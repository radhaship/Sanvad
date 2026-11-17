import type { Timestamp } from 'firebase/firestore';

export type WallpaperId =
  | 'default'
  | 'aurora'
  | 'sunset'
  | 'ocean'
  | 'lavender'
  | 'botanical'
  | 'midnight';

export type AccentColorId = 'teal' | 'indigo' | 'rose' | 'emerald';
export type FontSizeId = 'sm' | 'md' | 'lg';

export interface PrivateUser {
  uid: string;
  email: string;
  displayName: string;
  handle: string;
  photoUrl: string;
  bio: string;
  discoverable: boolean;
  pinnedChatIds?: string[];
  archivedChatIds?: string[];
  mutedChatIds?: string[];
  blockedUids?: string[];
  deletedChats?: Record<string, number>;
  wallpaper?: WallpaperId;
  chatWallpapers?: Record<string, WallpaperId>;
  readReceiptsEnabled?: boolean;
  accentColor?: AccentColorId | string;
  fontSize?: FontSizeId;
  fcmTokens?: string[];
  fcmTokenUpdatedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PublicUser {
  uid: string;
  displayName: string;
  handle: string;
  photoUrl: string;
  bio: string;
  isOnline: boolean;
  discoverable: boolean;
  lastSeen: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ChatType = 'direct' | 'group';
export type MessageType = 'text' | 'image' | 'audio' | 'poll' | 'meet' | 'file';
export type LastMessageType = 'none' | MessageType;
export type DisappearingDuration = 0 | 86400 | 604800 | 2592000;

export interface Chat {
  id: string;
  type: ChatType;
  name: string;
  photoUrl: string;
  createdBy: string;
  adminUids: string[];
  memberUids: string[];
  inviteCode: string;
  lastInviteUsed: string;
  lastMessageText: string;
  lastMessageType: LastMessageType;
  lastMessageSenderId: string;
  lastMessageAt: Timestamp | null;
  pinnedMessageId?: string;
  pinnedMessagePreview?: string;
  pinnedMessageSender?: string;
  pinnedBy?: string;
  disappearingSeconds?: DisappearingDuration;
  groupBio?: string;
  allowMembersEditInfo?: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface MessageReply {
  messageId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  previewText: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  type: MessageType;
  text: string;
  imageData: string;
  audioData?: string;
  audioDuration?: number;
  fileData?: string;
  fileName?: string;
  fileSize?: number;
  fileMime?: string;
  viewOnce?: boolean;
  viewedBy?: string[];
  forwarded?: boolean;
  pollId: string;
  meetUri?: string;
  meetCode?: string;
  mentions?: string[];
  reactions?: Record<string, string>;
  replyTo?: MessageReply | null;
  visibleToUids: string[];
  deliveredTo: string[];
  readBy: string[];
  editedAt?: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  pending?: boolean;
}

export interface StarredMessage {
  id: string;
  uid: string;
  chatId: string;
  chatTitle: string;
  senderName: string;
  type: MessageType;
  previewText: string;
  createdAt: Timestamp | null;
}

export interface TypingStatus {
  uid: string;
  displayName: string;
  isTyping: boolean;
  visibleToUids: string[];
  updatedAt: Timestamp | null;
}

export interface Poll {
  id: string;
  chatId: string;
  createdBy: string;
  creatorName: string;
  question: string;
  options: string[];
  isClosed: boolean;
  visibleToUids: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PollVote {
  voterId: string;
  voterName: string;
  optionIndex: number;
  visibleToUids: string[];
  updatedAt: Timestamp | null;
}

export interface AppStats {
  totalUsers: number;
  updatedAt: Timestamp | null;
}

export interface StatusMessage {
  id: string;
  uid: string;
  displayName: string;
  photoUrl: string;
  type: 'text' | 'image';
  text: string;
  mediaData: string;
  background: string;
  viewers: string[];
  privacy: 'everyone' | 'contacts';
  visibleToUids?: string[];
  createdAt: Timestamp | null;
}

export type CallType = 'audio' | 'video' | 'screen';
export type CallStatus = 'ringing' | 'live' | 'answered' | 'rejected' | 'ended' | 'missed';

export interface CallSession {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerPhoto: string;
  calleeId: string;
  calleeName: string;
  calleePhoto: string;
  callType: CallType;
  isGroup?: boolean;
  status: CallStatus;
  offerSdp: string;
  offerType: string;
  answerSdp?: string;
  answerType?: string;
  visibleToUids: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type CallPeerStatus = 'joining' | 'offered' | 'answered' | 'left';

export interface CallPeer {
  id: string;
  callId: string;
  callerId: string;
  viewerId: string;
  viewerName: string;
  viewerPhoto: string;
  status: CallPeerStatus;
  offerSdp?: string;
  offerType?: string;
  answerSdp?: string;
  answerType?: string;
  visibleToUids: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface IceCandidateRecord {
  id: string;
  senderId: string;
  role: 'caller' | 'callee';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
  visibleToUids: string[];
  createdAt: Timestamp | null;
}

export type ConfessionScope = 'community' | 'group';
export type ConfessionCategory = 'funny' | 'crush' | 'advice' | 'rant' | 'wholesome';

export interface ConfessionPost {
  id: string;
  alias: string;
  category: ConfessionCategory;
  text: string;
  scope: ConfessionScope;
  chatId: string;
  chatName: string;
  visibleToUids: string[];
  reactions: Record<string, string>;
  reportedBy: string[];
  reportCount: number;
  hidden: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ChecklistCategory = 'general' | 'travel' | 'food' | 'stay' | 'budget';

export interface ChecklistItem {
  id: string;
  chatId: string;
  title: string;
  category: ChecklistCategory;
  note: string;
  assignedToUid: string;
  assignedToName: string;
  completed: boolean;
  completedByUid: string;
  completedByName: string;
  createdBy: string;
  createdByName: string;
  visibleToUids: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type MiniGameType = 'tod' | 'challenge' | 'wyr' | 'lucky';

export interface GameResult {
  id: string;
  chatId: string;
  playerId: string;
  playerName: string;
  playerPhoto: string;
  recordedBy: string;
  gameType: MiniGameType;
  points: number;
  isWin: boolean;
  summary: string;
  visibleToUids: string[];
  createdAt: Timestamp | null;
}

