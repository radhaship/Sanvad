import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Send, SmilePlus, Trash2, X } from 'lucide-react';
import type { StatusMessage } from '../types/chat';
import { Avatar } from './Avatar';

const STATUS_REACTIONS = ['❤️', '🔥', '😂', '👏', '😮', '👍', '😢', '🎉'] as const;

interface StatusViewerModalProps {
  statuses: StatusMessage[];
  initialIndex?: number;
  currentUid: string;
  onMarkViewed: (statusId: string, viewers: string[]) => void;
  onDeleteStatus: (statusId: string) => Promise<void>;
  onReplyToStatus: (
    statusOwnerUid: string,
    statusOwnerName: string,
    messageText: string,
    options?: { openChat?: boolean }
  ) => Promise<void>;
  onClose: () => void;
}

export const StatusViewerModal: React.FC<StatusViewerModalProps> = ({
  statuses,
  initialIndex = 0,
  currentUid,
  onMarkViewed,
  onDeleteStatus,
  onReplyToStatus,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [replyFocused, setReplyFocused] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [showViewersList, setShowViewersList] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [selectedEmojiReaction, setSelectedEmojiReaction] = useState<string | null>(null);
  const [reactionFeedback, setReactionFeedback] = useState<{ emoji: string; recipient: string } | null>(
    null
  );
  const [reactionError, setReactionError] = useState<string | null>(null);

  const activeStatus = statuses[currentIndex];
  const isPaused =
    showReactionPicker ||
    showViewersList ||
    replyFocused ||
    replyText.trim().length > 0 ||
    sendingReply ||
    Boolean(reactionFeedback);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!activeStatus) return;
    onMarkViewed(activeStatus.id, activeStatus.viewers || []);
    setProgress(0);
    setShowReactionPicker(false);
    setSelectedEmojiReaction(null);
    setReactionFeedback(null);
    setReactionError(null);
  }, [currentIndex, activeStatus?.id]);

  useEffect(() => {
    if (!activeStatus || isPaused) return;
    const intervalTime = activeStatus.type === 'image' ? 6000 : 5000;
    const stepTime = 50;
    const increment = (stepTime / intervalTime) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + increment));
    }, stepTime);

    return () => clearInterval(timer);
  }, [currentIndex, activeStatus, isPaused]);

  useEffect(() => {
    if (!activeStatus || progress < 100) return;
    if (currentIndex < statuses.length - 1) {
      setCurrentIndex((i) => i + 1);
      setProgress(0);
    } else {
      onCloseRef.current();
    }
  }, [progress, currentIndex, statuses.length, activeStatus]);

  if (!activeStatus) return null;

  const isOwn = activeStatus.uid === currentUid;
  const viewers = activeStatus.viewers || [];

  const getStatusLabel = () => {
    const snippet = activeStatus.text.trim();
    if (snippet) {
      return snippet.length > 80 ? `${snippet.slice(0, 77)}...` : snippet;
    }
    return activeStatus.type === 'image' ? 'Photo status' : 'Status update';
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReply = replyText.trim();
    if (!cleanReply || sendingReply) return;
    setSendingReply(true);
    setReactionError(null);
    try {
      const msg = `Replying to your status ("${getStatusLabel()}"): ${cleanReply}`;
      await onReplyToStatus(activeStatus.uid, activeStatus.displayName, msg, { openChat: true });
      setReplyText('');
      onClose();
    } catch (err) {
      setReactionError(err instanceof Error ? err.message : 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleEmojiReaction = async (emoji: string) => {
    if (sendingReply || isOwn) return;
    setSelectedEmojiReaction(emoji);
    setSendingReply(true);
    setReactionError(null);
    try {
      const msg = `Reacted ${emoji} to your status: "${getStatusLabel()}"`;
      await onReplyToStatus(activeStatus.uid, activeStatus.displayName, msg, { openChat: false });
      setShowReactionPicker(false);
      setReactionFeedback({ emoji, recipient: activeStatus.displayName });
      setTimeout(() => {
        setSelectedEmojiReaction(null);
        setReactionFeedback(null);
      }, 1600);
    } catch (err) {
      setSelectedEmojiReaction(null);
      setReactionError(err instanceof Error ? err.message : 'Could not send reaction.');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md">
      <div className="relative w-full max-w-md h-full sm:h-[88dvh] sm:rounded-3xl bg-slate-900 flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Top Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-3 flex items-center gap-1.5 bg-gradient-to-b from-black/75 to-transparent pb-6">
          {statuses.map((s, idx) => (
            <div key={s.id} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-75"
                style={{
                  width:
                    idx < currentIndex
                      ? '100%'
                      : idx === currentIndex
                      ? `${progress}%`
                      : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header / Author info */}
        <div className="absolute top-4 left-0 right-0 z-20 px-4 pt-3 flex items-center justify-between gap-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={activeStatus.photoUrl} name={activeStatus.displayName} size="md" />
            <div className="min-w-0 text-white">
              <p className="text-sm font-bold truncate">{activeStatus.displayName}</p>
              <p className="text-[11px] text-slate-300">24-hour status</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isOwn && (
              <button
                type="button"
                onClick={async () => {
                  await onDeleteStatus(activeStatus.id);
                  if (statuses.length <= 1) {
                    onClose();
                  } else if (currentIndex >= statuses.length - 1) {
                    setCurrentIndex((i) => Math.max(0, i - 1));
                  }
                }}
                className="w-10 h-10 rounded-full bg-black/40 hover:bg-rose-600/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                title="Delete status"
                aria-label="Delete status"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          className={`flex-1 flex flex-col items-center justify-center p-6 text-center relative ${
            activeStatus.type === 'text'
              ? `bg-gradient-to-br ${activeStatus.background || 'from-teal-600 to-sky-800'}`
              : 'bg-black'
          }`}
        >
          {activeStatus.type === 'image' && activeStatus.mediaData ? (
            <div className="relative flex items-center justify-center max-w-full max-h-[68vh]">
              <img
                src={activeStatus.mediaData}
                alt={activeStatus.text ? `Status from ${activeStatus.displayName}: ${activeStatus.text}` : `Status image from ${activeStatus.displayName}`}
                className="max-h-[68vh] max-w-full object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
              {!isOwn && (
                <button
                  type="button"
                  onClick={() => setShowReactionPicker((open) => !open)}
                  aria-expanded={showReactionPicker}
                  aria-label="Add reaction"
                  className={`absolute bottom-3 right-3 z-20 min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 backdrop-blur-md shadow-lg transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap ${
                    showReactionPicker
                      ? 'bg-teal-600 border-teal-400 text-white'
                      : 'bg-black/70 hover:bg-black/85 border-white/20 text-white'
                  }`}
                >
                  <SmilePlus className="w-4 h-4 shrink-0" />
                  <span>Add reaction</span>
                </button>
              )}
            </div>
          ) : (
            <p className="text-xl sm:text-2xl font-bold text-white px-4 leading-relaxed whitespace-pre-wrap break-words [text-wrap:balance]">
              {activeStatus.text}
            </p>
          )}

          {/* Floating reaction sent feedback overlay */}
          {reactionFeedback && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-x-4 bottom-20 z-30 flex justify-center pointer-events-none"
            >
              <div className="px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-teal-400/40 text-white shadow-2xl flex items-center gap-2.5 animate-bounce">
                <span className="text-2xl leading-none" aria-hidden="true">
                  {reactionFeedback.emoji}
                </span>
                <div className="text-left">
                  <p className="text-xs font-semibold flex items-center gap-1 text-teal-300">
                    <Check className="w-3.5 h-3.5" />
                    <span>Reaction sent</span>
                  </p>
                  <p className="text-[11px] text-slate-300">
                    Delivered to {reactionFeedback.recipient}&apos;s chat
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeStatus.type === 'image' && activeStatus.text && (
            <div className="mt-3 max-w-full px-4 py-2 rounded-xl bg-black/65 backdrop-blur-xs text-white text-sm">
              {activeStatus.text}
            </div>
          )}
        </div>

        {/* Navigation tap areas */}
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/35 hover:bg-black/60 text-white flex items-center justify-center disabled:opacity-0 transition-opacity cursor-pointer z-10"
          aria-label="Previous status"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => setCurrentIndex((i) => Math.min(statuses.length - 1, i + 1))}
          disabled={currentIndex === statuses.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/35 hover:bg-black/60 text-white flex items-center justify-center disabled:opacity-0 transition-opacity cursor-pointer z-10"
          aria-label="Next status"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Footer: View counts or Add reaction + Reply */}
        <div className="px-4 py-3 bg-black/85 backdrop-blur-md flex flex-col gap-2.5 shrink-0 z-20 border-t border-white/10">
          {isOwn ? (
            <div className="flex items-center justify-between text-xs text-slate-300">
              <button
                type="button"
                onClick={() => setShowViewersList((o) => !o)}
                className="min-h-[40px] flex items-center gap-1.5 hover:text-white cursor-pointer"
              >
                <Eye className="w-4 h-4 text-teal-400" />
                <span>{viewers.length} {viewers.length === 1 ? 'view' : 'views'}</span>
              </button>
              <span>Posted 24h status</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {showReactionPicker && (
                <div
                  role="region"
                  aria-label="Status emoji reactions"
                  className="rounded-2xl bg-slate-800/95 border border-white/15 p-2.5 space-y-2 shadow-xl"
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-medium text-slate-300">
                      Send quick reaction to {activeStatus.displayName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowReactionPicker(false)}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      aria-label="Close reaction picker"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {STATUS_REACTIONS.map((emoji) => {
                      const isSelected = selectedEmojiReaction === emoji;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          disabled={sendingReply}
                          onClick={() => void handleEmojiReaction(emoji)}
                          className={`min-h-[44px] rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xl flex items-center justify-center transition-all duration-150 cursor-pointer ${
                            isSelected
                              ? 'scale-110 bg-teal-600 ring-2 ring-teal-300'
                              : ''
                          }`}
                          title={`Send ${emoji} reaction`}
                          aria-label={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {reactionError && (
                <p className="text-[11px] font-medium text-rose-400 px-1 break-words">
                  {reactionError}
                </p>
              )}

              <form onSubmit={(e) => void handleSendReply(e)} className="flex items-center gap-2">
                {activeStatus.type !== 'image' && (
                  <button
                    type="button"
                    onClick={() => setShowReactionPicker((open) => !open)}
                    disabled={sendingReply}
                    aria-expanded={showReactionPicker}
                    aria-label="Add reaction"
                    title="Add reaction"
                    className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer whitespace-nowrap ${
                      showReactionPicker
                        ? 'bg-teal-600 border-teal-400 text-white'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <SmilePlus className="w-4 h-4 shrink-0" />
                    <span>Add reaction</span>
                  </button>
                )}
                <input
                  type="text"
                  value={replyText}
                  onFocus={() => setReplyFocused(true)}
                  onBlur={() => setReplyFocused(false)}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${activeStatus.displayName}...`}
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  type="submit"
                  disabled={!replyText.trim() || sendingReply}
                  className="min-w-[44px] min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer shrink-0"
                  title="Send reply"
                  aria-label="Send reply"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {showViewersList && isOwn && (
            <div className="max-h-36 overflow-y-auto chat-scroll rounded-xl bg-slate-800 p-2 space-y-1 text-xs text-slate-200">
              <p className="font-semibold text-slate-400 px-2 pb-1">Viewers ({viewers.length})</p>
              {viewers.length === 0 ? (
                <p className="px-2 text-slate-400">No views yet.</p>
              ) : (
                viewers.map((vUid) => (
                  <div key={vUid} className="px-2 py-1 rounded-lg bg-slate-700/50 flex items-center gap-2">
                    <Avatar name={vUid} size="sm" />
                    <span className="truncate">User ID: {vUid.slice(0, 8)}...</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
