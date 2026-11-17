import React from 'react';
import { isUserRecentlyOnline } from '../lib/validation';
import type { PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

interface MentionSuggestionsProps {
  members: PublicUser[];
  activeIndex: number;
  onSelect: (user: PublicUser) => void;
}

export const MentionSuggestions: React.FC<MentionSuggestionsProps> = ({
  members,
  activeIndex,
  onSelect,
}) => {
  if (members.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="Mention a chat member"
      className="absolute bottom-full left-3 right-3 sm:left-5 sm:right-auto sm:w-80 mb-2 z-30 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
    >
      <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        Mention someone
      </div>
      <div className="max-h-52 overflow-y-auto chat-scroll py-1">
        {members.map((member, idx) => {
          const online = isUserRecentlyOnline(member);
          const highlighted = idx === activeIndex;
          return (
            <button
              key={member.uid}
              type="button"
              role="option"
              aria-selected={highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(member);
              }}
              className={`w-full px-3.5 py-2 flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
                highlighted
                  ? 'bg-teal-50 dark:bg-teal-950/50'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
              }`}
            >
              <Avatar
                src={member.photoUrl}
                name={member.displayName}
                size="sm"
                isOnline={online}
                showPresence
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate text-slate-900 dark:text-white">
                  {member.displayName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  @{member.handle}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
