import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Image as ImageIcon,
  Mic,
  Search,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { formatChatListTime } from '../lib/validation';
import type { StarredMessage } from '../types/chat';

interface StarredMessagesModalProps {
  starred: StarredMessage[];
  onOpenMessage: (chatId: string, messageId: string) => void;
  onRemoveStar: (starId: string) => Promise<void>;
  onClose: () => void;
}

export const StarredMessagesModal: React.FC<StarredMessagesModalProps> = ({
  starred,
  onOpenMessage,
  onRemoveStar,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return starred;
    return starred.filter(
      (s) =>
        s.previewText.toLowerCase().includes(q) ||
        s.chatTitle.toLowerCase().includes(q) ||
        s.senderName.toLowerCase().includes(q)
    );
  }, [starred, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Starred Messages ({starred.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close starred messages"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 shrink-0">
          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-3">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved messages..."
              className="w-full min-h-[42px] pl-2 bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto chat-scroll px-4 py-2 space-y-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Star className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {starred.length === 0 ? 'No starred messages yet' : 'No matching starred messages'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Tap the Star icon on any important message in a chat to save it privately here.
              </p>
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3 flex items-start justify-between gap-2.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    onOpenMessage(item.chatId, item.id);
                    onClose();
                  }}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 truncate">
                      {item.chatTitle} · {item.senderName}
                    </p>
                    <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                      {formatChatListTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-800 dark:text-slate-100 flex items-center gap-1.5 line-clamp-2 break-words">
                    {item.type === 'image' && <ImageIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                    {item.type === 'audio' && <Mic className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                    {item.type === 'poll' && <BarChart3 className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                    {item.type === 'meet' && <Video className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                    <span className="truncate">{item.previewText}</span>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => void onRemoveStar(item.id)}
                  className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-800 cursor-pointer shrink-0"
                  title="Remove star"
                  aria-label="Remove star"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
