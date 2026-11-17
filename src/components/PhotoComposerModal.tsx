import React, { useRef, useState } from 'react';
import { EyeOff, Plus, Reply, Send, Sticker, Trash2, X } from 'lucide-react';
import { compressChatPhoto } from '../lib/imageUtils';
import { LIMITS } from '../lib/validation';
import type { MessageReply } from '../types/chat';
import { MemeStickerEditorModal } from './MemeStickerEditorModal';

interface PhotoComposerModalProps {
  images: string[];
  replyPreview?: MessageReply | null;
  onClearReply?: () => void;
  onUpdateImages: (nextImages: string[]) => void;
  onClose: () => void;
  onSend: (images: string[], caption: string, viewOnce: boolean) => Promise<void>;
}

const MAX_BATCH_PHOTOS = 6;

export const PhotoComposerModal: React.FC<PhotoComposerModalProps> = ({
  images,
  replyPreview,
  onClearReply,
  onUpdateImages,
  onClose,
  onSend,
}) => {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [viewOnce, setViewOnce] = useState(false);
  const [editingMemeIdx, setEditingMemeIdx] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);

  const safeIdx = Math.min(selectedIdx, Math.max(0, images.length - 1));
  const activeImage = images[safeIdx] || '';

  const handleRemoveImage = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    if (next.length === 0) {
      onClose();
      return;
    }
    onUpdateImages(next);
    if (safeIdx >= next.length) {
      setSelectedIdx(next.length - 1);
    }
  };

  const handleAddMore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setErrorMsg(null);
    const remainingSlots = MAX_BATCH_PHOTOS - images.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`You can send up to ${MAX_BATCH_PHOTOS} photos at once.`);
      return;
    }

    const added: string[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      try {
        const compressed = await compressChatPhoto(file);
        added.push(compressed);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'One of the selected photos could not be processed.');
      }
    }
    if (added.length > 0) {
      const merged = [...images, ...added];
      onUpdateImages(merged);
      setSelectedIdx(merged.length - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || images.length === 0) return;
    setSending(true);
    setErrorMsg(null);
    try {
      await onSend(images, caption, viewOnce);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send photo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {images.length > 1 ? `Share ${images.length} Photos` : 'Share Photo'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Cancel photo"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative p-4 bg-slate-950 flex items-center justify-center h-[38vh] sm:h-[42vh] overflow-hidden">
          {activeImage && (
            <img
              src={activeImage}
              alt={`Photo preview ${safeIdx + 1}`}
              className="max-h-full w-auto rounded-lg object-contain"
            />
          )}
          {activeImage && (
            <button
              type="button"
              onClick={() => setEditingMemeIdx(safeIdx)}
              className="absolute top-3 left-3 min-h-[36px] px-3 rounded-xl bg-black/75 hover:bg-black/90 border border-white/20 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md cursor-pointer backdrop-blur-xs transition-colors"
              title="Crop into sticker or add funny meme text"
            >
              <Sticker className="w-3.5 h-3.5 text-teal-400" />
              <span>Meme / Sticker</span>
            </button>
          )}
          {images.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemoveImage(safeIdx)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center shadow-md cursor-pointer transition-colors"
              title="Remove this photo"
              aria-label="Remove this photo"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          {viewOnce && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/75 border border-white/20 text-white text-xs font-medium flex items-center gap-1.5 backdrop-blur-xs">
              <EyeOff className="w-3.5 h-3.5 text-teal-400" />
              <span>View once enabled</span>
            </div>
          )}
        </div>

        {/* Multi-photo thumbnail strip */}
        <div className="px-4 py-2.5 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                idx === safeIdx
                  ? 'border-teal-400 scale-105'
                  : 'border-transparent opacity-65 hover:opacity-100'
              }`}
              aria-label={`Select photo ${idx + 1}`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
          {images.length < MAX_BATCH_PHOTOS && (
            <button
              type="button"
              onClick={() => addMoreRef.current?.click()}
              className="w-12 h-12 rounded-xl border border-dashed border-slate-600 hover:border-teal-400 text-slate-300 hover:text-teal-300 flex flex-col items-center justify-center shrink-0 cursor-pointer transition-colors"
              title={`Add more photos (max ${MAX_BATCH_PHOTOS})`}
              aria-label="Add more photos"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[9px] font-semibold">Add</span>
            </button>
          )}
          <input
            ref={addMoreRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => void handleAddMore(e)}
            className="hidden"
          />
        </div>

        {errorMsg && (
          <p className="px-4 pt-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
            {errorMsg}
          </p>
        )}

        {replyPreview && (
          <div className="px-4 pt-3 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 rounded-xl bg-slate-100 dark:bg-slate-800 border-l-[3px] border-teal-600 dark:border-teal-400 px-3 py-1.5">
              <p className="text-[11px] font-semibold sanvad-accent-text flex items-center gap-1 truncate">
                <Reply className="w-3 h-3 shrink-0" />
                <span>Replying to {replyPreview.senderName}</span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                {replyPreview.previewText}
              </p>
            </div>
            {onClearReply && (
              <button
                type="button"
                onClick={onClearReply}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                aria-label="Remove reply quote"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="p-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewOnce((v) => !v)}
            aria-pressed={viewOnce}
            title={viewOnce ? 'View-once ON (tap to turn off)' : 'Set photo to View Once'}
            aria-label="Toggle view once photo"
            className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 ${
              viewOnce
                ? 'sanvad-accent-bg border-transparent'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-[11px] leading-none">
              1
            </span>
          </button>

          <input
            type="text"
            maxLength={LIMITS.MESSAGE_TEXT_MAX}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={viewOnce ? 'Add a caption (view-once)...' : 'Add a caption (optional)...'}
            className="flex-1 min-w-0 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            autoFocus
          />
          <button
            type="submit"
            disabled={sending}
            className="min-h-[44px] px-4 py-2 rounded-xl sanvad-accent-bg disabled:opacity-60 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>
              {sending
                ? 'Sending'
                : images.length > 1
                ? `Send (${images.length})`
                : 'Send'}
            </span>
          </button>
        </form>
      </div>

      {editingMemeIdx !== null && images[editingMemeIdx] && (
        <MemeStickerEditorModal
          imageSrc={images[editingMemeIdx]}
          onApply={(editedDataUrl) => {
            const next = [...images];
            next[editingMemeIdx] = editedDataUrl;
            onUpdateImages(next);
            setEditingMemeIdx(null);
          }}
          onClose={() => setEditingMemeIdx(null)}
        />
      )}
    </div>
  );
};
