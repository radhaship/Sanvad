import React, { useMemo, useState } from 'react';
import { Check, Forward, Search, Send, X } from 'lucide-react';
import { formatAudioDuration } from '../lib/validation';
import type { Chat, ChatMessage } from '../types/chat';
import { Avatar } from './Avatar';

interface ForwardModalProps {
  message: ChatMessage;
  chats: Chat[];
  currentChatId: string;
  getChatDisplay: (chat: Chat) => {
    title: string;
    photoUrl: string;
    isGroup: boolean;
    subtitle: string;
  };
  onForward: (targetChatIds: string[]) => Promise<void>;
  onClose: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  message,
  chats,
  currentChatId,
  getChatDisplay,
  onForward,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats
      .filter((c) => c.id !== currentChatId)
      .filter((c) => {
        if (!q) return true;
        return getChatDisplay(c).title.toLowerCase().includes(q);
      });
  }, [chats, currentChatId, query, getChatDisplay]);

  const toggleSelect = (chatId: string) => {
    setSelectedIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId].slice(0, 10)
    );
  };

  const previewLabel =
    message.type === 'image'
      ? message.text || 'Photo'
      : message.type === 'audio'
      ? `Voice message (${formatAudioDuration(message.audioDuration)})`
      : message.type === 'poll'
      ? `Poll: ${message.text}`
      : message.type === 'meet'
      ? message.text || 'Google Meet video call'
      : message.text;

  const handleSubmit = async () => {
    if (selectedIds.length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      await onForward(selectedIds);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to forward message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Forward className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Forward Message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close forward modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 space-y-3 shrink-0">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 truncate">
            {previewLabel}
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-3">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats to forward..."
              className="w-full min-h-[42px] pl-2 bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto chat-scroll px-3 py-2 space-y-1">
          {filteredChats.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
              No other chats available to forward to.
            </p>
          ) : (
            filteredChats.map((chat) => {
              const meta = getChatDisplay(chat);
              const selected = selectedIds.includes(chat.id);
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => toggleSelect(chat.id)}
                  className={`w-full min-h-[54px] px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    selected
                      ? 'bg-teal-50 dark:bg-teal-950/50 border border-teal-300 dark:border-teal-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={meta.photoUrl} name={meta.title} isGroup={meta.isGroup} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{meta.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {meta.subtitle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border ${
                      selected
                        ? 'bg-teal-700 border-teal-700 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <p className="px-5 py-2 text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
        )}

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            disabled={selectedIds.length === 0 || sending}
            onClick={() => void handleSubmit()}
            className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? 'Forwarding...' : 'Forward'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
