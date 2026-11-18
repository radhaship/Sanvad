import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AtSign,
  Ban,
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Bot,
  Camera,
  ChevronDown,
  ChevronUp,
  EyeOff,
  FileText,
  Gamepad2,
  Image as ImageIcon,
  Info,
  ListChecks,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MonitorUp,
  Moon,
  MoreVertical,
  Palette,
  Paperclip,
  Phone,
  Pin,
  PinOff,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Smile,
  Sparkles,
  Star,
  Sun,
  Timer,
  Trash2,
  Trophy,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { AppLockScreen, getStoredAppLockHash } from './components/AppLockScreen';
import { AuthScreen } from './components/AuthScreen';
import { Avatar } from './components/Avatar';
import { CameraCaptureModal } from './components/CameraCaptureModal';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { CreatePollModal } from './components/CreatePollModal';
import { ForwardModal } from './components/ForwardModal';
import { GameLeaderboardModal } from './components/GameLeaderboard';
import { GoogleMeetModal } from './components/GoogleMeetModal';
import { GroupChecklistModal } from './components/GroupChecklistModal';
import { ImageLightbox } from './components/ImageLightbox';
import { MentionSuggestions } from './components/MentionSuggestions';
import { MessageBubble } from './components/MessageBubble';
import { MessageInfoModal } from './components/MessageInfoModal';
import { MiniGameModal } from './components/MiniGameModal';
import { NewChatModal } from './components/NewChatModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PhotoComposerModal } from './components/PhotoComposerModal';
import { ProfileModal } from './components/ProfileModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { type ActiveScreenShareState, ScreenShareModal } from './components/ScreenShareModal';
import { SecretsBoardPanel } from './components/SecretsBoardPanel';
import { StarredMessagesModal } from './components/StarredMessagesModal';
import { StatusComposerModal } from './components/StatusComposerModal';
import { StatusViewerModal } from './components/StatusViewerModal';
import { TutorialModal } from './components/TutorialModal';
import { VoiceRecorderButton } from './components/VoiceRecorderButton';
import { WallpaperModal } from './components/WallpaperModal';
import { type ActiveCallModalState, WebRTCCallModal } from './components/WebRTCCallModal';
import {
  auth,
  clearInMemoryGoogleAccessToken,
  db,
  formatAuthError,
  handleFirestoreError,
  OperationType,
  signInWithBasicGoogle,
} from './lib/firebase';
import {
  decryptE2EEMessage,
  encryptE2EEMessage,
  getOrGenerateUserKeyPair,
  getPeerPublicKey,
} from './lib/e2e';
import {
  askBaatCheetAI,
  BAATCHEET_AI_NAME,
  BAATCHEET_AI_PUBLIC_PROFILE,
  BAATCHEET_AI_STARTER_PROMPTS,
  BAATCHEET_AI_UID,
  isBaatCheetAIChat,
} from './lib/aiBot';
import { compressChatPhoto } from './lib/imageUtils';
import {
  dismissPushPromptBanner,
  enableAndRegisterFcmNotifications,
  getNotificationPermission,
  getPushAlertsEnabled,
  isPushMessagingSupported,
  isPushPromptBannerDismissed,
  playNotificationChime,
  playSendMessageSound,
  playTypingStartedSound,
  registerFcmDeviceToken,
  removeFcmTokenFromUserProfile,
  setPushAlertsEnabled,
  showMessagePushNotification,
  subscribeForegroundFcmMessages,
  syncActiveChatToServiceWorker,
} from './lib/notifications';
import {
  buildMessageReply,
  extractMentionedUids,
  formatChatListTime,
  formatDayDivider,
  formatFileSize,
  formatLastSeen,
  isUserRecentlyOnline,
  LIMITS,
} from './lib/validation';
import {
  createPollMessage,
  deleteChatForSelf,
  deleteGroupChatPermanently,
  deleteOwnMessage,
  deleteStatusUpdate,
  editOwnMessage,
  ensureBaatCheetAIChat,
  ensureUserProfile,
  fetchOlderChatMessages,
  fetchPublicProfilesOnce,
  forwardMessageToChat,
  joinGroupByInviteCode,
  leaveGroup,
  lookupUserByHandle,
  markMessagesDelivered,
  markMessagesRead,
  markStatusViewed,
  markViewOncePhotoViewed,
  pinMessageInChat,
  removeStarredMessage,
  restoreDeletedChatVisibility,
  sendBotReplyMessage,
  sendFileMessage,
  sendPhotoMessage,
  sendTextMessage,
  sendVoiceMessage,
  setChatDisappearingTimer,
  setTypingStatus,
  startDirectChat,
  toggleArchiveChat,
  toggleBlockUser,
  toggleMessageReaction,
  toggleMuteChat,
  togglePinChat,
  toggleStarMessage,
  unpinMessageInChat,
  updatePresence,
} from './services/chatService';
import {
  getCachedChatMessages,
  getStaleOrMissingProfileUids,
  loadCachedProfiles,
  loadCachedUnreadCounts,
  saveCachedChatMessages,
  saveCachedProfiles,
  saveCachedUnreadCounts,
} from './lib/localCache';
import type {
  AppStats,
  CallSession,
  Chat,
  ChatMessage,
  ChecklistItem,
  ConfessionPost,
  DisappearingDuration,
  PrivateUser,
  PublicUser,
  StarredMessage,
  StatusMessage,
  TypingStatus,
  WallpaperId,
} from './types/chat';

const MESSAGE_PAGE_SIZE = 45;
const TYPING_DEBOUNCE_MS = 1500;
const TYPING_IDLE_STOP_MS = 3500;

