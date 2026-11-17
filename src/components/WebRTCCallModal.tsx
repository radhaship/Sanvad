import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  addCallIceCandidate,
  answerCallSession,
  createCallSession,
  updateCallStatus,
} from '../services/chatService';
import type { CallSession, CallType, IceCandidateRecord } from '../types/chat';
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

export type ActiveCallModalState =
  | {
      mode: 'outgoing';
      chatId: string;
      callType: CallType;
      peer: { uid: string; displayName: string; photoUrl: string };
    }
  | {
      mode: 'incoming';
      session: CallSession;
    };

interface WebRTCCallModalProps {
  callState: ActiveCallModalState;
  currentUser: { uid: string; displayName: string; photoUrl: string };
  onClose: () => void;
}

export const WebRTCCallModal: React.FC<WebRTCCallModalProps> = ({
  callState,
  currentUser,
  onClose,
}) => {
  const isOutgoing = callState.mode === 'outgoing';
  const callType: CallType = isOutgoing ? callState.callType : callState.session.callType;
  const peerDisplay = isOutgoing
    ? callState.peer
    : {
        uid: callState.session.callerId,
        displayName: callState.session.callerName,
        photoUrl: callState.session.callerPhoto,
      };

  const [callId, setCallId] = useState<string | null>(
    isOutgoing ? null : callState.session.id
  );
  const [statusLabel, setStatusLabel] = useState<string>(
    isOutgoing ? 'Calling...' : `Incoming ${callType} call`
  );
  const [connected, setConnected] = useState(false);
  const [acceptedIncoming, setAcceptedIncoming] = useState(isOutgoing);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(callType === 'audio');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [joining, setJoining] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const bufferedLocalCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const processedRemoteCandidateIdsRef = useRef<Set<string>>(new Set());
  const remoteDescSetRef = useRef(false);
  const answerAppliedRef = useRef(false);
  const closedRef = useRef(false);
  const callIdRef = useRef<string | null>(callId);
  callIdRef.current = callId;

  const stopRingtoneRef = useRef<(() => void) | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const visiblePair: [string, string] = isOutgoing
    ? [currentUser.uid, callState.peer.uid]
    : [callState.session.callerId, callState.session.calleeId];

  const startRingtoneLoop = (incomingStyle: boolean) => {
    if (stopRingtoneRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      let active = true;

      const playBeep = () => {
        if (!active || ctx.state === 'closed') return;
        if (ctx.state === 'suspended') {
          void ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(incomingStyle ? 520 : 440, now);
        if (incomingStyle) {
          osc.frequency.setValueAtTime(660, now + 0.18);
        }
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.075, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (incomingStyle ? 0.48 : 0.32));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (incomingStyle ? 0.52 : 0.36));
      };

      playBeep();
      const timer = setInterval(playBeep, incomingStyle ? 1800 : 2500);
      stopRingtoneRef.current = () => {
        active = false;
        clearInterval(timer);
        if (ctx.state !== 'closed') {
          void ctx.close().catch(() => {});
        }
        stopRingtoneRef.current = null;
      };
    } catch {
      // Autoplay policies may restrict sound before gesture
    }
  };

  const cleanupMediaAndPc = () => {
    stopRingtoneRef.current?.();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  };

  const attachLocalPreview = (stream: MediaStream) => {
    localStreamRef.current = stream;
    if (localVideoRef.current && callType === 'video') {
      localVideoRef.current.srcObject = stream;
    }
  };

  const acquireMedia = async (mode: 'user' | 'environment'): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints =
      callType === 'video'
        ? {
            audio: true,
            video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
          }
        : { audio: true, video: false };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    attachLocalPreview(stream);
    return stream;
  };

  const setupPeerConnection = (
    role: 'caller' | 'callee',
    localStream: MediaStream,
    fixedCallId?: string
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIGURATION);
    pcRef.current = pc;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
      if (event.track && !remoteStream.getTracks().includes(event.track)) {
        remoteStream.addTrack(event.track);
      }
      if (remoteVideoRef.current && callType === 'video') {
        remoteVideoRef.current.srcObject = remoteStream;
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
      }
      setHasRemoteStream(true);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || closedRef.current) return;
      const json = event.candidate.toJSON();
      const candidateInit: RTCIceCandidateInit = {
        candidate: json.candidate || '',
        sdpMid: json.sdpMid || '',
        sdpMLineIndex: typeof json.sdpMLineIndex === 'number' ? json.sdpMLineIndex : 0,
      };

      const targetCallId = fixedCallId || callIdRef.current;
      if (!targetCallId) {
        bufferedLocalCandidatesRef.current.push(candidateInit);
        return;
      }
      void addCallIceCandidate({
        callId: targetCallId,
        senderId: currentUser.uid,
        role,
        candidate: candidateInit.candidate || '',
        sdpMid: candidateInit.sdpMid || '',
        sdpMLineIndex: candidateInit.sdpMLineIndex ?? 0,
        visibleToUids: visiblePair,
      });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        stopRingtoneRef.current?.();
        setConnected(true);
        setStatusLabel('Connected');
      } else if (state === 'disconnected' || state === 'failed') {
        setStatusLabel('Connection lost');
      }
    };

    return pc;
  };

  const flushPendingRemoteCandidates = async () => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) return;
    while (pendingRemoteCandidatesRef.current.length > 0) {
      const item = pendingRemoteCandidatesRef.current.shift();
      if (!item) continue;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(item));
      } catch {
        // Ignore stale candidate
      }
    }
  };

  // Re-attach video elements when layout toggles between ringing/connected
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current && callType === 'video') {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current && callType === 'video') {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  }, [connected, acceptedIncoming, hasRemoteStream, callType]);

  // Call duration timer
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [connected]);

  // Initialize outgoing call or ring for incoming call
  useEffect(() => {
    if (!isOutgoing) {
      startRingtoneLoop(true);
      return () => {
        closedRef.current = true;
        cleanupMediaAndPc();
      };
    }

    let cancelled = false;
    let missTimeout: ReturnType<typeof setTimeout> | null = null;

    const initOutgoing = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Audio/Video calling is not supported in this browser.');
        }
        const stream = await acquireMedia('user');
        if (cancelled || closedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        startRingtoneLoop(false);
        const pc = setupPeerConnection('caller', stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const createdId = await createCallSession({
          chatId: callState.chatId,
          caller: currentUser,
          callee: callState.peer,
          callType: callState.callType,
          offerSdp: offer.sdp || '',
          offerType: offer.type || 'offer',
        });

        if (cancelled || closedRef.current) {
          void updateCallStatus(createdId, 'ended');
          return;
        }

        callIdRef.current = createdId;
        setCallId(createdId);
        setStatusLabel('Ringing...');

        // Flush any ICE candidates gathered before Firestore doc ID returned
        while (bufferedLocalCandidatesRef.current.length > 0) {
          const item = bufferedLocalCandidatesRef.current.shift();
          if (!item) continue;
          void addCallIceCandidate({
            callId: createdId,
            senderId: currentUser.uid,
            role: 'caller',
            candidate: item.candidate || '',
            sdpMid: item.sdpMid || '',
            sdpMLineIndex: item.sdpMLineIndex ?? 0,
            visibleToUids: visiblePair,
          });
        }

        missTimeout = setTimeout(() => {
          if (!answerAppliedRef.current && !closedRef.current) {
            void updateCallStatus(createdId, 'missed');
            setStatusLabel('No answer');
            setTimeout(() => onCloseRef.current(), 1200);
          }
        }, 45_000);
      } catch (err) {
        if (!cancelled) {
          stopRingtoneRef.current?.();
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Could not access microphone/camera for this call.'
          );
        }
      }
    };

    void initOutgoing();

    return () => {
      cancelled = true;
      closedRef.current = true;
      if (missTimeout) clearTimeout(missTimeout);
      cleanupMediaAndPc();
    };
  }, []);

  // Listen to Call document & remote ICE candidates
  useEffect(() => {
    if (!callId) return;

    const unsubCall = onSnapshot(
      doc(db, 'calls', callId),
      async (snap) => {
        if (!snap.exists()) {
          cleanupMediaAndPc();
          onCloseRef.current();
          return;
        }
        const data = snap.data() as CallSession;

        if (data.status === 'rejected' || data.status === 'ended' || data.status === 'missed') {
          stopRingtoneRef.current?.();
          setStatusLabel(
            data.status === 'rejected'
              ? 'Call declined'
              : data.status === 'missed'
              ? 'Missed call'
              : 'Call ended'
          );
          cleanupMediaAndPc();
          setTimeout(() => {
            if (!closedRef.current) {
              closedRef.current = true;
              onCloseRef.current();
            }
          }, 900);
          return;
        }

        if (
          isOutgoing &&
          data.status === 'answered' &&
          data.answerSdp &&
          !answerAppliedRef.current &&
          pcRef.current
        ) {
          answerAppliedRef.current = true;
          stopRingtoneRef.current?.();
          setStatusLabel('Connecting...');
          try {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription({
                type: (data.answerType as RTCSdpType) || 'answer',
                sdp: data.answerSdp,
              })
            );
            remoteDescSetRef.current = true;
            await flushPendingRemoteCandidates();
            setConnected(true);
            setStatusLabel('Connected');
          } catch {
            setErrorMsg('Failed to connect peer audio/video.');
          }
        }
      },
      () => {
        // Ignore transient read error
      }
    );

    const candidatesQuery = query(
      collection(db, 'calls', callId, 'candidates'),
      where('visibleToUids', 'array-contains', currentUser.uid)
    );

    const unsubCandidates = onSnapshot(
      candidatesQuery,
      async (snap) => {
        for (const d of snap.docs) {
          const rec = d.data() as IceCandidateRecord;
          if (rec.senderId === currentUser.uid) continue;
          if (processedRemoteCandidateIdsRef.current.has(rec.id)) continue;
          processedRemoteCandidateIdsRef.current.add(rec.id);

          const candidateInit: RTCIceCandidateInit = {
            candidate: rec.candidate,
            sdpMid: rec.sdpMid || null,
            sdpMLineIndex: rec.sdpMLineIndex,
          };

          if (remoteDescSetRef.current && pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(candidateInit));
            } catch {
              // Ignore late candidate
            }
          } else {
            pendingRemoteCandidatesRef.current.push(candidateInit);
          }
        }
      },
      () => {
        // Ignore transient error
      }
    );

    return () => {
      unsubCall();
      unsubCandidates();
    };
  }, [callId, isOutgoing, currentUser.uid]);

  const handleAcceptIncoming = async () => {
    if (isOutgoing || joining) return;
    setJoining(true);
    setErrorMsg(null);
    stopRingtoneRef.current?.();

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Audio/Video calling is not supported in this browser.');
      }
      const stream = await acquireMedia('user');
      const session = callState.session;
      const pc = setupPeerConnection('callee', stream, session.id);

      await pc.setRemoteDescription(
        new RTCSessionDescription({
          type: (session.offerType as RTCSdpType) || 'offer',
          sdp: session.offerSdp,
        })
      );
      remoteDescSetRef.current = true;
      await flushPendingRemoteCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await answerCallSession(session.id, answer.sdp || '', answer.type || 'answer');
      setAcceptedIncoming(true);
      setConnected(true);
      setStatusLabel('Connected');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not access microphone/camera to answer the call.'
      );
    } finally {
      setJoining(false);
    }
  };

  const handleRejectIncoming = async () => {
    if (isOutgoing) return;
    closedRef.current = true;
    stopRingtoneRef.current?.();
    await updateCallStatus(callState.session.id, 'rejected');
    cleanupMediaAndPc();
    onClose();
  };

  const handleEndCall = async () => {
    closedRef.current = true;
    stopRingtoneRef.current?.();
    const activeId = callIdRef.current;
    cleanupMediaAndPc();
    if (activeId) {
      await updateCallStatus(activeId, 'ended');
    }
    onClose();
  };

  const handleToggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !micMuted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicMuted(nextMuted);
  };

  const handleToggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream || callType !== 'video') return;
    const nextOff = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextOff;
    });
    setCameraOff(nextOff);
  };

  const handleFlipCamera = async () => {
    if (callType !== 'video' || !pcRef.current || !localStreamRef.current) return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const newVideoTrack = nextStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const sender = pcRef.current
        .getSenders()
        .find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newVideoTrack);
      }

      localStreamRef.current.getVideoTracks().forEach((oldTrack) => {
        oldTrack.stop();
        localStreamRef.current?.removeTrack(oldTrack);
      });
      newVideoTrack.enabled = !cameraOff;
      localStreamRef.current.addTrack(newVideoTrack);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setFacingMode(nextMode);
    } catch {
      // Ignore if single camera device
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white">
      {/* Hidden audio output element ensures voice plays on audio-only or mixed streams */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Video Call Remote Background */}
      {callType === 'video' && acceptedIncoming && (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            hasRemoteStream ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/35 to-slate-950/90 pointer-events-none" />

      {/* Top Bar */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-5 sm:p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold">
            {callType === 'video' ? (
              <Video className="w-3.5 h-3.5 text-teal-300" />
            ) : (
              <Phone className="w-3.5 h-3.5 text-teal-300" />
            )}
            <span>{callType === 'video' ? 'P2P Video Call' : 'P2P Voice Call'}</span>
          </div>

          <button
            type="button"
            onClick={() => void handleEndCall()}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
            aria-label="Close call screen"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Center Peer Card (Audio call or before remote video connects) */}
        <div
          className={`flex flex-col items-center text-center space-y-4 transition-opacity ${
            callType === 'video' && connected && hasRemoteStream
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100'
          }`}
        >
          <div className="relative">
            {!connected && (
              <span className="absolute -inset-3 rounded-full border-2 border-teal-400/50 animate-ping" />
            )}
            <Avatar src={peerDisplay.photoUrl} name={peerDisplay.displayName} size="xl" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold">{peerDisplay.displayName}</h2>
            <p className="text-sm text-teal-200 font-medium tabular-nums">
              {connected ? formatDuration(elapsedSec) : statusLabel}
            </p>
          </div>
          {errorMsg && (
            <div className="max-w-sm rounded-xl bg-rose-600/90 border border-rose-400/40 px-4 py-2.5 text-xs font-medium text-white">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Connected Video Overlay Header + Local Self-View PiP */}
        {callType === 'video' && acceptedIncoming && (
          <>
            {connected && hasRemoteStream && (
              <div className="absolute top-16 left-5 sm:left-8 flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/45 backdrop-blur-md border border-white/10">
                <span className="text-sm font-semibold">{peerDisplay.displayName}</span>
                <span className="text-xs text-teal-300 tabular-nums font-medium">
                  {formatDuration(elapsedSec)}
                </span>
              </div>
            )}

            <div className="absolute bottom-28 right-5 sm:right-8 w-28 h-40 sm:w-36 sm:h-48 rounded-2xl overflow-hidden bg-slate-900 border-2 border-white/25 shadow-2xl">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover ${
                  facingMode === 'user' ? '-scale-x-100' : ''
                } ${cameraOff ? 'hidden' : ''}`}
              />
              {cameraOff && (
                <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 gap-1">
                  <VideoOff className="w-5 h-5" />
                  <span>Camera off</span>
                </div>
              )}
            </div>
          </>
        )}

        {/* Bottom Controls */}
        <div className="flex items-center justify-center gap-4 pb-2">
          {!isOutgoing && !acceptedIncoming ? (
            <>
              <button
                type="button"
                onClick={() => void handleRejectIncoming()}
                className="min-w-[64px] min-h-[64px] rounded-full bg-rose-600 hover:bg-rose-700 text-white flex flex-col items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
                aria-label="Reject call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
              <button
                type="button"
                disabled={joining}
                onClick={() => void handleAcceptIncoming()}
                className="min-w-[64px] min-h-[64px] rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white flex flex-col items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
                aria-label="Accept call"
              >
                {callType === 'video' ? (
                  <Video className="w-6 h-6" />
                ) : (
                  <Phone className="w-6 h-6" />
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleToggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  micMuted
                    ? 'bg-white text-slate-900'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                title={micMuted ? 'Unmute' : 'Mute'}
              >
                {micMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {callType === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                      cameraOff
                        ? 'bg-white text-slate-900'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                    title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  >
                    {cameraOff ? (
                      <VideoOff className="w-6 h-6" />
                    ) : (
                      <Video className="w-6 h-6" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleFlipCamera()}
                    className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Flip camera"
                    title="Flip camera"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => void handleEndCall()}
                className="w-16 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xl cursor-pointer transition-transform active:scale-95"
                aria-label="End call"
                title="End call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
