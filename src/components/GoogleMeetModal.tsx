import React, { useState } from 'react';
import { Video, X } from 'lucide-react';
import { formatAuthError, getInMemoryGoogleAccessToken, signInWithGoogleForApp } from '../lib/firebase';
import { createGoogleMeetSpace, sendMeetMessage } from '../services/chatService';
import type { Chat, MessageReply } from '../types/chat';

interface GoogleMeetModalProps {
  chat: Chat;
  chatTitle: string;
  sender: { uid: string; displayName: string };
  replyTo?: MessageReply | null;
  onSent: () => void;
  onClose: () => void;
}

export const GoogleMeetModal: React.FC<GoogleMeetModalProps> = ({
  chat,
  chatTitle,
  sender,
  replyTo,
  onSent,
  onClose,
}) => {
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(!getInMemoryGoogleAccessToken());
  const [error, setError] = useState<string | null>(null);

  const handleCreateMeet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setError(null);
    setCreating(true);

    try {
      let token = getInMemoryGoogleAccessToken();
      if (!token) {
        const authRes = await signInWithGoogleForApp();
        token = authRes.accessToken;
        if (!token) {
          throw new Error('Could not obtain permission to create a Google Meet room.');
        }
        setNeedsReconnect(false);
      }

      const space = await createGoogleMeetSpace(token);
      await sendMeetMessage(chat, sender, space.meetingUri, space.meetingCode, note, replyTo);
      onSent();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start Google Meet.';
      if (msg === 'MEET_AUTH_REQUIRED') {
        setNeedsReconnect(true);
        setError('Please sign in again with Google to create a new Meet room.');
      } else {
        setError(formatAuthError(err));
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Start Google Meet
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Cancel Google Meet"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleCreateMeet(e)} className="p-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Create a new <strong>Google Meet</strong> room using your Google account and share the
            join link in <strong>{chatTitle}</strong> so everyone can talk live?
          </p>

          <div>
            <label
              htmlFor="meet-note"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
            >
              Call topic (optional)
            </label>
            <input
              id="meet-note"
              type="text"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., Weekend catch-up, Goa trip discussion"
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {needsReconnect && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              Google will prompt you to confirm Meet access before creating the video room.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="min-h-[42px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>
                {creating
                  ? 'Creating...'
                  : needsReconnect
                  ? 'Connect & Create Meet'
                  : 'Create & Share Meet'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
