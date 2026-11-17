import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  MonitorOff,
  MonitorUp,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  addCallIceCandidate,
  answerCallSession,
  answerScreenSharePeer,
  createCallSession,
  joinScreenSharePeer,
  leaveScreenSharePeer,
  sendScreenSharePeerOffer,
  updateCallStatus,
} from '../services/chatService';
import type { CallPeer, CallSession, IceCandidateRecord } from '../types/chat';
import { Avatar } from './Avatar';

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type ActiveScreenShareState =
  | {
      mode: 'outgoing';
      chatId: string;
      isGroup: boolean;
      visibleToUids: string[];
      target: { uid: string; displayName: string; photoUrl: string };
    }
  | {
      mode: 'incoming';
      session: CallSession;
      autoAccept?: boolean;
    };

interface ScreenShareModalProps {
  shareState: ActiveScreenShareState;
  currentUser: { uid: string; displayName: string; photoUrl: string };
  onClose: () => void;
}

interface GroupPeerEntry {
  viewerId: string;
  viewerName: string;
  viewerPhoto: string;
  pc: RTCPeerConnection;
  offeredSdp: string;
  answerApplied: boolean;
  remoteDescSet: boolean;
  pendingCandidates: RTCIceCandidateInit[];
}

export const ScreenShareModal: React.FC<ScreenShareModalProps> = ({
  shareState,
  currentUser,
  onClose,
}) => {
  const isOutgoing = shareState.mode === 'outgoing';
  const isGroup = isOutgoing ? shareState.isGroup : Boolean(shareState.session.isGroup);

  const [callId, setCallId] = useState<string | null>(
    isOutgoing ? null : shareState.session.id
  );
  const [acceptedIncoming, setAcceptedIncoming] = useState<boolean>(
    isOutgoing ? true : Boolean(shareState.autoAccept)
  );
  const [statusLabel, setStatusLabel] = useState<string>(
    isOutgoing
      ? 'Select a window or screen to share...'
      : shareState.autoAccept
      ? 'Connecting to live screen...'
      : isGroup
      ? 'Live screen share in group'
      : 'Incoming screen share'
  );
  const [connected, setConnected] = useState(false);
  const [hasStream, setHasStream] = useState(false);
  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [needsAudioTap, setNeedsAudioTap] = useState(false);
  const [fillMode, setFillMode] = useState<'contain' | 'cover'>('contain');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<
    Array<{ viewerId: string; viewerName: string; viewerPhoto: string }>
  >([]);
  const [joining, setJoining] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  // 1-on-1 refs
  const singlePcRef = useRef<RTCPeerConnection | null>(null);
  const pendingSingleCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const bufferedSingleLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const singleRemoteDescSetRef = useRef(false);
  const singleAnswerAppliedRef = useRef(false);

  // Group presenter mesh refs
  const groupPeersRef = useRef<Map<string, GroupPeerEntry>>(new Map());
  const processedCandidateIdsRef = useRef<Set<string>>(new Set());
  const pendingGroupCandidatesBySenderRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const viewerOfferAppliedRef = useRef<string | null>(null);

  const closedRef = useRef(false);
  const callIdRef = useRef<string | null>(callId);
  callIdRef.current = callId;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const targetDisplay = isOutgoing
    ? shareState.target
    : {
        uid: shareState.session.callerId,
        displayName: shareState.session.callerName,
        photoUrl: shareState.session.callerPhoto,
      };

  const cleanupAllMediaAndPcs = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      localStreamRef.current = null;
    }
    if (singlePcRef.current) {
      singlePcRef.current.onicecandidate = null;
      singlePcRef.current.ontrack = null;
      singlePcRef.current.onconnectionstatechange = null;
      singlePcRef.current.close();
      singlePcRef.current = null;
    }
    groupPeersRef.current.forEach((entry) => {
      entry.pc.onicecandidate = null;
      entry.pc.ontrack = null;
      entry.pc.onconnectionstatechange = null;
      entry.pc.close();
    });
    groupPeersRef.current.clear();
  };

  const closeGracefully = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    cleanupAllMediaAndPcs();
    onCloseRef.current();
  };

  const handleStopOrLeave = async (terminalStatus: 'ended' | 'rejected' | 'missed' = 'ended') => {
    const activeId = callIdRef.current;
    closedRef.current = true;
    cleanupAllMediaAndPcs();

    if (activeId) {
      if (isOutgoing || !isGroup) {
        await updateCallStatus(activeId, terminalStatus).catch(() => {});
      } else if (acceptedIncoming) {
        await leaveScreenSharePeer(activeId, currentUser.uid).catch(() => {});
      }
    }
    onCloseRef.current();
  };

  const attachRemoteVideoStream = (stream: MediaStream) => {
    remoteStreamRef.current = stream;
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.muted = audioMuted;
      void videoEl.play().catch(() => {
        // Retry muted if browser autoplay policy blocks unmuted playback
        videoEl.muted = true;
        setAudioMuted(true);
        if (stream.getAudioTracks().length > 0) {
          setNeedsAudioTap(true);
        }
        void videoEl.play().catch(() => {});
      });
    }
    setHasAudioTrack(stream.getAudioTracks().length > 0);
    setHasStream(true);
  };

  const flushCandidates = async (
    pc: RTCPeerConnection,
    queue: RTCIceCandidateInit[]
  ) => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(next));
      } catch {
        // Ignore stale candidate
      }
    }
  };

  const acquireDisplayStream = async (): Promise<MediaStream> => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error(
        'Screen sharing is not supported in this browser. Please try Chrome, Edge, or Firefox on desktop.'
      );
    }

    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as MediaTrackConstraints,
        audio: true,
      });
    } catch (err) {
      // If user explicitly cancelled/denied permission, rethrow immediately
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'AbortError')
      ) {
        throw err;
      }
      // Fallback to video-only screen share if system audio capture is unsupported
      return await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    }
  };

  // Start outgoing screen share (1-on-1 or group)
  useEffect(() => {
    if (!isOutgoing) return;
    let cancelled = false;

    const startSharing = async () => {
      try {
        const stream = await acquireDisplayStream();
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setHasAudioTrack(stream.getAudioTracks().length > 0);
        setHasStream(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true; // Presenter never hears their own system audio echo
          void videoRef.current.play().catch(() => {});
        }

        // Listen to browser's native "Stop sharing" bar event on every track
        const handleNativeStop = () => {
          if (!closedRef.current) {
            void handleStopOrLeave('ended');
          }
        };
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', handleNativeStop, { once: true });
        });

        if (shareState.isGroup) {
          setStatusLabel('Live in group · Waiting for viewers...');
          setConnected(true);
          const createdId = await createCallSession({
            chatId: shareState.chatId,
            caller: currentUser,
            callee: shareState.target,
            callType: 'screen',
            isGroup: true,
            visibleToUids: shareState.visibleToUids,
            offerSdp: 'group-screen-mesh',
            offerType: 'mesh',
          });
          if (cancelled || closedRef.current) {
            void updateCallStatus(createdId, 'ended');
            return;
          }
          setCallId(createdId);
        } else {
          // 1-on-1 P2P WebRTC offer
          setStatusLabel('Ringing peer...');
          const pc = new RTCPeerConnection(RTC_CONFIGURATION);
          singlePcRef.current = pc;

          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          const visiblePair: [string, string] = [currentUser.uid, shareState.target.uid];
          pc.onicecandidate = (event) => {
            if (!event.candidate || closedRef.current) return;
            const json = event.candidate.toJSON();
            const init: RTCIceCandidateInit = {
              candidate: json.candidate || '',
              sdpMid: json.sdpMid || '',
              sdpMLineIndex: typeof json.sdpMLineIndex === 'number' ? json.sdpMLineIndex : 0,
            };
            const targetId = callIdRef.current;
            if (!targetId) {
              bufferedSingleLocalCandidatesRef.current.push(init);
              return;
            }
            void addCallIceCandidate({
              callId: targetId,
              senderId: currentUser.uid,
              role: 'caller',
              candidate: init.candidate || '',
              sdpMid: init.sdpMid || '',
              sdpMLineIndex: init.sdpMLineIndex ?? 0,
              visibleToUids: visiblePair,
            });
          };

          pc.onconnectionstatechange = () => {
            if (closedRef.current) return;
            if (pc.connectionState === 'connected') {
              setConnected(true);
              setStatusLabel('Sharing screen live');
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
              void handleStopOrLeave('ended');
            } else if (pc.connectionState === 'disconnected') {
              setStatusLabel('Reconnecting...');
            }
          };

          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (cancelled || closedRef.current) return;

          const createdId = await createCallSession({
            chatId: shareState.chatId,
            caller: currentUser,
            callee: shareState.target,
            callType: 'screen',
            isGroup: false,
            offerSdp: offer.sdp || '',
            offerType: offer.type || 'offer',
          });
          if (cancelled || closedRef.current) {
            void updateCallStatus(createdId, 'ended');
            return;
          }
          setCallId(createdId);

          const buffered = [...bufferedSingleLocalCandidatesRef.current];
          bufferedSingleLocalCandidatesRef.current = [];
          buffered.forEach((cand) => {
            void addCallIceCandidate({
              callId: createdId,
              senderId: currentUser.uid,
              role: 'caller',
              candidate: cand.candidate || '',
              sdpMid: cand.sdpMid || '',
              sdpMLineIndex: cand.sdpMLineIndex ?? 0,
              visibleToUids: visiblePair,
            });
          });
        }
      } catch (err) {
        if (!cancelled) {
          const isDenied =
            err instanceof DOMException &&
            (err.name === 'NotAllowedError' || err.name === 'AbortError');
          setErrorMsg(
            isDenied
              ? 'Screen share cancelled. Allow screen capture to share your screen.'
              : err instanceof Error
              ? err.message
              : 'Could not start screen sharing.'
          );
          setStatusLabel('Screen share stopped');
        }
      }
    };

    void startSharing();

    return () => {
      cancelled = true;
      cleanupAllMediaAndPcs();
    };
  }, []);

  // Re-attach stream if video element mounts slightly after stream acquisition
  useEffect(() => {
    const stream = isOutgoing ? localStreamRef.current : remoteStreamRef.current;
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = isOutgoing ? true : audioMuted;
      void videoRef.current.play().catch(() => {});
    }
  }, [hasStream, acceptedIncoming, isOutgoing, audioMuted]);

  // 1-on-1 Ringing timeout (60s) if peer doesn't view
  useEffect(() => {
    if (!isOutgoing || isGroup || !callId || connected) return;
    const timer = setTimeout(() => {
      if (!closedRef.current && !connected) {
        void handleStopOrLeave('missed');
      }
    }, 60_000);
    return () => clearTimeout(timer);
  }, [isOutgoing, isGroup, callId, connected]);

  // Elapsed timer while connected/live
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [connected]);

  // Listen to parent /calls/{callId} document for status updates & 1-on-1 answer SDP
  useEffect(() => {
    if (!callId) return;
    const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
      if (!snap.exists()) {
        closeGracefully();
        return;
      }
      const data = snap.data() as CallSession;
      if (data.status === 'rejected' || data.status === 'ended' || data.status === 'missed') {
        const msg =
          data.status === 'rejected'
            ? 'Peer declined screen share.'
            : data.status === 'missed'
            ? 'No response.'
            : 'Screen share ended.';
        setStatusLabel(msg);
        setTimeout(() => closeGracefully(), 500);
        return;
      }

      if (
        isOutgoing &&
        !isGroup &&
        data.status === 'answered' &&
        data.answerSdp &&
        !singleAnswerAppliedRef.current &&
        singlePcRef.current
      ) {
        singleAnswerAppliedRef.current = true;
        setStatusLabel('Connecting...');
        void (async () => {
          try {
            const pc = singlePcRef.current;
            if (!pc) return;
            await pc.setRemoteDescription(
              new RTCSessionDescription({
                type: (data.answerType as RTCSdpType) || 'answer',
                sdp: data.answerSdp,
              })
            );
            singleRemoteDescSetRef.current = true;
            await flushCandidates(pc, pendingSingleCandidatesRef.current);
          } catch {
            setErrorMsg('Failed to establish P2P screen share connection.');
          }
        })();
      }
    });

    return () => unsub();
  }, [callId, isOutgoing, isGroup]);

  // Listen to ICE candidates for 1-on-1 OR Group mesh
  useEffect(() => {
    if (!callId) return;
    const candQ = query(
      collection(db, 'calls', callId, 'candidates'),
      where('visibleToUids', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(candQ, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return;
        const cand = change.doc.data() as IceCandidateRecord;
        if (cand.senderId === currentUser.uid) return;
        if (processedCandidateIdsRef.current.has(cand.id)) return;
        processedCandidateIdsRef.current.add(cand.id);

        const init: RTCIceCandidateInit = {
          candidate: cand.candidate,
          sdpMid: cand.sdpMid || null,
          sdpMLineIndex: cand.sdpMLineIndex,
        };

        if (isOutgoing && isGroup) {
          const entry = groupPeersRef.current.get(cand.senderId);
          if (entry && entry.remoteDescSet) {
            void entry.pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
          } else {
            const list = pendingGroupCandidatesBySenderRef.current.get(cand.senderId) || [];
            list.push(init);
            pendingGroupCandidatesBySenderRef.current.set(cand.senderId, list);
          }
          return;
        }

        const pc = singlePcRef.current;
        if (pc && singleRemoteDescSetRef.current) {
          void pc.addIceCandidate(new RTCIceCandidate(init)).catch(() => {});
        } else {
          pendingSingleCandidatesRef.current.push(init);
        }
      });
    });

    return () => unsub();
  }, [callId, currentUser.uid, isOutgoing, isGroup]);

  // Group Presenter: Listen to /calls/{callId}/peers and build per-viewer P2P WebRTC legs
  useEffect(() => {
    if (!isOutgoing || !isGroup || !callId) return;
    const peersQ = query(
      collection(db, 'calls', callId, 'peers'),
      where('visibleToUids', 'array-contains', currentUser.uid)
    );

    const syncViewerState = () => {
      const list = Array.from(groupPeersRef.current.values()).map((e) => ({
        viewerId: e.viewerId,
        viewerName: e.viewerName,
        viewerPhoto: e.viewerPhoto,
      }));
      setActiveViewers(list);
      setStatusLabel(
        list.length > 0
          ? `Sharing with ${list.length} ${list.length === 1 ? 'member' : 'members'}`
          : 'Live in group · Waiting for viewers...'
      );
    };

    const unsub = onSnapshot(peersQ, (snap) => {
      snap.docChanges().forEach((change) => {
        const peer = change.doc.data() as CallPeer;

        if (change.type === 'removed' || peer.status === 'left') {
          const existing = groupPeersRef.current.get(peer.viewerId);
          if (existing) {
            existing.pc.onicecandidate = null;
            existing.pc.onconnectionstatechange = null;
            existing.pc.close();
            groupPeersRef.current.delete(peer.viewerId);
            syncViewerState();
          }
          return;
        }

        if (peer.status === 'joining') {
          const stream = localStreamRef.current;
          if (!stream || closedRef.current) return;

          const existing = groupPeersRef.current.get(peer.viewerId);
          if (existing) {
            existing.pc.close();
            groupPeersRef.current.delete(peer.viewerId);
          }

          const pc = new RTCPeerConnection(RTC_CONFIGURATION);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));

          const entry: GroupPeerEntry = {
            viewerId: peer.viewerId,
            viewerName: peer.viewerName,
            viewerPhoto: peer.viewerPhoto,
            pc,
            offeredSdp: '',
            answerApplied: false,
            remoteDescSet: false,
            pendingCandidates: pendingGroupCandidatesBySenderRef.current.get(peer.viewerId) || [],
          };
          pendingGroupCandidatesBySenderRef.current.delete(peer.viewerId);
          groupPeersRef.current.set(peer.viewerId, entry);
          syncViewerState();

          pc.onicecandidate = (event) => {
            if (!event.candidate || closedRef.current) return;
            const json = event.candidate.toJSON();
            void addCallIceCandidate({
              callId,
              senderId: currentUser.uid,
              role: 'caller',
              candidate: json.candidate || '',
              sdpMid: json.sdpMid || '',
              sdpMLineIndex: typeof json.sdpMLineIndex === 'number' ? json.sdpMLineIndex : 0,
              visibleToUids: [currentUser.uid, peer.viewerId],
            });
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
              const curr = groupPeersRef.current.get(peer.viewerId);
              if (curr && curr.pc === pc) {
                groupPeersRef.current.delete(peer.viewerId);
                syncViewerState();
              }
            }
          };

          void (async () => {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              if (closedRef.current) return;
              entry.offeredSdp = offer.sdp || '';
              await sendScreenSharePeerOffer({
                callId,
                viewerId: peer.viewerId,
                offerSdp: offer.sdp || '',
                offerType: offer.type || 'offer',
              });
            } catch {
              // Ignore failed peer leg without dropping other viewers
            }
          })();
          return;
        }

        if (peer.status === 'answered' && peer.answerSdp) {
          const entry = groupPeersRef.current.get(peer.viewerId);
          if (entry && !entry.answerApplied) {
            entry.answerApplied = true;
            void (async () => {
              try {
                await entry.pc.setRemoteDescription(
                  new RTCSessionDescription({
                    type: (peer.answerType as RTCSdpType) || 'answer',
                    sdp: peer.answerSdp,
                  })
                );
                entry.remoteDescSet = true;
                await flushCandidates(entry.pc, entry.pendingCandidates);
              } catch {
                // Ignore peer leg failure
              }
            })();
          }
        }
      });
    });

    return () => unsub();
  }, [isOutgoing, isGroup, callId, currentUser.uid]);

  // Accept helper for incoming 1-on-1 OR Group screen share
  const acceptIncomingScreenShare = async () => {
    if (isOutgoing || joining) return;
    const session = shareState.session;
    setJoining(true);
    setAcceptedIncoming(true);
    setErrorMsg(null);
    setStatusLabel('Connecting to shared screen...');

    if (!session.isGroup) {
      // 1-on-1 direct screen share viewer
      try {
        const pc = new RTCPeerConnection(RTC_CONFIGURATION);
        singlePcRef.current = pc;
        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;

        pc.ontrack = (event) => {
          event.streams[0]?.getTracks().forEach((t) => {
            if (!remoteStream.getTracks().includes(t)) {
              remoteStream.addTrack(t);
            }
          });
          if (event.track && !remoteStream.getTracks().includes(event.track)) {
            remoteStream.addTrack(event.track);
          }
          attachRemoteVideoStream(remoteStream);
        };

        const visiblePair: [string, string] = [session.callerId, session.calleeId];
        pc.onicecandidate = (event) => {
          if (!event.candidate || closedRef.current) return;
          const json = event.candidate.toJSON();
          void addCallIceCandidate({
            callId: session.id,
            senderId: currentUser.uid,
            role: 'callee',
            candidate: json.candidate || '',
            sdpMid: json.sdpMid || '',
            sdpMLineIndex: typeof json.sdpMLineIndex === 'number' ? json.sdpMLineIndex : 0,
            visibleToUids: visiblePair,
          });
        };

        pc.onconnectionstatechange = () => {
          if (closedRef.current) return;
          if (pc.connectionState === 'connected') {
            setConnected(true);
            setStatusLabel(`Viewing ${session.callerName}'s screen`);
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setStatusLabel('Screen share disconnected');
          }
        };

        await pc.setRemoteDescription(
          new RTCSessionDescription({
            type: (session.offerType as RTCSdpType) || 'offer',
            sdp: session.offerSdp,
          })
        );
        singleRemoteDescSetRef.current = true;
        await flushCandidates(pc, pendingSingleCandidatesRef.current);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await answerCallSession(session.id, answer.sdp || '', answer.type || 'answer');
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Could not connect to shared screen.'
        );
      } finally {
        setJoining(false);
      }
      return;
    }

    // Group screen share viewer: signal joining in /calls/{callId}/peers/{viewerUid}
    try {
      await joinScreenSharePeer({
        callId: session.id,
        callerId: session.callerId,
        viewer: currentUser,
      });
      setStatusLabel(`Waiting for ${session.callerName}'s screen stream...`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join group screen share.');
      setJoining(false);
    }
  };

  // Auto-accept when viewer enters via "Live Screen · Watch" button
  useEffect(() => {
    if (!isOutgoing && shareState.autoAccept) {
      void acceptIncomingScreenShare();
    }
  }, []);

  // Group Viewer: listen to /calls/{callId}/peers/{currentUser.uid} for presenter SDP offer
  useEffect(() => {
    if (isOutgoing || !isGroup || !acceptedIncoming || !callId) return;
    const session = shareState.session;

    const peerDocRef = doc(db, 'calls', callId, 'peers', currentUser.uid);
    const unsub = onSnapshot(peerDocRef, (snap) => {
      if (!snap.exists()) return;
      const peer = snap.data() as CallPeer;
      if (peer.status !== 'offered' || !peer.offerSdp) return;
      if (viewerOfferAppliedRef.current === peer.offerSdp) return;
      viewerOfferAppliedRef.current = peer.offerSdp;

      void (async () => {
        try {
          if (singlePcRef.current) {
            singlePcRef.current.close();
          }
          const pc = new RTCPeerConnection(RTC_CONFIGURATION);
          singlePcRef.current = pc;

          const remoteStream = new MediaStream();
          remoteStreamRef.current = remoteStream;

          pc.ontrack = (event) => {
            event.streams[0]?.getTracks().forEach((t) => {
              if (!remoteStream.getTracks().includes(t)) {
                remoteStream.addTrack(t);
              }
            });
            if (event.track && !remoteStream.getTracks().includes(event.track)) {
              remoteStream.addTrack(event.track);
            }
            attachRemoteVideoStream(remoteStream);
          };

          pc.onicecandidate = (event) => {
            if (!event.candidate || closedRef.current) return;
            const json = event.candidate.toJSON();
            void addCallIceCandidate({
              callId,
              senderId: currentUser.uid,
              role: 'callee',
              candidate: json.candidate || '',
              sdpMid: json.sdpMid || '',
              sdpMLineIndex: typeof json.sdpMLineIndex === 'number' ? json.sdpMLineIndex : 0,
              visibleToUids: [session.callerId, currentUser.uid],
            });
          };

          pc.onconnectionstatechange = () => {
            if (closedRef.current) return;
            if (pc.connectionState === 'connected') {
              setConnected(true);
              setStatusLabel(`Viewing ${session.callerName}'s screen`);
            } else if (pc.connectionState === 'disconnected') {
              setStatusLabel('Reconnecting...');
            }
          };

          await pc.setRemoteDescription(
            new RTCSessionDescription({
              type: (peer.offerType as RTCSdpType) || 'offer',
              sdp: peer.offerSdp,
            })
          );
          singleRemoteDescSetRef.current = true;
          await flushCandidates(pc, pendingSingleCandidatesRef.current);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await answerScreenSharePeer({
            callId,
            viewerId: currentUser.uid,
            answerSdp: answer.sdp || '',
            answerType: answer.type || 'answer',
          });
        } catch (err) {
          setErrorMsg(
            err instanceof Error ? err.message : 'Failed to connect to group screen share.'
          );
        } finally {
          setJoining(false);
        }
      })();
    });

    return () => unsub();
  }, [isOutgoing, isGroup, acceptedIncoming, callId, currentUser.uid]);

  // Track Fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen may be blocked inside restricted embeds
    }
  };

  const toggleAudioMute = () => {
    if (isOutgoing) {
      const stream = localStreamRef.current;
      if (!stream) return;
      const next = !audioMuted;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      setAudioMuted(next);
      return;
    }

    const next = !audioMuted;
    if (videoRef.current) {
      videoRef.current.muted = next;
      if (!next) {
        void videoRef.current.play().catch(() => {});
      }
    }
    setAudioMuted(next);
    setNeedsAudioTap(false);
  };

  // Pre-accept incoming screen share invitation card
  if (!isOutgoing && !acceptedIncoming) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar
                src={targetDisplay.photoUrl}
                name={targetDisplay.displayName}
                size="xl"
              />
              <span className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-slate-900">
                <MonitorUp className="w-4 h-4" />
              </span>
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {isGroup ? 'Group Screen Share' : 'Incoming Screen Share'}
              </span>
              <h3 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                {targetDisplay.displayName}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {isGroup
                  ? `is sharing their screen in ${shareState.session.calleeName}`
                  : 'wants to share their screen with you (P2P)'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => void handleStopOrLeave(isGroup ? 'ended' : 'rejected')}
              className="flex-1 h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
              {isGroup ? 'Dismiss' : 'Decline'}
            </button>
            <button
              type="button"
              onClick={() => void acceptIncomingScreenShare()}
              className="flex-1 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 cursor-pointer"
            >
              <MonitorUp className="w-4 h-4" />
              View Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-slate-950/92 backdrop-blur-md flex flex-col p-2 sm:p-4 animate-fade-in"
    >
      <div className="w-full max-w-6xl mx-auto flex-1 min-h-0 flex flex-col rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">
        {/* Top bar */}
        <div className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={targetDisplay.photoUrl} name={targetDisplay.displayName} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  {isOutgoing ? 'Sharing Screen' : 'Live Screen'}
                </span>
                {connected && (
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {formatDuration(elapsedSec)}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {isOutgoing
                  ? isGroup
                    ? `${shareState.target.displayName} · Group Screen Share`
                    : `Sharing with ${targetDisplay.displayName}`
                  : `${targetDisplay.displayName}'s Screen`}
              </p>
              <p className="text-[11px] text-slate-400 truncate">{statusLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOutgoing && isGroup && (
              <div
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold"
                title={
                  activeViewers.length > 0
                    ? activeViewers.map((v) => v.viewerName).join(', ')
                    : 'No viewers yet'
                }
              >
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="tabular-nums">{activeViewers.length}</span>
                <span className="text-slate-400 font-normal">watching</span>
              </div>
            )}

            {hasAudioTrack && (
              <button
                type="button"
                onClick={toggleAudioMute}
                className={`h-9 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  audioMuted
                    ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title={
                  isOutgoing
                    ? audioMuted
                      ? 'Unmute shared audio'
                      : 'Mute shared audio'
                    : audioMuted
                    ? 'Unmute screen audio'
                    : 'Mute screen audio'
                }
              >
                {audioMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">
                  {audioMuted ? 'Muted' : 'Audio'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFillMode((m) => (m === 'contain' ? 'cover' : 'contain'))}
              className="hidden sm:inline-flex h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold items-center gap-1.5 cursor-pointer"
              title="Toggle Fit / Fill"
            >
              {fillMode === 'contain' ? 'Fit' : 'Fill'}
            </button>

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => void handleStopOrLeave('ended')}
              className="h-9 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-rose-600/25 cursor-pointer"
            >
              <MonitorOff className="w-4 h-4" />
              <span>{isOutgoing ? 'Stop Sharing' : isGroup ? 'Leave' : 'End'}</span>
            </button>
          </div>
        </div>

        {/* Main Screen Video Stage */}
        <div className="relative flex-1 min-h-0 bg-black flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="max-w-md mx-auto p-6 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <MonitorOff className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">{errorMsg}</p>
              <button
                type="button"
                onClick={() => void handleStopOrLeave('ended')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isOutgoing || audioMuted}
                className={`w-full h-full ${
                  fillMode === 'contain' ? 'object-contain' : 'object-cover'
                } ${hasStream ? 'opacity-100' : 'opacity-0'}`}
              />

              {!hasStream && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center animate-pulse">
                    <MonitorUp className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-200">{statusLabel}</p>
                  <p className="text-xs text-slate-400">
                    Direct P2P WebRTC stream · ₹0 server relay cost
                  </p>
                </div>
              )}

              {needsAudioTap && !isOutgoing && (
                <button
                  type="button"
                  onClick={toggleAudioMute}
                  className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-white text-xs font-semibold flex items-center gap-2 shadow-xl cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                  Tap to unmute shared audio
                </button>
              )}

              {isOutgoing && (
                <div className="hidden sm:flex absolute bottom-4 left-4 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 text-[11px] text-slate-300 items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live local preview · Click &ldquo;Stop Sharing&rdquo; anytime
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
