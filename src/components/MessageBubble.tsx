import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  BarChart3,
  Bot,
  Check,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Forward,
  Gamepad2,
  Image as ImageIcon,
  Info,
  Mic,
  Pencil,
  Pin,
  PinOff,
  Reply,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { isBaatCheetAIMessage } from '../lib/aiBot';
import { formatFileSize, formatMessageTime, LIMITS, REACTION_EMOJIS } from '../lib/validation';
import type { Chat, ChatMessage, MessageType, PublicUser } from '../types/chat';
import { AudioMessagePlayer } from './AudioMessagePlayer';
import { Avatar } from './Avatar';
import { extractFirstUrl, LinkPreviewCard } from './LinkPreviewCard';
import { MarkdownText } from './MarkdownText';
import { PollCard } from './PollCard';
import { TickMarks } from './TickMarks';

interface MessageBubbleProps {
  message: ChatMessage;
  chat: Chat;
  currentUid: string;
  currentUserName: string;
  currentUserHandle: string;
  senderProfile?: PublicUser;
  memberProfiles: Record<string, PublicUser>;
  showSenderHeader: boolean;
  isHighlighted?: boolean;
  isStarred?: boolean;
  isPinned?: boolean;
  canPin?: boolean;
  searchQuery?: string;
  readReceiptsEnabled?: boolean;
  isActionMenuOpen?: boolean;
  onOpenActionMenu?: () => void;
  onToggleActionMenu?: () => void;
  onCloseActionMenu?: () => void;
  onImageClick: (imageUrl: string, caption: string) => void;
  onOpenViewOnce?: (message: ChatMessage) => void;
  onPinToggle?: (message: ChatMessage) => void;
  onShowInfo?: (message: ChatMessage) => void;
  onReact: (messageId: string, currentEmoji: string | undefined, emoji: string) => void;
  onReply: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onToggleStar?: (message: ChatMessage) => void;
  onJumpToMessage?: (messageId: string) => void;
  onEdit: (messageId: string, messageType: MessageType, newText: string) => Promise<void>;
  onDelete: (messageId: string) => void;
}

interface MenuCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderSearchHighlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const regex = new RegExp(`(${escapeRegExp(q)})`, 'gi');
  const segments = text.split(regex);
  return segments.map((seg, i) =>
    seg.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-amber-300/90 text-slate-900 rounded px-0.5">
        {seg}
      </mark>
    ) : (
      <React.Fragment key={i}>{seg}</React.Fragment>
    )
  );
}