const COMPOSER_EMOJIS = [
  '😀', '😂', '😍', '🥰', '😎', '😭', '🙏', '👍',
  '❤️', '🔥', '🎉', '👏', '🤔', '😊', '🙌', '✨',
  '💯', '🤝', '😅', '🥳', '🚀', '⭐', '💬', '👀',
];

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('baatcheet_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<PrivateUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [publicUsers, setPublicUsers] = useState<Record<string, PublicUser>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [liveMessages, setLiveMessages] = useState<ChatMessage[]>([]);
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);

  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'direct' | 'group' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'chats' | 'status' | 'secrets' | 'people'>('chats');
  const [statuses, setStatuses] = useState<StatusMessage[]>([]);
  const [confessions, setConfessions] = useState<ConfessionPost[]>([]);
  const [ownConfessionIds, setOwnConfessionIds] = useState<Set<string>>(() => new Set());
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [viewingStatusIndex, setViewingStatusIndex] = useState<number | null>(null);
  const [showStatusComposer, setShowStatusComposer] = useState(false);
  const [summaryTotalUsers, setSummaryTotalUsers] = useState<number>(0);

  const [draftText, setDraftText] = useState('');
  const [draftsByChat, setDraftsByChat] = useState<Record<string, string>>({});
  const [sendingText, setSendingText] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [showMiniGameModal, setShowMiniGameModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCallModalState | null>(null);
  const [activeScreenShare, setActiveScreenShare] = useState<ActiveScreenShareState | null>(null);
  const [liveGroupScreenShares, setLiveGroupScreenShares] = useState<Record<string, CallSession>>({});
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    caption: string;
    viewOnce?: boolean;
  } | null>(null);

  const [fallbackMsgLimit, setFallbackMsgLimit] = useState(MESSAGE_PAGE_SIZE);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [useFallbackMsgQuery, setUseFallbackMsgQuery] = useState(false);

  const [showNewChat, setShowNewChat] = useState<{ open: boolean; tab: 'direct' | 'group' | 'join' }>({
    open: false,
    tab: 'direct',
  });
  const [showPollModal, setShowPollModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showMeetModal, setShowMeetModal] = useState(false);
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const [showStarredModal, setShowStarredModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const e2eePrivateKeyRef = useRef<CryptoKey | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMobileExtras, setShowMobileExtras] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [infoMessage, setInfoMessage] = useState<ChatMessage | null>(null);
  const [chatPendingDelete, setChatPendingDelete] = useState<Chat | null>(null);
  const [deletingSidebarChat, setDeletingSidebarChat] = useState(false);
  const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatMatchIdx, setInChatMatchIdx] = useState(0);
  const [notifTick, setNotifTick] = useState(0);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(true);
  const [enablingPushBanner, setEnablingPushBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);

  const [typingUsers, setTypingUsers] = useState<TypingStatus[]>([]);
  const [typingTick, setTypingTick] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [activeMessageActionId, setActiveMessageActionId] = useState<string | null>(null);
  const [aiThinkingChats, setAiThinkingChats] = useState<Record<string, boolean>>({});

  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileAttachmentInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const deepLinkHandledRef = useRef(false);
  const baatCheetInitUidRef = useRef<string | null>(null);
  const lastTypingEmitRef = useRef<number>(0);
  const typingDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingPublishedRef = useRef(false);
  const latestDraftRef = useRef('');
  const prevTyperUidsRef = useRef<Set<string>>(new Set());
  const typingInitForChatRef = useRef<string | null>(null);
  const lastTypingSoundAtRef = useRef<number>(0);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevChatLastMsgAtRef = useRef<Record<string, number>>({});
  const fetchedProfileOnceRef = useRef<Set<string>>(new Set());
  const pendingJumpMsgIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isPrependingOlderRef = useRef(false);
  const handledCallIdsRef = useRef<Set<string>>(new Set());
  const activeChatIdRef = useRef<string | null>(activeChatId);

  const messages = useMemo(() => {
    const merged = new Map<string, ChatMessage>();
    olderMessages.forEach((m) => merged.set(m.id, m));
    liveMessages.forEach((m) => merged.set(m.id, m));
    const list = Array.from(merged.values());
    list.sort((a, b) => {
      const tA = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const tB = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      if (tA !== tB) return tA - tB;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [olderMessages, liveMessages]);

  const resolvedPublicUsers = useMemo<Record<string, PublicUser>>(
    () => ({
      ...publicUsers,
      [BAATCHEET_AI_UID]: BAATCHEET_AI_PUBLIC_PROFILE,
    }),
    [publicUsers]
  );

  const publicUsersRef = useRef<Record<string, PublicUser>>(resolvedPublicUsers);
  activeChatIdRef.current = activeChatId;
  publicUsersRef.current = resolvedPublicUsers;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('baatcheet_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('baatcheet_theme', 'light');
    }
  }, [isDark]);

  // Sync Accent Color & Message Font Size on <html>
  useEffect(() => {
    const root = document.documentElement;
    const savedAccent = localStorage.getItem('sanvad_accent');
    const savedFontSize = localStorage.getItem('sanvad_font_size');
    const accent =
      currentUser?.accentColor === 'indigo' ||
      currentUser?.accentColor === 'rose' ||
      currentUser?.accentColor === 'emerald' ||
      currentUser?.accentColor === 'teal'
        ? currentUser.accentColor
        : savedAccent === 'indigo' || savedAccent === 'rose' || savedAccent === 'emerald'
        ? savedAccent
        : 'teal';
    const fontSize =
      currentUser?.fontSize === 'sm' || currentUser?.fontSize === 'md' || currentUser?.fontSize === 'lg'
        ? currentUser.fontSize
        : savedFontSize === 'sm' || savedFontSize === 'lg'
        ? savedFontSize
        : 'md';

    root.setAttribute('data-accent', accent);
    root.setAttribute('data-font-size', fontSize);
    localStorage.setItem('sanvad_accent', accent);
    localStorage.setItem('sanvad_font_size', fontSize);
  }, [currentUser?.accentColor, currentUser?.fontSize]);

  // Hash-based mobile navigation & back button synchronization
  const isPoppingHistoryRef = useRef(false);

  const getCurrentViewString = useCallback(() => {
    if (activeCall) return 'view=call';
    if (activeScreenShare) return 'view=screenshare';
    if (showCameraModal) return 'view=camera';
    if (lightboxImage) return 'view=lightbox';
    if (pendingPhotos.length > 0) return 'view=photocomposer';
    if (showMiniGameModal) return 'view=minigame';
    if (showLeaderboardModal) return 'view=leaderboard';
    if (showChecklistModal) return 'view=checklist';
    if (forwardingMessage) return 'view=forward';
    if (infoMessage) return 'view=msginfo';
    if (chatPendingDelete) return 'view=deletechat';
    if (showInfoDrawer) return 'view=info';
    if (showNewChat.open) return 'view=newchat';
    if (showProfileModal) return 'view=profile';
    if (showPollModal) return 'view=poll';
    if (showMeetModal) return 'view=meet';
    if (showWallpaperModal) return 'view=wallpaper';
    if (showStarredModal) return 'view=starred';
    if (showTutorialModal) return 'view=tutorial';
    if (showStatusComposer || viewingStatusIndex !== null) return 'view=status';
    if (inChatSearchOpen) return 'view=search';
    if (activeChatId) return 'view=chat';
    if (mobileTab !== 'chats') return `view=tab-${mobileTab}`;
    return 'view=list';
  }, [
    activeCall,
    activeScreenShare,
    showCameraModal,
    lightboxImage,
    pendingPhotos.length,
    showMiniGameModal,
    showLeaderboardModal,
    showChecklistModal,
    forwardingMessage,
    infoMessage,
    chatPendingDelete,
    showInfoDrawer,
    showNewChat.open,
    showProfileModal,
    showPollModal,
    showMeetModal,
    showWallpaperModal,
    showStarredModal,
    showTutorialModal,
    showStatusComposer,
    viewingStatusIndex,
    inChatSearchOpen,
    activeChatId,
    mobileTab,
  ]);

  // Ensure initial history state uses #view=list so hardware back stays predictable
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState({ view: '#view=list' }, '', '#view=list');
    }
  }, []);

  // Sync React state changes to URL hash
  useEffect(() => {
    if (isPoppingHistoryRef.current) {
      isPoppingHistoryRef.current = false;
      return;
    }
    const targetHash = `#${getCurrentViewString()}`;
    if (window.location.hash !== targetHash) {
      window.history.pushState({ view: targetHash }, '', targetHash);
    }
  }, [getCurrentViewString]);

  // Listen to popstate / hardware back button events
  useEffect(() => {
    const handlePopState = () => {
      isPoppingHistoryRef.current = true;
      const hash = window.location.hash || '#view=list';

      setActiveCall((prev) => (!hash.includes('view=call') && prev ? null : prev));
      setActiveScreenShare((prev) =>
        !hash.includes('view=screenshare') && prev ? null : prev
      );
      setShowCameraModal((prev) => (!hash.includes('view=camera') && prev ? false : prev));
      setLightboxImage((prev) => (!hash.includes('view=lightbox') && prev ? null : prev));
      setPendingPhotos((prev) =>
        !hash.includes('view=photocomposer') && prev.length > 0 ? [] : prev
      );
      setShowMiniGameModal((prev) => (!hash.includes('view=minigame') && prev ? false : prev));
      setShowLeaderboardModal((prev) =>
        !hash.includes('view=leaderboard') && prev ? false : prev
      );
      setShowChecklistModal((prev) => (!hash.includes('view=checklist') && prev ? false : prev));
      setForwardingMessage((prev) => (!hash.includes('view=forward') && prev ? null : prev));
      setInfoMessage((prev) => (!hash.includes('view=msginfo') && prev ? null : prev));
      setChatPendingDelete((prev) => (!hash.includes('view=deletechat') && prev ? null : prev));
      setShowInfoDrawer((prev) => (!hash.includes('view=info') && prev ? false : prev));
      setShowNewChat((prev) =>
        !hash.includes('view=newchat') && prev.open ? { open: false, tab: 'direct' } : prev
      );
      setShowProfileModal((prev) => (!hash.includes('view=profile') && prev ? false : prev));
      setShowPollModal((prev) => (!hash.includes('view=poll') && prev ? false : prev));
      setShowMeetModal((prev) => (!hash.includes('view=meet') && prev ? false : prev));
      setShowWallpaperModal((prev) => (!hash.includes('view=wallpaper') && prev ? false : prev));
      setShowStarredModal((prev) => (!hash.includes('view=starred') && prev ? false : prev));
      setShowTutorialModal((prev) => (!hash.includes('view=tutorial') && prev ? false : prev));
      if (!hash.includes('view=status')) {
        setShowStatusComposer(false);
        setViewingStatusIndex(null);
      }
      setInChatSearchOpen((prev) => (!hash.includes('view=search') && prev ? false : prev));

      const isSubChatOverlay =
        hash.includes('view=chat') ||
        hash.includes('view=search') ||
        hash.includes('view=info') ||
        hash.includes('view=poll') ||
        hash.includes('view=meet') ||
        hash.includes('view=minigame') ||
        hash.includes('view=leaderboard') ||
        hash.includes('view=checklist') ||
        hash.includes('view=photocomposer') ||
        hash.includes('view=camera') ||
        hash.includes('view=forward') ||
        hash.includes('view=msginfo') ||
        hash.includes('view=lightbox') ||
        hash.includes('view=call') ||
        hash.includes('view=screenshare');

      if (!isSubChatOverlay) {
        setActiveChatId(null);
      }

      if (hash.includes('view=tab-status')) {
        setMobileTab('status');
      } else if (hash.includes('view=tab-secrets')) {
        setMobileTab('secrets');
      } else if (hash.includes('view=tab-people')) {
        setMobileTab('people');
      } else if (hash === '#view=list' || hash === '') {
        setMobileTab('chats');
      }

      requestAnimationFrame(() => {
        isPoppingHistoryRef.current = false;
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setCurrentUser(null);
        setChats([]);
        setLiveMessages([]);
        setOlderMessages([]);
        setPublicUsers({});
        setUnreadCounts({});
        setActiveChatId(null);
        setAuthReady(true);
        return;
      }
      try {
        const profile = await ensureUserProfile(user);
        setCurrentUser(profile);
        setAuthError(null);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to initialize account.');
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  const currentUid = currentUser?.uid ?? null;

  // Initialize E2EE user keypair
  useEffect(() => {
    if (!currentUid) return;
    void getOrGenerateUserKeyPair(currentUid).then((key) => {
      e2eePrivateKeyRef.current = key;
    });
  }, [currentUid]);

  // Decrypt incoming E2EE messages
  useEffect(() => {
    const privKey = e2eePrivateKeyRef.current;
    if (!privKey) return;
    messages.forEach((msg) => {
      if (msg.text.startsWith('ENC:') && !decryptedCache[msg.id]) {
        void decryptE2EEMessage(msg.text, privKey).then((decrypted) => {
          setDecryptedCache((prev) => ({ ...prev, [msg.id]: decrypted }));
        });
      }
    });
  }, [messages, decryptedCache]);

  const readReceiptsEnabled = currentUser?.readReceiptsEnabled !== false;
  const readReceiptsEnabledRef = useRef<boolean>(readReceiptsEnabled);
  readReceiptsEnabledRef.current = readReceiptsEnabled;

  const mutedChatIds = currentUser?.mutedChatIds ?? [];
  const blockedUids = currentUser?.blockedUids ?? [];
  const deletedChatsMap = currentUser?.deletedChats ?? {};

  const mutedChatSet = useMemo(() => new Set(mutedChatIds), [mutedChatIds]);
  const blockedUidSet = useMemo(() => new Set(blockedUids), [blockedUids]);
  const mutedChatSetRef = useRef<Set<string>>(mutedChatSet);
  const blockedUidSetRef = useRef<Set<string>>(blockedUidSet);
  const deletedChatsMapRef = useRef<Record<string, number>>(deletedChatsMap);
  mutedChatSetRef.current = mutedChatSet;
  blockedUidSetRef.current = blockedUidSet;
  deletedChatsMapRef.current = deletedChatsMap;

  const localViewedAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    prevChatLastMsgAtRef.current = {};
    fetchedProfileOnceRef.current.clear();

    if (!currentUid) {
      localViewedAtRef.current = {};
      setDraftsByChat({});
      setPublicUsers({});
      setUnreadCounts({});
      setAppLockEnabled(false);
      setIsAppLocked(false);
      return;
    }
    const hasPin = Boolean(getStoredAppLockHash(currentUid));
    setAppLockEnabled(hasPin);
    setIsAppLocked(hasPin);

    try {
      const raw = localStorage.getItem(`sanvad_local_read_${currentUid}`);
      localViewedAtRef.current = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      localViewedAtRef.current = {};
    }

    try {
      const rawDrafts = localStorage.getItem(`sanvad_drafts_${currentUid}`);
      setDraftsByChat(rawDrafts ? (JSON.parse(rawDrafts) as Record<string, string>) : {});
    } catch {
      setDraftsByChat({});
    }

    // Hydrate cached user profiles and unread counters immediately for 0ms startup
    const cachedProfiles = loadCachedProfiles(currentUid);
    if (Object.keys(cachedProfiles).length > 0) {
      setPublicUsers((prev) => ({ ...cachedProfiles, ...prev }));
    }
    const cachedUnread = loadCachedUnreadCounts(currentUid);
    if (Object.keys(cachedUnread).length > 0) {
      setUnreadCounts(cachedUnread);
    }
  }, [currentUid]);

  const saveDraftForChat = useCallback(
    (chatId: string, text: string) => {
      if (!currentUid) return;
      setDraftsByChat((prev) => {
        const next = { ...prev };
        if (text.trim()) {
          next[chatId] = text;
        } else {
          delete next[chatId];
        }
        try {
          localStorage.setItem(`sanvad_drafts_${currentUid}`, JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
    },
    [currentUid]
  );

  const markChatViewedLocally = useCallback(
    (chatId: string, latestTsMs: number) => {
      if (!currentUid) return;
      const prev = localViewedAtRef.current[chatId] ?? 0;
      if (latestTsMs > prev) {
        localViewedAtRef.current[chatId] = latestTsMs;
        try {
          localStorage.setItem(
            `sanvad_local_read_${currentUid}`,
            JSON.stringify(localViewedAtRef.current)
          );
        } catch {
          // Ignore storage quota errors
        }
      }
    },
    [currentUid]
  );

  // Subscribe to own private profile
  useEffect(() => {
    if (!currentUid) return;
    const path = `users/${currentUid}`;
    const unsub = onSnapshot(
      doc(db, 'users', currentUid),
      (snap) => {
        if (snap.exists()) {
          setCurrentUser(snap.data() as PrivateUser);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [currentUid]);

  // Subscribe to total app users summary
  useEffect(() => {
    if (!currentUid) {
      setSummaryTotalUsers(0);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'app_stats', 'summary'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as AppStats;
          if (typeof data.totalUsers === 'number') {
            setSummaryTotalUsers(data.totalUsers);
          }
        }
      },
      () => {
        // Non-fatal fallback to directory count
      }
    );
    return () => unsub();
  }, [currentUid]);

  // Real-time presence heartbeat (only after users_public/{uid} exists)
  useEffect(() => {
    if (!currentUid) return;
    void updatePresence(currentUid, true);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void updatePresence(currentUid, true);
      }
    }, 120_000);

    const handleVisibility = () => {
      void updatePresence(currentUid, document.visibilityState === 'visible');
    };
    const handleUnload = () => {
      void updatePresence(currentUid, false);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUid]);

  // Subscribe to recent 24h statuses (bounded to 60 reads to stay Spark-Plan friendly)
  useEffect(() => {
    if (!currentUid) {
      setStatuses([]);
      return;
    }
    const path = 'statuses';
    const q = query(collection(db, 'statuses'), orderBy('createdAt', 'desc'), limit(60));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list = snap.docs
          .map((d) => d.data() as StatusMessage)
          .filter((s) => {
            const t = s.createdAt?.toMillis() ?? 0;
            if (now - t >= 24 * 60 * 60 * 1000) return false;
            if (s.uid === currentUid) return true;
            if (s.privacy === 'contacts') {
              const allowed = s.visibleToUids || [];
              if (!allowed.includes(currentUid)) return false;
            }
            return true;
          });
        list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setStatuses(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUid]);

  // Subscribe to anonymous confessions (community + user's groups) & own author ownership markers
  useEffect(() => {
    if (!currentUid) {
      setConfessions([]);
      setOwnConfessionIds(new Set());
      return;
    }

    let communityDocs: ConfessionPost[] = [];
    let groupDocs: ConfessionPost[] = [];

    const mergeAndPublish = () => {
      const map = new Map<string, ConfessionPost>();
      for (const p of communityDocs) map.set(p.id, p);
      for (const p of groupDocs) map.set(p.id, p);
      const merged = Array.from(map.values()).sort(
        (a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now())
      );
      setConfessions(merged);
    };

    const communityQ = query(
      collection(db, 'confessions'),
      where('scope', '==', 'community'),
      limit(60)
    );
    const groupQ = query(
      collection(db, 'confessions'),
      where('visibleToUids', 'array-contains', currentUid),
      limit(60)
    );
    const ownQ = query(
      collection(db, 'confessions_authors'),
      where('authorId', '==', currentUid)
    );

    const unsubCommunity = onSnapshot(
      communityQ,
      (snap) => {
        communityDocs = snap.docs.map((d) => d.data() as ConfessionPost);
        mergeAndPublish();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'confessions')
    );

    const unsubGroup = onSnapshot(
      groupQ,
      (snap) => {
        groupDocs = snap.docs.map((d) => d.data() as ConfessionPost);
        mergeAndPublish();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'confessions')
    );

    const unsubOwn = onSnapshot(
      ownQ,
      (snap) => {
        setOwnConfessionIds(new Set(snap.docs.map((d) => d.id)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'confessions_authors')
    );

    return () => {
      unsubCommunity();
      unsubGroup();
      unsubOwn();
    };
  }, [currentUid]);

  // Deep links (?connect=handle, ?join=inviteCode, or ?chatId=chatId from push notifications)
  useEffect(() => {
    if (!currentUser || deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const connectHandle = params.get('connect');
    const joinCode = params.get('join');
    const openChatId = params.get('chatId');

    if (!connectHandle && !joinCode && !openChatId) return;
    deepLinkHandledRef.current = true;

    const processLink = async () => {
      try {
        if (openChatId) {
          setMobileTab('chats');
          setActiveChatId(openChatId);
        } else if (connectHandle) {
          const friend = await lookupUserByHandle(connectHandle);
          if (friend && friend.uid !== currentUser.uid) {
            const chatId = await startDirectChat(currentUser.uid, friend.uid);
            setActiveChatId(chatId);
          }
        } else if (joinCode) {
          const chatId = await joinGroupByInviteCode(currentUser.uid, joinCode);
          setActiveChatId(chatId);
        }
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : 'Could not open invite link.');
      } finally {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    void processLink();
  }, [currentUser]);

  // Global directory listing is intentionally disabled so all users' names remain private.

  // Subscribe to user's chats (single lightweight metadata listener drives sidebar, unread counts & notifications without opening background message listeners)
  useEffect(() => {
    if (!currentUid) return;
    const path = 'chats';
    const q = query(collection(db, 'chats'), where('memberUids', 'array-contains', currentUid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Chat);
        list.sort((a, b) => {
          const tA = a.lastMessageAt?.toMillis() ?? a.createdAt?.toMillis() ?? 0;
          const tB = b.lastMessageAt?.toMillis() ?? b.createdAt?.toMillis() ?? 0;
          return tB - tA;
        });
        setChats(list);

        let newlyNotifiedChat: Chat | null = null;
        setUnreadCounts((prev) => {
          let changed = false;
          const next: Record<string, number> = { ...prev };

          list.forEach((chat) => {
            const lastMs = chat.lastMessageAt?.toMillis() ?? 0;
            const prevSeenLastMs = prevChatLastMsgAtRef.current[chat.id];
            prevChatLastMsgAtRef.current[chat.id] = lastMs;

            const isViewingChat =
              activeChatIdRef.current === chat.id && document.visibilityState === 'visible';

            if (isViewingChat) {
              if (lastMs > 0) {
                markChatViewedLocally(chat.id, lastMs);
              }
              if ((next[chat.id] ?? 0) !== 0) {
                next[chat.id] = 0;
                changed = true;
              }
              return;
            }

            if (
              chat.lastMessageType === 'none' ||
              !chat.lastMessageSenderId ||
              chat.lastMessageSenderId === currentUid ||
              blockedUidSetRef.current.has(chat.lastMessageSenderId)
            ) {
              return;
            }

            const localViewed = localViewedAtRef.current[chat.id] ?? 0;
            const deletedCutoff = deletedChatsMapRef.current[chat.id] ?? 0;
            if (deletedCutoff > 0 && lastMs <= deletedCutoff) return;

            if (prevSeenLastMs === undefined) {
              if (lastMs > localViewed && (next[chat.id] ?? 0) === 0) {
                next[chat.id] = 1;
                changed = true;
              }
            } else if (lastMs > prevSeenLastMs && lastMs > localViewed) {
              next[chat.id] = (next[chat.id] ?? 0) + 1;
              changed = true;
              newlyNotifiedChat = chat;
            }
          });

          if (changed) {
            saveCachedUnreadCounts(currentUid, next);
            return next;
          }
          return prev;
        });

        const notifyChat = newlyNotifiedChat as Chat | null;
        if (notifyChat && !mutedChatSetRef.current.has(notifyChat.id)) {
          playNotificationChime();
          const senderProfile =
            notifyChat.lastMessageSenderId === BAATCHEET_AI_UID
              ? BAATCHEET_AI_PUBLIC_PROFILE
              : publicUsersRef.current[notifyChat.lastMessageSenderId];
          const senderDisplay =
            senderProfile?.displayName || notifyChat.name || 'Friend';
          const senderAvatar = senderProfile?.photoUrl || notifyChat.photoUrl || undefined;
          const notifTitle =
            notifyChat.type === 'group' && notifyChat.name
              ? `${senderDisplay} in ${notifyChat.name}`
              : senderDisplay;
          const notifBody = notifyChat.lastMessageText || 'New message';
          void showMessagePushNotification({
            title: notifTitle,
            body: notifBody,
            chatId: notifyChat.id,
            icon: senderAvatar,
            tag: `${notifyChat.id}_${notifyChat.lastMessageAt?.toMillis() ?? Date.now()}`,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUid, markChatViewedLocally]);

  // Auto-provision the built-in "BaatCheet AI" system contact chat for every signed-in user
  useEffect(() => {
    if (!currentUser?.uid) {
      baatCheetInitUidRef.current = null;
      return;
    }
    if (baatCheetInitUidRef.current === currentUser.uid) return;
    baatCheetInitUidRef.current = currentUser.uid;
    void ensureBaatCheetAIChat({
      uid: currentUser.uid,
      displayName: currentUser.displayName,
    }).catch(() => {
      // Allow retry if initial provisioning hit a transient network issue
      baatCheetInitUidRef.current = null;
    });
  }, [currentUser?.uid, currentUser?.displayName]);

  // One-time cached profile hydration for background chat members (zero ongoing listeners on inactive chats)
  const memberUidKey = useMemo(() => {
    const uidSet = new Set<string>();
    if (currentUid) uidSet.add(currentUid);
    chats.forEach((c) =>
      c.memberUids.forEach((u) => {
        if (u !== BAATCHEET_AI_UID) uidSet.add(u);
      })
    );
    return Array.from(uidSet).sort().join(',');
  }, [chats, currentUid]);

  useEffect(() => {
    if (!currentUid || !memberUidKey) return;
    const allUids = memberUidKey.split(',').filter(Boolean);
    const missingOrStale = getStaleOrMissingProfileUids(currentUid, allUids).filter(
      (uid) => !fetchedProfileOnceRef.current.has(uid)
    );
    if (missingOrStale.length === 0) return;

    missingOrStale.forEach((uid) => fetchedProfileOnceRef.current.add(uid));
    void fetchPublicProfilesOnce(missingOrStale).then((fetched) => {
      if (Object.keys(fetched).length > 0) {
        saveCachedProfiles(currentUid, fetched);
        setPublicUsers((prev) => ({ ...prev, ...fetched }));
      }
    });
  }, [currentUid, memberUidKey]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  // Targeted live profile listeners ONLY for self + active open chat's members
  const activeProfileListenerKey = useMemo(() => {
    const uidSet = new Set<string>();
    if (currentUid) uidSet.add(currentUid);
    if (activeChat) {
      activeChat.memberUids
        .filter((u) => u !== BAATCHEET_AI_UID)
        .slice(0, 20)
        .forEach((u) => uidSet.add(u));
    }
    return Array.from(uidSet).sort().join(',');
  }, [currentUid, activeChat]);

  useEffect(() => {
    if (!currentUid || !activeProfileListenerKey) return;
    const uids = activeProfileListenerKey.split(',').filter(Boolean);
    const unsubs = uids.map((uid) =>
      onSnapshot(
        doc(db, 'users_public', uid),
        (snap) => {
          if (snap.exists()) {
            const u = snap.data() as PublicUser;
            saveCachedProfiles(currentUid, { [u.uid]: u });
            setPublicUsers((prev) => ({ ...prev, [u.uid]: u }));
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users_public/${uid}`)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [currentUid, activeProfileListenerKey]);

  // Subscribe to real-time Trip & Hangout Checklist items for active group chat
  useEffect(() => {
    if (!currentUid || !activeChat || activeChat.type !== 'group') {
      setChecklistItems([]);
      return;
    }
    const path = `chats/${activeChat.id}/checklist_items`;
    const q = query(
      collection(db, 'chats', activeChat.id, 'checklist_items'),
      where('visibleToUids', 'array-contains', currentUid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as ChecklistItem);
        list.sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          return (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now());
        });
        setChecklistItems(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUid, activeChat?.id, activeChat?.type]);

  // Hydrate locally cached messages immediately and reset pagination when switching chats
  useEffect(() => {
    setFallbackMsgLimit(MESSAGE_PAGE_SIZE);
    setHasMoreMessages(false);
    setLoadingOlderMessages(false);
    setUseFallbackMsgQuery(false);
    setShowChecklistModal(false);
    setShowLeaderboardModal(false);
    setShowHeaderMenu(false);
    setShowMobileExtras(false);
    setShowEmojiPicker(false);
    setOlderMessages([]);
    prevScrollHeightRef.current = null;
    isPrependingOlderRef.current = false;

    if (currentUid && activeChatId) {
      const cached = getCachedChatMessages(currentUid, activeChatId);
      setLiveMessages(cached.slice(-MESSAGE_PAGE_SIZE));
      if (cached.length > MESSAGE_PAGE_SIZE) {
        setOlderMessages(cached.slice(0, cached.length - MESSAGE_PAGE_SIZE));
      }
      setUnreadCounts((prev) => {
        if ((prev[activeChatId] ?? 0) === 0) return prev;
        const next = { ...prev, [activeChatId]: 0 };
        saveCachedUnreadCounts(currentUid, next);
        return next;
      });
    } else {
      setLiveMessages([]);
    }
  }, [activeChatId, currentUid]);

  // Listen for incoming 1-on-1 WebRTC calls & screen shares (direct + group)
  useEffect(() => {
    if (!currentUid) return;
    const callsQ = query(
      collection(db, 'calls'),
      where('visibleToUids', 'array-contains', currentUid)
    );
    const unsub = onSnapshot(
      callsQ,
      (snap) => {
        const now = Date.now();
        const sessions = snap.docs.map((d) => d.data() as CallSession);

        const nextLiveGroupMap: Record<string, CallSession> = {};
        sessions.forEach((c) => {
          if (c.callType === 'screen' && c.isGroup && c.status === 'live') {
            nextLiveGroupMap[c.chatId] = c;
          }
        });
        setLiveGroupScreenShares(nextLiveGroupMap);

        const incomingRinging = sessions.filter((c) => {
          if (c.callType === 'screen') return false;
          if (c.calleeId !== currentUid || c.status !== 'ringing') return false;
          if (handledCallIdsRef.current.has(c.id)) return false;
          if (blockedUidSetRef.current.has(c.callerId)) return false;
          const createdMs = c.createdAt?.toMillis() ?? now;
          return now - createdMs < 90_000;
        });

        if (incomingRinging.length > 0 && !activeCall && !activeScreenShare) {
          const nextCall = incomingRinging[0];
          handledCallIdsRef.current.add(nextCall.id);
          setActiveCall({ mode: 'incoming', session: nextCall });
          return;
        }

        const incomingScreenShares = sessions.filter((c) => {
          if (c.callType !== 'screen') return false;
          if (c.callerId === currentUid) return false;
          if (handledCallIdsRef.current.has(c.id)) return false;
          if (blockedUidSetRef.current.has(c.callerId)) return false;
          if (c.isGroup) {
            if (c.status !== 'live') return false;
          } else {
            if (c.calleeId !== currentUid || c.status !== 'ringing') return false;
          }
          const createdMs = c.createdAt?.toMillis() ?? now;
          return now - createdMs < 90_000;
        });

        if (incomingScreenShares.length > 0 && !activeCall && !activeScreenShare) {
          const nextScreen = incomingScreenShares[0];
          handledCallIdsRef.current.add(nextScreen.id);
          setActiveScreenShare({ mode: 'incoming', session: nextScreen, autoAccept: false });
        }
      },
      () => {
        // Ignore transient call listener errors
      }
    );
    return () => unsub();
  }, [currentUid, activeCall, activeScreenShare]);

  // Targeted active-chat listener: strictly listens to the last 45 messages of ONLY the active open chat
  useEffect(() => {
    if (!currentUid || !activeChatId) {
      setLiveMessages([]);
      setOlderMessages([]);
      setHasMoreMessages(false);
      return;
    }
    const path = `chats/${activeChatId}/messages`;
    const q = useFallbackMsgQuery
      ? query(
          collection(db, 'chats', activeChatId, 'messages'),
          where('visibleToUids', 'array-contains', currentUid)
        )
      : query(
          collection(db, 'chats', activeChatId, 'messages'),
          where('visibleToUids', 'array-contains', currentUid),
          orderBy('createdAt', 'desc'),
          limit(MESSAGE_PAGE_SIZE)
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rawList = snap.docs.map((d) => ({
          ...(d.data() as ChatMessage),
          pending: d.metadata.hasPendingWrites,
        }));
        rawList.sort((a, b) => {
          const tA = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
          const tB = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
          if (tA !== tB) return tA - tB;
          return a.id.localeCompare(b.id);
        });

        const list = useFallbackMsgQuery ? rawList.slice(-fallbackMsgLimit) : rawList;
        setHasMoreMessages(
          useFallbackMsgQuery ? rawList.length > fallbackMsgLimit : snap.docs.length >= MESSAGE_PAGE_SIZE
        );
        setLoadingOlderMessages(false);
        setLiveMessages(list);
        saveCachedChatMessages(currentUid, activeChatId, list);

        const latestTs = list.reduce(
          (max, m) => Math.max(max, m.createdAt?.toMillis() ?? 0),
          0
        );
        if (latestTs > 0) {
          markChatViewedLocally(activeChatId, latestTs);
        }
        setUnreadCounts((prev) => {
          if ((prev[activeChatId] ?? 0) === 0) return prev;
          const next = { ...prev, [activeChatId]: 0 };
          saveCachedUnreadCounts(currentUid, next);
          return next;
        });
        void markMessagesDelivered(currentUid, activeChatId, list);
        void markMessagesRead(currentUid, activeChatId, list, readReceiptsEnabledRef.current);
      },
      (err) => {
        const msg = err instanceof Error ? err.message.toLowerCase() : '';
        if (!useFallbackMsgQuery && (msg.includes('index') || msg.includes('failed-precondition'))) {
          setUseFallbackMsgQuery(true);
          return;
        }
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );

    return () => unsub();
  }, [currentUid, activeChatId, fallbackMsgLimit, useFallbackMsgQuery, markChatViewedLocally]);

  // If user turns Read Receipts back ON while viewing a chat, immediately sync readBy
  useEffect(() => {
    if (!currentUid || !activeChatId || !readReceiptsEnabled || messages.length === 0) return;
    void markMessagesRead(currentUid, activeChatId, messages, true);
  }, [currentUid, activeChatId, readReceiptsEnabled, messages]);

  // Subscribe to typing indicators for active chat
  useEffect(() => {
    typingInitForChatRef.current = null;
    prevTyperUidsRef.current = new Set();

    if (!currentUid || !activeChatId) {
      setTypingUsers([]);
      return;
    }
    const path = `chats/${activeChatId}/typing`;
    const q = query(
      collection(db, 'chats', activeChatId, 'typing'),
      where('visibleToUids', 'array-contains', currentUid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as TypingStatus);
        if (typingInitForChatRef.current !== activeChatId) {
          const now = Date.now();
          prevTyperUidsRef.current = new Set(
            list
              .filter(
                (t) =>
                  t.uid !== currentUid &&
                  t.isTyping &&
                  t.updatedAt &&
                  now - t.updatedAt.toMillis() < 8500
              )
              .map((t) => t.uid)
          );
          typingInitForChatRef.current = activeChatId;
        }
        setTypingUsers(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUid, activeChatId]);

  // Periodically expire stale typing statuses (8s TTL)
  useEffect(() => {
    if (typingUsers.length === 0) return;
    const timer = setInterval(() => setTypingTick((t) => t + 1), 2000);
    return () => clearInterval(timer);
  }, [typingUsers.length]);

  // Clear own typing status, active reply, emoji picker, and restore saved draft for newly selected chat
  useEffect(() => {
    setReplyingTo(null);
    setHighlightedMsgId(null);
    setActiveMessageActionId(null);
    setInChatSearchOpen(false);
    setInChatSearchQuery('');
    setInChatMatchIdx(0);
    setIsRecordingVoice(false);
    setShowEmojiPicker(false);
    setShowMobileExtras(false);
    setInfoMessage(null);
    const nextDraft = activeChat?.id ? draftsByChat[activeChat.id] || '' : '';
    latestDraftRef.current = nextDraft;
    setDraftText(nextDraft);
    return () => {
      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current);
        typingDebounceTimerRef.current = null;
      }
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (activeChat && currentUser && typingPublishedRef.current && !isBaatCheetAIChat(activeChat)) {
        typingPublishedRef.current = false;
        lastTypingEmitRef.current = 0;
        void setTypingStatus(activeChat, currentUser, false);
      }
    };
  }, [activeChat?.id]);

  // Show interactive tutorial once on first login per user
  useEffect(() => {
    if (!currentUid) return;
    const seenKey = `sanvad_tutorial_seen_${currentUid}`;
    if (!localStorage.getItem(seenKey)) {
      localStorage.setItem(seenKey, '1');
      setShowTutorialModal(true);
    }
  }, [currentUid]);

  // Listen to user's private starred messages
  useEffect(() => {
    if (!currentUid) {
      setStarredMessages([]);
      return;
    }
    const path = `users/${currentUid}/starred`;
    const q = query(collection(db, 'users', currentUid, 'starred'), where('uid', '==', currentUid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StarredMessage);
        list.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setStarredMessages(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUid]);

  // Keep service worker informed about currently viewed visible chat to suppress duplicate OS alerts
  useEffect(() => {
    const syncSwState = () => {
      syncActiveChatToServiceWorker(activeChatId, document.visibilityState === 'visible');
    };
    syncSwState();
    document.addEventListener('visibilitychange', syncSwState);
    return () => document.removeEventListener('visibilitychange', syncSwState);
  }, [activeChatId]);

  // Auto-sync FCM device token when permission is granted + handle foreground FCM pushes
  useEffect(() => {
    if (!currentUid) {
      setPushBannerDismissed(true);
      return;
    }
    setPushBannerDismissed(isPushPromptBannerDismissed(currentUid));

    if (getNotificationPermission() === 'granted' && getPushAlertsEnabled()) {
      void registerFcmDeviceToken(currentUid).then(() => {
        setNotifTick((t) => t + 1);
      });
    }

    const unsubForeground = subscribeForegroundFcmMessages((payload) => {
      const data = payload.data || {};
      const chatId = typeof data.chatId === 'string' && data.chatId ? data.chatId : undefined;
      if (chatId && mutedChatSetRef.current.has(chatId)) return;

      const isCurrentlyViewing =
        Boolean(chatId) &&
        activeChatIdRef.current === chatId &&
        document.visibilityState === 'visible';
      if (isCurrentlyViewing) return;

      const title =
        data.senderName || payload.notification?.title || 'Sanvad';
      const body =
        data.messagePreview || payload.notification?.body || 'New message';
      const icon =
        data.senderAvatar || payload.notification?.icon || undefined;

      playNotificationChime();
      void showMessagePushNotification({
        title,
        body,
        chatId,
        icon,
        tag: data.tag || chatId || 'sanvad-fcm',
      });
    });

    return () => {
      unsubForeground();
    };
  }, [currentUid]);

  // Listen to custom open-chat events & Service Worker notification click deep-link messages
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ chatId?: string }>).detail;
      if (detail?.chatId) {
        setMobileTab('chats');
        setActiveChatId(detail.chatId);
      }
    };
    const swHandler = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; chatId?: string } | null;
      if (data?.type === 'SANVAD_OPEN_CHAT' && data.chatId) {
        setMobileTab('chats');
        setActiveChatId(data.chatId);
      }
    };
    window.addEventListener('sanvad:open-chat', handler);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', swHandler);
    }
    return () => {
      window.removeEventListener('sanvad:open-chat', handler);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', swHandler);
      }
    };
  }, []);

  const totalUnreadCount = useMemo(
    () => Object.values(unreadCounts).reduce((sum, count) => sum + count, 0),
    [unreadCounts]
  );

  // Update browser tab title with total unread count
  useEffect(() => {
    document.title = totalUnreadCount > 0 ? `(${totalUnreadCount}) Sanvad` : 'Sanvad';
  }, [totalUnreadCount]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!hasMoreMessages || loadingOlderMessages || !activeChatId || !currentUid) return;
    prevScrollHeightRef.current = feedScrollRef.current?.scrollHeight ?? null;
    isPrependingOlderRef.current = true;
    setLoadingOlderMessages(true);

    if (useFallbackMsgQuery) {
      setFallbackMsgLimit((prev) => prev + MESSAGE_PAGE_SIZE);
      return;
    }

    const oldestTs: Timestamp | null =
      messages.find((m) => m.createdAt instanceof Timestamp)?.createdAt ??
      messages[0]?.createdAt ??
      null;

    if (!oldestTs) {
      setHasMoreMessages(false);
      setLoadingOlderMessages(false);
      return;
    }

    try {
      const { messages: olderBatch, hasMore } = await fetchOlderChatMessages(
        activeChatId,
        currentUid,
        oldestTs,
        MESSAGE_PAGE_SIZE
      );
      if (olderBatch.length > 0) {
        setOlderMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          olderBatch.forEach((m) => map.set(m.id, m));
          prev.forEach((m) => map.set(m.id, m));
          const merged = Array.from(map.values());
          saveCachedChatMessages(currentUid, activeChatId, [...merged, ...liveMessages]);
          return merged;
        });
      }
      setHasMoreMessages(hasMore && olderBatch.length > 0);
    } catch {
      setHasMoreMessages(false);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [
    hasMoreMessages,
    loadingOlderMessages,
    activeChatId,
    currentUid,
    useFallbackMsgQuery,
    messages,
    liveMessages,
  ]);

  // Auto-scroll message list to bottom, jump to starred message, or preserve scroll when loading older messages
  useEffect(() => {
    if (isPrependingOlderRef.current) {
      isPrependingOlderRef.current = false;
      const container = feedScrollRef.current;
      const prevHeight = prevScrollHeightRef.current;
      prevScrollHeightRef.current = null;
      if (container && prevHeight !== null) {
        requestAnimationFrame(() => {
          container.scrollTop += Math.max(0, container.scrollHeight - prevHeight);
        });
      }
      return;
    }

    if (pendingJumpMsgIdRef.current && messages.some((m) => m.id === pendingJumpMsgIdRef.current)) {
      const targetId = pendingJumpMsgIdRef.current;
      pendingJumpMsgIdRef.current = null;
      requestAnimationFrame(() => handleJumpToMessage(targetId));
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeChatId]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithBasicGoogle();
    } catch (err) {
      setAuthError(formatAuthError(err));
    }
  };

  const handleSignOut = async () => {
    if (firebaseUser) {
      await removeFcmTokenFromUserProfile(firebaseUser.uid);
      await updatePresence(firebaseUser.uid, false);
    }
    clearInMemoryGoogleAccessToken();
    await signOut(auth);
    setShowProfileModal(false);
  };

  const activeMembers = useMemo(() => {
    if (!activeChat) return [];
    return activeChat.memberUids
      .map((id) => resolvedPublicUsers[id])
      .filter((u): u is PublicUser => Boolean(u));
  }, [activeChat, resolvedPublicUsers]);

  const activeTypers = useMemo(() => {
    void typingTick;
    const now = Date.now();
    return typingUsers.filter(
      (t) =>
        t.uid !== currentUid &&
        t.isTyping &&
        t.updatedAt &&
        now - t.updatedAt.toMillis() < 8500
    );
  }, [typingUsers, currentUid, typingTick]);

  // Play subtle sound once when someone new starts typing in the active visible chat
  useEffect(() => {
    if (!activeChatId || typingInitForChatRef.current !== activeChatId) return;

    const nextUids = new Set(
      activeTypers
        .filter((t) => !blockedUidSetRef.current.has(t.uid))
        .map((t) => t.uid)
    );
    const prevUids = prevTyperUidsRef.current;

    let someoneStartedTyping = false;
    for (const uid of nextUids) {
      if (!prevUids.has(uid)) {
        someoneStartedTyping = true;
        break;
      }
    }
    prevTyperUidsRef.current = nextUids;

    if (
      someoneStartedTyping &&
      document.visibilityState === 'visible' &&
      !mutedChatSetRef.current.has(activeChatId)
    ) {
      const now = Date.now();
      if (now - lastTypingSoundAtRef.current > 1500) {
        lastTypingSoundAtRef.current = now;
        playTypingStartedSound();
      }
    }
  }, [activeChatId, activeTypers]);

  // Parse trailing @mention query from draftText
  const mentionQueryMatch = useMemo(() => {
    if (mentionDismissed) return null;
    const match = draftText.match(/(?:^|\s)@([a-z0-9_-]{0,30})$/i);
    return match ? match[1].toLowerCase() : null;
  }, [draftText, mentionDismissed]);

  const mentionCandidates = useMemo(() => {
    if (mentionQueryMatch === null || !currentUid) return [];
    return activeMembers
      .filter((m) => m.uid !== currentUid)
      .filter(
        (m) =>
          m.handle.toLowerCase().includes(mentionQueryMatch) ||
          m.displayName.toLowerCase().includes(mentionQueryMatch)
      )
      .slice(0, 6);
  }, [mentionQueryMatch, activeMembers, currentUid]);

  const insertMention = (member: PublicUser) => {
    const replaced = draftText.replace(
      /(^|\s)@([a-z0-9_-]{0,30})$/i,
      `$1@${member.handle} `
    );
    setDraftText(replaced);
    setMentionIndex(0);
    setMentionDismissed(false);
    composerRef.current?.focus();
  };

  const handleDraftChange = (value: string) => {
    latestDraftRef.current = value;
    setDraftText(value);
    setMentionDismissed(false);
    setMentionIndex(0);
    if (activeChat?.id) {
      saveDraftForChat(activeChat.id, value);
    }

    if (!activeChat || !currentUser || isBaatCheetAIChat(activeChat)) return;

    if (!value.trim()) {
      if (typingDebounceTimerRef.current) {
        clearTimeout(typingDebounceTimerRef.current);
        typingDebounceTimerRef.current = null;
      }
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (typingPublishedRef.current) {
        typingPublishedRef.current = false;
        lastTypingEmitRef.current = 0;
        void setTypingStatus(activeChat, currentUser, false);
      }
      return;
    }

    // 1.5s debounce before writing typing=true to save Firestore writes on short/quick replies
    const now = Date.now();
    if (
      !typingDebounceTimerRef.current &&
      (!typingPublishedRef.current || now - lastTypingEmitRef.current > 4500)
    ) {
      const targetChat = activeChat;
      const targetUser = currentUser;
      typingDebounceTimerRef.current = setTimeout(() => {
        typingDebounceTimerRef.current = null;
        if (!latestDraftRef.current.trim() || activeChatIdRef.current !== targetChat.id) return;
        typingPublishedRef.current = true;
        lastTypingEmitRef.current = Date.now();
        void setTypingStatus(targetChat, targetUser, true);
      }, TYPING_DEBOUNCE_MS);
    }

    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    const stopChat = activeChat;
    const stopUser = currentUser;
    typingStopTimerRef.current = setTimeout(() => {
      typingStopTimerRef.current = null;
      if (typingPublishedRef.current) {
        typingPublishedRef.current = false;
        lastTypingEmitRef.current = 0;
        void setTypingStatus(stopChat, stopUser, false);
      }
    }, TYPING_IDLE_STOP_MS);
  };

  const activeReplyPayload = useMemo(() => {
    if (!replyingTo) return null;
    const senderDisplay =
      replyingTo.senderId === currentUser?.uid
        ? 'You'
        : resolvedPublicUsers[replyingTo.senderId]?.displayName || replyingTo.senderName;
    return buildMessageReply(replyingTo, senderDisplay);
  }, [replyingTo, currentUser?.uid, resolvedPublicUsers]);

  const handleStartReply = (msg: ChatMessage) => {
    setReplyingTo(msg);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const handleJumpToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(messageId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMsgId((curr) => (curr === messageId ? null : curr));
    }, 1600);
  };

  const triggerBotReply = useCallback(
    async (targetChat: Chat, userPromptText: string, imageData?: string) => {
      if (!currentUser || !isBaatCheetAIChat(targetChat)) return;
      const priorTurns = messages
        .filter((m) => m.chatId === targetChat.id && (m.type === 'text' || m.type === 'image'))
        .slice(-12)
        .map((m) => ({
          role: (m.senderId === BAATCHEET_AI_UID ? 'model' : 'user') as 'user' | 'model',
          text: m.text?.trim() || (m.type === 'image' ? 'Shared an image.' : ''),
        }))
        .filter((t) => t.text.length > 0);

      const finalPrompt =
        userPromptText.trim() || (imageData ? 'Please analyze this photo and help me.' : '');
      if (!finalPrompt) return;

      const lastTurn = priorTurns[priorTurns.length - 1];
      const history =
        lastTurn && lastTurn.role === 'user' && lastTurn.text === finalPrompt
          ? priorTurns
          : [...priorTurns, { role: 'user' as const, text: finalPrompt }];

      setAiThinkingChats((prev) => ({ ...prev, [targetChat.id]: true }));
      playTypingStartedSound();

      try {
        const reply = await askBaatCheetAI({
          userName: currentUser.displayName,
          history,
          imageData,
        });
        const isViewing =
          activeChatIdRef.current === targetChat.id && document.visibilityState === 'visible';
        await sendBotReplyMessage(targetChat, currentUser.uid, reply, isViewing);
      } catch (err) {
        setBannerError(
          err instanceof Error ? err.message : 'BaatCheet AI could not respond right now.'
        );
      } finally {
        setAiThinkingChats((prev) => {
          const next = { ...prev };
          delete next[targetChat.id];
          return next;
        });
      }
    },
    [currentUser, messages]
  );

  const handleSendText = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const rawText = overrideText ?? draftText;
    if (!activeChat || !currentUser || !rawText.trim() || sendingText) return;
    const text = rawText;
    const mentionedUids = extractMentionedUids(text, activeMembers);
    const replyTarget = overrideText ? null : replyingTo;
    const replySnapshot = replyTarget
      ? buildMessageReply(
          replyTarget,
          resolvedPublicUsers[replyTarget.senderId]?.displayName || replyTarget.senderName
        )
      : null;

    if (!overrideText) {
      latestDraftRef.current = '';
      setDraftText('');
      saveDraftForChat(activeChat.id, '');
      setReplyingTo(null);
    }
    setMentionDismissed(false);
    setShowEmojiPicker(false);
    setSendingText(true);

    if (typingDebounceTimerRef.current) {
      clearTimeout(typingDebounceTimerRef.current);
      typingDebounceTimerRef.current = null;
    }
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (typingPublishedRef.current) {
      typingPublishedRef.current = false;
      lastTypingEmitRef.current = 0;
      void setTypingStatus(activeChat, currentUser, false);
    }

    try {
      let finalMessageText = text;
      if (activeChat.type === 'direct' && !isBaatCheetAIChat(activeChat)) {
        const peerUid = activeChat.memberUids.find((u) => u !== currentUid);
        if (peerUid) {
          try {
            const peerPub = await getPeerPublicKey(peerUid);
            const rawOwnPub = localStorage.getItem(`sanvad_e2e_pub_jwk_${currentUser.uid}`);
            const ownPub = rawOwnPub
              ? await window.crypto.subtle.importKey(
                  'jwk',
                  JSON.parse(rawOwnPub),
                  { name: 'RSA-OAEP', hash: 'SHA-256' },
                  true,
                  ['encrypt']
                )
              : null;
            const pubs = [peerPub, ownPub].filter(Boolean) as CryptoKey[];
            if (pubs.length > 0) {
              finalMessageText = await encryptE2EEMessage(text, pubs);
            }
          } catch (e2eeErr) {
            console.error('E2EE encryption failed, sending plaintext:', e2eeErr);
          }
        }
      }
      await sendTextMessage(activeChat, currentUser, finalMessageText, mentionedUids, replySnapshot);
      playSendMessageSound();
      if (isBaatCheetAIChat(activeChat)) {
        void triggerBotReply(activeChat, text);
      }
    } catch (err) {
      if (!overrideText) {
        setDraftText(text);
        saveDraftForChat(activeChat.id, text);
        setReplyingTo(replyTarget);
      }
      setBannerError(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSendingText(false);
    }
  };

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setBannerError(null);
    const compressedBatch: string[] = [];
    for (const file of files.slice(0, 6)) {
      try {
        const compressed = await compressChatPhoto(file);
        compressedBatch.push(compressed);
      } catch (err) {
        setBannerError(err instanceof Error ? err.message : 'Could not process image.');
      }
    }
    if (compressedBatch.length > 0) {
      setPendingPhotos(compressedBatch);
    }
  };

  const handlePickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChat || !currentUser || sendingFile) return;
    setBannerError(null);

    if (file.size > LIMITS.FILE_RAW_MAX_BYTES) {
      setBannerError(
        `File is too large (${formatFileSize(file.size)}). Max size is ${formatFileSize(
          LIMITS.FILE_RAW_MAX_BYTES
        )}.`
      );
      return;
    }

    setSendingFile(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read selected file.'));
        reader.readAsDataURL(file);
      });
      const replySnapshot = replyingTo
        ? buildMessageReply(
            replyingTo,
            publicUsers[replyingTo.senderId]?.displayName || replyingTo.senderName
          )
        : null;
      await sendFileMessage(
        activeChat,
        currentUser,
        dataUrl,
        file.name,
        file.size,
        file.type || 'application/octet-stream',
        replySnapshot
      );
      playSendMessageSound();
      setReplyingTo(null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to send file.');
    } finally {
      setSendingFile(false);
    }
  };

  const handleDeleteChat = async (targetChat: Chat) => {
    if (!currentUser) return;
    saveDraftForChat(targetChat.id, '');
    if (targetChat.type === 'group') {
      if (targetChat.createdBy === currentUser.uid) {
        await deleteGroupChatPermanently(currentUser.uid, targetChat.id, currentUser);
      } else {
        await leaveGroup(targetChat, currentUser.uid);
      }
    } else {
      await deleteChatForSelf(currentUser.uid, targetChat.id, currentUser);
    }
    if (activeChatId === targetChat.id) {
      setActiveChatId(null);
      setShowInfoDrawer(false);
    }
  };

  const getChatDisplay = (chat: Chat) => {
    if (chat.type === 'group') {
      const onlineMembers = chat.memberUids.filter(
        (id) => id !== currentUser?.uid && isUserRecentlyOnline(resolvedPublicUsers[id])
      ).length;
      return {
        title: chat.name,
        photoUrl: chat.photoUrl,
        isGroup: true,
        isBot: false,
        isOnline: false,
        subtitle: `${chat.memberUids.length} members · ${onlineMembers} online`,
      };
    }
    const otherUid = chat.memberUids.find((id) => id !== currentUser?.uid) || '';
    if (otherUid === BAATCHEET_AI_UID) {
      return {
        title: BAATCHEET_AI_NAME,
        photoUrl: BAATCHEET_AI_PUBLIC_PROFILE.photoUrl,
        isGroup: false,
        isBot: true,
        isOnline: true,
        subtitle: 'AI Assistant · Always ready',
      };
    }
    const other = resolvedPublicUsers[otherUid];
    const online = isUserRecentlyOnline(other);
    return {
      title: other?.displayName || 'Friend',
      photoUrl: other?.photoUrl || '',
      isGroup: false,
      isBot: false,
      isOnline: online,
      subtitle: online ? 'Online' : formatLastSeen(other?.lastSeen),
    };
  };

  const pinnedChatIds = currentUser?.pinnedChatIds ?? [];
  const archivedChatIds = currentUser?.archivedChatIds ?? [];

  const unreadChatsCount = useMemo(
    () =>
      chats.filter(
        (chat) => !archivedChatIds.includes(chat.id) && (unreadCounts[chat.id] || 0) > 0
      ).length,
    [chats, archivedChatIds, unreadCounts]
  );

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = chats.filter((chat) => {
      const deletedAtMs = deletedChatsMap[chat.id] ?? 0;
      const lastActivityMs = chat.lastMessageAt?.toMillis() ?? chat.createdAt?.toMillis() ?? 0;
      if (deletedAtMs > 0 && lastActivityMs <= deletedAtMs && activeChatId !== chat.id) {
        return false;
      }

      const isArchived = archivedChatIds.includes(chat.id);
      if (chatFilter === 'archived') {
        if (!isArchived) return false;
      } else {
        if (isArchived) return false;
        if (chatFilter === 'unread') {
          if ((unreadCounts[chat.id] || 0) === 0) return false;
        } else if (chatFilter !== 'all' && chat.type !== chatFilter) {
          return false;
        }
      }
      if (!q) return true;
      const meta = getChatDisplay(chat);
      return (
        meta.title.toLowerCase().includes(q) ||
        chat.lastMessageText.toLowerCase().includes(q)
      );
    });

    if (chatFilter !== 'archived') {
      list.sort((a, b) => {
        const pinA = pinnedChatIds.includes(a.id) ? 1 : 0;
        const pinB = pinnedChatIds.includes(b.id) ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        const tA = a.lastMessageAt?.toMillis() ?? a.createdAt?.toMillis() ?? 0;
        const tB = b.lastMessageAt?.toMillis() ?? b.createdAt?.toMillis() ?? 0;
        return tB - tA;
      });
    }

    return list;
  }, [
    chats,
    chatFilter,
    searchQuery,
    publicUsers,
    currentUser?.uid,
    pinnedChatIds,
    archivedChatIds,
    deletedChatsMap,
    activeChatId,
    unreadCounts,
  ]);

  const visibleMessages = useMemo(() => {
    if (!activeChat) return [];
    const deletedAtMs = deletedChatsMap[activeChat.id] ?? 0;
    const disappearSec = activeChat.disappearingSeconds ?? 0;
    const now = Date.now();
    return messages.filter((m) => {
      const msgMs = m.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      if (deletedAtMs > 0 && msgMs <= deletedAtMs) return false;
      if (disappearSec > 0 && m.createdAt && now - msgMs >= disappearSec * 1000) {
        return false;
      }
      return true;
    });
  }, [messages, activeChat, deletedChatsMap]);

  const directoryList = useMemo(() => Object.values(publicUsers), [publicUsers]);
  const groupChats = useMemo(() => chats.filter((c) => c.type === 'group'), [chats]);
  const openChecklistCount = useMemo(
    () => checklistItems.filter((item) => !item.completed).length,
    [checklistItems]
  );
  const friendsList = useMemo(
    () =>
      directoryList.filter((u) => u.uid !== currentUser?.uid && u.uid !== BAATCHEET_AI_UID),
    [directoryList, currentUser?.uid]
  );
  const onlineFriendsCount = useMemo(
    () => friendsList.filter((u) => isUserRecentlyOnline(u)).length,
    [friendsList]
  );
  const totalAppUsers = Math.max(
    summaryTotalUsers,
    directoryList.length,
    currentUser ? 1 : 0
  );
  const activeWallpaperId: WallpaperId =
    (activeChatId && currentUser?.chatWallpapers?.[activeChatId]) ||
    currentUser?.wallpaper ||
    'default';
  const welcomeWallpaperId: WallpaperId = currentUser?.wallpaper || 'default';

  const starredIdSet = useMemo(
    () => new Set(starredMessages.map((s) => s.id)),
    [starredMessages]
  );

  const inChatMatches = useMemo(() => {
    const q = inChatSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return visibleMessages
      .filter((m) => {
        if (m.text && m.text.toLowerCase().includes(q)) return true;
        if (m.type === 'file' && m.fileName?.toLowerCase().includes(q)) return true;
        if (m.type === 'audio' && ('voice message'.includes(q) || 'audio'.includes(q))) return true;
        return false;
      })
      .map((m) => m.id);
  }, [visibleMessages, inChatSearchQuery]);

  const navigateInChatSearch = (direction: 'prev' | 'next') => {
    if (inChatMatches.length === 0) return;
    const nextIdx =
      direction === 'next'
        ? (inChatMatchIdx + 1) % inChatMatches.length
        : (inChatMatchIdx - 1 + inChatMatches.length) % inChatMatches.length;
    setInChatMatchIdx(nextIdx);
    const targetId = inChatMatches[nextIdx];
    if (targetId) handleJumpToMessage(targetId);
  };

  const pushEnabled = useMemo(() => {
    void notifTick;
    return getNotificationPermission() === 'granted' && getPushAlertsEnabled();
  }, [notifTick]);

  const handleQuickNotificationToggle = async () => {
    const perm = getNotificationPermission();
    if (perm === 'unsupported') {
      setBannerError('Notifications are not supported in this browser.');
      return;
    }
    if (perm === 'default') {
      if (!currentUser) return;
      const result = await enableAndRegisterFcmNotifications(currentUser.uid);
      setNotifTick((t) => t + 1);
      if (result.permission === 'granted') {
        playNotificationChime();
        if (currentUid) {
          dismissPushPromptBanner(currentUid);
          setPushBannerDismissed(true);
        }
      } else if (result.message) {
        setBannerError(result.message);
      }
      return;
    }
    if (perm === 'denied') {
      setBannerError('Notifications are blocked in browser site settings. Open App Guide for help.');
      return;
    }
    const next = !getPushAlertsEnabled();
    setPushAlertsEnabled(next);
    setNotifTick((t) => t + 1);
    if (next) {
      playNotificationChime();
      if (currentUser) {
        void registerFcmDeviceToken(currentUser.uid);
      }
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#F7F8FA] dark:bg-[#0B0F17]">
        <div className="flex flex-col items-center gap-3">
          <img src="/pwa-192x192.png" alt="Sanvad" className="w-14 h-14 rounded-2xl object-cover shadow-sm" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Loading Sanvad...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !currentUser) {
    return (
      <>
        <AuthScreen
          onSignIn={handleSignIn}
          isDark={isDark}
          onToggleTheme={() => setIsDark((d) => !d)}
          error={authError}
          onClearError={() => setAuthError(null)}
        />
        <OfflineIndicator />
      </>
    );
  }

  if (isAppLocked) {
    return (
      <>
        <AppLockScreen
          uid={currentUser.uid}
          userName={currentUser.displayName}
          onUnlock={() => setIsAppLocked(false)}
          onSignOut={handleSignOut}
        />
        <OfflineIndicator />
      </>
    );
  }

  const activeMeta = activeChat ? getChatDisplay(activeChat) : null;
  const isActiveBotChat = isBaatCheetAIChat(activeChat);
  const isActiveBotThinking = Boolean(activeChat && aiThinkingChats[activeChat.id]);
  const activeOtherUid =
    activeChat?.type === 'direct'
      ? activeChat.memberUids.find((id) => id !== currentUser.uid)
      : undefined;
  const isActiveChatMuted = activeChat ? mutedChatSet.has(activeChat.id) : false;
  const isActiveChatBlocked = Boolean(
    activeOtherUid && activeOtherUid !== BAATCHEET_AI_UID && blockedUidSet.has(activeOtherUid)
  );
  const canPinActiveMessages = activeChat
    ? activeChat.type === 'direct' || activeChat.adminUids.includes(currentUser.uid)
    : false;

  return (
    <div className="h-dvh w-full flex bg-[#F7F8FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* LEFT SIDEBAR: Chat List & Friends */}
      <aside
        className={`${
          activeChat ? 'hidden md:flex' : 'flex'
        } w-full md:w-[350px] lg:w-[390px] shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800`}
      >
        {/* Sidebar Header */}
        <header className="h-14 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2.5 min-w-0 rounded-xl py-1 pr-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
            title="Edit profile & photo"
          >
            <Avatar
              src={currentUser.photoUrl}
              name={currentUser.displayName}
              size="sm"
              isOnline
              showPresence
            />
            <div className="min-w-0 text-left">
              <p className="font-display text-sm font-bold truncate leading-tight">
                {currentUser.displayName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                @{currentUser.handle}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowStarredModal(true)}
              className="relative min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Starred messages"
              aria-label="Starred messages"
            >
              <Star className={`w-4 h-4 ${starredMessages.length > 0 ? 'text-amber-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => void handleQuickNotificationToggle()}
              className={`min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                pushEnabled
                  ? 'text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title={pushEnabled ? 'Notifications active (tap to mute)' : 'Enable push notifications'}
              aria-label={pushEnabled ? 'Notifications active' : 'Enable push notifications'}
            >
              {pushEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setShowTutorialModal(true)}
              className="min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="App Guide & Mobile Install Tutorial"
              aria-label="App Guide & Mobile Install Tutorial"
            >
              <BookOpen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowNewChat({ open: true, tab: 'direct' })}
              className="min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="New chat or group"
              aria-label="New chat or group"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              className="hidden sm:flex min-w-[36px] min-h-[38px] items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            {appLockEnabled && (
              <button
                type="button"
                onClick={() => setIsAppLocked(true)}
                className="min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors cursor-pointer"
                title="Lock Sanvad now"
                aria-label="Lock Sanvad now"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="min-w-[36px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Profile & Settings"
              aria-label="Profile & Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Desktop Sidebar Mode Switcher (Chats / Status / Secrets / Friends) */}
        <div className="hidden md:grid grid-cols-4 gap-1 px-3.5 pt-2.5 pb-1 shrink-0">
          {(
            [
              { id: 'chats', label: 'Chats' },
              { id: 'status', label: 'Status' },
              { id: 'secrets', label: 'Secrets' },
              { id: 'people', label: 'Friends' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMobileTab(item.id)}
              className={`min-h-[34px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                mobileTab === item.id
                  ? 'sanvad-accent-bg shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search & Filter */}
        {mobileTab === 'chats' && (
          <div className="px-3.5 pt-3 pb-2 space-y-2.5 shrink-0">
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full min-h-[40px] pl-2 bg-transparent text-sm focus:outline-none"
              />
            </div>

            {/* Status Stories Row in Sidebar */}
            <div className="flex items-center gap-3 overflow-x-auto py-1 px-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setShowStatusComposer(true)}
                className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group"
                title="Add status update"
              >
                <div className="relative w-12 h-12 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-lg shadow-md group-hover:bg-teal-800 transition-colors">
                  +
                </div>
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate max-w-[56px]">
                  My Status
                </span>
              </button>

              {statuses.map((s, idx) => {
                const hasViewed = (s.viewers || []).includes(currentUser.uid);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setViewingStatusIndex(idx)}
                    className="flex flex-col items-center gap-1 shrink-0 cursor-pointer group"
                  >
                    <div
                      className={`relative p-0.5 rounded-full ${
                        hasViewed
                          ? 'bg-slate-300 dark:bg-slate-700'
                          : 'bg-gradient-to-tr from-amber-500 via-rose-500 to-teal-500 animate-pulse'
                      }`}
                    >
                      <Avatar src={s.photoUrl} name={s.displayName} size="md" />
                    </div>
                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200 truncate max-w-[56px]">
                      {s.uid === currentUser.uid ? 'You' : s.displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {(['all', 'unread', 'direct', 'group', 'archived'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setChatFilter(f)}
                  className={`min-h-[34px] px-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    chatFilter === f
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {f === 'all'
                    ? 'All'
                    : f === 'unread'
                    ? unreadChatsCount > 0
                      ? `Unread (${unreadChatsCount})`
                      : 'Unread'
                    : f === 'direct'
                    ? 'Direct'
                    : f === 'group'
                    ? 'Groups'
                    : archivedChatIds.length > 0
                    ? `Arc (${archivedChatIds.length})`
                    : 'Archive'}
                </button>
              ))}
            </div>

            {isPushMessagingSupported() &&
              getNotificationPermission() === 'default' &&
              !pushBannerDismissed && (
                <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/80 dark:bg-teal-950/35 px-3 py-2.5 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bell className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-teal-950 dark:text-teal-100 truncate">
                        Turn on Push Alerts
                      </p>
                      <p className="text-[11px] text-teal-800/80 dark:text-teal-300/80 truncate">
                        Get notified even when Sanvad is in the background
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={enablingPushBanner}
                      onClick={async () => {
                        setEnablingPushBanner(true);
                        try {
                          const res = await enableAndRegisterFcmNotifications(currentUser.uid);
                          setNotifTick((t) => t + 1);
                          if (res.permission === 'granted') {
                            playNotificationChime();
                            dismissPushPromptBanner(currentUser.uid);
                            setPushBannerDismissed(true);
                          } else if (res.message) {
                            setBannerError(res.message);
                          }
                        } finally {
                          setEnablingPushBanner(false);
                        }
                      }}
                      className="min-h-[30px] px-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      {enablingPushBanner ? '...' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissPushPromptBanner(currentUser.uid);
                        setPushBannerDismissed(true);
                      }}
                      className="min-h-[30px] px-2 rounded-lg text-[11px] font-medium text-teal-800 dark:text-teal-300 hover:bg-teal-100/70 dark:hover:bg-teal-900/40 cursor-pointer"
                    >
                      Later
                    </button>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Scrollable List (Chats, Status or People on Mobile) */}
        <div className="flex-1 overflow-y-auto chat-scroll pb-16 md:pb-3">
          {mobileTab === 'status' ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Status Stories</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Share updates that disappear in 24 hours.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStatusComposer(true)}
                  className="min-h-[38px] px-3.5 rounded-xl bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition-colors cursor-pointer"
                >
                  + Add Status
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowStatusComposer(true)}
                  className="w-full p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-teal-700 text-white flex items-center justify-center font-bold text-xl shrink-0">
                    +
                  </div>
                  <div>
                    <p className="text-sm font-semibold">My Status</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Tap to add photo or text status update
                    </p>
                  </div>
                </button>

                {statuses.length === 0 ? (
                  <div className="text-center py-10 space-y-2 text-slate-500">
                    <Sparkles className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="text-sm font-medium">No recent status updates</p>
                    <p className="text-xs">Be the first to share a story with your friends!</p>
                  </div>
                ) : (
                  statuses.map((s, idx) => {
                    const hasViewed = (s.viewers || []).includes(currentUser.uid);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setViewingStatusIndex(idx)}
                        className="w-full p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors cursor-pointer"
                      >
                        <div
                          className={`p-0.5 rounded-full ${
                            hasViewed
                              ? 'bg-slate-300 dark:bg-slate-700'
                              : 'bg-gradient-to-tr from-amber-500 via-rose-500 to-teal-500 animate-pulse'
                          }`}
                        >
                          <Avatar src={s.photoUrl} name={s.displayName} size="md" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{s.displayName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {s.type === 'text' ? s.text : 'Photo status'} · {(s.viewers || []).length} views
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : mobileTab === 'secrets' ? (
            <SecretsBoardPanel
              currentUid={currentUser.uid}
              confessions={confessions}
              ownConfessionIds={ownConfessionIds}
              groupChats={groupChats}
            />
          ) : mobileTab === 'people' ? (
            <div className="p-3 space-y-2">
              <div className="px-2 py-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Your Connections ({friendsList.length}) · {onlineFriendsCount} Online
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewChat({ open: true, tab: 'direct' })}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 cursor-pointer"
                >
                  + Find @handle
                </button>
              </div>
              {friendsList.length === 0 ? (
                <div className="px-4 py-12 text-center space-y-3">
                  <Users className="w-9 h-9 mx-auto text-slate-400" />
                  <p className="text-sm font-medium">No connections yet</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Other users&apos; names stay private. Find a friend by their exact @handle or
                    share your Friend Link from Profile.
                  </p>
                </div>
              ) : (
                friendsList.map((person) => {
                  const online = isUserRecentlyOnline(person);
                  return (
                    <button
                      key={person.uid}
                      type="button"
                      onClick={() => {
                        void startDirectChat(currentUser.uid, person.uid).then(async (id) => {
                          await restoreDeletedChatVisibility(
                            currentUser.uid,
                            id,
                            currentUser.deletedChats
                          );
                          setActiveChatId(id);
                          setMobileTab('chats');
                        });
                      }}
                      className="w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-3 text-left cursor-pointer"
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
                            @{person.handle} · {online ? 'Online' : formatLastSeen(person.lastSeen)}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                        Chat
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="px-6 py-14 text-center space-y-3">
              {chatFilter === 'archived' ? (
                <>
                  <Archive className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    No archived chats
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chats you archive will stay tucked away here until you unarchive them.
                  </p>
                </>
              ) : chatFilter === 'unread' ? (
                <>
                  <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    All caught up!
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    You have no unread messages across your active chats.
                  </p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    No conversations yet
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Start a personal chat or create a group with your friends.
                  </p>
                  <div className="pt-2 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewChat({ open: true, tab: 'direct' })}
                      className="min-h-[40px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      New Chat
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {filteredChats.map((chat) => {
                const meta = getChatDisplay(chat);
                const isSelected = chat.id === activeChatId;
                const isPinned = pinnedChatIds.includes(chat.id);
                const isArchived = archivedChatIds.includes(chat.id);
                const isMuted = mutedChatSet.has(chat.id);
                const savedDraft = !isSelected ? (draftsByChat[chat.id] || '').trim() : '';
                const unread = unreadCounts[chat.id] || 0;
                const timeStr = formatChatListTime(chat.lastMessageAt || chat.createdAt);
                const iSentLast = chat.lastMessageSenderId === currentUser.uid;
                return (
                  <div
                    key={chat.id}
                    className={`group relative flex items-center transition-colors ${
                      isSelected
                        ? 'bg-teal-50/80 dark:bg-teal-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveChatId(chat.id)}
                      className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <Avatar
                        src={meta.photoUrl}
                        name={meta.title}
                        isGroup={meta.isGroup}
                        isOnline={meta.isOnline}
                        showPresence={!meta.isGroup}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                            {isPinned && !isArchived && (
                              <Pin className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0" />
                            )}
                            {meta.isBot && (
                              <Bot
                                className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"
                                aria-label="AI Assistant"
                              />
                            )}
                            <span className="truncate">{meta.title}</span>
                            {isMuted && (
                              <BellOff
                                className="w-3 h-3 text-slate-400 shrink-0"
                                aria-label="Muted"
                              />
                            )}
                          </p>
                          <span
                            className={`text-[11px] tabular-nums shrink-0 group-hover:hidden ${
                              unread > 0
                                ? 'text-teal-700 dark:text-teal-400 font-semibold'
                                : 'text-slate-400'
                            }`}
                          >
                            {timeStr}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          {aiThinkingChats[chat.id] ? (
                            <p className="text-xs font-medium text-teal-700 dark:text-teal-400 truncate animate-pulse">
                              AI is thinking...
                            </p>
                          ) : savedDraft ? (
                            <p className="text-xs truncate">
                              <span className="font-semibold text-rose-600 dark:text-rose-400">
                                Draft:{' '}
                              </span>
                              <span className="text-slate-600 dark:text-slate-300">{savedDraft}</span>
                            </p>
                          ) : (
                            <p
                              className={`text-xs truncate flex items-center gap-1 ${
                                unread > 0
                                  ? 'font-semibold text-slate-800 dark:text-slate-100'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {chat.lastMessageType === 'audio' && (
                                <Mic className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0" />
                              )}
                              {chat.lastMessageType === 'file' && (
                                <FileText className="w-3 h-3 text-teal-700 dark:text-teal-400 shrink-0" />
                              )}
                              <span className="truncate">
                                {iSentLast && chat.lastMessageType !== 'none'
                                  ? `You: ${chat.lastMessageText}`
                                  : chat.lastMessageText ||
                                    (chat.type === 'group' ? 'Tap to start chatting' : meta.subtitle)}
                              </span>
                            </p>
                          )}
                          {unread > 0 && (
                            <span
                              className={`min-w-[20px] h-5 px-1.5 rounded-full text-white text-[11px] font-bold tabular-nums flex items-center justify-center shrink-0 ${
                                isMuted ? 'bg-slate-400 dark:bg-slate-600' : 'bg-teal-700'
                              }`}
                            >
                              {unread > 99 ? '99+' : unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="hidden group-hover:flex focus-within:flex items-center gap-0.5 pr-2.5 shrink-0">
                      {!isArchived && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void togglePinChat(currentUser.uid, pinnedChatIds, chat.id);
                          }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                            isPinned
                              ? 'text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60'
                              : 'text-slate-400 hover:text-teal-700 dark:hover:text-teal-400 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                          }`}
                          title={isPinned ? 'Unpin chat' : 'Pin chat'}
                          aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                        >
                          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleArchiveChat(
                            currentUser.uid,
                            archivedChatIds,
                            pinnedChatIds,
                            chat.id
                          );
                          if (!isArchived && activeChatId === chat.id) {
                            setActiveChatId(null);
                          }
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                        title={isArchived ? 'Unarchive chat' : 'Archive chat'}
                        aria-label={isArchived ? 'Unarchive chat' : 'Archive chat'}
                      >
                        {isArchived ? (
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        ) : (
                          <Archive className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatPendingDelete(chat);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                        title={
                          chat.type === 'group' && chat.createdBy === currentUser.uid
                            ? 'Delete group'
                            : 'Delete chat'
                        }
                        aria-label={
                          chat.type === 'group' && chat.createdBy === currentUser.uid
                            ? 'Delete group'
                            : 'Delete chat'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Sidebar Footer: App Users & PWA Install */}
        <div className="hidden md:flex items-center justify-between gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 min-w-0">
            <Users className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
            <span className="font-semibold tabular-nums">{totalAppUsers}</span>
            <span className="text-slate-500 dark:text-slate-400 truncate">
              users · {onlineFriendsCount} online
            </span>
          </div>
          <PWAInstallButton compact />
        </div>

        {/* Mobile Bottom Tab Bar (natural thumb zone, compact 56px <= 15% cap) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => setMobileTab('chats')}
            className={`relative h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              mobileTab === 'chats'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {totalUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-teal-700 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </span>
              )}
            </div>
            <span>Chats</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('status')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              mobileTab === 'status'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            <span>Status</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('secrets')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              mobileTab === 'secrets'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <EyeOff className="w-5 h-5" />
            <span>Secrets</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('people')}
            className={`h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
              mobileTab === 'people'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Friends</span>
          </button>
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
          >
            <Settings className="w-5 h-5" />
            <span>Profile</span>
          </button>
        </nav>
      </aside>

      {/* RIGHT MAIN CHAT AREA */}
      <main
        className={`${
          activeChat ? 'flex' : 'hidden md:flex'
        } flex-1 flex-col min-w-0 bg-[#F7F8FA] dark:bg-[#0B0F17]`}
      >
        {bannerError && (
          <div
            role="alert"
            className="px-4 py-2.5 bg-rose-600 text-white text-xs font-medium flex items-center justify-between gap-3 shrink-0"
          >
            <span>{bannerError}</span>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              className="underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {!activeChat || !activeMeta ? (
          <div
            className={`flex-1 wallpaper-${welcomeWallpaperId} flex flex-col items-center justify-center p-6 sm:p-8 text-center`}
          >
            <div className="max-w-md w-full rounded-3xl bg-white/92 dark:bg-slate-900/92 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 p-7 sm:p-8 shadow-sm space-y-5">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 flex items-center justify-center">
                <img src="/pwa-192x192.png" alt="Sanvad" className="w-14 h-14 rounded-xl object-cover shadow-xs" />
              </div>
              <div className="space-y-2">
                <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white [text-wrap:balance]">
                  Welcome to Sanvad, {currentUser.displayName}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Message friends, start Google Meet calls, share photos,
                  customize wallpapers, and vote on live polls.
                </p>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200/60 dark:border-teal-800/60 text-xs font-medium text-teal-800 dark:text-teal-200">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {totalAppUsers} {totalAppUsers === 1 ? 'user' : 'users'} on Sanvad ·{' '}
                    {onlineFriendsCount} online now
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewChat({ open: true, tab: 'direct' })}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold cursor-pointer"
                >
                  Start Chat
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewChat({ open: true, tab: 'group' })}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold cursor-pointer"
                >
                  Create Group
                </button>
                <button
                  type="button"
                  onClick={() => setShowWallpaperModal(true)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Palette className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>Wallpapers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTutorialModal(true)}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>App Guide &amp; Install</span>
                </button>
                <PWAInstallButton />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Top Bar (56px) */}
            <header className="h-14 px-3 sm:px-5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveChatId(null)}
                  className="md:hidden min-w-[38px] min-h-[38px] -ml-1 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowInfoDrawer(true)}
                  className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                >
                  <Avatar
                    src={activeMeta.photoUrl}
                    name={activeMeta.title}
                    size="sm"
                    isGroup={activeMeta.isGroup}
                    isOnline={activeMeta.isOnline}
                    showPresence={!activeMeta.isGroup}
                  />
                  <div className="min-w-0">
                    <h2 className="font-display text-sm sm:text-base font-bold truncate leading-tight flex items-center gap-1.5">
                      {activeMeta.isBot && (
                        <Bot
                          className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0"
                          aria-label="AI Bot"
                        />
                      )}
                      <span className="truncate">{activeMeta.title}</span>
                      {isActiveChatMuted && (
                        <BellOff
                          className="w-3.5 h-3.5 text-slate-400 shrink-0"
                          aria-label="Muted"
                        />
                      )}
                      {(activeChat.disappearingSeconds ?? 0) > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[10px] font-semibold shrink-0"
                          title="Disappearing messages enabled"
                        >
                          <Timer className="w-3 h-3" />
                          <span>
                            {activeChat.disappearingSeconds === 86400
                              ? '24h'
                              : activeChat.disappearingSeconds === 604800
                              ? '7d'
                              : '30d'}
                          </span>
                        </span>
                      )}
                    </h2>
                    <p
                      className={`text-xs truncate ${
                        isActiveBotThinking
                          ? 'text-teal-600 dark:text-teal-400 font-medium animate-pulse'
                          : activeTypers.length > 0 || activeMeta.isOnline
                          ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isActiveBotThinking
                        ? 'AI is thinking...'
                        : activeTypers.length > 0
                        ? activeTypers.length === 1
                          ? `${activeTypers[0].displayName} is typing...`
                          : `${activeTypers.map((t) => t.displayName).slice(0, 2).join(', ')} typing...`
                        : activeMeta.subtitle}
                    </p>
                  </div>
                </button>
              </div>

              <div className="relative flex items-center gap-1 shrink-0">
                {activeChat.type === 'direct' && activeOtherUid && !isActiveBotChat && (
                  <>
                    <button
                      type="button"
                      disabled={isActiveChatBlocked}
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setActiveCall({
                          mode: 'outgoing',
                          chatId: activeChat.id,
                          callType: 'audio',
                          peer: {
                            uid: activeOtherUid,
                            displayName: activeMeta.title,
                            photoUrl: activeMeta.photoUrl,
                          },
                        });
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      title="Voice Call (P2P)"
                      aria-label="Start voice call"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={isActiveChatBlocked}
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setActiveCall({
                          mode: 'outgoing',
                          chatId: activeChat.id,
                          callType: 'video',
                          peer: {
                            uid: activeOtherUid,
                            displayName: activeMeta.title,
                            photoUrl: activeMeta.photoUrl,
                          },
                        });
                      }}
                      className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl sanvad-accent-text hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                      title="Video Call (P2P)"
                      aria-label="Start video call"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                  </>
                )}

                {activeChat.type === 'group' &&
                  liveGroupScreenShares[activeChat.id] &&
                  liveGroupScreenShares[activeChat.id].callerId !== currentUser.uid && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setActiveScreenShare({
                          mode: 'incoming',
                          session: liveGroupScreenShares[activeChat.id],
                          autoAccept: true,
                        });
                      }}
                      className="h-9 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                      title={`Watch ${liveGroupScreenShares[activeChat.id].callerName}'s live screen`}
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span>Live Screen</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    setShowMobileExtras(false);
                    setShowEmojiPicker(false);
                    setShowHeaderMenu((o) => !o);
                  }}
                  className={`relative min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
                    showHeaderMenu
                      ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Chat options & tools"
                  aria-label="Chat options & tools"
                  aria-expanded={showHeaderMenu}
                >
                  <MoreVertical className="w-5 h-5" />
                  {activeChat.type === 'group' && openChecklistCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full sanvad-accent-bg ring-2 ring-white dark:ring-slate-900" />
                  )}
                </button>

                {showHeaderMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setShowHeaderMenu(false)}
                      aria-hidden="true"
                    />
                    <div
                      role="menu"
                      aria-label="Chat options"
                      className="absolute top-full right-0 mt-2 w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-40"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setInChatSearchOpen((o) => !o);
                          setInChatSearchQuery('');
                          setInChatMatchIdx(0);
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className="flex-1">
                          {inChatSearchOpen ? 'Close Search' : 'Search in Chat'}
                        </span>
                      </button>

                      {((activeChat.type === 'direct' && activeOtherUid && !isActiveBotChat) ||
                        activeChat.type === 'group') && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={
                            (activeChat.type === 'direct' && isActiveChatBlocked) ||
                            Boolean(activeScreenShare)
                          }
                          onClick={() => {
                            setShowHeaderMenu(false);
                            if (activeChat.type === 'direct' && activeOtherUid) {
                              setActiveScreenShare({
                                mode: 'outgoing',
                                chatId: activeChat.id,
                                isGroup: false,
                                visibleToUids: [currentUser.uid, activeOtherUid],
                                target: {
                                  uid: activeOtherUid,
                                  displayName: activeMeta.title,
                                  photoUrl: activeMeta.photoUrl,
                                },
                              });
                            } else if (activeChat.type === 'group') {
                              setActiveScreenShare({
                                mode: 'outgoing',
                                chatId: activeChat.id,
                                isGroup: true,
                                visibleToUids: activeChat.memberUids,
                                target: {
                                  uid: 'group',
                                  displayName: activeMeta.title,
                                  photoUrl: activeMeta.photoUrl,
                                },
                              });
                            }
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                        >
                          <MonitorUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="flex-1">Share Screen (P2P)</span>
                        </button>
                      )}

                      {!isActiveBotChat && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            setShowMeetModal(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                        >
                          <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="flex-1">Google Meet Call</span>
                        </button>
                      )}

                      {!isActiveBotChat && (
                        <>
                          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              setShowMiniGameModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                          >
                            <Gamepad2 className="w-4 h-4 sanvad-accent-text shrink-0" />
                            <span className="flex-1">Mini Games</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              setShowLeaderboardModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                          >
                            <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                            <span className="flex-1">Game Leaderboard</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowHeaderMenu(false);
                              setShowPollModal(true);
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                          >
                            <BarChart3 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                            <span className="flex-1">Create Poll</span>
                          </button>
                        </>
                      )}

                      {activeChat.type === 'group' && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowHeaderMenu(false);
                            setShowChecklistModal(true);
                          }}
                          className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                        >
                          <ListChecks className="w-4 h-4 sanvad-accent-text shrink-0" />
                          <span className="flex-1">Trip Checklist</span>
                          {openChecklistCount > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full sanvad-accent-bg text-[10px] font-bold tabular-nums flex items-center justify-center">
                              {openChecklistCount}
                            </span>
                          )}
                        </button>
                      )}

                      <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowWallpaperModal(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Palette className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className="flex-1">Chat Wallpaper</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setShowHeaderMenu(false);
                          setShowInfoDrawer(true);
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className="flex-1">Chat Info &amp; Settings</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </header>

            {inChatSearchOpen && (
              <div className="px-3 sm:px-5 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={inChatSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setInChatSearchQuery(val);
                    setInChatMatchIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      navigateInChatSearch('next');
                    } else if (e.key === 'Escape') {
                      setInChatSearchOpen(false);
                      setInChatSearchQuery('');
                    }
                  }}
                  placeholder="Search messages in this chat..."
                  className="flex-1 min-h-[36px] bg-transparent text-sm focus:outline-none"
                />
                {inChatSearchQuery.trim() && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {inChatMatches.length > 0
                      ? `${Math.min(inChatMatchIdx + 1, inChatMatches.length)} / ${inChatMatches.length}`
                      : '0 / 0'}
                  </span>
                )}
                <button
                  type="button"
                  disabled={inChatMatches.length === 0}
                  onClick={() => navigateInChatSearch('prev')}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  aria-label="Previous match"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={inChatMatches.length === 0}
                  onClick={() => navigateInChatSearch('next')}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  aria-label="Next match"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInChatSearchOpen(false);
                    setInChatSearchQuery('');
                  }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                  aria-label="Close chat search"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {activeChat.pinnedMessageId && (
              <div className="px-3 sm:px-5 py-2 bg-teal-50/90 dark:bg-teal-950/40 border-b border-teal-200/70 dark:border-teal-800/50 flex items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeChat.pinnedMessageId) {
                      handleJumpToMessage(activeChat.pinnedMessageId);
                    }
                  }}
                  className="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-lg bg-teal-600/15 dark:bg-teal-400/15 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                    <Pin className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-teal-800 dark:text-teal-300 truncate">
                      Pinned · {activeChat.pinnedMessageSender || 'Message'}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
                      {activeChat.pinnedMessagePreview || 'Pinned message'}
                    </p>
                  </div>
                </button>
                {canPinActiveMessages && (
                  <button
                    type="button"
                    onClick={() => void unpinMessageInChat(activeChat.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-teal-100/70 dark:hover:bg-teal-900/50 cursor-pointer shrink-0"
                    title="Unpin message"
                    aria-label="Unpin message"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Message Feed with Custom Wallpaper */}
            <div
              ref={feedScrollRef}
              onClick={() => {
                if (showHeaderMenu) setShowHeaderMenu(false);
                if (showMobileExtras) setShowMobileExtras(false);
                if (showEmojiPicker) setShowEmojiPicker(false);
              }}
              onScroll={(e) => {
                if (e.currentTarget.scrollTop < 60 && hasMoreMessages && !loadingOlderMessages) {
                  handleLoadOlderMessages();
                }
              }}
              className={`flex-1 overflow-y-auto chat-scroll wallpaper-${activeWallpaperId} px-3 sm:px-6 py-4 space-y-3`}
            >
              {hasMoreMessages && (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    disabled={loadingOlderMessages}
                    onClick={handleLoadOlderMessages}
                    className="min-h-[34px] px-3.5 py-1 rounded-full bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-white dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {loadingOlderMessages ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Loading older messages...</span>
                      </>
                    ) : (
                      <span>Load older messages</span>
                    )}
                  </button>
                </div>
              )}
              {visibleMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-12 space-y-2 text-slate-500 dark:text-slate-400">
                  <div className="rounded-2xl bg-white/85 dark:bg-slate-900/80 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800 px-6 py-5 shadow-xs space-y-1.5">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      No messages yet
                    </p>
                    <p className="text-xs max-w-xs">
                      Say hello, @mention a friend, share a photo, attach a file, or create a poll!
                    </p>
                  </div>
                </div>
              ) : (
                visibleMessages.map((msg, idx) => {
                  const prev = idx > 0 ? visibleMessages[idx - 1] : null;
                  const currDay = formatDayDivider(msg.createdAt);
                  const prevDay = prev ? formatDayDivider(prev.createdAt) : null;
                  const showDayDivider = currDay !== prevDay;
                  const showSenderHeader = !prev || prev.senderId !== msg.senderId || showDayDivider;

                  return (
                    <React.Fragment key={msg.id}>
                      {showDayDivider && (
                        <div className="py-2.5 flex items-center gap-3">
                          <span className="flex-1 h-px bg-slate-200/80 dark:bg-slate-800" />
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {currDay}
                          </span>
                          <span className="flex-1 h-px bg-slate-200/80 dark:bg-slate-800" />
                        </div>
                      )}
                      <MessageBubble
                        message={{
                          ...msg,
                          text: decryptedCache[msg.id] || (msg.text.startsWith('ENC:') ? '🔒 [Encrypted Message]' : msg.text),
                        }}
                        chat={activeChat}
                        currentUid={currentUser.uid}
                        currentUserName={currentUser.displayName}
                        currentUserHandle={currentUser.handle}
                        senderProfile={resolvedPublicUsers[msg.senderId]}
                        memberProfiles={resolvedPublicUsers}
                        showSenderHeader={showSenderHeader}
                        isHighlighted={highlightedMsgId === msg.id}
                        isStarred={starredIdSet.has(msg.id)}
                        isPinned={activeChat.pinnedMessageId === msg.id}
                        canPin={canPinActiveMessages}
                        searchQuery={inChatSearchOpen ? inChatSearchQuery : ''}
                        readReceiptsEnabled={readReceiptsEnabled}
                        isActionMenuOpen={activeMessageActionId === msg.id}
                        onOpenActionMenu={() => setActiveMessageActionId(msg.id)}
                        onToggleActionMenu={() =>
                          setActiveMessageActionId((prev) => (prev === msg.id ? null : msg.id))
                        }
                        onCloseActionMenu={() => setActiveMessageActionId(null)}
                        onImageClick={(url, caption) =>
                          setLightboxImage({ url, caption, viewOnce: false })
                        }
                        onOpenViewOnce={(m) => {
                          if (
                            m.senderId !== currentUser.uid &&
                            !(m.viewedBy || []).includes(currentUser.uid)
                          ) {
                            void markViewOncePhotoViewed(activeChat.id, m.id, currentUser.uid);
                          }
                          if (m.imageData) {
                            setLightboxImage({
                              url: m.imageData,
                              caption: m.text || 'View-once photo',
                              viewOnce: true,
                            });
                          }
                        }}
                        onPinToggle={(m) => {
                          if (activeChat.pinnedMessageId === m.id) {
                            void unpinMessageInChat(activeChat.id);
                          } else {
                            void pinMessageInChat(activeChat.id, currentUser.uid, m);
                          }
                        }}
                        onShowInfo={(m) => setInfoMessage(m)}
                        onReact={(id, currEmoji, nextEmoji) =>
                          void toggleMessageReaction(
                            activeChat.id,
                            id,
                            currentUser.uid,
                            currEmoji,
                            nextEmoji
                          )
                        }
                        onReply={handleStartReply}
                        onForward={(m) => setForwardingMessage(m)}
                        onToggleStar={(m) =>
                          void toggleStarMessage(
                            currentUser.uid,
                            activeMeta.title,
                            m,
                            starredIdSet.has(m.id)
                          )
                        }
                        onJumpToMessage={handleJumpToMessage}
                        onEdit={async (id, type, newText) => {
                          const mentioned = extractMentionedUids(newText, activeMembers);
                          await editOwnMessage(activeChat.id, id, type, newText, mentioned);
                        }}
                        onDelete={(id) => void deleteOwnMessage(activeChat.id, id)}
                      />
                    </React.Fragment>
                  );
                })
              )}

              {isActiveBotThinking && (
                <div className="flex items-end gap-2 pt-1">
                  <Avatar
                    src={BAATCHEET_AI_PUBLIC_PROFILE.photoUrl}
                    name={BAATCHEET_AI_NAME}
                    size="sm"
                    isOnline
                    showPresence
                  />
                  <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 shadow-xs flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-300">
                    <Bot className="w-3.5 h-3.5 shrink-0" />
                    <span>AI is thinking...</span>
                    <span className="inline-flex gap-0.5 items-center ml-0.5" aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}

              {activeTypers.length > 0 && (
                <div className="flex items-center gap-2 pt-1 text-xs font-medium text-teal-700 dark:text-teal-400">
                  <span className="inline-flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 px-3 py-1.5 rounded-2xl shadow-xs">
                    <span>
                      {activeTypers.length === 1
                        ? `${activeTypers[0].displayName} is typing`
                        : `${activeTypers.map((t) => t.displayName).slice(0, 2).join(', ')} are typing`}
                    </span>
                    <span className="inline-flex gap-0.5 items-center ml-1" aria-hidden="true">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 dark:bg-teal-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </span>
                </div>
              )}

              {isActiveBotChat && visibleMessages.length <= 1 && !isActiveBotThinking && (
                <div className="pt-2 flex flex-wrap gap-2">
                  {BAATCHEET_AI_STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={sendingText}
                      onClick={() => void handleSendText(undefined, prompt)}
                      className="px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-800/95 border border-teal-200/80 dark:border-teal-800/70 hover:bg-teal-50 dark:hover:bg-teal-950/60 text-xs font-medium text-teal-800 dark:text-teal-200 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quoted Reply Preview Bar */}
            {activeReplyPayload && (
              <div className="px-3 sm:px-5 py-2 bg-slate-50 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex-1 min-w-0 pl-3 border-l-[3px] border-teal-600 dark:border-teal-400">
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-1.5 truncate">
                    <Reply className="w-3.5 h-3.5 shrink-0" />
                    <span>Replying to {activeReplyPayload.senderName}</span>
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
                    {activeReplyPayload.type === 'image' && !activeReplyPayload.previewText
                      ? 'Shared a photo'
                      : activeReplyPayload.type === 'meet' && !activeReplyPayload.previewText
                      ? 'Google Meet video call'
                      : activeReplyPayload.previewText}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Cancel reply"
                  aria-label="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Bottom Composer (Thumb Zone) */}
            {isActiveChatBlocked && activeOtherUid ? (
              <div className="px-4 py-3 bg-slate-100 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2 min-w-0">
                  <Ban className="w-4 h-4 text-rose-500 shrink-0" />
                  <span className="truncate">
                    You blocked {activeMeta.title}. Unblock to send messages.
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void toggleBlockUser(currentUser.uid, blockedUids, activeOtherUid)}
                  className="min-h-[38px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Unblock
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => void handleSendText(e)}
                className="relative px-3 sm:px-5 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-end gap-1.5 sm:gap-2 shrink-0"
              >
                {!isRecordingVoice && (
                  <>
                    <MentionSuggestions
                      members={mentionCandidates}
                      activeIndex={mentionIndex}
                      onSelect={insertMention}
                    />

                    {showEmojiPicker && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setShowEmojiPicker(false)}
                          aria-hidden="true"
                        />
                        <div className="absolute bottom-full left-3 sm:left-5 mb-2 p-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl grid grid-cols-8 gap-1 z-30">
                          {COMPOSER_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                handleDraftChange(`${draftText}${emoji}`);
                                composerRef.current?.focus();
                              }}
                              className="w-9 h-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-lg cursor-pointer transition-transform active:scale-90"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => void handlePickPhoto(e)}
                      className="hidden"
                    />
                    <input
                      ref={fileAttachmentInputRef}
                      type="file"
                      accept=".pdf,.txt,.doc,.docx,.csv,.json,.zip,application/pdf,text/plain"
                      onChange={(e) => void handlePickFile(e)}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowMobileExtras(false);
                        setShowEmojiPicker((o) => !o);
                      }}
                      className={`min-w-[40px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer shrink-0 ${
                        showEmojiPicker
                          ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-400'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Emoji"
                      aria-label="Toggle emoji picker"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    {showMobileExtras && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setShowMobileExtras(false)}
                          aria-hidden="true"
                        />
                        <div
                          role="menu"
                          aria-label="Chat attachments and tools"
                          className="absolute bottom-full left-3 sm:left-5 mb-2 p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl grid grid-cols-2 gap-1.5 z-30 min-w-[260px]"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setShowMobileExtras(false);
                              photoInputRef.current?.click();
                            }}
                            className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <ImageIcon className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span>Photos</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowMobileExtras(false);
                              setShowCameraModal(true);
                            }}
                            className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                            <span>Camera</span>
                          </button>
                          <button
                            type="button"
                            disabled={sendingFile}
                            onClick={() => {
                              setShowMobileExtras(false);
                              fileAttachmentInputRef.current?.click();
                            }}
                            className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            <Paperclip className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                            <span>Attach File</span>
                          </button>
                          {!isActiveBotChat && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMobileExtras(false);
                                  setShowMiniGameModal(true);
                                }}
                                className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <Gamepad2 className="w-4 h-4 sanvad-accent-text shrink-0" />
                                <span>Mini Games</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMobileExtras(false);
                                  setShowLeaderboardModal(true);
                                }}
                                className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
                                <span>Leaderboard</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMobileExtras(false);
                                  setShowPollModal(true);
                                }}
                                className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <BarChart3 className="w-4 h-4 sanvad-accent-text shrink-0" />
                                <span>Create Poll</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMobileExtras(false);
                                  setShowMeetModal(true);
                                }}
                                className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                <Video className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Google Meet</span>
                              </button>
                            </>
                          )}
                          {activeChat.type === 'group' && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowMobileExtras(false);
                                setShowChecklistModal(true);
                              }}
                              className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <ListChecks className="w-4 h-4 sanvad-accent-text shrink-0" />
                              <span className="truncate">Trip Checklist</span>
                            </button>
                          )}
                          {activeMembers.length > 1 && !isActiveBotChat && (
                            <button
                              type="button"
                              onClick={() => {
                                setShowMobileExtras(false);
                                const needsSpace = draftText.length > 0 && !/\s$/.test(draftText);
                                handleDraftChange(`${draftText}${needsSpace ? ' ' : ''}@`);
                                composerRef.current?.focus();
                              }}
                              className="min-h-[42px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              <AtSign className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                              <span>Mention (@)</span>
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowHeaderMenu(false);
                        setShowEmojiPicker(false);
                        setShowMobileExtras((v) => !v);
                      }}
                      className={`min-w-[40px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors cursor-pointer shrink-0 ${
                        showMobileExtras
                          ? 'bg-teal-50 dark:bg-teal-950/50 sanvad-accent-text'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="All tools (Photo, Camera, File, Games, Poll, Meet)"
                      aria-label="Open composer tools"
                      aria-expanded={showMobileExtras}
                    >
                      <Plus className={`w-5 h-5 transition-transform ${showMobileExtras ? 'rotate-45' : ''}`} />
                    </button>

                    <textarea
                      ref={composerRef}
                      rows={1}
                      maxLength={LIMITS.MESSAGE_TEXT_MAX}
                      value={draftText}
                      onFocus={() => {
                        setShowHeaderMenu(false);
                        setShowEmojiPicker(false);
                        setShowMobileExtras(false);
                      }}
                      onChange={(e) => handleDraftChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (mentionCandidates.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setMentionIndex((i) => (i + 1) % mentionCandidates.length);
                            return;
                          }
                          if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setMentionIndex(
                              (i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length
                            );
                            return;
                          }
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            e.preventDefault();
                            const chosen = mentionCandidates[mentionIndex] || mentionCandidates[0];
                            if (chosen) insertMention(chosen);
                            return;
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setMentionDismissed(true);
                            return;
                          }
                        }

                        if (e.key === 'Escape' && replyingTo) {
                          e.preventDefault();
                          setReplyingTo(null);
                          return;
                        }

                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendText();
                        }
                      }}
                      placeholder={
                        isActiveBotChat
                          ? 'Ask BaatCheet AI anything (English, Hindi, Hinglish)...'
                          : 'Type a message or @mention...'
                      }
                      className="flex-1 min-h-[44px] max-h-32 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </>
                )}

                {!draftText.trim() && (
                  <VoiceRecorderButton
                    disabled={sendingText}
                    onRecordingChange={setIsRecordingVoice}
                    onError={(msg) => setBannerError(msg)}
                    onSendVoice={async (audioData, durationSec) => {
                      const replySnapshot = replyingTo
                        ? buildMessageReply(
                            replyingTo,
                            publicUsers[replyingTo.senderId]?.displayName || replyingTo.senderName
                          )
                        : null;
                      await sendVoiceMessage(
                        activeChat,
                        currentUser,
                        audioData,
                        durationSec,
                        replySnapshot
                      );
                      playSendMessageSound();
                      setReplyingTo(null);
                    }}
                  />
                )}

                {!isRecordingVoice && draftText.trim() && (
                  <button
                    type="submit"
                    disabled={sendingText}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl sanvad-accent-bg disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                    title="Send message"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </main>

      {/* Modals & Drawers */}
      {showNewChat.open && (
        <NewChatModal
          initialTab={showNewChat.tab}
          currentUid={currentUser.uid}
          directoryUsers={directoryList}
          onChatOpened={(chatId) => {
            void restoreDeletedChatVisibility(currentUser.uid, chatId, currentUser.deletedChats);
            setActiveChatId(chatId);
          }}
          onClose={() => setShowNewChat({ open: false, tab: 'direct' })}
        />
      )}

      {showPollModal && activeChat && (
        <CreatePollModal
          onClose={() => setShowPollModal(false)}
          onSubmit={async (question, options) => {
            await createPollMessage(activeChat, currentUser, question, options);
            playSendMessageSound();
          }}
        />
      )}

      {pendingPhotos.length > 0 && activeChat && (
        <PhotoComposerModal
          images={pendingPhotos}
          replyPreview={activeReplyPayload}
          onClearReply={() => setReplyingTo(null)}
          onUpdateImages={setPendingPhotos}
          onClose={() => setPendingPhotos([])}
          onSend={async (images, caption, viewOnce) => {
            const mentionedUids = extractMentionedUids(caption, activeMembers);
            const replySnapshot = replyingTo
              ? buildMessageReply(
                  replyingTo,
                  publicUsers[replyingTo.senderId]?.displayName || replyingTo.senderName
                )
              : null;
            for (let i = 0; i < images.length; i++) {
              await sendPhotoMessage(
                activeChat,
                currentUser,
                images[i],
                i === 0 ? caption : '',
                i === 0 ? mentionedUids : [],
                i === 0 ? replySnapshot : null,
                viewOnce
              );
            }
            playSendMessageSound();
            setReplyingTo(null);
            if (isBaatCheetAIChat(activeChat) && !viewOnce && images[0]) {
              void triggerBotReply(
                activeChat,
                caption.trim() || 'Please look at this photo and tell me what you see or help with it.',
                images[0]
              );
            }
          }}
        />
      )}

      {showCameraModal && activeChat && (
        <CameraCaptureModal
          onCaptured={(compressedDataUrl) => {
            setShowCameraModal(false);
            setPendingPhotos([compressedDataUrl]);
          }}
          onClose={() => setShowCameraModal(false)}
        />
      )}

      {showMiniGameModal && activeChat && activeMeta && (
        <MiniGameModal
          chat={activeChat}
          chatTitle={activeMeta.title}
          currentUser={{
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            photoUrl: currentUser.photoUrl,
          }}
          members={activeMembers}
          onSendMessage={async (text, mentioned = []) => {
            const parsedMentions = extractMentionedUids(text, activeMembers);
            const combinedMentions = Array.from(new Set([...mentioned, ...parsedMentions]));
            await sendTextMessage(activeChat, currentUser, text, combinedMentions);
            playSendMessageSound();
          }}
          onCreatePoll={async (question, options) => {
            await createPollMessage(activeChat, currentUser, question, options);
            playSendMessageSound();
          }}
          onClose={() => setShowMiniGameModal(false)}
        />
      )}

      {showLeaderboardModal && activeChat && activeMeta && (
        <GameLeaderboardModal
          chat={activeChat}
          chatTitle={activeMeta.title}
          currentUid={currentUser.uid}
          members={activeMembers}
          onOpenMiniGames={() => setShowMiniGameModal(true)}
          onShareLeaderboard={async (summaryText) => {
            await sendTextMessage(activeChat, currentUser, summaryText);
            playSendMessageSound();
          }}
          onClose={() => setShowLeaderboardModal(false)}
        />
      )}

      {showChecklistModal && activeChat && activeChat.type === 'group' && (
        <GroupChecklistModal
          chat={activeChat}
          currentUser={{ uid: currentUser.uid, displayName: currentUser.displayName }}
          members={activeMembers}
          items={checklistItems}
          onShareSummary={async (summaryText) => {
            await sendTextMessage(activeChat, currentUser, summaryText);
            playSendMessageSound();
          }}
          onClose={() => setShowChecklistModal(false)}
        />
      )}

      {activeCall && (
        <WebRTCCallModal
          callState={activeCall}
          currentUser={{
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            photoUrl: currentUser.photoUrl,
          }}
          onClose={() => setActiveCall(null)}
        />
      )}

      {activeScreenShare && (
        <ScreenShareModal
          shareState={activeScreenShare}
          currentUser={{
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            photoUrl: currentUser.photoUrl,
          }}
          onClose={() => setActiveScreenShare(null)}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          isDark={isDark}
          totalAppUsers={totalAppUsers}
          blockedUsers={blockedUids
            .map((uid) => publicUsers[uid])
            .filter((u): u is PublicUser => Boolean(u))}
          appLockEnabled={appLockEnabled}
          onAppLockChange={(enabled) => {
            setAppLockEnabled(enabled);
            if (!enabled) setIsAppLocked(false);
          }}
          onUnblockUser={(targetUid) => toggleBlockUser(currentUser.uid, blockedUids, targetUid)}
          onToggleTheme={() => setIsDark((d) => !d)}
          onOpenWallpaper={() => setShowWallpaperModal(true)}
          onOpenTutorial={() => setShowTutorialModal(true)}
          onNotificationStateChange={() => setNotifTick((t) => t + 1)}
          onSignOut={handleSignOut}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {showInfoDrawer && activeChat && (
        <ChatInfoDrawer
          chat={activeChat}
          currentUid={currentUser.uid}
          members={activeMembers}
          messages={visibleMessages}
          isPinned={pinnedChatIds.includes(activeChat.id)}
          isArchived={archivedChatIds.includes(activeChat.id)}
          isMuted={isActiveChatMuted}
          isBlocked={isActiveChatBlocked}
          onTogglePin={() => void togglePinChat(currentUser.uid, pinnedChatIds, activeChat.id)}
          onToggleArchive={() => {
            const wasArchived = archivedChatIds.includes(activeChat.id);
            void toggleArchiveChat(currentUser.uid, archivedChatIds, pinnedChatIds, activeChat.id);
            if (!wasArchived) {
              setShowInfoDrawer(false);
              setActiveChatId(null);
            }
          }}
          onToggleMute={() => void toggleMuteChat(currentUser.uid, mutedChatIds, activeChat.id)}
          onToggleBlock={
            activeOtherUid && !isActiveBotChat
              ? () => void toggleBlockUser(currentUser.uid, blockedUids, activeOtherUid)
              : undefined
          }
          onDisappearingChange={(seconds: DisappearingDuration) =>
            setChatDisappearingTimer(activeChat.id, seconds)
          }
          onDeleteChat={() => handleDeleteChat(activeChat)}
          onOpenWallpaper={() => setShowWallpaperModal(true)}
          onOpenMeet={() => setShowMeetModal(true)}
          onOpenChecklist={
            activeChat.type === 'group' ? () => setShowChecklistModal(true) : undefined
          }
          openChecklistCount={openChecklistCount}
          onImageClick={(url, caption) => setLightboxImage({ url, caption, viewOnce: false })}
          onLeftGroup={() => setActiveChatId(null)}
          onClose={() => setShowInfoDrawer(false)}
        />
      )}

      {showMeetModal && activeChat && activeMeta && (
        <GoogleMeetModal
          chat={activeChat}
          chatTitle={activeMeta.title}
          sender={currentUser}
          replyTo={
            replyingTo
              ? buildMessageReply(
                  replyingTo,
                  resolvedPublicUsers[replyingTo.senderId]?.displayName || replyingTo.senderName
                )
              : null
          }
          onSent={() => setReplyingTo(null)}
          onClose={() => setShowMeetModal(false)}
        />
      )}

      {showWallpaperModal && (
        <WallpaperModal
          uid={currentUser.uid}
          activeChatId={activeChat?.id}
          activeChatTitle={activeMeta?.title}
          currentDefaultWallpaper={currentUser.wallpaper || 'default'}
          chatWallpapers={currentUser.chatWallpapers || {}}
          onClose={() => setShowWallpaperModal(false)}
        />
      )}

      {forwardingMessage && activeChat && (
        <ForwardModal
          message={forwardingMessage}
          chats={chats}
          currentChatId={activeChat.id}
          getChatDisplay={getChatDisplay}
          onForward={async (targetIds) => {
            for (const targetId of targetIds) {
              const target = chats.find((c) => c.id === targetId);
              if (target) {
                await forwardMessageToChat(target, currentUser, forwardingMessage);
              }
            }
          }}
          onClose={() => setForwardingMessage(null)}
        />
      )}

      {infoMessage && activeChat && (
        <MessageInfoModal
          message={infoMessage}
          chat={activeChat}
          currentUid={currentUser.uid}
          memberProfiles={resolvedPublicUsers}
          onClose={() => setInfoMessage(null)}
        />
      )}

      {chatPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => !deletingSidebarChat && setChatPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {chatPendingDelete.type === 'group'
                  ? chatPendingDelete.createdBy === currentUser.uid
                    ? 'Delete group permanently?'
                    : 'Leave group?'
                  : 'Delete this chat?'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {chatPendingDelete.type === 'group'
                  ? chatPendingDelete.createdBy === currentUser.uid
                    ? `This will permanently remove "${chatPendingDelete.name}" for all members.`
                    : `You will be removed from "${chatPendingDelete.name}".`
                  : `This clears old messages and removes "${
                      getChatDisplay(chatPendingDelete).title
                    }" from your chat list. It will reappear if they message you again or you start a new chat.`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deletingSidebarChat}
                onClick={() => setChatPendingDelete(null)}
                className="min-h-[38px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingSidebarChat}
                onClick={async () => {
                  setDeletingSidebarChat(true);
                  try {
                    await handleDeleteChat(chatPendingDelete);
                    setChatPendingDelete(null);
                  } catch (err) {
                    setBannerError(err instanceof Error ? err.message : 'Could not delete chat.');
                  } finally {
                    setDeletingSidebarChat(false);
                  }
                }}
                className="min-h-[38px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {deletingSidebarChat
                  ? 'Deleting...'
                  : chatPendingDelete.type === 'group' &&
                    chatPendingDelete.createdBy !== currentUser.uid
                  ? 'Leave Group'
                  : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStatusComposer && (
        <StatusComposerModal
          currentUser={currentUser}
          chats={chats}
          onClose={() => setShowStatusComposer(false)}
        />
      )}

      {viewingStatusIndex !== null && statuses.length > 0 && (
        <StatusViewerModal
          statuses={statuses}
          initialIndex={viewingStatusIndex}
          currentUid={currentUser.uid}
          onMarkViewed={(id, viewers) => void markStatusViewed(id, viewers, currentUser.uid)}
          onDeleteStatus={(id) => deleteStatusUpdate(id)}
          onReplyToStatus={async (ownerUid, _ownerName, messageText, options) => {
            const chatId = await startDirectChat(currentUser.uid, ownerUid);
            await restoreDeletedChatVisibility(currentUser.uid, chatId, currentUser.deletedChats);
            if (options?.openChat !== false) {
              setActiveChatId(chatId);
            }
            const targetChat =
              chats.find((c) => c.id === chatId) ||
              ({ id: chatId, memberUids: [currentUser.uid, ownerUid], type: 'direct' } as Chat);
            await sendTextMessage(targetChat, currentUser, messageText);
          }}
          onClose={() => setViewingStatusIndex(null)}
        />
      )}

      {showStarredModal && (
        <StarredMessagesModal
          starred={starredMessages}
          onOpenMessage={(chatId, messageId) => {
            if (activeChatId === chatId) {
              handleJumpToMessage(messageId);
            } else {
              pendingJumpMsgIdRef.current = messageId;
              setActiveChatId(chatId);
            }
          }}
          onRemoveStar={(starId) => removeStarredMessage(currentUser.uid, starId)}
          onClose={() => setShowStarredModal(false)}
        />
      )}

      {showTutorialModal && (
        <TutorialModal
          userName={currentUser.displayName}
          userHandle={currentUser.handle}
          onNotificationStateChange={() => setNotifTick((t) => t + 1)}
          onClose={() => setShowTutorialModal(false)}
        />
      )}

      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          caption={lightboxImage.caption}
          viewOnce={lightboxImage.viewOnce}
          onClose={() => setLightboxImage(null)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}
