import type { Timestamp } from 'firebase/firestore';
import type { ChatMessage, MessageReply, PublicUser, WallpaperId } from '../types/chat';

export const LIMITS = {
  DISPLAY_NAME_MAX: 50,
  HANDLE_MIN: 3,
  HANDLE_MAX: 30,
  BIO_MAX: 160,
  GROUP_NAME_MAX: 60,
  MESSAGE_TEXT_MAX: 2000,
  REPLY_PREVIEW_MAX: 180,
  POLL_QUESTION_MAX: 240,
  POLL_OPTION_MAX: 80,
  POLL_OPTIONS_MIN: 2,
  POLL_OPTIONS_MAX: 6,
  PHOTO_MAX_CHARS: 235000,
  IMAGE_MSG_MAX_CHARS: 440000,
  AUDIO_MSG_MAX_CHARS: 440000,
  FILE_MSG_MAX_CHARS: 440000,
  FILE_NAME_MAX: 140,
  FILE_RAW_MAX_BYTES: 320000,
  AUDIO_MAX_DURATION_SEC: 45,
  MAX_GROUP_MEMBERS: 50,
  MENTIONS_MAX: 20,
  CONFESSION_TEXT_MAX: 500,
  CHECKLIST_TITLE_MAX: 120,
  CHECKLIST_NOTE_MAX: 80,
} as const;

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const CONFESSION_EMOJIS = ['😂', '❤️', '😮', '🔥', '🫂'] as const;
export type ConfessionEmoji = (typeof CONFESSION_EMOJIS)[number];

export const ANONYMOUS_ALIASES = [
  'Midnight Chai ☕',
  'Silent Owl 🦉',
  'Mystery Fox 🦊',
  'Incognito Panda 🐼',
  'Shadow Samosa 🥟',
  'Secret Koala 🐨',
  'Stealth Mango 🥭',
  'Undercover Cat 🐱',
  'Whispering Breeze 🍃',
  'Cosmic Jalebi 🌀',
] as const;

export function pickAnonymousAlias(): string {
  return ANONYMOUS_ALIASES[Math.floor(Math.random() * ANONYMOUS_ALIASES.length)];
}

const BLOCKED_SAFETY_PATTERNS = [
  /\b(kill\s+yourself|kys)\b/i,
  /\b(rape|suicide\s+method|bomb\s+threat)\b/i,
  /\b(doxx|leak\s+phone|home\s+address\s+is)\b/i,
];

export function checkModerationSafety(text: string): string | null {
  const cleaned = text.trim();
  if (!cleaned) return 'Text cannot be empty.';
  for (const rx of BLOCKED_SAFETY_PATTERNS) {
    if (rx.test(cleaned)) {
      return 'This post violates Sanvad community safety guidelines and cannot be published.';
    }
  }
  return null;
}

export interface WallpaperPreset {
  id: WallpaperId;
  name: string;
  swatchClass: string;
}

export const WALLPAPER_PRESETS: WallpaperPreset[] = [
  { id: 'default', name: 'Teal Geometry', swatchClass: 'wallpaper-default' },
  { id: 'aurora', name: 'Mint Aurora', swatchClass: 'wallpaper-aurora' },
  { id: 'ocean', name: 'Ocean Waves', swatchClass: 'wallpaper-ocean' },
  { id: 'sunset', name: 'Amber Dusk', swatchClass: 'wallpaper-sunset' },
  { id: 'lavender', name: 'Soft Lavender', swatchClass: 'wallpaper-lavender' },
  { id: 'botanical', name: 'Sage Botanical', swatchClass: 'wallpaper-botanical' },
  { id: 'midnight', name: 'Starlight Slate', swatchClass: 'wallpaper-midnight' },
];

export const HANDLE_REGEX = /^[a-z0-9_-]{3,30}$/;
export const ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let result = '';
  let byteCount = 0;
  for (const ch of value) {
    const chBytes = encoder.encode(ch).length;
    if (byteCount + chBytes > maxBytes) break;
    result += ch;
    byteCount += chBytes;
  }
  return result;
}

export function extractMentionedUids(text: string, members: PublicUser[]): string[] {
  if (!text || members.length === 0) return [];
  const matches = text.match(/@([a-z0-9_-]{3,30})/gi) || [];
  if (matches.length === 0) return [];
  const handleToUid = new Map<string, string>();
  members.forEach((m) => handleToUid.set(m.handle.toLowerCase(), m.uid));
  const uids = new Set<string>();
  for (const raw of matches) {
    const h = raw.slice(1).toLowerCase();
    const uid = handleToUid.get(h);
    if (uid) uids.add(uid);
  }
  return Array.from(uids).slice(0, LIMITS.MENTIONS_MAX);
}

export function formatAudioDuration(seconds: number | undefined): string {
  const safe = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatFileSize(bytes: number | undefined): string {
  const safe = Math.max(0, bytes || 0);
  if (safe < 1024) return `${safe} B`;
  const kb = safe / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function buildMessageReply(
  message: ChatMessage,
  senderNameOverride?: string
): MessageReply {
  const cleanName = truncateUtf8(
    (senderNameOverride || message.senderName || 'Friend').trim(),
    LIMITS.DISPLAY_NAME_MAX
  );
  const rawPreview =
    message.type === 'image'
      ? message.viewOnce
        ? 'View-once photo'
        : message.text.trim() || 'Shared a photo'
      : message.type === 'audio'
      ? `Voice message (${formatAudioDuration(message.audioDuration)})`
      : message.type === 'file'
      ? message.fileName?.trim() || 'Document'
      : message.type === 'poll'
      ? message.text.trim() || 'Poll'
      : message.type === 'meet'
      ? message.text.trim() || 'Google Meet video call'
      : message.text.trim();

  return {
    messageId: message.id,
    senderId: message.senderId,
    senderName: cleanName || 'Friend',
    type: message.type,
    previewText: truncateUtf8(rawPreview, LIMITS.REPLY_PREVIEW_MAX),
  };
}

export function sanitizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, LIMITS.HANDLE_MAX);
}

export function generateRandomId(prefix: string, len = 14): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) {
    out += chars[arr[i] % chars.length];
  }
  return `${prefix}_${out}`;
}

export function getDirectChatId(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted[0]}_${sorted[1]}`;
}

export function isUserRecentlyOnline(user: PublicUser | null | undefined): boolean {
  if (!user || !user.isOnline) return false;
  if (!user.lastSeen) return user.isOnline;
  const lastSeenMs = user.lastSeen.toMillis();
  return Date.now() - lastSeenMs < 120_000;
}

export function formatLastSeen(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Offline';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts.toMillis()) / 1000));
  if (diffSec < 60) return 'Last seen just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `Last seen ${diffHr}h ago`;
  const date = ts.toDate();
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function formatMessageTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatChatListTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDayDivider(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Today';
  const date = ts.toDate();
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
