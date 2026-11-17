import { Timestamp } from 'firebase/firestore';
import type { ChatMessage, PublicUser } from '../types/chat';

const PROFILES_CACHE_PREFIX = 'sanvad_profiles_cache_v1_';
const MESSAGES_CACHE_PREFIX = 'sanvad_messages_cache_v1_';
const UNREAD_CACHE_PREFIX = 'sanvad_unread_v1_';

const PROFILE_TTL_MS = 10 * 60 * 1000; // 10 minutes before background one-time refresh
const MAX_CACHED_CHATS = 15;
const MAX_PERSISTED_MSGS_PER_CHAT = 45;
const MAX_LOCALSTORAGE_MEDIA_CHARS = 8_000; // Strip large base64 payloads in localStorage to respect 5MB quota

interface SerializedTimestamp {
  __sanvadTsMs: number;
}

function isSerializedTimestamp(val: unknown): val is SerializedTimestamp {
  return (
    typeof val === 'object' &&
    val !== null &&
    '__sanvadTsMs' in val &&
    typeof (val as SerializedTimestamp).__sanvadTsMs === 'number'
  );
}

function encodeTimestamp(ts: Timestamp | null | undefined): SerializedTimestamp | null {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') {
    return { __sanvadTsMs: ts.toMillis() };
  }
  return null;
}

function decodeTimestamp(val: unknown): Timestamp | null {
  if (!val) return null;
  if (isSerializedTimestamp(val)) {
    return Timestamp.fromMillis(val.__sanvadTsMs);
  }
  if (typeof (val as Timestamp).toMillis === 'function') {
    return val as Timestamp;
  }
  return null;
}

// ---------------------------------------------------------------------------
// In-Memory Session Caches (Zero quota limit — keeps full photos/files too)
// ---------------------------------------------------------------------------
const memoryMessagesByUser = new Map<string, Map<string, ChatMessage[]>>();

function getUserMemoryMap(uid: string): Map<string, ChatMessage[]> {
  let userMap = memoryMessagesByUser.get(uid);
  if (!userMap) {
    userMap = new Map<string, ChatMessage[]>();
    memoryMessagesByUser.set(uid, userMap);
  }
  return userMap;
}

// ---------------------------------------------------------------------------
// Public Profile Local Cache (localStorage + freshness TTL)
// ---------------------------------------------------------------------------
interface StoredProfileEntry {
  profile: Omit<PublicUser, 'lastSeen' | 'updatedAt'> & {
    lastSeen: SerializedTimestamp | null;
    updatedAt: SerializedTimestamp | null;
  };
  cachedAt: number;
}

type StoredProfilesMap = Record<string, StoredProfileEntry>;

