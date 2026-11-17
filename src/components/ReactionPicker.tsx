import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { REACTION_EMOJIS } from '../lib/validation';

interface ReactionPickerProps {
  selectedEmoji?: string;
  align?: 'left' | 'right';
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({
  selectedEmoji,
  align = 'left',
  onSelect,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      role="menu"
      aria-label="Choose emoji reaction"
      className={`absolute bottom-full mb-1.5 z-30 flex items-center gap-0.5 px-1.5 py-1 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg ${
        align === 'right' ? 'right-0' : 'left-0'
      }`}
    >
      {REACTION_EMOJIS.map((emoji) => {
        const isActive = selectedEmoji === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-transform hover:scale-115 active:scale-95 cursor-pointer ${
              isActive
                ? 'bg-teal-50 dark:bg-teal-950/60 ring-1 ring-teal-500/40'
                : 'hover:bg-slate-100 dark:hover:bg-slate-700/70'
            }`}
            aria-label={`React with ${emoji}`}
            aria-pressed={isActive}
          >
            {emoji}
          </button>
        );
      })}
    </motion.div>
  );
};
