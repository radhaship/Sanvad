import React from 'react';
import { CheckCheck, Clock, Eye, X } from 'lucide-react';
import { formatMessageTime } from '../lib/validation';
import type { Chat, ChatMessage, PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

interface MessageInfoModalProps {
  message: ChatMessage;
  chat: Chat;
  currentUid: string;
  memberProfiles: Record<string, PublicUser>;
  onClose: () => void;
}

export const MessageInfoModal: React.FC<MessageInfoModalProps> = ({
  message,
  chat,
  currentUid,
  memberProfiles,
  onClose,
}) => {
  const otherMemberUids = chat.memberUids.filter((uid) => uid !== message.senderId);
  const readUids = otherMemberUids.filter((uid) => message.readBy.includes(uid));
  const deliveredOnlyUids = otherMemberUids.filter(
    (uid) => message.deliveredTo.includes(uid) && !message.readBy.includes(uid)
  );
  const pendingUids = otherMemberUids.filter(
    (uid) => !message.deliveredTo.includes(uid) && !message.readBy.includes(uid)
  );

  const previewText =
    message.type === 'image'
      ? message.viewOnce
        ? 'View-once photo'
        : message.text || 'Photo'
      : message.type === 'file'
      ? message.fileName || 'Document'
      : message.type === 'audio'
      ? 'Voice message'
      : message.type === 'poll'
      ? `Poll: ${message.text}`
      : message.type === 'meet'
      ? 'Google Meet call'
      : message.text;

  const renderUserRow = (uid: string) => {
    const profile = memberProfiles[uid];
    return (
      <div key={uid} className="py-2 flex items-center gap-3">
        <Avatar
          src={profile?.photoUrl}
          name={profile?.displayName || 'Friend'}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {uid === currentUid ? 'You' : profile?.displayName || 'Friend'}
          </p>
          {profile?.handle && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              @{profile.handle}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Message Info</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close message info"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto chat-scroll p-5 space-y-5">
          {/* Message Summary */}
          <div className="rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/50 p-3.5 space-y-1">
            <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">
              {message.senderId === currentUid ? 'Sent by you' : `Sent by ${message.senderName}`}
            </p>
            <p className="text-sm text-slate-800 dark:text-slate-100 line-clamp-3 break-words">
              {previewText}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
              Sent at {formatMessageTime(message.createdAt) || 'Just now'}
              {message.editedAt ? ` · Edited ${formatMessageTime(message.editedAt)}` : ''}
            </p>
          </div>

          {/* Read By */}
          <div>
            <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 mb-2">
              <CheckCheck className="w-4 h-4" />
              <span>Read by ({readUids.length})</span>
            </p>
            {readUids.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">No one has read this yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {readUids.map(renderUserRow)}
              </div>
            )}
          </div>

          {/* Delivered To */}
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 mb-2">
              <CheckCheck className="w-4 h-4 text-slate-400" />
              <span>Delivered to ({deliveredOnlyUids.length})</span>
            </p>
            {deliveredOnlyUids.length === 0 ? (
              <p className="text-xs text-slate-400 py-1">
                {readUids.length === otherMemberUids.length && otherMemberUids.length > 0
                  ? 'All recipients have read it.'
                  : 'Waiting for delivery.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {deliveredOnlyUids.map(renderUserRow)}
              </div>
            )}
          </div>

          {/* Pending */}
          {pendingUids.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-2">
                <Clock className="w-4 h-4" />
                <span>Not delivered yet ({pendingUids.length})</span>
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingUids.map(renderUserRow)}
              </div>
            </div>
          )}

          {/* View-Once Opened By */}
          {message.viewOnce && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mb-2">
                <Eye className="w-4 h-4" />
                <span>View-once opened ({(message.viewedBy || []).length})</span>
              </p>
              {(message.viewedBy || []).length === 0 ? (
                <p className="text-xs text-slate-400">Photo has not been opened yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(message.viewedBy || []).map(renderUserRow)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
