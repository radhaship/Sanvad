import React, { useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  Copy,
  Download,
  FileText,
  Image as ImageIcon,
  ListChecks,
  LogOut,
  Palette,
  Pin,
  PinOff,
  ShieldCheck,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { compressAvatarImage } from '../lib/imageUtils';
import { formatFileSize, formatLastSeen, isUserRecentlyOnline, LIMITS } from '../lib/validation';
import {
  addMemberToGroup,
  leaveGroup,
  lookupUserByHandle,
  removeMemberFromGroup,
  updateGroupInfo,
} from '../services/chatService';
import type { Chat, ChatMessage, DisappearingDuration, PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

const DISAPPEARING_OPTIONS: { value: DisappearingDuration; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 86400, label: '24 Hours' },
  { value: 604800, label: '7 Days' },
  { value: 2592000, label: '30 Days' },
];

interface ChatInfoDrawerProps {
  chat: Chat;
  currentUid: string;
  members: PublicUser[];
  messages: ChatMessage[];
  isPinned: boolean;
  isArchived: boolean;
  isMuted: boolean;
  isBlocked: boolean;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onToggleMute: () => void;
  onToggleBlock?: () => void;
  onDisappearingChange: (seconds: DisappearingDuration) => Promise<void>;
  onDeleteChat: () => Promise<void>;
  onOpenWallpaper: () => void;
  onOpenMeet: () => void;
  onOpenChecklist?: () => void;
  openChecklistCount?: number;
  onImageClick: (url: string, caption: string) => void;
  onLeftGroup: () => void;
  onClose: () => void;
}

export const ChatInfoDrawer: React.FC<ChatInfoDrawerProps> = ({
  chat,
  currentUid,
  members,
  messages,
  isPinned,
  isArchived,
  isMuted,
  isBlocked,
  onTogglePin,
  onToggleArchive,
  onToggleMute,
  onToggleBlock,
  onDisappearingChange,
  onDeleteChat,
  onOpenWallpaper,
  onOpenMeet,
  onOpenChecklist,
  openChecklistCount = 0,
  onImageClick,
  onLeftGroup,
  onClose,
}) => {
  const isGroup = chat.type === 'group';
  const isAdmin = chat.adminUids.includes(currentUid);
  const canEditChatSettings = !isGroup || isAdmin;
  const otherMember = !isGroup ? members.find((m) => m.uid !== currentUid) : undefined;

  const [tab, setTab] = useState<'info' | 'photos' | 'files'>('info');
  const [groupName, setGroupName] = useState(chat.name);
  const [groupBio, setGroupBio] = useState(chat.groupBio || '');
  const [allowMembersEdit, setAllowMembersEdit] = useState(Boolean(chat.allowMembersEditInfo));
  const [groupPhoto, setGroupPhoto] = useState(chat.photoUrl);
  const [savingGroup, setSavingGroup] = useState(false);
  const [savingTimer, setSavingTimer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);
  const [addHandle, setAddHandle] = useState('');
  const [adding, setAdding] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sharedPhotos = messages.filter((m) => m.type === 'image' && m.imageData && !m.viewOnce);
  const sharedFiles = messages.filter((m) => m.type === 'file' && m.fileData);
  const currentTimer: DisappearingDuration = chat.disappearingSeconds ?? 0;
  const isMember = chat.memberUids.includes(currentUid);
  const canEditGroupInfo = isAdmin || (isGroup && chat.allowMembersEditInfo === true);

  const handleGroupPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressAvatarImage(file);
      setGroupPhoto(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress photo.');
    }
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavingGroup(true);
    try {
      await updateGroupInfo(
        chat.id,
        groupName,
        groupBio,
        groupPhoto,
        isAdmin ? allowMembersEdit : undefined
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update group.');
    } finally {
      setSavingGroup(false);
    }
  };

  const handleCopyInvite = async () => {
    const link = `${window.location.origin}/?join=${encodeURIComponent(chat.inviteCode)}`;
    await navigator.clipboard.writeText(link);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleAddByHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!addHandle.trim()) return;
    setAdding(true);
    try {
      const user = await lookupUserByHandle(addHandle);
      if (!user) {
        setError('User handle not found.');
      } else if (chat.memberUids.includes(user.uid)) {
        setError('This friend is already in the group.');
      } else {
        await addMemberToGroup(chat, user.uid);
        setAddHandle('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member.');
    } finally {
      setAdding(false);
    }
  };

  const handleLeave = async () => {
    setError(null);
    try {
      await leaveGroup(chat, currentUid);
      onLeftGroup();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave group.');
    }
  };

  const handleTimerSelect = async (seconds: DisappearingDuration) => {
    if (savingTimer || !canEditChatSettings || currentTimer === seconds) return;
    setError(null);
    setSavingTimer(true);
    try {
      await onDisappearingChange(seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update disappearing timer.');
    } finally {
      setSavingTimer(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (deletingChat) return;
    setError(null);
    setDeletingChat(true);
    try {
      await onDeleteChat();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chat.');
      setDeletingChat(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {isGroup ? 'Group Info' : 'Contact Info'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-3 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setTab('info')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'info'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setTab('photos')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'photos'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Photos ({sharedPhotos.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('files')}
              className={`min-h-[38px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === 'files'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Files ({sharedFiles.length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto chat-scroll p-5 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {tab === 'info' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onTogglePin}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isPinned
                      ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500/50 text-teal-700 dark:text-teal-300'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  <span>{isPinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleMute}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isMuted
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400/60 text-amber-800 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                  <span>{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleArchive}
                  className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isArchived
                      ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400/60 text-amber-800 dark:text-amber-300'
                      : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isArchived ? (
                    <ArchiveRestore className="w-3.5 h-3.5" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  <span>{isArchived ? 'Unarchive' : 'Archive Chat'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const chatTitle = isGroup ? chat.name : (otherMember?.displayName || 'Chat');
                    const lines = messages.map((m) => {
                      const timeStr = m.createdAt?.toDate?.()?.toLocaleString() ?? 'Recent';
                      const sender = m.senderName || 'User';
                      const content = m.type === 'image' ? (m.text ? `[Photo: ${m.text}]` : '[Photo]') : m.type === 'file' ? `[File: ${m.fileName}]` : m.type === 'audio' ? '[Voice Message]' : m.type === 'poll' ? `[Poll: ${m.text}]` : m.type === 'meet' ? '[Google Meet Call]' : m.text;
                      return `[${timeStr}] ${sender}: ${content}`;
                    });
                    const blob = new Blob([`Chat Export: ${chatTitle}\nExported on: ${new Date().toLocaleString()}\n\n` + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `sanvad-chat-${chat.id.slice(0, 8)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export (.txt)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWallpaper();
                  }}
                  className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Palette className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                  <span>Wallpaper</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMeet();
                  }}
                  className={`${
                    isGroup && onOpenChecklist ? '' : 'col-span-2'
                  } min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer`}
                >
                  <Video className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isGroup && onOpenChecklist ? 'Google Meet' : 'Start Google Meet Video Call'}</span>
                </button>
                {isGroup && onOpenChecklist && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChecklist();
                    }}
                    className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ListChecks className="w-3.5 h-3.5 sanvad-accent-text shrink-0" />
                    <span className="truncate">
                      Checklist{openChecklistCount > 0 ? ` (${openChecklistCount})` : ''}
                    </span>
                  </button>
                )}
              </div>

              {/* Disappearing Messages */}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                    <Timer className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    <span>Disappearing Messages</span>
                  </p>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {DISAPPEARING_OPTIONS.find((o) => o.value === currentTimer)?.label || 'Off'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {canEditChatSettings
                    ? 'Messages older than the selected timer automatically disappear from chat.'
                    : 'Only group admins can change the disappearing messages timer.'}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {DISAPPEARING_OPTIONS.map((opt) => {
                    const active = currentTimer === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={!canEditChatSettings || savingTimer}
                        onClick={() => void handleTimerSelect(opt.value)}
                        className={`min-h-[36px] px-2 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                          active
                            ? 'bg-teal-700 border-teal-700 text-white'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isGroup ? (
                <>
                  <div className="flex flex-col items-center text-center">
                    <div className="relative">
                      <Avatar src={groupPhoto} name={chat.name} size="xl" isGroup />
                      {canEditGroupInfo && (
                        <>
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center shadow cursor-pointer"
                            title="Change group photo"
                          >
                            <Camera className="w-4 h-4" />
                          </button>
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => void handleGroupPhotoChange(e)}
                            className="hidden"
                          />
                        </>
                      )}
                    </div>

                    {canEditGroupInfo ? (
                      <form onSubmit={(e) => void handleSaveGroup(e)} className="mt-4 w-full space-y-3">
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 text-left mb-1">
                            Group Name
                          </label>
                          <input
                            type="text"
                            maxLength={LIMITS.GROUP_NAME_MAX}
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="Group name"
                            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 text-left mb-1">
                            Group Bio / Description
                          </label>
                          <textarea
                            maxLength={200}
                            rows={2}
                            value={groupBio}
                            onChange={(e) => setGroupBio(e.target.value)}
                            placeholder="Add group description or rules..."
                            className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={savingGroup}
                          className="w-full min-h-[40px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                        >
                          {savingGroup ? 'Saving...' : 'Save Group Info'}
                        </button>
                      </form>
                    ) : (
                      <div className="mt-3 text-center">
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">{chat.name}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 max-w-xs break-words">
                          {chat.groupBio || 'No group description.'}
                        </p>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                            Allow Members to Edit Group Info
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            If enabled, any group member can change group name, bio, and photo.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={allowMembersEdit}
                          onClick={() => setAllowMembersEdit((v) => !v)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 shrink-0 cursor-pointer ${
                            allowMembersEdit ? 'bg-teal-700 dark:bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-150 ${
                              allowMembersEdit ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Invite Code */}
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">Group Invite Code: {chat.inviteCode}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Friends can join using this link or code.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleCopyInvite()}
                      className="min-h-[38px] px-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {copiedInvite ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedInvite ? 'Copied' : 'Copy Link'}</span>
                    </button>
                  </div>

                  {/* Add Member by Handle */}
                  {isAdmin && (
                    <form onSubmit={(e) => void handleAddByHandle(e)} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={addHandle}
                        onChange={(e) => setAddHandle(e.target.value)}
                        placeholder="Add friend by @handle"
                        className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                      <button
                        type="submit"
                        disabled={adding}
                        className="min-h-[42px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>{adding ? '...' : 'Add'}</span>
                      </button>
                    </form>
                  )}

                  {/* Member list */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                      Members ({members.length})
                    </p>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {members.map((m) => {
                        const online = isUserRecentlyOnline(m);
                        const isCreator = m.uid === chat.createdBy;
                        const mAdmin = chat.adminUids.includes(m.uid);
                        return (
                          <div key={m.uid} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar
                                src={m.photoUrl}
                                name={m.displayName}
                                size="sm"
                                isOnline={online}
                                showPresence
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {m.displayName}
                                  {m.uid === currentUid ? ' (You)' : ''}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                  {online ? 'Online' : formatLastSeen(m.lastSeen)}
                                  {mAdmin ? ' · Admin' : ''}
                                </p>
                              </div>
                            </div>

                            {isAdmin && !isCreator && m.uid !== currentUid && (
                              <button
                                type="button"
                                onClick={() => void removeMemberFromGroup(chat, m.uid)}
                                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                                title="Remove member"
                                aria-label={`Remove ${m.displayName}`}
                              >
                                <UserMinus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {chat.createdBy !== currentUid && (
                    <button
                      type="button"
                      onClick={() => void handleLeave()}
                      className="w-full min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Leave Group</span>
                    </button>
                  )}

                  {chat.createdBy === currentUid && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      {!confirmDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(true)}
                          className="w-full min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Group</span>
                        </button>
                      ) : (
                        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3 space-y-2.5">
                          <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                            Permanently delete this group for all members?
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(false)}
                              disabled={deletingChat}
                              className="flex-1 min-h-[40px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleConfirmDelete()}
                              disabled={deletingChat}
                              className="flex-1 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              {deletingChat ? 'Deleting...' : 'Delete Group'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center text-center py-4 space-y-3">
                    <Avatar
                      src={otherMember?.photoUrl}
                      name={otherMember?.displayName || 'Friend'}
                      size="xl"
                      isOnline={isUserRecentlyOnline(otherMember)}
                      showPresence
                    />
                    <div>
                      <h4 className="text-lg font-bold">{otherMember?.displayName || 'Friend'}</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        @{otherMember?.handle || 'user'} ·{' '}
                        {isUserRecentlyOnline(otherMember)
                          ? 'Online'
                          : formatLastSeen(otherMember?.lastSeen)}
                      </p>
                    </div>
                    {otherMember?.bio && (
                      <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                        {otherMember.bio}
                      </p>
                    )}
                  </div>

                  {/* Block & Delete Chat */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    {onToggleBlock && (
                      <button
                        type="button"
                        onClick={onToggleBlock}
                        className={`w-full min-h-[44px] rounded-xl border text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                          isBlocked
                            ? 'border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                            : 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                        }`}
                      >
                        {isBlocked ? <ShieldCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                        <span>
                          {isBlocked
                            ? `Unblock ${otherMember?.displayName || 'Contact'}`
                            : `Block ${otherMember?.displayName || 'Contact'}`}
                        </span>
                      </button>
                    )}

                    {!confirmDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="w-full min-h-[44px] rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Chat</span>
                      </button>
                    ) : (
                      <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 p-3 space-y-2.5">
                        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                          Delete this chat and clear conversation history from your list?
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            disabled={deletingChat}
                            className="flex-1 min-h-[40px] rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete()}
                            disabled={deletingChat}
                            className="flex-1 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {deletingChat ? 'Deleting...' : 'Delete Chat'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : tab === 'photos' ? (
            sharedPhotos.length === 0 ? (
              <div className="py-16 text-center space-y-2 text-slate-500 dark:text-slate-400">
                <ImageIcon className="w-8 h-8 mx-auto opacity-50" />
                <p className="text-sm font-medium">No photos shared yet</p>
                <p className="text-xs">Photos sent in this chat will appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sharedPhotos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onImageClick(m.imageData, m.text)}
                    className="aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 cursor-zoom-in"
                  >
                    <img
                      src={m.imageData}
                      alt={m.text || 'Shared photo'}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )
          ) : sharedFiles.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-slate-500 dark:text-slate-400">
              <FileText className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-sm font-medium">No documents shared yet</p>
              <p className="text-xs">PDFs and documents sent in this chat will appear here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {sharedFiles.map((m) => (
                <div key={m.id} className="py-3 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{m.fileName || 'Document'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatFileSize(m.fileSize)} · {m.senderName}
                    </p>
                  </div>
                  <a
                    href={m.fileData}
                    download={m.fileName || 'document'}
                    className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center shrink-0"
                    title="Download file"
                    aria-label={`Download ${m.fileName || 'document'}`}
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
