import React, { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play } from 'lucide-react';
import { formatAudioDuration } from '../lib/validation';

interface AudioMessagePlayerProps {
  src: string;
  durationHint?: number;
  onDarkBubble?: boolean;
}

export const AudioMessagePlayer: React.FC<AudioMessagePlayerProps> = ({
  src,
  durationHint = 0,
  onDarkBubble = false,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHint);

  useEffect(() => {
    setDuration(durationHint);
    setCurrentTime(0);
    setIsPlaying(false);
  }, [src, durationHint]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const val = Number(e.target.value);
    if (!audio || !Number.isFinite(val)) return;
    audio.currentTime = val;
    setCurrentTime(val);
  };

  const totalSec = Number.isFinite(duration) && duration > 0 ? duration : durationHint || 1;
  const progressPct = Math.min(100, Math.max(0, (currentTime / Math.max(totalSec, 0.1)) * 100));

  return (
    <div className="flex items-center gap-2.5 min-w-[205px] sm:min-w-[235px] py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      <button
        type="button"
        onClick={() => void togglePlay()}
        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
          onDarkBubble
            ? 'bg-white text-teal-800 hover:bg-teal-50'
            : 'bg-teal-700 text-white hover:bg-teal-800'
        }`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="relative h-5 flex items-center">
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden ${
              onDarkBubble ? 'bg-white/25' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                onDarkBubble ? 'bg-white' : 'bg-teal-600 dark:bg-teal-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={totalSec}
            step={0.1}
            value={Math.min(currentTime, totalSec)}
            onChange={handleSeek}
            aria-label="Seek voice message"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div
          className={`flex items-center justify-between text-[11px] tabular-nums ${
            onDarkBubble ? 'text-teal-50/90' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <Mic className="w-3 h-3" />
            <span>{formatAudioDuration(isPlaying ? currentTime : totalSec)}</span>
          </span>
          <span>Voice note</span>
        </div>
      </div>
    </div>
  );
};
