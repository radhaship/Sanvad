import React, { useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Send, Sparkles, X } from 'lucide-react';
import { compressChatPhoto } from '../lib/imageUtils';
import { LIMITS } from '../lib/validation';
import { createStatusUpdate } from '../services/chatService';
import type { Chat, PrivateUser } from '../types/chat';

const GRADIENT_PRESETS = [
  { name: 'Teal Sky', class: 'from-teal-600 to-sky-700' },
  { name: 'Sunset Amber', class: 'from-amber-600 to-rose-700' },
  { name: 'Midnight Aurora', class: 'from-violet-700 to-indigo-900' },
  { name: 'Emerald Glow', class: 'from-emerald-600 to-teal-800' },
  { name: 'Rose Velvet', class: 'from-rose-600 to-pink-800' },
] as const;

interface StatusComposerModalProps {
  currentUser: PrivateUser;
  chats: Chat[];
  onClose: () => void;
}

export const StatusComposerModal: React.FC<StatusComposerModalProps> = ({
  currentUser,
  chats,
  onClose,
}) => {
  const [tab, setTab] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [mediaData, setMediaData] = useState('');
  const [background, setBackground] = useState<string>(GRADIENT_PRESETS[0].class);
  const [privacy, setPrivacy] = useState<'everyone' | 'contacts'>('everyone');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contactUids = React.useMemo(() => {
    const set = new Set<string>([currentUser.uid]);
    chats.forEach((c) => c.memberUids.forEach((u: string) => set.add(u)));
    return Array.from(set);
  }, [chats, currentUser.uid]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressChatPhoto(file);
      setMediaData(compressed);
      setTab('image');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process status photo.');
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting) return;
    if (tab === 'text' && !text.trim()) {
      setError('Please write something for your status.');
      return;
    }
    if (tab === 'image' && !mediaData) {
      setError('Please select a photo for your status.');
      return;
    }

    setPosting(true);
    setError(null);
    try {
      await createStatusUpdate(
        currentUser,
        tab,
        text,
        mediaData,
        background,
        privacy,
        contactUids
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post status update.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Status Update</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close status composer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePost} className="flex-1 overflow-y-auto chat-scroll p-5 space-y-4">
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => setTab('text')}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'text'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Text Status
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'image'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Photo Status
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {tab === 'text' ? (
            <div className="space-y-3">
              <div
                className={`w-full h-48 rounded-2xl bg-gradient-to-br ${background} p-6 flex flex-col items-center justify-center text-center shadow-md`}
              >
                <textarea
                  rows={3}
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type your status update..."
                  className="w-full bg-transparent text-white placeholder-white/70 text-center text-lg sm:text-xl font-bold focus:outline-none resize-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Background Gradient
                </label>
                <div className="flex flex-wrap gap-2">
                  {GRADIENT_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setBackground(p.class)}
                      className={`h-9 px-3 rounded-xl bg-gradient-to-br ${p.class} text-white text-xs font-medium border-2 transition-transform cursor-pointer ${
                        background === p.class ? 'border-white scale-105 shadow-md' : 'border-transparent'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-full h-56 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center relative">
                {mediaData ? (
                  <img src={mediaData} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 text-slate-500 hover:text-teal-700 cursor-pointer"
                  >
                    <Camera className="w-8 h-8" />
                    <span className="text-xs font-medium">Click to upload photo</span>
                  </button>
                )}
              </div>

              <div>
                <label
                  htmlFor="status-caption"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                >
                  Caption (Optional)
                </label>
                <input
                  id="status-caption"
                  type="text"
                  maxLength={200}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Add a caption..."
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
              Who can see this status?
            </label>
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setPrivacy('everyone')}
                className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  privacy === 'everyone'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Everyone
              </button>
              <button
                type="button"
                onClick={() => setPrivacy('contacts')}
                className={`flex-1 min-h-[36px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  privacy === 'contacts'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Only my contacts
              </button>
            </div>
          </div>

          {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={posting}
            className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{posting ? 'Posting Status...' : 'Post 24h Status'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