function readStoredProfilesMap(currentUid: string): StoredProfilesMap {
  try {
    const raw = localStorage.getItem(`${PROFILES_CACHE_PREFIX}${currentUid}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredProfilesMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCachedProfiles(currentUid: string): Record<string, PublicUser> {
  if (!currentUid) return {};
  const map = readStoredProfilesMap(currentUid);
  const result: Record<string, PublicUser> = {};
  Object.entries(map).forEach(([uid, entry]) => {
    if (!entry?.profile) return;
    result[uid] = {
      ...entry.profile,
      lastSeen: decodeTimestamp(entry.profile.lastSeen),
      updatedAt: decodeTimestamp(entry.profile.updatedAt),
    };
  });
  return result;
}

export function getStaleOrMissingProfileUids(
  currentUid: string,
  candidateUids: string[]
): string[] {
  if (!currentUid || candidateUids.length === 0) return [];
  const map = readStoredProfilesMap(currentUid);
  const now = Date.now();
  return candidateUids.filter((uid) => {
    const entry = map[uid];
    if (!entry) return true;
    return now - (entry.cachedAt || 0) > PROFILE_TTL_MS;
  });
}

export function saveCachedProfiles(
  currentUid: string,
  profiles: Record<string, PublicUser>
): void {
  if (!currentUid) return;
  try {
    const existing = readStoredProfilesMap(currentUid);
    const now = Date.now();
    const next: StoredProfilesMap = { ...existing };

    Object.values(profiles).forEach((p) => {
      if (!p?.uid) return;
      next[p.uid] = {
        profile: {
          uid: p.uid,
          displayName: p.displayName,
          handle: p.handle,
          photoUrl: (p.photoUrl || '').length <= 32_000 ? p.photoUrl : '',
          bio: p.bio,
          isOnline: p.isOnline,
          discoverable: p.discoverable,
          lastSeen: encodeTimestamp(p.lastSeen),
          updatedAt: encodeTimestamp(p.updatedAt),
        },
        cachedAt: now,
      };
    });

    // Keep bounded to most recent 100 profiles
    const entries = Object.entries(next)
      .sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0))
      .slice(0, 100);
    localStorage.setItem(
      `${PROFILES_CACHE_PREFIX}${currentUid}`,
      JSON.stringify(Object.fromEntries(entries))
    );
  } catch {
    // Ignore storage quota errors
  }
}

// ---------------------------------------------------------------------------
// Chat Messages Local Cache (In-Memory + localStorage LRU)
// ---------------------------------------------------------------------------
interface StoredChatMessagesEntry {
  updatedAt: number;
  messages: Array<
    Omit<ChatMessage, 'createdAt' | 'updatedAt' | 'editedAt' | 'pending'> & {
      createdAt: SerializedTimestamp | null;
      updatedAt: SerializedTimestamp | null;
      editedAt?: SerializedTimestamp | null;
    }
  >;
}

type StoredMessagesMap = Record<string, StoredChatMessagesEntry>;

function readStoredMessagesMap(currentUid: string): StoredMessagesMap {
  try {
    const raw = localStorage.getItem(`${MESSAGES_CACHE_PREFIX}${currentUid}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredMessagesMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getCachedChatMessages(currentUid: string, chatId: string): ChatMessage[] {
  if (!currentUid || !chatId) return [];
  const mem = getUserMemoryMap(currentUid).get(chatId);
  if (mem && mem.length > 0) {
    return mem;
  }

  const storedMap = readStoredMessagesMap(currentUid);
  const entry = storedMap[chatId];
  if (!entry || !Array.isArray(entry.messages)) return [];

  const hydrated: ChatMessage[] = entry.messages.map((m) => ({
    ...m,
    createdAt: decodeTimestamp(m.createdAt),
    updatedAt: decodeTimestamp(m.updatedAt),
    editedAt: m.editedAt ? decodeTimestamp(m.editedAt) : undefined,
    pending: false,
  }));
  getUserMemoryMap(currentUid).set(chatId, hydrated);
  return hydrated;
}

export function saveCachedChatMessages(
  currentUid: string,
  chatId: string,
  messages: ChatMessage[]
): void {
  if (!currentUid || !chatId) return;
  const deduped = new Map<string, ChatMessage>();
  messages.forEach((m) => {
    if (m?.id) deduped.set(m.id, m);
  });
  const sorted = Array.from(deduped.values()).sort((a, b) => {
    const tA = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    const tB = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  // Store full messages (capped at last 225) in memory for zero-latency tab switches
  getUserMemoryMap(currentUid).set(chatId, sorted.slice(-225));

  // Persist compact recent window (last 45) to localStorage with large binary blobs stripped
  try {
    const storedMap = readStoredMessagesMap(currentUid);
    const tail = sorted.slice(-MAX_PERSISTED_MSGS_PER_CHAT).map((m) => {
      const { pending: _p, ...rest } = m;
      return {
        ...rest,
        imageData:
          rest.imageData && rest.imageData.length <= MAX_LOCALSTORAGE_MEDIA_CHARS
            ? rest.imageData
            : '',
        audioData:
          rest.audioData && rest.audioData.length <= MAX_LOCALSTORAGE_MEDIA_CHARS
            ? rest.audioData
            : undefined,
        fileData:
          rest.fileData && rest.fileData.length <= MAX_LOCALSTORAGE_MEDIA_CHARS
            ? rest.fileData
            : undefined,
        createdAt: encodeTimestamp(rest.createdAt),
        updatedAt: encodeTimestamp(rest.updatedAt),
        editedAt: rest.editedAt ? encodeTimestamp(rest.editedAt) : undefined,
      };
    });

    storedMap[chatId] = {
      updatedAt: Date.now(),
      messages: tail,
    };

    const lru = Object.entries(storedMap)
      .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
      .slice(0, MAX_CACHED_CHATS);
    localStorage.setItem(
      `${MESSAGES_CACHE_PREFIX}${currentUid}`,
      JSON.stringify(Object.fromEntries(lru))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCachedUnreadCounts(currentUid: string): Record<string, number> {
  if (!currentUid) return {};
  try {
    const raw = localStorage.getItem(`${UNREAD_CACHE_PREFIX}${currentUid}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCachedUnreadCounts(
  currentUid: string,
  counts: Record<string, number>
): void {
  if (!currentUid) return;
  try {
    localStorage.setItem(`${UNREAD_CACHE_PREFIX}${currentUid}`, JSON.stringify(counts));
  } catch {
    // Ignore storage quota errors
  }
}
