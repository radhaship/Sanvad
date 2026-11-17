import React, { useRef, useState } from 'react';
import { Camera, Check, Search, UserPlus, Users, X } from 'lucide-react';
import { compressAvatarImage } from '../lib/imageUtils';
import { isUserRecentlyOnline, LIMITS } from '../lib/validation';
import {
  createGroupChat,
  joinGroupByInviteCode,
  lookupUserByHandle,
  startDirectChat,
} from '../services/chatService';
import type { PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

interface NewChatModalProps {
  initialTab?: 'direct' | 'group' | 'join';
  currentUid: string;
  directoryUsers: PublicUser[];
  onChatOpened: (chatId: string) => void;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  initialTab = 'direct',
  currentUid,
  directoryUsers,
  onChatOpened,
  onClose,
}) => {
  const [tab, setTab] = useState<'direct' | 'group' | 'join'>(initialTab);
  const [handleInput, setHandleInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<PublicUser | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState('');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const otherUsers = directoryUsers.filter((u) => u.uid !== currentUid);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFoundUser(null);
    if (!handleInput.trim()) return;
    setSearching(true);
    try {
      const user = await lookupUserByHandle(handleInput);
      if (!user) {
        setError('No user found with that @handle.');
      } else if (user.uid === currentUid) {
        setError('That is your own handle.');
      } else {
        setFoundUser(user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  };

  const handleStartDM = async (otherUid: string) => {
    setError(null);
    setSubmitting(true);
    try {
      const chatId = await startDirectChat(currentUid, otherUid);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMember = (uid: string) => {
    setSelectedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleGroupPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressAvatarImage(file);
      setGroupPhoto(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process group photo.');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }
    setSubmitting(true);
    try {
      const chatId = await createGroupChat(currentUid, groupName, groupPhoto, selectedUids);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let cleanCode = inviteCode.trim();
    if (cleanCode.includes('join=')) {
      try {
        const url = new URL(cleanCode);
        cleanCode = url.searchParams.get('join') || cleanCode;
      } catch {
        const parts = cleanCode.split('join=');
        cleanCode = parts[1]?.split('&')[0] || cleanCode;
      }
    }
    if (!cleanCode) {
      setError('Enter a group invite code or link.');
      return;
    }
    setSubmitting(true);
    try {
      const chatId = await joinGroupByInviteCode(currentUid, cleanCode);
      onChatOpened(chatId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join group.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Start Conversation</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Control Tabs */}
        <div className="px-5 pt-4 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setTab('direct');
                setError(null);
              }}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'direct'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Personal Chat
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('group');
                setError(null);
              }}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'group'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Create Group
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('join');
                setError(null);
              }}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                tab === 'join'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Join Group
            </button>
          </div>
        </div>

        <div className="overflow-y-auto chat-scroll p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {tab === 'direct' && (
            <>
              <form onSubmit={(e) => void handleLookup(e)} className="flex items-center gap-2">
                <div className="flex-1 flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={handleInput}
                    onChange={(e) => setHandleInput(e.target.value)}
                    placeholder="Find friend by @handle"
                    className="w-full min-h-[42px] pl-2 bg-transparent text-sm focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="min-h-[42px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer shrink-0"
                >
                  {searching ? '...' : 'Find'}
                </button>
              </form>

              {foundUser && (
                <div className="p-3 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={foundUser.photoUrl}
                      name={foundUser.displayName}
                      isOnline={isUserRecentlyOnline(foundUser)}
                      showPresence
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{foundUser.displayName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        @{foundUser.handle} ·{' '}
                        {isUserRecentlyOnline(foundUser) ? 'Online' : 'Offline'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleStartDM(foundUser.uid)}
                    className="min-h-[38px] px-3.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer shrink-0"
                  >
                    Message
                  </button>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                  Your Chat Connections ({otherUsers.length})
                </p>
                {otherUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                    Other users&apos; names stay private. Enter a friend&apos;s exact @handle above
                    or share your Friend Link from Profile to start chatting!
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {otherUsers.map((person) => {
                      const online = isUserRecentlyOnline(person);
                      return (
                        <button
                          key={person.uid}
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleStartDM(person.uid)}
                          className="w-full py-2.5 px-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              src={person.photoUrl}
                              name={person.displayName}
                              isOnline={online}
                              showPresence
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{person.displayName}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                @{person.handle} · {online ? 'Online' : 'Offline'}
                              </p>
                            </div>
                          </div>
                          <UserPlus className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'group' && (
            <form onSubmit={(e) => void handleCreateGroup(e)} className="space-y-4">
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                  title="Upload group photo"
                >
                  {groupPhoto ? (
                    <img src={groupPhoto} alt="Group avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-5 h-5 text-slate-500" />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleGroupPhoto(e)}
                  className="hidden"
                />
                <div className="flex-1">
                  <label
                    htmlFor="group-name"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
                  >
                    Group Name
                  </label>
                  <input
                    id="group-name"
                    type="text"
                    maxLength={LIMITS.GROUP_NAME_MAX}
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., College Gang, Goa Trip"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Add Friends ({selectedUids.length} selected)
                </p>
                {otherUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                    You can create the group now and share its invite link with friends!
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto chat-scroll divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                    {otherUsers.map((person) => {
                      const picked = selectedUids.includes(person.uid);
                      return (
                        <button
                          key={person.uid}
                          type="button"
                          onClick={() => toggleMember(person.uid)}
                          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar
                              src={person.photoUrl}
                              name={person.displayName}
                              size="sm"
                              isOnline={isUserRecentlyOnline(person)}
                              showPresence
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{person.displayName}</p>
                              <p className="text-xs text-slate-500 truncate">@{person.handle}</p>
                            </div>
                          </div>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                              picked
                                ? 'bg-teal-700 border-teal-700 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {picked && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Users className="w-4 h-4" />
                <span>{submitting ? 'Creating Group...' : 'Create Group'}</span>
              </button>
            </form>
          )}

          {tab === 'join' && (
            <form onSubmit={(e) => void handleJoinGroup(e)} className="space-y-4">
              <div>
                <label
                  htmlFor="join-code"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                >
                  Group Invite Code or Link
                </label>
                <input
                  id="join-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste invite code (e.g., invXXXXXXXX)"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {submitting ? 'Joining...' : 'Join Group'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
