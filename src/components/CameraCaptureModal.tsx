import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, RotateCcw, Upload, X } from 'lucide-react';
import { compressChatPhoto } from '../lib/imageUtils';

interface CameraCaptureModalProps {
  onCaptured: (compressedDataUrl: string) => void;
  onClose: () => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  onCaptured,
  onClose,
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (capturedUrl) {
      stopCamera();
      return;
    }

    let cancelled = false;
    setStarting(true);
    setCameraError(null);

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Live camera preview is unavailable on this browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error
              ? err.message
              : 'Camera permission was denied or no camera device was found.'
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [facingMode, capturedUrl]);

  const handleSnap = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || processing) return;
    setProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');

      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('Could not capture photo.');
      const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
      const compressed = await compressChatPhoto(file);
      setCapturedUrl(compressed);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Failed to capture photo.');
    } finally {
      setProcessing(false);
    }
  };

  const handleNativeFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProcessing(true);
    setCameraError(null);
    try {
      const compressed = await compressChatPhoto(file);
      onCaptured(compressed);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Could not process captured photo.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      <div className="px-4 py-3 flex items-center justify-between bg-black/50 backdrop-blur-xs shrink-0">
        <button
          type="button"
          onClick={() => {
            stopCamera();
            onClose();
          }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-white hover:bg-white/10 cursor-pointer"
          aria-label="Close camera"
        >
          <X className="w-6 h-6" />
        </button>
        <p className="text-sm font-semibold">Take Photo</p>
        {!capturedUrl ? (
          <button
            type="button"
            onClick={() =>
              setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
            }
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-white hover:bg-white/10 cursor-pointer"
            title="Switch camera"
            aria-label="Switch camera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        ) : (
          <div className="w-11" />
        )}
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black p-3">
        {capturedUrl ? (
          <img
            src={capturedUrl}
            alt="Captured preview"
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        ) : cameraError ? (
          <div className="max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 text-center space-y-4">
            <Camera className="w-10 h-10 mx-auto text-slate-400" />
            <div className="space-y-1">
              <p className="text-sm font-bold">Camera access unavailable</p>
              <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
            </div>
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="w-full min-h-[44px] px-4 rounded-xl sanvad-accent-bg text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Open Device Camera / Photo</span>
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`max-h-full max-w-full rounded-xl object-contain ${
                facingMode === 'user' ? '-scale-x-100' : ''
              }`}
            />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-slate-300">
                Starting camera...
              </div>
            )}
          </>
        )}
        <input
          ref={nativeCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleNativeFallback(e)}
          className="hidden"
        />
      </div>

      <div className="px-6 py-5 bg-black/75 flex items-center justify-center gap-6 shrink-0">
        {capturedUrl ? (
          <>
            <button
              type="button"
              onClick={() => setCapturedUrl(null)}
              className="min-h-[48px] px-5 rounded-full bg-white/15 hover:bg-white/25 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={() => onCaptured(capturedUrl)}
              className="min-h-[48px] px-6 rounded-full sanvad-accent-bg text-sm font-semibold inline-flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Use Photo</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => nativeCameraInputRef.current?.click()}
              className="min-h-[44px] px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              title="Use system camera"
            >
              <Upload className="w-4 h-4" />
              <span>Native</span>
            </button>
            <button
              type="button"
              disabled={Boolean(cameraError) || starting || processing}
              onClick={() => void handleSnap()}
              className="w-16 h-16 rounded-full bg-white border-4 border-slate-400 hover:scale-105 active:scale-95 disabled:opacity-40 transition-transform cursor-pointer"
              aria-label="Capture photo"
            />
            <div className="w-16" />
          </div>
        )}
      </div>
    </div>
  );
};
