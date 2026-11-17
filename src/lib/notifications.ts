import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging,
} from 'firebase/messaging';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseApp, handleFirestoreError, OperationType } from './firebase';

const SOUND_KEY = 'sanvad_sound_alerts';
const TYPING_SOUND_KEY = 'sanvad_typing_sound';
const SEND_SOUND_KEY = 'sanvad_send_sound';
const PUSH_KEY = 'sanvad_push_alerts';
const FCM_TOKEN_CACHE_PREFIX = 'sanvad_fcm_token_';
const PUSH_BANNER_DISMISSED_PREFIX = 'sanvad_push_banner_dismissed_';

let audioCtx: AudioContext | null = null;
let cachedMessaging: Messaging | null = null;

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface FcmSyncResult {
  ok: boolean;
  token: string | null;
  reason?:
    | 'unsupported'
    | 'permission-denied'
    | 'missing-vapid'
    | 'sw-unavailable'
    | 'error';
  message?: string;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export function isPushMessagingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getSoundAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(SOUND_KEY);
  return val === null ? true : val === 'true';
}

export function setSoundAlertsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_KEY, enabled ? 'true' : 'false');
}

export function getSendSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(SEND_SOUND_KEY);
  return val === null ? true : val === 'true';
}

export function setSendSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SEND_SOUND_KEY, enabled ? 'true' : 'false');
}

export function getTypingSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(TYPING_SOUND_KEY);
  return val === null ? true : val === 'true';
}

export function setTypingSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TYPING_SOUND_KEY, enabled ? 'true' : 'false');
}

export function getPushAlertsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const val = localStorage.getItem(PUSH_KEY);
  if (val !== null) return val === 'true';
  return getNotificationPermission() === 'granted';
}

export function setPushAlertsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PUSH_KEY, enabled ? 'true' : 'false');
}

export function getCachedDeviceFcmToken(uid: string): string | null {
  if (typeof window === 'undefined' || !uid) return null;
  try {
    return localStorage.getItem(`${FCM_TOKEN_CACHE_PREFIX}${uid}`);
  } catch {
    return null;
  }
}

function setCachedDeviceFcmToken(uid: string, token: string | null): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    const key = `${FCM_TOKEN_CACHE_PREFIX}${uid}`;
    if (token) {
      localStorage.setItem(key, token);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function isPushPromptBannerDismissed(uid: string): boolean {
  if (typeof window === 'undefined' || !uid) return false;
  try {
    return localStorage.getItem(`${PUSH_BANNER_DISMISSED_PREFIX}${uid}`) === 'true';
  } catch {
    return false;
  }
}

export function dismissPushPromptBanner(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    localStorage.setItem(`${PUSH_BANNER_DISMISSED_PREFIX}${uid}`, 'true');
  } catch {
    // Ignore storage errors
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setPushAlertsEnabled(true);
    }
    return result;
  } catch {
    return Notification.permission;
  }
}

async function resolveFcmServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;

    if (existing) {
      const readyOrTimeout = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (readyOrTimeout?.active) return readyOrTimeout;
    }

    // Fallback when VitePWA service worker isn't registered (e.g. dev server)
    const registered = await navigator.serviceWorker.register('/sw-push.js', { scope: '/' });
    if (registered.active) return registered;

    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    return ready || registered;
  } catch {
    return null;
  }
}

async function getMessagingInstance(): Promise<Messaging | null> {
  try {
    const supported = await isSupported();
    if (!supported) return null;
    if (!cachedMessaging) {
      cachedMessaging = getMessaging(firebaseApp);
    }
    return cachedMessaging;
  } catch {
    return null;
  }
}