function renderFormattedText(
  text: string,
  isOwn: boolean,
  currentUserHandle: string,
  searchQuery = ''
) {
  const parts = text.split(/(https?:\/\/[^\s<>"'`)\]]+|@[a-z0-9_-]{3,30})/gi);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={idx}
          data-no-bubble-menu
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline underline-offset-2 break-all ${
            isOwn ? 'text-teal-100 hover:text-white' : 'sanvad-accent-text hover:opacity-80'
          }`}
        >
          {renderSearchHighlight(part, searchQuery)}
        </a>
      );
    }
    if (/^@[a-z0-9_-]{3,30}$/i.test(part)) {
      const isSelfMention = part.slice(1).toLowerCase() === currentUserHandle.toLowerCase();
      return (
        <span
          key={idx}
          className={`font-semibold px-1 py-0.5 rounded-md ${
            isOwn
              ? 'bg-white/20 text-white'
              : isSelfMention
              ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
              : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
          }`}
        >
          {renderSearchHighlight(part, searchQuery)}
        </span>
      );
    }
    return <React.Fragment key={idx}>{renderSearchHighlight(part, searchQuery)}</React.Fragment>;
  });
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  chat,
  currentUid,
  currentUserName,
  currentUserHandle,
  senderProfile,
  memberProfiles,
  showSenderHeader,
  isHighlighted = false,
  isStarred = false,
  isPinned = false,
  canPin = false,
  searchQuery = '',
  readReceiptsEnabled = true,
  isActionMenuOpen: controlledMenuOpen,
  onOpenActionMenu,
  onToggleActionMenu,
  onCloseActionMenu,
  onImageClick,
  onOpenViewOnce,
  onPinToggle,
  onShowInfo,
  onReact,
  onReply,
  onForward,
  onToggleStar,
  onJumpToMessage,
  onEdit,
  onDelete,
}) => {
  const [localMenuOpen, setLocalMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<MenuCoords>({ left: 12, width: 264, top: 80 });
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.text);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedMeet, setCopiedMeet] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const bubbleRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClickRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipeAxisRef = useRef<'x' | 'y' | null>(null);

  const isMenuControlled = typeof controlledMenuOpen === 'boolean';
  const menuOpen = isMenuControlled ? controlledMenuOpen : localMenuOpen;

  const isOwn = message.senderId === currentUid;
  const isBotMsg = isBaatCheetAIMessage(message);
  const canDelete = isOwn || isBotMsg;
  const canEdit =
    isOwn && (message.type === 'text' || (message.type === 'image' && !message.viewOnce));
  const timeStr = formatMessageTime(message.createdAt);

  const reactionsMap = message.reactions || {};
  const myReaction = reactionsMap[currentUid];

  const groupedReactions = useMemo(() => {
    const groups = new Map<string, string[]>();
    Object.entries(reactionsMap).forEach(([uid, emoji]) => {
      if (!emoji) return;
      const arr = groups.get(emoji) || [];
      arr.push(uid);
      groups.set(emoji, arr);
    });
    return Array.from(groups.entries());
  }, [reactionsMap]);

  const isMentioned =
    !isOwn &&
    ((message.mentions && message.mentions.includes(currentUid)) ||
      (currentUserHandle &&
        message.text.toLowerCase().includes(`@${currentUserHandle.toLowerCase()}`)));

  const computeMenuPosition = () => {
    const el = bubbleRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = Math.min(264, vw - 24);
    if (!el) {
      setMenuCoords({ left: Math.max(12, (vw - menuWidth) / 2), width: menuWidth, top: 96 });
      return;
    }

    const rect = el.getBoundingClientRect();
    const rawLeft = isOwn ? rect.right - menuWidth : rect.left;
    const left = Math.max(12, Math.min(rawLeft, vw - menuWidth - 12));

    const spaceAbove = rect.top - 72;
    const spaceBelow = vh - rect.bottom - 16;

    if (spaceAbove >= 270 || (spaceAbove >= spaceBelow && spaceAbove >= 200)) {
      setMenuCoords({
        left,
        width: menuWidth,
        bottom: Math.max(16, vh - rect.top + 8),
      });
    } else if (spaceBelow >= 270) {
      setMenuCoords({
        left,
        width: menuWidth,
        top: Math.max(72, rect.bottom + 8),
      });
    } else {
      setMenuCoords({
        left,
        width: menuWidth,
        top: Math.max(72, Math.min(rect.top + 12, vh - 310)),
      });
    }
  };

  const openMenu = () => {
    if (isEditing) return;
    computeMenuPosition();
    setConfirmDelete(false);
    if (isMenuControlled) {
      onOpenActionMenu?.();
    } else {
      setLocalMenuOpen(true);
    }
  };

  const closeMenu = () => {
    setConfirmDelete(false);
    if (isMenuControlled) {
      onCloseActionMenu?.();
    } else {
      setLocalMenuOpen(false);
    }
  };

  const toggleMenu = () => {
    if (isEditing) return;
    if (menuOpen) {
      closeMenu();
      return;
    }
    computeMenuPosition();
    setConfirmDelete(false);
    if (isMenuControlled) {
      onToggleActionMenu?.();
    } else {
      setLocalMenuOpen(true);
    }
  };

  useEffect(() => {
    if (!menuOpen) {
      setConfirmDelete(false);
      return;
    }
    computeMenuPosition();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };
    const onResize = () => computeMenuPosition();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isEditing || e.button === 2) return;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = setTimeout(() => {
      suppressNextClickRef.current = true;
      openMenu();
      clearLongPress();
    }, 420);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      clearLongPress();
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isEditing || menuOpen) return;
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    swipeAxisRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || isEditing || menuOpen) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    if (swipeAxisRef.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) && dx > 0) {
        swipeAxisRef.current = 'x';
        clearLongPress();
      } else {
        swipeAxisRef.current = 'y';
        return;
      }
    }

    if (swipeAxisRef.current === 'x') {
      const clamped = Math.min(72, Math.max(0, dx * 0.75));
      setSwipeOffset(clamped);
    }
  };

  const handleTouchEnd = () => {
    if (swipeOffset >= 48) {
      suppressNextClickRef.current = true;
      onReply(message);
    }
    setSwipeOffset(0);
    touchStartRef.current = null;
    swipeAxisRef.current = null;
  };

  const handleBubbleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (isEditing) return;

    const selectedText = window.getSelection()?.toString();
    if (selectedText && selectedText.trim().length > 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button, a, audio, input, textarea, [data-no-bubble-menu]')) {
      return;
    }

    toggleMenu();
  };

  const handleBubbleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    e.preventDefault();
    openMenu();
  };

  const startEdit = () => {
    closeMenu();
    setEditDraft(message.text);
    setEditError(null);
    setConfirmDelete(false);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditDraft(message.text);
    setEditError(null);
  };

  const submitEdit = async () => {
    if (savingEdit) return;
    if (message.type === 'text' && !editDraft.trim()) {
      setEditError('Message cannot be empty.');
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await onEdit(message.id, message.type, editDraft);
      setIsEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update message.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCopyMeet = async () => {
    if (!message.meetUri) return;
    await navigator.clipboard.writeText(message.meetUri);
    setCopiedMeet(true);
    setTimeout(() => setCopiedMeet(false), 1800);
  };

  const handleCopyText = async () => {
    if (!message.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      // Ignore clipboard permission errors silently
    }
    closeMenu();
  };

  const renderReplyQuote = (forDarkBubble: boolean, compactSpacing = false) => {
    const reply = message.replyTo;
    if (!reply) return null;
    const quotedSender =
      reply.senderId === currentUid
        ? 'You'
        : memberProfiles[reply.senderId]?.displayName || reply.senderName;

    return (
      <button
        type="button"
        onClick={() => onJumpToMessage?.(reply.messageId)}
        className={`w-full text-left rounded-xl px-2.5 py-1.5 border-l-[3px] transition-colors cursor-pointer ${
          compactSpacing ? 'mb-1.5' : 'mb-2'
        } ${
          forDarkBubble
            ? 'bg-black/15 hover:bg-black/25 border-teal-200 text-white'
            : 'bg-slate-100/90 dark:bg-slate-900/75 hover:bg-slate-200/70 dark:hover:bg-slate-900 border-teal-600 dark:border-teal-400 text-slate-800 dark:text-slate-100'
        }`}
        title="Jump to quoted message"
      >
        <p
          className={`text-[11px] font-semibold truncate ${
            forDarkBubble ? 'text-teal-100' : 'text-teal-700 dark:text-teal-400'
          }`}
        >
          {quotedSender}
        </p>
        <p
          className={`mt-0.5 text-xs flex items-center gap-1 line-clamp-2 break-words ${
            forDarkBubble ? 'text-teal-50/90' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {reply.type === 'image' && <ImageIcon className="w-3.5 h-3.5 shrink-0 opacity-85" />}
          {reply.type === 'audio' && <Mic className="w-3.5 h-3.5 shrink-0 opacity-85" />}
          {reply.type === 'poll' && <BarChart3 className="w-3.5 h-3.5 shrink-0 opacity-85" />}
          {reply.type === 'meet' && <Video className="w-3.5 h-3.5 shrink-0 opacity-85" />}
          <span className="truncate">{reply.previewText}</span>
        </p>
      </button>
    );
  };

  const renderReactionsRow = () => {
    if (groupedReactions.length === 0) return null;
    return (
      <div
        className={`mt-1 flex flex-wrap items-center gap-1 ${
          isOwn ? 'justify-end' : 'justify-start'
        }`}
      >
        {groupedReactions.map(([emoji, uids]) => {
          const iReacted = uids.includes(currentUid);
          const names = uids
            .map((uid) => (uid === currentUid ? 'You' : memberProfiles[uid]?.displayName || 'Friend'))
            .join(', ');
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(message.id, myReaction, emoji)}
              title={names}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-xs border transition-colors cursor-pointer ${
                iReacted
                  ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500/50 text-teal-800 dark:text-teal-200 font-semibold'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span>{emoji}</span>
              <span className="tabular-nums text-[11px]">{uids.length}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderContextMenu = () => {
    if (!menuOpen || isEditing) return null;

    return (
      <>
        <div
          className="fixed inset-0 z-40 bg-slate-950/15 dark:bg-black/35 backdrop-blur-[1px]"
          onClick={(e) => {
            e.stopPropagation();
            closeMenu();
          }}
          aria-hidden="true"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          role="menu"
          aria-label="Message actions"
          onClick={(e) => e.stopPropagation()}
          style={{
            left: `${menuCoords.left}px`,
            width: `${menuCoords.width}px`,
            ...(typeof menuCoords.top === 'number'
              ? { top: `${menuCoords.top}px` }
              : { bottom: `${menuCoords.bottom ?? 16}px` }),
          }}
          className="fixed z-50 max-h-[calc(100vh-96px)] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
        >
          {/* Quick Emoji Reactions */}
          <div className="flex items-center justify-between gap-0.5 px-2 py-2 border-b border-slate-100 dark:border-slate-800">
            {REACTION_EMOJIS.map((emoji) => {
              const isActive = myReaction === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(message.id, myReaction, emoji);
                    closeMenu();
                  }}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-transform hover:scale-110 active:scale-95 cursor-pointer ${
                    isActive
                      ? 'bg-teal-50 dark:bg-teal-950/70 ring-1 ring-teal-500/50'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  aria-label={`React with ${emoji}`}
                  aria-pressed={isActive}
                >
                  {emoji}
                </button>
              );
            })}
          </div>

          {confirmDelete && canDelete ? (
            <div className="p-3 space-y-2.5">
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {isBotMsg ? 'Delete this AI response?' : 'Delete this message for everyone?'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    closeMenu();
                    onDelete(message.id);
                  }}
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1 divide-y divide-slate-100 dark:divide-slate-800/80">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  closeMenu();
                  onReply(message);
                }}
                className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
              >
                <Reply className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span>Reply</span>
              </button>

              {onForward && !message.viewOnce && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onForward(message);
                  }}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <Forward className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Forward</span>
                </button>
              )}

              {canPin && onPinToggle && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onPinToggle(message);
                  }}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  {isPinned ? (
                    <PinOff className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                  ) : (
                    <Pin className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  )}
                  <span>{isPinned ? 'Unpin from chat' : 'Pin in chat'}</span>
                </button>
              )}

              {onToggleStar && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onToggleStar(message);
                  }}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <Star
                    className={`w-4 h-4 shrink-0 ${
                      isStarred ? 'text-amber-500 fill-amber-500' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span>{isStarred ? 'Unstar' : 'Star'}</span>
                </button>
              )}

              {onShowInfo && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onShowInfo(message);
                  }}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Info</span>
                </button>
              )}

              {message.text.trim().length > 0 && !message.viewOnce && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleCopyText()}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Copy</span>
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={startEdit}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>Edit</span>
                </button>
              )}

              {canDelete && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDelete(true)}
                  className="w-full min-h-[42px] px-3.5 flex items-center gap-3 text-left text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </motion.div>
      </>
    );
  };

  if (message.type === 'poll') {
    return (
      <div
        id={`msg-${message.id}`}
        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} rounded-2xl transition-colors duration-300 ${
          isHighlighted ? 'bg-teal-500/10 ring-2 ring-teal-500/40 p-1 -m-1' : ''
        }`}
      >
        {!isOwn && showSenderHeader && chat.type === 'group' && (
          <div className="flex items-center gap-2 mb-1 ml-1">
            <Avatar
              src={senderProfile?.photoUrl}
              name={senderProfile?.displayName || message.senderName}
              size="sm"
            />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {senderProfile?.displayName || message.senderName}
            </span>
          </div>
        )}
        <div
          ref={bubbleRef}
          onClick={handleBubbleClick}
          onContextMenu={handleBubbleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          className={`max-w-[85%] sm:max-w-[74%] rounded-2xl transition-shadow cursor-pointer ${
            menuOpen ? 'ring-2 ring-teal-500/60 dark:ring-teal-400/60 shadow-md relative z-50' : ''
          }`}
        >
          <PollCard
            chat={chat}
            pollId={message.pollId}
            currentUid={currentUid}
            currentUserName={currentUserName}
          />
          {renderReactionsRow()}
          <div
            className={`mt-1 px-1 flex items-center gap-1.5 text-[11px] text-slate-400 tabular-nums ${
              isOwn ? 'justify-end' : 'justify-start'
            }`}
          >
            {isStarred && (
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Starred" />
            )}
            <span>{timeStr || 'Sending'}</span>
            <TickMarks
              pending={message.pending}
              deliveredCount={message.deliveredTo.length}
              readCount={message.readBy.length}
              memberCount={chat.memberUids.length}
              isOwn={isOwn}
              readReceiptsEnabled={readReceiptsEnabled}
            />
          </div>
        </div>

        {renderContextMenu()}
      </div>
    );
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} rounded-2xl transition-colors duration-300 ${
        isHighlighted ? 'bg-teal-500/10 ring-2 ring-teal-500/40 p-1 -m-1' : ''
      }`}
    >
      {!isOwn && showSenderHeader && chat.type === 'group' && (
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 ml-1">
          {senderProfile?.displayName || message.senderName}
        </span>
      )}

      <div
        ref={bubbleRef}
        onClick={handleBubbleClick}
        onContextMenu={handleBubbleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={
          swipeOffset > 0
            ? { transform: `translateX(${swipeOffset}px)`, transition: 'none' }
            : { transform: 'translateX(0px)', transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)' }
        }
        className={`relative max-w-[85%] sm:max-w-[74%] min-w-0 ${
          menuOpen ? 'relative z-50' : ''
        }`}
      >
        {swipeOffset > 8 && (
          <div
            aria-hidden="true"
            className={`absolute -left-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              swipeOffset >= 48
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-200/90 dark:bg-slate-700/90 text-slate-600 dark:text-slate-200'
            }`}
          >
            <Reply className="w-4 h-4" />
          </div>
        )}
        <div
          className={`rounded-2xl overflow-hidden shadow-xs transition-shadow cursor-pointer ${
            menuOpen ? 'ring-2 ring-teal-500/70 dark:ring-teal-400/70 shadow-lg' : ''
          } ${
            isOwn
              ? 'sanvad-accent-bg rounded-tr-sm'
              : isMentioned
              ? 'bg-amber-50/90 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-amber-300 dark:border-amber-600/60 rounded-tl-sm'
              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-sm'
          }`}
        >
          {message.type === 'image' && message.replyTo && (
            <div className="px-2 pt-2">{renderReplyQuote(isOwn, true)}</div>
          )}

          {message.type === 'image' && message.imageData && !message.viewOnce && (
            <button
              type="button"
              onClick={() => onImageClick(message.imageData, message.text)}
              className="block w-full text-left cursor-zoom-in focus:outline-none"
            >
              <img
                src={message.imageData}
                alt={message.text || 'Shared photo'}
                referrerPolicy="no-referrer"
                className="w-full max-w-[320px] max-h-[340px] object-cover bg-slate-100 dark:bg-slate-900"
              />
            </button>
          )}

          <div className="px-3.5 py-2">
            {message.forwarded && (
              <p
                className={`mb-1 flex items-center gap-1 text-[11px] italic ${
                  isOwn ? 'text-teal-100/85' : 'text-slate-400 dark:text-slate-400'
                }`}
              >
                <Forward className="w-3 h-3 shrink-0" />
                <span>Forwarded</span>
              </p>
            )}

            {message.type !== 'image' && renderReplyQuote(isOwn)}

            {message.type === 'image' && message.viewOnce ? (
              (() => {
                const viewedByMe = !isOwn && (message.viewedBy || []).includes(currentUid);
                const openedByOther = isOwn && (message.viewedBy || []).length > 0;
                const disabled = isOwn || viewedByMe;
                return (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (!disabled) onOpenViewOnce?.(message);
                    }}
                    className={`flex items-center gap-2.5 min-w-[180px] py-1 text-left ${
                      disabled ? 'opacity-80 cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                        viewedByMe || openedByOther
                          ? 'border-current/40 opacity-70'
                          : isOwn
                          ? 'border-white/80 text-white'
                          : 'border-teal-600 dark:border-teal-400 text-teal-700 dark:text-teal-300'
                      }`}
                    >
                      {viewedByMe || openedByOther ? <EyeOff className="w-3.5 h-3.5" /> : '1'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight">
                        {viewedByMe || openedByOther ? 'Opened' : 'View-once photo'}
                      </p>
                      <p
                        className={`text-[11px] ${
                          isOwn ? 'text-teal-100/80' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isOwn
                          ? openedByOther
                            ? 'Recipient viewed'
                            : 'Expires after viewing'
                          : viewedByMe
                          ? 'Photo already viewed'
                          : 'Tap to open once'}
                      </p>
                    </div>
                  </button>
                );
              })()
            ) : message.type === 'file' && message.fileData ? (
              <div className="flex items-center gap-3 min-w-[210px] py-0.5">
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isOwn
                      ? 'bg-white/20 text-white'
                      : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {message.fileName || 'Document'}
                  </p>
                  <p
                    className={`text-[11px] tabular-nums ${
                      isOwn ? 'text-teal-100/85' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {formatFileSize(message.fileSize)}
                  </p>
                </div>
                <a
                  href={message.fileData}
                  download={message.fileName || 'document'}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    isOwn
                      ? 'bg-white/20 hover:bg-white/30 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                  }`}
                  title="Download file"
                  aria-label={`Download ${message.fileName || 'document'}`}
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
            ) : message.type === 'audio' && message.audioData ? (
              <AudioMessagePlayer
                src={message.audioData}
                durationHint={message.audioDuration}
                onDarkBubble={isOwn}
              />
            ) : message.type === 'meet' ? (
              <div className="space-y-2.5 min-w-[210px]">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isOwn
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight">Google Meet Video Call</p>
                    {message.meetCode && (
                      <p
                        className={`text-[11px] truncate ${
                          isOwn ? 'text-teal-100/85' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Code: {message.meetCode}
                      </p>
                    )}
                  </div>
                </div>

                {message.text && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.text}
                  </p>
                )}

                {message.meetUri && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <a
                      href={message.meetUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex-1 min-h-[36px] px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        isOwn
                          ? 'bg-white text-teal-800 hover:bg-teal-50'
                          : 'bg-teal-700 hover:bg-teal-800 text-white'
                      }`}
                    >
                      <span>Join Meet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void handleCopyMeet()}
                      className={`min-h-[36px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                        isOwn
                          ? 'bg-white/15 hover:bg-white/25 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200'
                      }`}
                      title="Copy Google Meet link"
                      aria-label="Copy Google Meet link"
                    >
                      {copiedMeet ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            ) : isEditing ? (
              <div className="space-y-2 min-w-[220px]">
                <textarea
                  rows={2}
                  maxLength={LIMITS.MESSAGE_TEXT_MAX}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void submitEdit();
                    }
                  }}
                  placeholder={message.type === 'image' ? 'Edit caption...' : 'Edit message...'}
                  autoFocus
                  className="w-full rounded-xl px-2.5 py-2 text-sm bg-white/95 dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-teal-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                />
                {editError && (
                  <p className="text-[11px] font-medium text-amber-200 break-words [overflow-wrap:anywhere]">
                    {editError}
                  </p>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={savingEdit}
                    className="px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitEdit()}
                    disabled={savingEdit}
                    className="px-2.5 py-1 rounded-lg bg-white text-teal-800 hover:bg-teal-50 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                    <span>{savingEdit ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              </div>
            ) : (
              message.text && (() => {
                const isGameMessage = message.text.includes('[Sanvad Game');
                const firstUrl = message.type === 'text' ? extractFirstUrl(message.text) : null;
                return (
                  <div>
                    {isBotMsg && (
                      <div className="mb-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[10px] font-bold uppercase tracking-wider">
                        <Bot className="w-3 h-3" />
                        <span>BaatCheet AI</span>
                      </div>
                    )}
                    {isGameMessage && (
                      <div
                        className={`mb-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                          isOwn
                            ? 'bg-white/20 text-white'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}
                      >
                        <Gamepad2 className="w-3 h-3" />
                        <span>Mini Game</span>
                      </div>
                    )}
                    {isBotMsg ? (
                      <MarkdownText
                        text={message.text}
                        onDarkBubble={isOwn}
                        currentUserHandle={currentUserHandle}
                        searchQuery={searchQuery}
                      />
                    ) : (
                      <p className="sanvad-msg-text whitespace-pre-wrap break-words">
                        {renderFormattedText(message.text, isOwn, currentUserHandle, searchQuery)}
                      </p>
                    )}
                    {firstUrl && <LinkPreviewCard url={firstUrl} isOwn={isOwn} />}
                  </div>
                );
              })()
            )}

            <div
              className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] tabular-nums ${
                isOwn ? 'text-teal-100/85' : 'text-slate-400 dark:text-slate-400'
              }`}
            >
              {isStarred && (
                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Starred" />
              )}
              {message.editedAt && <span className="italic opacity-80">edited</span>}
              <span>{timeStr || 'Sending'}</span>
              <TickMarks
                pending={message.pending}
                deliveredCount={message.deliveredTo.length}
                readCount={message.readBy.length}
                memberCount={chat.memberUids.length}
                isOwn={isOwn}
                onDarkBubble={isOwn}
                readReceiptsEnabled={readReceiptsEnabled}
              />
            </div>
          </div>
        </div>

        {renderReactionsRow()}
      </div>

      {renderContextMenu()}
    </div>
  );
};
