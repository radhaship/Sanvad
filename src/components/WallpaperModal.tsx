import React, { useState } from 'react';
import { Check, Palette, X } from 'lucide-react';
import { WALLPAPER_PRESETS } from '../lib/validation';
import { applyChatWallpaper } from '../services/chatService';
import type { WallpaperId } from '../types/chat';

interface WallpaperModalProps {
  uid: string;
  activeChatId?: string | null;
  activeChatTitle?: string;
  currentDefaultWallpaper: WallpaperId;
  chatWallpapers: Record<string, WallpaperId>;
  onClose: () => void;
}

export const WallpaperModal: React.FC<WallpaperModalProps> = ({
  uid,
  activeChatId,
  activeChatTitle,
  currentDefaultWallpaper,
  chatWallpapers,
  onClose,
}) => {
  const initialSelected =
    (activeChatId && chatWallpapers[activeChatId]) || currentDefaultWallpaper || 'default';

  const [selected, setSelected] = useState<WallpaperId>(initialSelected);
  const [scope, setScope] = useState<'chat' | 'all'>(activeChatId ? 'chat' : 'all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await applyChatWallpaper(
        uid,
        selected,
        scope,
        activeChatId || undefined,
        chatWallpapers
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save wallpaper.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Palette className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Chat Wallpaper</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close wallpaper picker"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {activeChatId && (
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setScope('chat')}
                className={`min-h-[36px] px-2 rounded-lg text-xs font-semibold transition-colors truncate cursor-pointer ${
                  scope === 'chat'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                This chat ({activeChatTitle || 'Chat'})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`min-h-[36px] px-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                All chats
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {WALLPAPER_PRESETS.map((preset) => {
              const isSelected = selected === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelected(preset.id)}
                  className={`group rounded-2xl border p-1.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-teal-600 ring-2 ring-teal-500/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div
                    className={`relative h-16 w-full rounded-xl overflow-hidden border border-slate-200/70 dark:border-slate-700/70 ${preset.swatchClass}`}
                  >
                    <div className="absolute right-2 bottom-2 w-10 h-3 rounded-full bg-teal-700/90" />
                    <div className="absolute left-2 top-2 w-12 h-3 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700/60" />
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center shadow">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 px-1 text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                    {preset.name}
                  </p>
                </button>
              );
            })}
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleApply()}
              className="min-h-[42px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {saving ? 'Applying...' : 'Apply Wallpaper'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
