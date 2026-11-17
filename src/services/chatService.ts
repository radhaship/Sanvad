import type { User } from 'firebase/auth';
import {
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  BAATCHEET_AI_NAME,
  BAATCHEET_AI_UID,
  BAATCHEET_AI_WELCOME_MESSAGE,
} from '../lib/aiBot';
import {
  checkModerationSafety,
  formatAudioDuration,
  formatFileSize,
  generateRandomId,
  getDirectChatId,
  HANDLE_REGEX,
  ID_REGEX,
  LIMITS,
  pickAnonymousAlias,
  sanitizeHandle,
  truncateUtf8,
} from '../lib/validation';
import type {
  AccentColorId,
  CallStatus,
  CallType,
  Chat,
  ChatMessage,
  ChecklistCategory,
  ChecklistItem,
  ConfessionCategory,
  ConfessionPost,
  ConfessionScope,
  DisappearingDuration,
  FontSizeId,
  MessageReply,
  MessageType,
  MiniGameType,
  PrivateUser,
  PublicUser,
  StarredMessage,
  WallpaperId,
} from '../types/chat';

export async function ensureUserProfile(firebaseUser: User): Promise<PrivateUser> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const publicRef = doc(db, 'users_public', firebaseUser.uid);

  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
  }

  const statsRef = doc(db, 'app_stats', 'summary');

  if (snap.exists()) {
    const existingData = snap.data() as PrivateUser;
    try {
      const pubSnap = await getDoc(publicRef);
      if (pubSnap.exists()) {
        await updateDoc(publicRef, {
          isOnline: true,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const batch = writeBatch(db);
        batch.set(publicRef, {
          uid: existingData.uid,
          displayName: existingData.displayName,
          handle: existingData.handle,
          photoUrl: existingData.photoUrl,
          bio: existingData.bio,
          isOnline: true,
          discoverable: existingData.discoverable,
          lastSeen: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users_public/${firebaseUser.uid}`);
    }

    try {
      const statsSnap = await getDoc(statsRef);
      if (!statsSnap.exists()) {
        await setDoc(statsRef, {
          totalUsers: 1,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-critical stats initialization
    }

    return existingData;
  }

  const displayName = (
    (firebaseUser.displayName || '').trim() ||
    firebaseUser.email?.split('@')[0] ||
    'Friend'
  ).slice(0, LIMITS.DISPLAY_NAME_MAX);

  let baseHandle = sanitizeHandle(
    firebaseUser.email?.split('@')[0] || displayName || 'user'
  );
  if (baseHandle.length < LIMITS.HANDLE_MIN) {
    baseHandle = `user_${baseHandle}`;
  }
  const suffix = firebaseUser.uid.slice(0, 4).toLowerCase().replace(/[^a-z0-9]/g, 'x');
  let handle = `${baseHandle.slice(0, 24)}_${suffix}`;
  if (!HANDLE_REGEX.test(handle)) {
    handle = `bc_${firebaseUser.uid.slice(0, 8).toLowerCase()}`;
  }

  // Ensure handle does not collide
  try {
    const handleCheck = await getDoc(doc(db, 'handles', handle));
    if (handleCheck.exists()) {
      handle = `bc_${generateRandomId('u', 6).toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `handles/${handle}`);
  }

  const photoUrl = (firebaseUser.photoURL || '').slice(0, LIMITS.PHOTO_MAX_CHARS);
  const email = (firebaseUser.email || '').slice(0, 120);
  const bio = 'Hey there! I am on Sanvad.';

  let canWriteStats = false;
  let statsExists = false;
  const seedCount = 1;
  try {
    const statsSnap = await getDoc(statsRef);
    statsExists = statsSnap.exists();
    canWriteStats = true;
  } catch {
    canWriteStats = false;
  }

  const batch = writeBatch(db);
  batch.set(userRef, {
    uid: firebaseUser.uid,
    email,
    displayName,
    handle,
    photoUrl,
    bio,
    discoverable: false,
    pinnedChatIds: [],
    archivedChatIds: [],
    mutedChatIds: [],
    blockedUids: [],
    deletedChats: {},
    wallpaper: 'default',
    chatWallpapers: {},
    readReceiptsEnabled: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(publicRef, {
    uid: firebaseUser.uid,
    displayName,
    handle,
    photoUrl,
    bio,
    isOnline: true,
    discoverable: false,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'handles', handle), {
    uid: firebaseUser.uid,
    handle,
    createdAt: serverTimestamp(),
  });

  if (canWriteStats) {
    if (statsExists) {
      batch.update(statsRef, {
        totalUsers: increment(1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(statsRef, {
        totalUsers: seedCount,
        updatedAt: serverTimestamp(),
      });
    }
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
  }

  const createdSnap = await getDoc(userRef);
  return createdSnap.data() as PrivateUser;
}

export async function updatePresence(uid: string, isOnline: boolean): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return;
  const path = `users_public/${uid}`;
  const ref = doc(db, 'users_public', uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      isOnline,
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Presence updates may race on page unload; log without crashing UI if offline
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }
}

export async function updateUserProfile(
  uid: string,
  oldHandle: string,
  updates: {
    displayName: string;
    handle: string;
    photoUrl: string;
    bio: string;
    discoverable: boolean;
  }
): Promise<void> {
  const displayName = updates.displayName.trim().slice(0, LIMITS.DISPLAY_NAME_MAX);
  const handle = sanitizeHandle(updates.handle);
  const bio = updates.bio.trim().slice(0, LIMITS.BIO_MAX);
  const photoUrl = updates.photoUrl.slice(0, LIMITS.PHOTO_MAX_CHARS);

  if (!displayName) {
    throw new Error('Display name cannot be empty.');
  }
  if (!HANDLE_REGEX.test(handle)) {
    throw new Error('Handle must be 3–30 characters using lowercase letters, numbers, _ or -.');
  }

  if (handle !== oldHandle) {
    const newHandleRef = doc(db, 'handles', handle);
    let existingHandle;
    try {
      existingHandle = await getDoc(newHandleRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `handles/${handle}`);
    }
    if (existingHandle.exists() && existingHandle.data().uid !== uid) {
      throw new Error(`@${handle} is already taken. Try another handle.`);
    }
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    displayName,
    handle,
    photoUrl,
    bio,
    discoverable: updates.discoverable,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'users_public', uid), {
    displayName,
    handle,
    photoUrl,
    bio,
    discoverable: updates.discoverable,
    isOnline: true,
    lastSeen: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (handle !== oldHandle) {
    batch.delete(doc(db, 'handles', oldHandle));
    batch.set(doc(db, 'handles', handle), {
      uid,
      handle,
      createdAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function lookupUserByHandle(rawHandle: string): Promise<PublicUser | null> {
  const normalized = sanitizeHandle(rawHandle.replace(/^@/, ''));
  if (!HANDLE_REGEX.test(normalized)) return null;

  try {
    const handleSnap = await getDoc(doc(db, 'handles', normalized));
    if (!handleSnap.exists()) return null;
    const uid = handleSnap.data().uid as string;
    const pubSnap = await getDoc(doc(db, 'users_public', uid));
    if (!pubSnap.exists()) return null;
    return pubSnap.data() as PublicUser;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `handles/${normalized}`);
  }
}

export async function startDirectChat(
  currentUid: string,
  otherUid: string
): Promise<string> {
  if (currentUid === otherUid) {
    throw new Error('Cannot start a direct chat with yourself.');
  }
  const chatId = getDirectChatId(currentUid, otherUid);
  const chatRef = doc(db, 'chats', chatId);

  try {
    const existing = await getDoc(chatRef);
    if (existing.exists()) {
      return chatId;
    }

    const batch = writeBatch(db);
    batch.set(chatRef, {
      id: chatId,
      type: 'direct',
      name: '',
      photoUrl: '',
      createdBy: currentUid,
      adminUids: [currentUid, otherUid],
      memberUids: [currentUid, otherUid],
      inviteCode: '',
      lastInviteUsed: '',
      lastMessageText: '',
      lastMessageType: 'none',
      lastMessageSenderId: '',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return chatId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function createGroupChat(
  currentUid: string,
  name: string,
  photoUrl: string,
  invitedUids: string[]
): Promise<string> {
  const cleanName = name.trim().slice(0, LIMITS.GROUP_NAME_MAX);
  if (!cleanName) {
    throw new Error('Group name is required.');
  }

  const uniqueMembers = Array.from(new Set([currentUid, ...invitedUids])).slice(
    0,
    LIMITS.MAX_GROUP_MEMBERS
  );
  const chatId = generateRandomId('grp', 14);
  const inviteCode = generateRandomId('inv', 8).replace('_', '');

  const batch = writeBatch(db);
  batch.set(doc(db, 'chats', chatId), {
    id: chatId,
    type: 'group',
    name: cleanName,
    groupBio: '',
    allowMembersEditInfo: false,
    photoUrl: photoUrl.slice(0, LIMITS.PHOTO_MAX_CHARS),
    createdBy: currentUid,
    adminUids: [currentUid],
    memberUids: uniqueMembers,
    inviteCode,
    lastInviteUsed: '',
    lastMessageText: 'Group created',
    lastMessageType: 'none',
    lastMessageSenderId: currentUid,
    lastMessageAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'group_invites', inviteCode), {
    inviteCode,
    chatId,
    groupName: cleanName,
    createdBy: currentUid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return chatId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function joinGroupByInviteCode(
  currentUid: string,
  rawCode: string
): Promise<string> {
  const code = rawCode.trim();
  if (!code || code.length < 6 || code.length > 24 || !ID_REGEX.test(code)) {
    throw new Error('Invalid invite code format.');
  }

  let inviteSnap;
  try {
    inviteSnap = await getDoc(doc(db, 'group_invites', code));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `group_invites/${code}`);
  }

  if (!inviteSnap.exists()) {
    throw new Error('Group invite code not found.');
  }

  const { chatId } = inviteSnap.data() as { chatId: string };
  const chatRef = doc(db, 'chats', chatId);

  try {
    await updateDoc(chatRef, {
      memberUids: arrayUnion(currentUid),
      lastInviteUsed: code,
      updatedAt: serverTimestamp(),
    });
    return chatId;
  } catch (err) {
    // If the user is already a member, Action 3 denies re-joining; verify membership cleanly.
    try {
      const chatSnap = await getDoc(chatRef);
      if (chatSnap.exists() && (chatSnap.data() as Chat).memberUids.includes(currentUid)) {
        return chatId;
      }
    } catch {
      // Fall through to structured error handler
    }
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function syncChatVisibilityForNewMembers(
  chatId: string,
  newMemberUids: string[],
  actorUid?: string
): Promise<void> {
  const uid = actorUid || auth.currentUser?.uid;
  if (!uid) return;
  try {
    const msgsQuery = query(
      collection(db, 'chats', chatId, 'messages'),
      where('visibleToUids', 'array-contains', uid),
      limit(40)
    );
    const pollsQuery = query(
      collection(db, 'chats', chatId, 'polls'),
      where('visibleToUids', 'array-contains', uid),
      limit(20)
    );
    const checklistQuery = query(
      collection(db, 'chats', chatId, 'checklist_items'),
      where('visibleToUids', 'array-contains', uid),
      limit(60)
    );
    const gameResultsQuery = query(
      collection(db, 'chats', chatId, 'game_results'),
      where('visibleToUids', 'array-contains', uid),
      limit(80)
    );
    const [msgsSnap, pollsSnap, checklistSnap, gameResultsSnap] = await Promise.all([
      getDocs(msgsQuery),
      getDocs(pollsQuery),
      getDocs(checklistQuery),
      getDocs(gameResultsQuery),
    ]);
    if (msgsSnap.empty && pollsSnap.empty && checklistSnap.empty && gameResultsSnap.empty) return;

    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => {
      batch.update(d.ref, { visibleToUids: newMemberUids });
    });
    pollsSnap.docs.forEach((d) => {
      batch.update(d.ref, { visibleToUids: newMemberUids });
    });
    checklistSnap.docs.forEach((d) => {
      batch.update(d.ref, { visibleToUids: newMemberUids });
    });
    gameResultsSnap.docs.forEach((d) => {
      batch.update(d.ref, { visibleToUids: newMemberUids });
    });
    await batch.commit();
  } catch {
    // Non-critical visibility backfill
  }
}

export async function addMemberToGroup(chat: Chat, newUid: string): Promise<void> {
  if (chat.memberUids.includes(newUid)) return;
  if (chat.memberUids.length >= LIMITS.MAX_GROUP_MEMBERS) {
    throw new Error(`Groups are limited to ${LIMITS.MAX_GROUP_MEMBERS} members.`);
  }
  const updatedMembers = [...chat.memberUids, newUid];
  try {
    await updateDoc(doc(db, 'chats', chat.id), {
      memberUids: updatedMembers,
      updatedAt: serverTimestamp(),
    });
    await syncChatVisibilityForNewMembers(chat.id, updatedMembers);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
  }
}

export async function removeMemberFromGroup(chat: Chat, targetUid: string): Promise<void> {
  if (targetUid === chat.createdBy) {
    throw new Error('Group creator cannot be removed.');
  }
  const updatedMembers = chat.memberUids.filter((id) => id !== targetUid);
  const updatedAdmins = chat.adminUids.filter((id) => id !== targetUid);
  try {
    await updateDoc(doc(db, 'chats', chat.id), {
      memberUids: updatedMembers,
      adminUids: updatedAdmins,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
  }
}

export async function updateGroupInfo(
  chatId: string,
  name: string,
  groupBio: string,
  photoUrl: string,
  allowMembersEditInfo?: boolean
): Promise<void> {
  const cleanName = name.trim().slice(0, LIMITS.GROUP_NAME_MAX);
  if (!cleanName) throw new Error('Group name cannot be empty.');
  const cleanBio = groupBio.trim().slice(0, 200);
  const payload: Record<string, unknown> = {
    name: cleanName,
    groupBio: cleanBio,
    photoUrl: photoUrl.slice(0, LIMITS.PHOTO_MAX_CHARS),
    updatedAt: serverTimestamp(),
  };
  if (typeof allowMembersEditInfo === 'boolean') {
    payload.allowMembersEditInfo = allowMembersEditInfo;
  }
  try {
    await updateDoc(doc(db, 'chats', chatId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function leaveGroup(chat: Chat, uid: string): Promise<void> {
  if (chat.createdBy === uid) {
    throw new Error('As the group creator, you cannot leave this group.');
  }
  const updatedMembers = chat.memberUids.filter((id) => id !== uid);
  try {
    await updateDoc(doc(db, 'chats', chat.id), {
      memberUids: updatedMembers,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chat.id}`);
  }
}

export async function sendTextMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  rawText: string,
  mentionedUids: string[] = [],
  replyTo?: MessageReply | null
): Promise<void> {
  const text = truncateUtf8(rawText.trim(), LIMITS.MESSAGE_TEXT_MAX);
  if (!text) return;

  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: truncateUtf8(sender.displayName.trim() || 'User', LIMITS.DISPLAY_NAME_MAX),
    type: 'text',
    text,
    imageData: '',
    pollId: '',
    mentions: mentionedUids.slice(0, LIMITS.MENTIONS_MAX),
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: text.slice(0, 180),
    lastMessageType: 'text',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function sendPhotoMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  imageData: string,
  rawCaption: string,
  mentionedUids: string[] = [],
  replyTo?: MessageReply | null,
  viewOnce = false
): Promise<void> {
  const caption = truncateUtf8(rawCaption.trim(), LIMITS.MESSAGE_TEXT_MAX);
  const safeImage = imageData.slice(0, LIMITS.IMAGE_MSG_MAX_CHARS);
  if (!safeImage) throw new Error('Image is missing.');

  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: truncateUtf8(sender.displayName.trim() || 'User', LIMITS.DISPLAY_NAME_MAX),
    type: 'image',
    text: caption,
    imageData: safeImage,
    ...(viewOnce ? { viewOnce: true, viewedBy: [] } : {}),
    pollId: '',
    mentions: mentionedUids.slice(0, LIMITS.MENTIONS_MAX),
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: viewOnce
      ? 'View-once photo'
      : caption
      ? `Photo: ${caption.slice(0, 150)}`
      : 'Shared a photo',
    lastMessageType: 'image',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function markViewOncePhotoViewed(
  chatId: string,
  messageId: string,
  uid: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      viewedBy: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function sendFileMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  fileData: string,
  rawFileName: string,
  fileSize: number,
  fileMime: string,
  replyTo?: MessageReply | null
): Promise<void> {
  const safeData = fileData.slice(0, LIMITS.FILE_MSG_MAX_CHARS);
  const cleanName = truncateUtf8(rawFileName.trim() || 'Document', LIMITS.FILE_NAME_MAX);
  const safeSize = Math.max(0, Math.min(500000, Math.round(fileSize)));
  const safeMime = (fileMime || 'application/octet-stream').slice(0, 100);
  if (safeData.length < 10) throw new Error('File data is invalid.');

  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: truncateUtf8(sender.displayName.trim() || 'User', LIMITS.DISPLAY_NAME_MAX),
    type: 'file',
    text: `${cleanName} (${formatFileSize(safeSize)})`,
    imageData: '',
    fileData: safeData,
    fileName: cleanName,
    fileSize: safeSize,
    fileMime: safeMime,
    pollId: '',
    mentions: [],
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: `File: ${cleanName}`.slice(0, 180),
    lastMessageType: 'file',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function createPollMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  rawQuestion: string,
  rawOptions: string[]
): Promise<void> {
  const question = rawQuestion.trim().slice(0, LIMITS.POLL_QUESTION_MAX);
  const options = rawOptions
    .map((o) => o.trim().slice(0, LIMITS.POLL_OPTION_MAX))
    .filter(Boolean)
    .slice(0, LIMITS.POLL_OPTIONS_MAX);

  if (!question) throw new Error('Poll question is required.');
  if (options.length < LIMITS.POLL_OPTIONS_MIN) {
    throw new Error('At least 2 poll options are required.');
  }

  const pollId = generateRandomId('poll', 14);
  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'polls', pollId), {
    id: pollId,
    chatId: chat.id,
    createdBy: sender.uid,
    creatorName: sender.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    question,
    options,
    isClosed: false,
    visibleToUids: chat.memberUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: sender.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    type: 'poll',
    text: question,
    imageData: '',
    pollId,
    mentions: [],
    reactions: {},
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: `Poll: ${question.slice(0, 150)}`,
    lastMessageType: 'poll',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/polls/${pollId}`);
  }
}

export async function castPollVote(
  chat: Chat,
  pollId: string,
  voter: { uid: string; displayName: string },
  optionIndex: number
): Promise<void> {
  const voteRef = doc(db, 'chats', chat.id, 'polls', pollId, 'votes', voter.uid);
  try {
    const batch = writeBatch(db);
    batch.set(voteRef, {
      voterId: voter.uid,
      voterName: voter.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
      optionIndex,
      visibleToUids: chat.memberUids,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `chats/${chat.id}/polls/${pollId}/votes/${voter.uid}`
    );
  }
}

export async function closePoll(chatId: string, pollId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId, 'polls', pollId), {
      isClosed: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}/polls/${pollId}`);
  }
}

export async function markMessagesDelivered(
  uid: string,
  chatId: string,
  messages: ChatMessage[]
): Promise<void> {
  const toMark = messages.filter(
    (m) => m.senderId !== uid && !m.deliveredTo.includes(uid)
  );
  if (toMark.length === 0) return;

  const batch = writeBatch(db);
  toMark.slice(0, 25).forEach((m) => {
    batch.update(doc(db, 'chats', chatId, 'messages', m.id), {
      deliveredTo: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch {
    // Silent retry on next snapshot if concurrent
  }
}

export async function markMessagesRead(
  uid: string,
  chatId: string,
  messages: ChatMessage[],
  readReceiptsEnabled = true
): Promise<void> {
  if (!readReceiptsEnabled) return;

  const toMark = messages.filter(
    (m) => m.senderId !== uid && (!m.readBy.includes(uid) || !m.deliveredTo.includes(uid))
  );
  if (toMark.length === 0) return;

  const batch = writeBatch(db);
  toMark.slice(0, 30).forEach((m) => {
    batch.update(doc(db, 'chats', chatId, 'messages', m.id), {
      deliveredTo: arrayUnion(uid),
      readBy: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch {
    // Silent retry on next snapshot if concurrent
  }
}

export async function deleteOwnMessage(chatId: string, messageId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
  }
}

export async function editOwnMessage(
  chatId: string,
  messageId: string,
  messageType: MessageType,
  rawText: string,
  mentionedUids: string[] = []
): Promise<void> {
  const cleanText = truncateUtf8(rawText.trim(), LIMITS.MESSAGE_TEXT_MAX);
  if (messageType === 'text' && !cleanText) {
    throw new Error('Message text cannot be empty.');
  }
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: cleanText,
      mentions: mentionedUids.slice(0, LIMITS.MENTIONS_MAX),
      editedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function togglePinChat(
  uid: string,
  currentPinned: string[] = [],
  chatId: string
): Promise<void> {
  const exists = currentPinned.includes(chatId);
  const nextPinned = exists
    ? currentPinned.filter((id) => id !== chatId)
    : [chatId, ...currentPinned].slice(0, 20);
  try {
    await updateDoc(doc(db, 'users', uid), {
      pinnedChatIds: nextPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function toggleArchiveChat(
  uid: string,
  currentArchived: string[] = [],
  currentPinned: string[] = [],
  chatId: string
): Promise<void> {
  const isArchived = currentArchived.includes(chatId);
  const nextArchived = isArchived
    ? currentArchived.filter((id) => id !== chatId)
    : [chatId, ...currentArchived].slice(0, 50);
  const nextPinned = isArchived
    ? currentPinned
    : currentPinned.filter((id) => id !== chatId);
  try {
    await updateDoc(doc(db, 'users', uid), {
      archivedChatIds: nextArchived,
      pinnedChatIds: nextPinned,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function applyChatWallpaper(
  uid: string,
  wallpaper: WallpaperId,
  scope: 'chat' | 'all',
  chatId?: string,
  existingChatWallpapers: Record<string, WallpaperId> = {}
): Promise<void> {
  try {
    if (scope === 'chat' && chatId) {
      const merged = { ...existingChatWallpapers, [chatId]: wallpaper };
      const trimmedKeys = Object.keys(merged).slice(-50);
      const boundedMap: Record<string, WallpaperId> = {};
      trimmedKeys.forEach((k) => {
        boundedMap[k] = merged[k];
      });
      await updateDoc(doc(db, 'users', uid), {
        chatWallpapers: boundedMap,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'users', uid), {
        wallpaper,
        chatWallpapers: {},
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateReadReceiptsPreference(
  uid: string,
  enabled: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', uid), {
      readReceiptsEnabled: enabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function pinMessageInChat(
  chatId: string,
  uid: string,
  message: ChatMessage
): Promise<void> {
  const preview =
    message.type === 'image'
      ? message.viewOnce
        ? 'View-once photo'
        : message.text.trim() || 'Shared a photo'
      : message.type === 'audio'
      ? `Voice message (${formatAudioDuration(message.audioDuration)})`
      : message.type === 'file'
      ? message.fileName?.trim() || 'Document'
      : message.type === 'poll'
      ? `Poll: ${message.text.trim() || 'Group Poll'}`
      : message.type === 'meet'
      ? message.text.trim() || 'Google Meet video call'
      : message.text.trim() || 'Pinned message';

  try {
    await updateDoc(doc(db, 'chats', chatId), {
      pinnedMessageId: message.id,
      pinnedMessagePreview: truncateUtf8(preview, 180),
      pinnedMessageSender: truncateUtf8(message.senderName || 'Friend', LIMITS.DISPLAY_NAME_MAX),
      pinnedBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function unpinMessageInChat(chatId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      pinnedMessageId: deleteField(),
      pinnedMessagePreview: deleteField(),
      pinnedMessageSender: deleteField(),
      pinnedBy: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function setChatDisappearingTimer(
  chatId: string,
  seconds: DisappearingDuration
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      disappearingSeconds: seconds,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function toggleMuteChat(
  uid: string,
  currentMuted: string[] = [],
  chatId: string
): Promise<void> {
  const exists = currentMuted.includes(chatId);
  const nextMuted = exists
    ? currentMuted.filter((id) => id !== chatId)
    : [chatId, ...currentMuted].slice(0, 100);
  try {
    await updateDoc(doc(db, 'users', uid), {
      mutedChatIds: nextMuted,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function toggleBlockUser(
  uid: string,
  currentBlocked: string[] = [],
  targetUid: string
): Promise<void> {
  if (uid === targetUid) return;
  const exists = currentBlocked.includes(targetUid);
  const nextBlocked = exists
    ? currentBlocked.filter((id) => id !== targetUid)
    : [targetUid, ...currentBlocked].slice(0, 100);
  try {
    await updateDoc(doc(db, 'users', uid), {
      blockedUids: nextBlocked,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function deleteChatForSelf(
  uid: string,
  chatId: string,
  userProfile: PrivateUser
): Promise<void> {
  const currentDeleted = { ...(userProfile.deletedChats || {}), [chatId]: Date.now() };
  const keys = Object.keys(currentDeleted);
  if (keys.length > 100) {
    keys
      .sort((a, b) => currentDeleted[a] - currentDeleted[b])
      .slice(0, keys.length - 100)
      .forEach((k) => {
        delete currentDeleted[k];
      });
  }

  try {
    await updateDoc(doc(db, 'users', uid), {
      deletedChats: currentDeleted,
      pinnedChatIds: (userProfile.pinnedChatIds || []).filter((id) => id !== chatId),
      archivedChatIds: (userProfile.archivedChatIds || []).filter((id) => id !== chatId),
      mutedChatIds: (userProfile.mutedChatIds || []).filter((id) => id !== chatId),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function restoreDeletedChatVisibility(
  uid: string,
  chatId: string,
  existingDeletedChats: Record<string, number> = {}
): Promise<void> {
  if (!(chatId in existingDeletedChats)) return;
  try {
    await updateDoc(doc(db, 'users', uid), {
      [`deletedChats.${chatId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical visibility restore
  }
}

export async function deleteGroupChatPermanently(
  uid: string,
  chatId: string,
  userProfile: PrivateUser
): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId));
    await updateDoc(doc(db, 'users', uid), {
      pinnedChatIds: (userProfile.pinnedChatIds || []).filter((id) => id !== chatId),
      archivedChatIds: (userProfile.archivedChatIds || []).filter((id) => id !== chatId),
      mutedChatIds: (userProfile.mutedChatIds || []).filter((id) => id !== chatId),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
  }
}

export async function createGoogleMeetSpace(accessToken: string): Promise<{
  meetingUri: string;
  meetingCode: string;
}> {
  const res = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error('MEET_AUTH_REQUIRED');
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(errText || 'Failed to create Google Meet room.');
  }

  const data = (await res.json()) as {
    meetingUri?: string;
    meetingCode?: string;
  };

  if (!data.meetingUri) {
    throw new Error('Google Meet did not return a valid meeting link.');
  }

  return {
    meetingUri: data.meetingUri.slice(0, 300),
    meetingCode: (data.meetingCode || '').slice(0, 60),
  };
}

export async function sendMeetMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  meetingUri: string,
  meetingCode: string,
  rawNote = '',
  replyTo?: MessageReply | null
): Promise<void> {
  const note = rawNote.trim().slice(0, LIMITS.MESSAGE_TEXT_MAX) || 'Started a Google Meet video call';
  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: sender.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    type: 'meet',
    text: note,
    imageData: '',
    pollId: '',
    meetUri: meetingUri.slice(0, 300),
    meetCode: meetingCode.slice(0, 60),
    mentions: [],
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: `Google Meet: ${note.slice(0, 140)}`,
    lastMessageType: 'meet',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function syncDeliveryForAllUserChats(uid: string, chats: Chat[]): Promise<void> {
  for (const chat of chats.slice(0, 12)) {
    try {
      const q = query(
        collection(db, 'chats', chat.id, 'messages'),
        where('visibleToUids', 'array-contains', uid),
        limit(30)
      );
      const snap = await getDocs(q);
      const msgs = snap.docs.map((d) => d.data() as ChatMessage);
      await markMessagesDelivered(uid, chat.id, msgs);
    } catch {
      // Ignore transient query errors during background sync
    }
  }
}

export async function toggleMessageReaction(
  chatId: string,
  messageId: string,
  uid: string,
  currentEmoji: string | undefined,
  nextEmoji: string
): Promise<void> {
  const path = `chats/${chatId}/messages/${messageId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      [`reactions.${uid}`]: currentEmoji === nextEmoji ? deleteField() : nextEmoji,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function setTypingStatus(
  chat: Chat,
  user: { uid: string; displayName: string },
  isTyping: boolean
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
  try {
    await setDoc(doc(db, 'chats', chat.id, 'typing', user.uid), {
      uid: user.uid,
      displayName: user.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
      isTyping,
      visibleToUids: chat.memberUids,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical typing indicator errors should not interrupt message composition
  }
}

export async function createStatusUpdate(
  user: { uid: string; displayName: string; photoUrl: string },
  type: 'text' | 'image',
  rawText: string,
  mediaData: string,
  background: string,
  privacy: 'everyone' | 'contacts' = 'everyone',
  visibleToUids: string[] = []
): Promise<void> {
  const text = rawText.trim().slice(0, 500);
  const safeMedia = mediaData.slice(0, LIMITS.IMAGE_MSG_MAX_CHARS);
  if (type === 'text' && !text) {
    throw new Error('Status text cannot be empty.');
  }
  if (type === 'image' && !safeMedia) {
    throw new Error('Status photo is missing.');
  }

  const statusId = generateRandomId('st', 16);
  const statusRef = doc(db, 'statuses', statusId);
  const path = `statuses/${statusId}`;

  const docData: Record<string, unknown> = {
    id: statusId,
    uid: user.uid,
    displayName: user.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    photoUrl: user.photoUrl.slice(0, LIMITS.PHOTO_MAX_CHARS),
    type,
    text,
    mediaData: type === 'image' ? safeMedia : '',
    background: background.slice(0, 40) || 'from-teal-600 to-sky-700',
    viewers: [],
    privacy,
    createdAt: serverTimestamp(),
  };

  if (privacy === 'contacts') {
    docData.visibleToUids = visibleToUids.slice(0, 50);
  }

  try {
    await setDoc(statusRef, docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function markStatusViewed(
  statusId: string,
  viewers: string[],
  currentUid: string
): Promise<void> {
  if (viewers.includes(currentUid)) return;
  const statusRef = doc(db, 'statuses', statusId);
  const path = `statuses/${statusId}`;
  try {
    await updateDoc(statusRef, {
      viewers: [...viewers, currentUid],
    });
  } catch (err) {
    // Non-critical view tracking error
  }
}

export async function deleteStatusUpdate(statusId: string): Promise<void> {
  const path = `statuses/${statusId}`;
  try {
    await deleteDoc(doc(db, 'statuses', statusId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}


export async function sendVoiceMessage(
  chat: Chat,
  sender: { uid: string; displayName: string },
  audioData: string,
  durationSec: number,
  replyTo?: MessageReply | null
): Promise<void> {
  const safeAudio = audioData.slice(0, LIMITS.AUDIO_MSG_MAX_CHARS);
  if (safeAudio.length < 20) {
    throw new Error('Voice recording was too short.');
  }
  const safeDuration = Math.max(0, Math.min(300, Math.round(durationSec)));
  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: sender.uid,
    senderName: sender.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    type: 'audio',
    text: '',
    imageData: '',
    audioData: safeAudio,
    audioDuration: safeDuration,
    pollId: '',
    mentions: [],
    reactions: {},
    ...(replyTo ? { replyTo } : {}),
    visibleToUids: chat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: `Voice message (${formatAudioDuration(safeDuration)})`,
    lastMessageType: 'audio',
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function forwardMessageToChat(
  targetChat: Chat,
  sender: { uid: string; displayName: string },
  sourceMessage: ChatMessage
): Promise<void> {
  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);
  const msgRef = doc(db, 'chats', targetChat.id, 'messages', messageId);

  let nextType: MessageType = sourceMessage.type;
  let nextText = (sourceMessage.text || '').trim().slice(0, LIMITS.MESSAGE_TEXT_MAX);
  let nextImageData = '';
  let nextAudioData: string | undefined;
  let nextAudioDuration: number | undefined;
  let nextFileData: string | undefined;
  let nextFileName: string | undefined;
  let nextFileSize: number | undefined;
  let nextFileMime: string | undefined;
  let nextMeetUri: string | undefined;
  let nextMeetCode: string | undefined;
  let lastSummary = nextText;

  if (sourceMessage.type === 'poll') {
    nextType = 'text';
    nextText = `📊 Poll: ${nextText || 'Group Poll'}`.slice(0, LIMITS.MESSAGE_TEXT_MAX);
    lastSummary = nextText;
  } else if (sourceMessage.type === 'image') {
    if (sourceMessage.viewOnce) {
      throw new Error('View-once photos cannot be forwarded.');
    }
    nextImageData = (sourceMessage.imageData || '').slice(0, LIMITS.IMAGE_MSG_MAX_CHARS);
    if (nextImageData.length < 10) {
      nextType = 'text';
      nextText = nextText || 'Shared photo';
      lastSummary = nextText;
    } else {
      lastSummary = nextText ? `Photo: ${nextText.slice(0, 140)}` : 'Forwarded photo';
    }
  } else if (sourceMessage.type === 'file') {
    const safeFile = (sourceMessage.fileData || '').slice(0, LIMITS.FILE_MSG_MAX_CHARS);
    const cleanFileName = truncateUtf8(sourceMessage.fileName || 'Document', LIMITS.FILE_NAME_MAX);
    if (safeFile.length < 10) {
      nextType = 'text';
      nextText = cleanFileName;
      lastSummary = nextText;
    } else {
      nextFileData = safeFile;
      nextFileName = cleanFileName;
      nextFileSize = Math.max(0, Math.min(500000, Math.round(sourceMessage.fileSize || 0)));
      nextFileMime = (sourceMessage.fileMime || 'application/octet-stream').slice(0, 100);
      lastSummary = `File: ${cleanFileName}`;
    }
  } else if (sourceMessage.type === 'audio') {
    const safeAudio = (sourceMessage.audioData || '').slice(0, LIMITS.AUDIO_MSG_MAX_CHARS);
    if (safeAudio.length < 20) {
      nextType = 'text';
      nextText = `Voice message (${formatAudioDuration(sourceMessage.audioDuration)})`;
      lastSummary = nextText;
    } else {
      nextAudioData = safeAudio;
      nextAudioDuration = Math.max(0, Math.min(300, Math.round(sourceMessage.audioDuration || 0)));
      lastSummary = `Voice message (${formatAudioDuration(nextAudioDuration)})`;
    }
  } else if (sourceMessage.type === 'meet') {
    const uri = (sourceMessage.meetUri || '').slice(0, 300);
    if (uri.startsWith('https://meet.google.com/')) {
      nextMeetUri = uri;
      nextMeetCode = (sourceMessage.meetCode || '').slice(0, 60);
      nextText = nextText || 'Google Meet video call';
      lastSummary = `Google Meet: ${nextText.slice(0, 140)}`;
    } else {
      nextType = 'text';
      nextText = nextText || 'Google Meet video call';
      lastSummary = nextText;
    }
  } else {
    nextType = 'text';
    nextText = nextText || 'Forwarded message';
    lastSummary = nextText;
  }

  const payload: Record<string, unknown> = {
    id: messageId,
    chatId: targetChat.id,
    senderId: sender.uid,
    senderName: sender.displayName.slice(0, LIMITS.DISPLAY_NAME_MAX),
    type: nextType,
    text: nextText,
    imageData: nextImageData,
    pollId: '',
    forwarded: true,
    mentions: [],
    reactions: {},
    visibleToUids: targetChat.memberUids,
    deliveredTo: [sender.uid],
    readBy: [sender.uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (nextAudioData !== undefined) {
    payload.audioData = nextAudioData;
    payload.audioDuration = nextAudioDuration ?? 0;
  }
  if (nextFileData !== undefined) {
    payload.fileData = nextFileData;
    payload.fileName = nextFileName ?? 'Document';
    payload.fileSize = nextFileSize ?? 0;
    payload.fileMime = nextFileMime ?? 'application/octet-stream';
  }
  if (nextMeetUri !== undefined) {
    payload.meetUri = nextMeetUri;
    payload.meetCode = nextMeetCode ?? '';
  }

  batch.set(msgRef, payload);

  batch.update(doc(db, 'chats', targetChat.id), {
    lastMessageText: lastSummary.slice(0, 180) || 'Forwarded message',
    lastMessageType: nextType,
    lastMessageSenderId: sender.uid,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${targetChat.id}/messages/${messageId}`);
  }
}

export async function toggleStarMessage(
  uid: string,
  chatTitle: string,
  message: ChatMessage,
  currentlyStarred: boolean
): Promise<void> {
  const starRef = doc(db, 'users', uid, 'starred', message.id);
  const path = `users/${uid}/starred/${message.id}`;

  if (currentlyStarred) {
    try {
      await deleteDoc(starRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
    return;
  }

  const rawPreview =
    message.type === 'image'
      ? message.viewOnce
        ? 'View-once photo'
        : message.text.trim() || 'Shared a photo'
      : message.type === 'audio'
      ? `Voice message (${formatAudioDuration(message.audioDuration)})`
      : message.type === 'file'
      ? `File: ${message.fileName?.trim() || 'Document'}`
      : message.type === 'poll'
      ? `Poll: ${message.text.trim() || 'Group Poll'}`
      : message.type === 'meet'
      ? message.text.trim() || 'Google Meet video call'
      : message.text.trim() || 'Message';

  const docData: Omit<StarredMessage, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> } = {
    id: message.id,
    uid,
    chatId: message.chatId,
    chatTitle: (chatTitle.trim() || 'Chat').slice(0, 60),
    senderName: (message.senderName.trim() || 'Friend').slice(0, 50),
    type: message.type,
    previewText: rawPreview.slice(0, 240),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(starRef, docData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function removeStarredMessage(uid: string, starId: string): Promise<void> {
  const path = `users/${uid}/starred/${starId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'starred', starId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function updateAppearancePreferences(
  uid: string,
  prefs: { accentColor?: AccentColorId; fontSize?: FontSizeId }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (prefs.accentColor) {
    payload.accentColor = prefs.accentColor.slice(0, 30);
  }
  if (prefs.fontSize) {
    payload.fontSize = prefs.fontSize;
  }
  try {
    await updateDoc(doc(db, 'users', uid), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function createCallSession(params: {
  chatId: string;
  caller: { uid: string; displayName: string; photoUrl: string };
  callee: { uid: string; displayName: string; photoUrl: string };
  callType: CallType;
  isGroup?: boolean;
  visibleToUids?: string[];
  offerSdp: string;
  offerType: string;
}): Promise<string> {
  const callId = generateRandomId('call', 16);
  const path = `calls/${callId}`;
  const isGroupSession = Boolean(params.isGroup && params.callType === 'screen');
  const visibleToUids = isGroupSession
    ? Array.from(
        new Set([
          params.caller.uid,
          ...(params.visibleToUids || []).filter((uid) => uid && uid !== 'baatcheet_ai_bot'),
        ])
      ).slice(0, 50)
    : [params.caller.uid, params.callee.uid];

  const payload: Record<string, unknown> = {
    id: callId,
    chatId: params.chatId,
    callerId: params.caller.uid,
    callerName: truncateUtf8(params.caller.displayName.trim() || 'Friend', LIMITS.DISPLAY_NAME_MAX),
    callerPhoto: (params.caller.photoUrl || '').slice(0, LIMITS.PHOTO_MAX_CHARS),
    calleeId: isGroupSession ? 'group' : params.callee.uid,
    calleeName: truncateUtf8(params.callee.displayName.trim() || 'Friend', LIMITS.DISPLAY_NAME_MAX),
    calleePhoto: (params.callee.photoUrl || '').slice(0, LIMITS.PHOTO_MAX_CHARS),
    callType: params.callType,
    ...(isGroupSession ? { isGroup: true } : {}),
    status: isGroupSession ? 'live' : 'ringing',
    offerSdp: params.offerSdp.slice(0, 20000),
    offerType: (params.offerType || 'offer').slice(0, 20),
    visibleToUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'calls', callId), payload);
    return callId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function answerCallSession(
  callId: string,
  answerSdp: string,
  answerType: string
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'answered',
      answerSdp: answerSdp.slice(0, 20000),
      answerType: (answerType || 'answer').slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateCallStatus(
  callId: string,
  status: Exclude<CallStatus, 'ringing' | 'live' | 'answered'>
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Ignore errors when call already transitioned to terminal state concurrently
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function joinScreenSharePeer(params: {
  callId: string;
  callerId: string;
  viewer: { uid: string; displayName: string; photoUrl: string };
}): Promise<void> {
  const path = `calls/${params.callId}/peers/${params.viewer.uid}`;
  const peerRef = doc(db, 'calls', params.callId, 'peers', params.viewer.uid);
  try {
    try {
      await deleteDoc(peerRef);
    } catch {
      // No prior peer record to clear
    }
    await setDoc(peerRef, {
      id: params.viewer.uid,
      callId: params.callId,
      callerId: params.callerId,
      viewerId: params.viewer.uid,
      viewerName: truncateUtf8(params.viewer.displayName.trim() || 'Member', LIMITS.DISPLAY_NAME_MAX),
      viewerPhoto: (params.viewer.photoUrl || '').slice(0, LIMITS.PHOTO_MAX_CHARS),
      status: 'joining',
      visibleToUids: [params.callerId, params.viewer.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function sendScreenSharePeerOffer(params: {
  callId: string;
  viewerId: string;
  offerSdp: string;
  offerType: string;
}): Promise<void> {
  const path = `calls/${params.callId}/peers/${params.viewerId}`;
  try {
    await updateDoc(doc(db, 'calls', params.callId, 'peers', params.viewerId), {
      status: 'offered',
      offerSdp: params.offerSdp.slice(0, 20000),
      offerType: (params.offerType || 'offer').slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('Missing or insufficient permissions')) {
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function answerScreenSharePeer(params: {
  callId: string;
  viewerId: string;
  answerSdp: string;
  answerType: string;
}): Promise<void> {
  const path = `calls/${params.callId}/peers/${params.viewerId}`;
  try {
    await updateDoc(doc(db, 'calls', params.callId, 'peers', params.viewerId), {
      status: 'answered',
      answerSdp: params.answerSdp.slice(0, 20000),
      answerType: (params.answerType || 'answer').slice(0, 20),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function leaveScreenSharePeer(callId: string, viewerId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', callId, 'peers', viewerId), {
      status: 'left',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if session already closed
  }
}

export async function addCallIceCandidate(params: {
  callId: string;
  senderId: string;
  role: 'caller' | 'callee';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
  visibleToUids: [string, string];
}): Promise<void> {
  if (!params.candidate) return;
  const candidateId = generateRandomId('ice', 14);
  const safeIndex = Math.max(0, Math.min(20, Math.round(params.sdpMLineIndex || 0)));
  try {
    await setDoc(doc(db, 'calls', params.callId, 'candidates', candidateId), {
      id: candidateId,
      senderId: params.senderId,
      role: params.role,
      candidate: params.candidate.slice(0, 2000),
      sdpMid: (params.sdpMid || '').slice(0, 64),
      sdpMLineIndex: safeIndex,
      visibleToUids: params.visibleToUids,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-fatal if call closed while trickling ICE candidates
  }
}

export async function createConfessionPost(params: {
  uid: string;
  rawText: string;
  category: ConfessionCategory;
  scope: ConfessionScope;
  targetChat?: Chat | null;
}): Promise<string> {
  const safetyErr = checkModerationSafety(params.rawText);
  if (safetyErr) {
    throw new Error(safetyErr);
  }
  const text = truncateUtf8(params.rawText.trim(), LIMITS.CONFESSION_TEXT_MAX);
  if (!text) {
    throw new Error('Write a secret or confession before posting.');
  }
  if (params.scope === 'group' && !params.targetChat) {
    throw new Error('Select a group chat to post an anonymous group secret.');
  }

  const confessionId = generateRandomId('cf', 14);
  const alias = pickAnonymousAlias();
  const chatId = params.scope === 'group' && params.targetChat ? params.targetChat.id : '';
  const chatName =
    params.scope === 'group' && params.targetChat
      ? truncateUtf8(params.targetChat.name || 'Group', LIMITS.GROUP_NAME_MAX)
      : '';
  const visibleToUids =
    params.scope === 'group' && params.targetChat ? params.targetChat.memberUids.slice(0, 50) : [];

  const batch = writeBatch(db);
  batch.set(doc(db, 'confessions', confessionId), {
    id: confessionId,
    alias,
    category: params.category,
    text,
    scope: params.scope,
    chatId,
    chatName,
    visibleToUids,
    reactions: {},
    reportedBy: [],
    reportCount: 0,
    hidden: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'confessions_authors', confessionId), {
    confessionId,
    authorId: params.uid,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return confessionId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `confessions/${confessionId}`);
  }
}

export async function toggleConfessionReaction(
  confession: ConfessionPost,
  uid: string,
  emoji: string
): Promise<void> {
  const path = `confessions/${confession.id}`;
  const current = confession.reactions?.[uid];
  try {
    await updateDoc(doc(db, 'confessions', confession.id), {
      [`reactions.${uid}`]: current === emoji ? deleteField() : emoji,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function reportConfessionPost(
  confession: ConfessionPost,
  uid: string
): Promise<void> {
  if ((confession.reportedBy || []).includes(uid)) return;
  const nextReported = [...(confession.reportedBy || []), uid].slice(0, 20);
  const nextCount = (confession.reportCount || 0) + 1;
  const path = `confessions/${confession.id}`;
  try {
    await updateDoc(doc(db, 'confessions', confession.id), {
      reportedBy: nextReported,
      reportCount: nextCount,
      hidden: nextCount >= 3 || confession.hidden,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function hideGroupConfession(confessionId: string): Promise<void> {
  const path = `confessions/${confessionId}`;
  try {
    await updateDoc(doc(db, 'confessions', confessionId), {
      hidden: true,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteConfessionPost(
  confessionId: string,
  isAuthor: boolean
): Promise<void> {
  const path = `confessions/${confessionId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'confessions', confessionId));
    if (isAuthor) {
      batch.delete(doc(db, 'confessions_authors', confessionId));
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function addGroupChecklistItem(params: {
  chat: Chat;
  creator: { uid: string; displayName: string };
  title: string;
  category: ChecklistCategory;
  note?: string;
  assignedTo?: { uid: string; displayName: string } | null;
}): Promise<string> {
  const title = truncateUtf8(params.title.trim(), LIMITS.CHECKLIST_TITLE_MAX);
  if (!title) throw new Error('Checklist item title cannot be empty.');
  const note = truncateUtf8((params.note || '').trim(), LIMITS.CHECKLIST_NOTE_MAX);
  const itemId = generateRandomId('chk', 14);
  const path = `chats/${params.chat.id}/checklist_items/${itemId}`;

  try {
    await setDoc(doc(db, 'chats', params.chat.id, 'checklist_items', itemId), {
      id: itemId,
      chatId: params.chat.id,
      title,
      category: params.category,
      note,
      assignedToUid: params.assignedTo?.uid || '',
      assignedToName: params.assignedTo
        ? truncateUtf8(params.assignedTo.displayName.trim() || 'Member', LIMITS.DISPLAY_NAME_MAX)
        : '',
      completed: false,
      completedByUid: '',
      completedByName: '',
      createdBy: params.creator.uid,
      createdByName: truncateUtf8(
        params.creator.displayName.trim() || 'Member',
        LIMITS.DISPLAY_NAME_MAX
      ),
      visibleToUids: params.chat.memberUids.slice(0, LIMITS.MAX_GROUP_MEMBERS),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return itemId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function toggleGroupChecklistItem(
  chatId: string,
  item: ChecklistItem,
  actor: { uid: string; displayName: string }
): Promise<void> {
  const nextCompleted = !item.completed;
  const path = `chats/${chatId}/checklist_items/${item.id}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'checklist_items', item.id), {
      completed: nextCompleted,
      completedByUid: nextCompleted ? actor.uid : '',
      completedByName: nextCompleted
        ? truncateUtf8(actor.displayName.trim() || 'Member', LIMITS.DISPLAY_NAME_MAX)
        : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateGroupChecklistItem(
  chatId: string,
  itemId: string,
  updates: {
    title: string;
    category: ChecklistCategory;
    note: string;
    assignedToUid: string;
    assignedToName: string;
  }
): Promise<void> {
  const title = truncateUtf8(updates.title.trim(), LIMITS.CHECKLIST_TITLE_MAX);
  if (!title) throw new Error('Checklist item title cannot be empty.');
  const path = `chats/${chatId}/checklist_items/${itemId}`;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'checklist_items', itemId), {
      title,
      category: updates.category,
      note: truncateUtf8(updates.note.trim(), LIMITS.CHECKLIST_NOTE_MAX),
      assignedToUid: updates.assignedToUid,
      assignedToName: updates.assignedToUid
        ? truncateUtf8(updates.assignedToName.trim() || 'Member', LIMITS.DISPLAY_NAME_MAX)
        : '',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteGroupChecklistItem(chatId: string, itemId: string): Promise<void> {
  const path = `chats/${chatId}/checklist_items/${itemId}`;
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'checklist_items', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function recordMiniGameResult(params: {
  chat: Chat;
  player: { uid: string; displayName: string; photoUrl?: string };
  recordedByUid: string;
  gameType: MiniGameType;
  points: number;
  isWin: boolean;
  summary: string;
}): Promise<string> {
  if (!params.chat.memberUids.includes(params.player.uid)) {
    throw new Error('Selected player is not a member of this chat.');
  }
  const safePoints = Math.min(50, Math.max(1, Math.round(params.points)));
  const summary = truncateUtf8(params.summary.trim() || 'Mini-Game Played', 120);
  const resultId = generateRandomId('gm', 14);
  const path = `chats/${params.chat.id}/game_results/${resultId}`;

  try {
    await setDoc(doc(db, 'chats', params.chat.id, 'game_results', resultId), {
      id: resultId,
      chatId: params.chat.id,
      playerId: params.player.uid,
      playerName: truncateUtf8(
        params.player.displayName.trim() || 'Player',
        LIMITS.DISPLAY_NAME_MAX
      ),
      playerPhoto: (params.player.photoUrl || '').slice(0, LIMITS.PHOTO_MAX_CHARS),
      recordedBy: params.recordedByUid,
      gameType: params.gameType,
      points: safePoints,
      isWin: params.isWin,
      summary,
      visibleToUids: params.chat.memberUids.slice(0, LIMITS.MAX_GROUP_MEMBERS),
      createdAt: serverTimestamp(),
    });
    return resultId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteMiniGameResult(chatId: string, resultId: string): Promise<void> {
  const path = `chats/${chatId}/game_results/${resultId}`;
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'game_results', resultId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function ensureBaatCheetAIChat(user: {
  uid: string;
  displayName: string;
}): Promise<string> {
  const chatId = getDirectChatId(user.uid, BAATCHEET_AI_UID);
  const chatRef = doc(db, 'chats', chatId);

  try {
    const existing = await getDoc(chatRef);
    if (existing.exists()) {
      return chatId;
    }

    const memberUids = [user.uid, BAATCHEET_AI_UID];
    const preview = truncateUtf8(
      'Namaste! Main BaatCheet AI hoon. English, Hindi ya Hinglish me kuch bhi poochein!',
      180
    );

    await setDoc(chatRef, {
      id: chatId,
      type: 'direct',
      name: '',
      photoUrl: '',
      createdBy: user.uid,
      adminUids: memberUids,
      memberUids,
      inviteCode: '',
      lastInviteUsed: '',
      lastMessageText: preview,
      lastMessageType: 'text',
      lastMessageSenderId: BAATCHEET_AI_UID,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const welcomeId = generateRandomId('msg', 16);
    await setDoc(doc(db, 'chats', chatId, 'messages', welcomeId), {
      id: welcomeId,
      chatId,
      senderId: BAATCHEET_AI_UID,
      senderName: BAATCHEET_AI_NAME,
      type: 'text',
      text: truncateUtf8(BAATCHEET_AI_WELCOME_MESSAGE, 4000),
      imageData: '',
      pollId: '',
      mentions: [],
      reactions: {},
      visibleToUids: memberUids,
      deliveredTo: [BAATCHEET_AI_UID, user.uid],
      readBy: [BAATCHEET_AI_UID, user.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return chatId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function sendBotReplyMessage(
  chat: Chat,
  recipientUid: string,
  rawText: string,
  markReadImmediately: boolean
): Promise<void> {
  const text = truncateUtf8(rawText.trim(), 4000);
  if (!text) return;

  const messageId = generateRandomId('msg', 16);
  const batch = writeBatch(db);

  batch.set(doc(db, 'chats', chat.id, 'messages', messageId), {
    id: messageId,
    chatId: chat.id,
    senderId: BAATCHEET_AI_UID,
    senderName: BAATCHEET_AI_NAME,
    type: 'text',
    text,
    imageData: '',
    pollId: '',
    mentions: [],
    reactions: {},
    visibleToUids: chat.memberUids,
    deliveredTo: [BAATCHEET_AI_UID, recipientUid],
    readBy: markReadImmediately ? [BAATCHEET_AI_UID, recipientUid] : [BAATCHEET_AI_UID],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const plainPreview =
    text
      .replace(/```[\s\S]*?```/g, '[code]')
      .replace(/[#>*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'AI Reply';

  batch.update(doc(db, 'chats', chat.id), {
    lastMessageText: truncateUtf8(plainPreview, 180),
    lastMessageType: 'text',
    lastMessageSenderId: BAATCHEET_AI_UID,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function fetchOlderChatMessages(
  chatId: string,
  currentUid: string,
  beforeTimestamp: Timestamp,
  pageSize = 45
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const path = `chats/${chatId}/messages`;
  try {
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      where('visibleToUids', 'array-contains', currentUid),
      orderBy('createdAt', 'desc'),
      startAfter(beforeTimestamp),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    const messages = snap.docs.map((d) => ({
      ...(d.data() as ChatMessage),
      pending: false,
    }));
    messages.sort((a, b) => {
      const tA = a.createdAt?.toMillis() ?? 0;
      const tB = b.createdAt?.toMillis() ?? 0;
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    return {
      messages,
      hasMore: snap.docs.length >= pageSize,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('index') || msg.includes('failed-precondition')) {
      return { messages: [], hasMore: false };
    }
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchPublicProfilesOnce(
  uids: string[]
): Promise<Record<string, PublicUser>> {
  const uniqueUids = Array.from(new Set(uids.filter((u) => u && u !== BAATCHEET_AI_UID)));
  const fetched: Record<string, PublicUser> = {};
  if (uniqueUids.length === 0) return fetched;

  await Promise.all(
    uniqueUids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users_public', uid));
        if (snap.exists()) {
          const profile = snap.data() as PublicUser;
          fetched[profile.uid] = profile;
        }
      } catch {
        // Non-fatal if a profile fetch fails transiently
      }
    })
  );

  return fetched;
}