export async function saveFcmTokenToUserProfile(uid: string, token: string): Promise<void> {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) return;
  const cleanToken = token.trim();
  if (cleanToken.length < 10 || cleanToken.length > 350) return;

  const userRef = doc(db, 'users', uid);
  const path = `users/${uid}`;

  let existingTokens: string[] = [];
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as { fcmTokens?: unknown };
      if (Array.isArray(data.fcmTokens)) {
        existingTokens = data.fcmTokens.filter(
          (t): t is string =>
            typeof t === 'string' && t.length >= 10 && t.length <= 350 && t !== cleanToken
        );
      }
    }
  } catch {
    // Proceed with saving just this device's token
  }

  const merged = [cleanToken, ...existingTokens].slice(0, 10);

  try {
    await updateDoc(userRef, {
      fcmTokens: merged,
      fcmTokenUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setCachedDeviceFcmToken(uid, cleanToken);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeFcmTokenFromUserProfile(uid: string): Promise<void> {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) return;
  const cached = getCachedDeviceFcmToken(uid);
  if (!cached) return;

  const userRef = doc(db, 'users', uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as { fcmTokens?: unknown };
      const existing = Array.isArray(data.fcmTokens)
        ? data.fcmTokens.filter(
            (t): t is string => typeof t === 'string' && t.length >= 10 && t.length <= 350
          )
        : [];
      const remaining = existing.filter((t) => t !== cached);
      await updateDoc(userRef, {
        fcmTokens: remaining,
        fcmTokenUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Non-critical cleanup
  } finally {
    setCachedDeviceFcmToken(uid, null);
  }
}

export async function registerFcmDeviceToken(uid: string): Promise<FcmSyncResult> {
  if (!uid || !auth.currentUser || auth.currentUser.uid !== uid) {
    return { ok: false, token: null, reason: 'error', message: 'Sign in required.' };
  }
  if (!isPushMessagingSupported()) {
    return {
      ok: false,
      token: null,
      reason: 'unsupported',
      message: 'Web Push is not supported in this browser.',
    };
  }
  if (Notification.permission !== 'granted') {
    return {
      ok: false,
      token: null,
      reason: 'permission-denied',
      message: 'Notification permission is not granted yet.',
    };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    return {
      ok: false,
      token: null,
      reason: 'unsupported',
      message: 'Firebase Cloud Messaging is not supported in this browser context.',
    };
  }

  const swReg = await resolveFcmServiceWorkerRegistration();
  if (!swReg) {
    return {
      ok: false,
      token: null,
      reason: 'sw-unavailable',
      message: 'Push service worker could not register in this preview window.',
    };
  }

  const vapidKey = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();

  try {
    const token = await getToken(messaging, {
      ...(vapidKey ? { vapidKey } : {}),
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      return {
        ok: false,
        token: null,
        reason: vapidKey ? 'error' : 'missing-vapid',
        message: vapidKey
          ? 'Could not obtain FCM registration token.'
          : 'Notifications active! Add VITE_FIREBASE_VAPID_KEY to sync Web Push FCM tokens.',
      };
    }

    await saveFcmTokenToUserProfile(uid, token);
    return { ok: true, token };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err || '');
    if (!vapidKey || errMsg.toLowerCase().includes('vapid') || errMsg.includes('messaging/')) {
      return {
        ok: false,
        token: null,
        reason: vapidKey ? 'error' : 'missing-vapid',
        message: vapidKey
          ? `FCM sync failed: ${errMsg}`
          : 'Browser alerts are enabled! Add VITE_FIREBASE_VAPID_KEY in .env to issue closed-app FCM tokens.',
      };
    }
    return {
      ok: false,
      token: null,
      reason: 'error',
      message: errMsg || 'Failed to register FCM token.',
    };
  }
}

export async function enableAndRegisterFcmNotifications(
  uid: string
): Promise<{ permission: NotificationPermissionState } & FcmSyncResult> {
  const permission = await requestBrowserNotificationPermission();
  if (permission !== 'granted') {
    return {
      permission,
      ok: false,
      token: null,
      reason: permission === 'unsupported' ? 'unsupported' : 'permission-denied',
      message:
        permission === 'denied'
          ? 'Notifications blocked in browser settings. Allow notifications via the site lock icon.'
          : permission === 'unsupported'
          ? 'Notifications are not supported in this browser.'
          : 'Notification permission was dismissed.',
    };
  }

  setPushAlertsEnabled(true);
  const syncRes = await registerFcmDeviceToken(uid);
  return { permission, ...syncRes };
}

export function subscribeForegroundFcmMessages(
  onPayload: (payload: MessagePayload) => void
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  void getMessagingInstance().then((messaging) => {
    if (cancelled || !messaging) return;
    unsubscribe = onMessage(messaging, (payload) => {
      onPayload(payload);
    });
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export function syncActiveChatToServiceWorker(chatId: string | null, visible: boolean): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const payload = { type: 'SANVAD_ACTIVE_CHAT', chatId, visible };
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage(payload);
    return;
  }
  void navigator.serviceWorker.getRegistration().then((reg) => {
    reg?.active?.postMessage(payload);
  });
}

export function playNotificationChime(): void {
  if (typeof window === 'undefined' || !getSoundAlertsEnabled()) return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.08, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(660, 0, 0.14);
    playTone(880, 0.09, 0.18);
  } catch {
    // Ignore audio context autoplay blocks silently
  }
}

export function playSendMessageSound(): void {
  if (typeof window === 'undefined' || !getSendSoundEnabled()) return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Short crisp upward pop (~75ms)
    const popOsc = audioCtx.createOscillator();
    const popGain = audioCtx.createGain();
    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(520, now);
    popOsc.frequency.exponentialRampToValueAtTime(980, now + 0.065);
    popGain.gain.setValueAtTime(0.0001, now);
    popGain.gain.exponentialRampToValueAtTime(0.065, now + 0.008);
    popGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    popOsc.connect(popGain);
    popGain.connect(audioCtx.destination);
    popOsc.start(now);
    popOsc.stop(now + 0.085);

    // Subtle crisp overtone snap (~35ms)
    const snapOsc = audioCtx.createOscillator();
    const snapGain = audioCtx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(1320, now);
    snapOsc.frequency.exponentialRampToValueAtTime(1760, now + 0.032);
    snapGain.gain.setValueAtTime(0.0001, now);
    snapGain.gain.exponentialRampToValueAtTime(0.022, now + 0.005);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    snapOsc.connect(snapGain);
    snapGain.connect(audioCtx.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.045);
  } catch {
    // Ignore audio context autoplay blocks silently
  }
}

export function playTypingStartedSound(): void {
  if (typeof window === 'undefined' || !getTypingSoundEnabled()) return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const playSoftTap = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + startOffset + duration);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.01);
    };

    // Subtle soft two-tap bubble cue (~72ms total)
    playSoftTap(380, 0, 0.028, 0.028);
    playSoftTap(510, 0.036, 0.036, 0.034);
  } catch {
    // Ignore audio context autoplay blocks silently
  }
}

