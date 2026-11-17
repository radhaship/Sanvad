import React, { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { formatAudioDuration, LIMITS } from '../lib/validation';

interface VoiceRecorderButtonProps {
  disabled?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  onSendVoice: (audioData: string, durationSec: number) => Promise<void>;
  onError: (message: string) => void;
}

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not encode audio recording.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read audio recording.'));
    reader.readAsDataURL(blob);
  });
}

export const VoiceRecorderButton: React.FC<VoiceRecorderButtonProps> = ({
  disabled = false,
  onRecordingChange,
  onSendVoice,
  onError,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sending, setSending] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  const cleanupStream = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      cleanupStream();
    };
  }, []);

  const stopRecording = (cancel: boolean) => {
    cancelledRef.current = cancel;
    setIsRecording(false);
    onRecordingChange?.(false);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      cleanupStream();
    }
  };

  const startRecording = async () => {
    if (disabled || sending || isRecording) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      onError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;

      const mimeType = pickSupportedMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const wasCancelled = cancelledRef.current;
        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const recordedType = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedType });
        cleanupStream();

        if (wasCancelled || blob.size === 0) {
          return;
        }

        setSending(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (dataUrl.length > LIMITS.AUDIO_MSG_MAX_CHARS) {
            onError('Voice message is too large. Please record a shorter clip.');
            return;
          }
          await onSendVoice(dataUrl, durationSec);
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Failed to send voice message.');
        } finally {
          setSending(false);
          setElapsedSec(0);
        }
      };

      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);
      onRecordingChange?.(true);
      recorder.start(250);

      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(secs);
        if (secs >= LIMITS.AUDIO_MAX_DURATION_SEC) {
          stopRecording(false);
        }
      }, 250);
    } catch {
      cleanupStream();
      setIsRecording(false);
      onRecordingChange?.(false);
      onError('Microphone permission is required to record voice messages.');
    }
  };

  if (isRecording) {
    return (
      <div className="flex-1 flex items-center justify-between gap-2 min-h-[44px] px-3 py-1.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse shrink-0" />
          <span className="text-xs font-semibold text-rose-700 dark:text-rose-300 whitespace-nowrap">
            Recording
          </span>
          <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {formatAudioDuration(elapsedSec)} / {formatAudioDuration(LIMITS.AUDIO_MAX_DURATION_SEC)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => stopRecording(true)}
            className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1 text-xs font-medium cursor-pointer"
            title="Discard recording"
            aria-label="Discard recording"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span className="hidden sm:inline">Cancel</span>
          </button>
          <button
            type="button"
            onClick={() => stopRecording(false)}
            className="min-w-[44px] min-h-[40px] px-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white inline-flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Stop and send voice message"
            aria-label="Send voice message"
          >
            {elapsedSec < 1 ? <Square className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
            <span>Send</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || sending}
      onClick={() => void startRecording()}
      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
      title={sending ? 'Sending voice note...' : 'Record voice message'}
      aria-label={sending ? 'Sending voice note' : 'Record voice message'}
    >
      <Mic className="w-5 h-5" />
    </button>
  );
};