function resolveNotificationIcon(icon?: string): string {
  if (!icon || typeof icon !== 'string') return '/pwa-192x192.png';
  const trimmed = icon.trim();
  if (
    (trimmed.startsWith('https://') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('data:image/')) &&
    trimmed.length < 65000
  ) {
    return trimmed;
  }
  return '/pwa-192x192.png';
}

export async function showMessagePushNotification(params: {
  title: string;
  body: string;
  chatId?: string;
  tag?: string;
  icon?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted' || !getPushAlertsEnabled()) return;

  const { title, body, chatId, tag } = params;
  const resolvedIcon = resolveNotificationIcon(params.icon);
  const deepUrl = chatId ? `/?chatId=${encodeURIComponent(chatId)}` : '/';

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: resolvedIcon,
          badge: '/pwa-192x192.png',
          tag: tag || chatId || 'sanvad-message',
          data: { chatId, url: deepUrl },
        });
        return;
      }
    }

    const notif = new Notification(title, {
      body,
      icon: resolvedIcon,
      tag: tag || chatId || 'sanvad-message',
    });
    notif.onclick = () => {
      window.focus();
      if (chatId) {
        window.dispatchEvent(new CustomEvent('sanvad:open-chat', { detail: { chatId } }));
      }
      notif.close();
    };
  } catch {
    // Notification blocked or unsupported in current context
  }
}
