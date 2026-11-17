import React, { useRef, useState } from 'react';
import {
  Ban,
  Bell,
  BookOpen,
  Camera,
  Check,
  CheckCheck,
  Copy,
  Keyboard,
  Lock,
  LogOut,
  Moon,
  Palette,
  Send,
  Sun,
  Type,
  Users,
  Volume2,
  X,
} from 'lucide-react';
import { compressAvatarImage } from '../lib/imageUtils';
import {
  enableAndRegisterFcmNotifications,
  getCachedDeviceFcmToken,
  getNotificationPermission,
  getPushAlertsEnabled,
  getSendSoundEnabled,
  getSoundAlertsEnabled,
  getTypingSoundEnabled,
  playNotificationChime,
  playSendMessageSound,
  playTypingStartedSound,
  registerFcmDeviceToken,
  setPushAlertsEnabled,
  setSendSoundEnabled,
  setSoundAlertsEnabled,
  setTypingSoundEnabled,
  showMessagePushNotification,
} from '../lib/notifications';
import { LIMITS, sanitizeHandle } from '../lib/validation';
import {
  updateAppearancePreferences,
  updateReadReceiptsPreference,
  updateUserProfile,
} from '../services/chatService';
import type { AccentColorId, FontSizeId, PrivateUser, PublicUser } from '../types/chat';
import { clearStoredAppLockHash, hashPin, setStoredAppLockHash } from './AppLockScreen';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAInstallButton';

const ACCENT_OPTIONS: Array<{ id: AccentColorId; label: string; swatch: string }> = [
  { id: 'teal', label: 'Teal', swatch: '#0f766e' },
  { id: 'indigo', label: 'Indigo', swatch: '#4338ca' },
  { id: 'rose', label: 'Rose', swatch: '#be123c' },
  { id: 'emerald', label: 'Emerald', swatch: '#047857' },
];

const FONT_SIZE_OPTIONS: Array<{ id: FontSizeId; label: string; sample: string }> = [
  { id: 'sm', label: 'Small', sample: '13px' },
  { id: 'md', label: 'Medium', sample: '14px' },
  { id: 'lg', label: 'Large', sample: '16px' },
];

const STATUS_PRESETS = [
  'Available',
  'Busy',
  'At work',
  'In a meeting',
  'Hey there! I am on Sanvad.',
] as const;

interface ProfileModalProps {
  user: PrivateUser;
  isDark: boolean;
  totalAppUsers?: number;
  blockedUsers?: PublicUser[];
  appLockEnabled?: boolean;
  onAppLockChange?: (enabled: boolean) => void;
  onUnblockUser?: (targetUid: string) => Promise<void>;
  onToggleTheme: () => void;
  onOpenWallpaper?: () => void;
  onOpenTutorial?: () => void;
  onNotificationStateChange?: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  isDark,
  totalAppUsers,
  blockedUsers = [],
  appLockEnabled = false,
  onAppLockChange,
  onUnblockUser,
  onToggleTheme,
  onOpenWallpaper,
  onOpenTutorial,
  onNotificationStateChange,
  onSignOut,
  onClose,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [handle, setHandle] = useState(user.handle);
  const [bio, setBio] = useState(user.bio);
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl);
  const [discoverable, setDiscoverable] = useState(user.discoverable);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [permState, setPermState] = useState(getNotificationPermission);
  const [pushOn, setPushOn] = useState(getPushAlertsEnabled);
  const [fcmSyncing, setFcmSyncing] = useState(false);
  const [fcmNote, setFcmNote] = useState<string | null>(null);
  const [deviceTokenReady, setDeviceTokenReady] = useState(() =>
    Boolean(getCachedDeviceFcmToken(user.uid))
  );
  const [soundOn, setSoundOn] = useState(getSoundAlertsEnabled);
  const [typingSoundOn, setTypingSoundOn] = useState(getTypingSoundEnabled);
  const [sendSoundOn, setSendSoundOn] = useState(getSendSoundEnabled);
  const [readReceiptsOn, setReadReceiptsOn] = useState(user.readReceiptsEnabled !== false);
  const [savingReadReceipts, setSavingReadReceipts] = useState(false);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [pinEditorOpen, setPinEditorOpen] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState<AccentColorId>(() => {
    const val = user.accentColor;
    return val === 'indigo' || val === 'rose' || val === 'emerald' ? val : 'teal';
  });
  const [fontSize, setFontSize] = useState<FontSizeId>(() => {
    const val = user.fontSize;
    return val === 'sm' || val === 'lg' ? val : 'md';
  });
  const [savingAppearance, setSavingAppearance] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChangeAppearance = async (nextPrefs: {
    accentColor?: AccentColorId;
    fontSize?: FontSizeId;
  }) => {
    const prevAccent = accentColor;
    const prevSize = fontSize;
    if (nextPrefs.accentColor) {
      setAccentColor(nextPrefs.accentColor);
      document.documentElement.setAttribute('data-accent', nextPrefs.accentColor);
      localStorage.setItem('sanvad_accent', nextPrefs.accentColor);
    }
    if (nextPrefs.fontSize) {
      setFontSize(nextPrefs.fontSize);
      document.documentElement.setAttribute('data-font-size', nextPrefs.fontSize);
      localStorage.setItem('sanvad_font_size', nextPrefs.fontSize);
    }
    setSavingAppearance(true);
    try {
      await updateAppearancePreferences(user.uid, nextPrefs);
    } catch {
      setAccentColor(prevAccent);
      setFontSize(prevSize);
      document.documentElement.setAttribute('data-accent', prevAccent);
      document.documentElement.setAttribute('data-font-size', prevSize);
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinDraft)) {
      setPinError('Enter a 4-digit numeric PIN.');
      return;
    }
    const hashed = await hashPin(pinDraft);
    setStoredAppLockHash(user.uid, hashed);
    setPinDraft('');
    setPinError(null);
    setPinEditorOpen(false);
    onAppLockChange?.(true);
  };

  const handleDisablePin = () => {
    clearStoredAppLockHash(user.uid);
    setPinDraft('');
    setPinError(null);
    setPinEditorOpen(false);
    onAppLockChange?.(false);
  };

  const handleToggleReadReceipts = async () => {
    if (savingReadReceipts) return;
    const prev = readReceiptsOn;
    const next = !prev;
    setReadReceiptsOn(next);
    setPrivacyError(null);
    setSavingReadReceipts(true);
    try {
      await updateReadReceiptsPreference(user.uid, next);
    } catch (err) {
      setReadReceiptsOn(prev);
      setPrivacyError(err instanceof Error ? err.message : 'Failed to update read receipts setting.');
    } finally {
      setSavingReadReceipts(false);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressAvatarImage(file);
      setPhotoUrl(compressed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process profile photo.');
    }
  };

  const handleCopyInvite = async () => {
    const link = `${window.location.origin}/?connect=${encodeURIComponent(user.handle)}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateUserProfile(user.uid, user.handle, {
        displayName,
        handle: sanitizeHandle(handle),
        photoUrl,
        bio,
        discoverable,
      });
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Profile &amp; Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close profile"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto chat-scroll p-5 space-y-5">
          {/* Avatar upload */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar src={photoUrl} name={displayName || user.displayName} size="xl" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-teal-700 hover:bg-teal-800 text-white flex items-center justify-center shadow-md cursor-pointer"
                title="Update profile photo"
                aria-label="Update profile photo"
              >
                <Camera className="w-4 h-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => void handlePhotoSelect(e)}
                className="hidden"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{displayName || user.displayName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
              >
                Change profile photo
              </button>
            </div>
          </div>

          {/* Share Friend Link */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Your Friend Handle: @{user.handle}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Share this link so friends can message you directly.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopyInvite()}
              className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Link'}</span>
            </button>
          </div>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <div>
              <label
                htmlFor="prof-name"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Display Name
              </label>
              <input
                id="prof-name"
                type="text"
                maxLength={LIMITS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="prof-handle"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                Username Handle
              </label>
              <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 focus-within:ring-2 focus-within:ring-teal-600">
                <span className="text-sm text-slate-400 select-none">@</span>
                <input
                  id="prof-handle"
                  type="text"
                  maxLength={LIMITS.HANDLE_MAX}
                  value={handle}
                  onChange={(e) => setHandle(sanitizeHandle(e.target.value))}
                  className="w-full min-h-[44px] pl-1 py-2 bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="prof-bio"
                className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1"
              >
                About / Status
              </label>
              <input
                id="prof-bio"
                type="text"
                maxLength={LIMITS.BIO_MAX}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBio(preset)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                      bio === preset
                        ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-800 dark:text-teal-200'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-800 dark:text-slate-100">
                Private Profile Protection
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Your name and account stay hidden from strangers. Only friends who have your exact
                @handle, Friend Link, or share a group chat with you can see your profile.
              </p>
            </div>

            {error && <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>}
            {success && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{success}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[44px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>

          {/* Privacy */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Privacy
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                    <CheckCheck
                      className={`w-3.5 h-3.5 shrink-0 ${
                        readReceiptsOn ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400'
                      }`}
                    />
                    <span>Read Receipts (Blue Ticks)</span>
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    If turned off, you won&apos;t send or see blue ticks for messages sent and received.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={readReceiptsOn}
                  aria-label="Toggle read receipts"
                  disabled={savingReadReceipts}
                  onClick={() => void handleToggleReadReceipts()}
                  className="min-h-[44px] px-1 flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 rounded-lg"
                >
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      readReceiptsOn
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {readReceiptsOn ? 'On' : 'Off'}
                  </span>
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-150 ${
                      readReceiptsOn
                        ? 'bg-teal-700 dark:bg-teal-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-150 ${
                        readReceiptsOn ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </span>
                </button>
              </div>
              {privacyError && (
                <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 break-words">
                  {privacyError}
                </p>
              )}

              {/* App Lock 4-Digit PIN */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                      <Lock
                        className={`w-3.5 h-3.5 shrink-0 ${
                          appLockEnabled ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400'
                        }`}
                      />
                      <span>App Lock (4-Digit PIN)</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {appLockEnabled
                        ? 'Passcode protection enabled on this device.'
                        : 'Require a 4-digit PIN when opening Sanvad.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPinError(null);
                        setPinDraft('');
                        setPinEditorOpen((v) => !v);
                      }}
                      className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      {appLockEnabled ? 'Change PIN' : 'Set PIN'}
                    </button>
                    {appLockEnabled && (
                      <button
                        type="button"
                        onClick={handleDisablePin}
                        className="min-h-[34px] px-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold cursor-pointer"
                      >
                        Off
                      </button>
                    )}
                  </div>
                </div>

                {pinEditorOpen && (
                  <form onSubmit={(e) => void handleSavePin(e)} className="flex items-center gap-2">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={pinDraft}
                      onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="4-digit PIN"
                      className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm tracking-widest tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                    <button
                      type="submit"
                      className="min-h-[40px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save PIN
                    </button>
                  </form>
                )}
                {pinError && (
                  <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
                    {pinError}
                  </p>
                )}
              </div>

              {/* Blocked Contacts */}
              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                  <Ban className="w-3.5 h-3.5 text-slate-400" />
                  <span>Blocked Contacts ({blockedUsers.length})</span>
                </p>
                {blockedUsers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    You haven&apos;t blocked anyone.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {blockedUsers.map((b) => (
                      <div key={b.uid} className="py-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={b.photoUrl} name={b.displayName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{b.displayName}</p>
                            <p className="text-[11px] text-slate-500 truncate">@{b.handle}</p>
                          </div>
                        </div>
                        {onUnblockUser && (
                          <button
                            type="button"
                            onClick={() => void onUnblockUser(b.uid)}
                            className="min-h-[32px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Unblock
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notifications & Sound Alerts */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Notifications &amp; Sound Alerts
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2.5">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span>Web Push Notifications (FCM)</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {permState === 'granted'
                        ? deviceTokenReady || (user.fcmTokens?.length ?? 0) > 0
                          ? `Synced (${user.fcmTokens?.length || 1} device${
                              (user.fcmTokens?.length || 1) === 1 ? '' : 's'
                            }) · Tap alerts jump straight to chat`
                          : 'Browser alerts active · Tap Sync Token for FCM'
                        : permState === 'denied'
                        ? 'Blocked in browser site settings'
                        : permState === 'unsupported'
                        ? 'Not supported in this browser'
                        : 'Get WhatsApp-style background message alerts'}
                    </p>
                  </div>
                  {permState === 'granted' ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={fcmSyncing}
                        onClick={async () => {
                          setFcmSyncing(true);
                          setFcmNote(null);
                          try {
                            const res = await registerFcmDeviceToken(user.uid);
                            if (res.ok && res.token) {
                              setDeviceTokenReady(true);
                              setFcmNote('FCM device token saved to your profile.');
                            } else {
                              setFcmNote(res.message || 'Could not sync FCM token.');
                            }
                          } finally {
                            setFcmSyncing(false);
                          }
                        }}
                        className="min-h-[32px] px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold cursor-pointer disabled:opacity-60"
                      >
                        {fcmSyncing ? 'Syncing...' : 'Sync Token'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !pushOn;
                          setPushAlertsEnabled(next);
                          setPushOn(next);
                          onNotificationStateChange?.();
                          if (next) {
                            playNotificationChime();
                            void showMessagePushNotification({
                              title: 'Sanvad Push Active',
                              body: 'Notifications are ready with deep-link support.',
                              tag: 'sanvad-test-push',
                            });
                          }
                        }}
                        className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                          pushOn
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {pushOn ? 'On' : 'Paused'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={permState === 'unsupported' || fcmSyncing}
                      onClick={async () => {
                        setFcmSyncing(true);
                        setFcmNote(null);
                        try {
                          const res = await enableAndRegisterFcmNotifications(user.uid);
                          setPermState(res.permission);
                          setPushOn(res.permission === 'granted');
                          onNotificationStateChange?.();
                          if (res.permission === 'granted') {
                            playNotificationChime();
                            if (res.ok && res.token) {
                              setDeviceTokenReady(true);
                              setFcmNote('Notifications enabled & FCM token synced!');
                            } else if (res.message) {
                              setFcmNote(res.message);
                            }
                            void showMessagePushNotification({
                              title: 'Sanvad Alerts Active',
                              body: 'You will now get push notifications for incoming messages.',
                              tag: 'sanvad-test-push',
                            });
                          } else if (res.message) {
                            setFcmNote(res.message);
                          }
                        } finally {
                          setFcmSyncing(false);
                        }
                      }}
                      className="min-h-[36px] px-3 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer shrink-0"
                    >
                      {fcmSyncing ? 'Enabling...' : 'Enable'}
                    </button>
                  )}
                </div>
                {fcmNote && (
                  <p className="text-[11px] text-teal-700 dark:text-teal-300 leading-relaxed">
                    {fcmNote}
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>Message Received Sound</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Chime when a new message arrives
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !soundOn;
                    setSoundAlertsEnabled(next);
                    setSoundOn(next);
                    onNotificationStateChange?.();
                    if (next) playNotificationChime();
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0 ${
                    soundOn
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {soundOn ? 'Sound On' : 'Muted'}
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Keyboard className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>Typing Started Sound</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Subtle audio cue when someone starts typing
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !typingSoundOn;
                    setTypingSoundEnabled(next);
                    setTypingSoundOn(next);
                    onNotificationStateChange?.();
                    if (next) playTypingStartedSound();
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0 ${
                    typingSoundOn
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {typingSoundOn ? 'Sound On' : 'Off'}
                </button>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>Send Message Sound</span>
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Audio feedback when sending a text or file
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !sendSoundOn;
                    setSendSoundEnabled(next);
                    setSendSoundOn(next);
                    onNotificationStateChange?.();
                    if (next) playSendMessageSound();
                  }}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold cursor-pointer shrink-0 ${
                    sendSoundOn
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {sendSoundOn ? 'Sound On' : 'Off'}
                </button>
              </div>
            </div>
          </div>

          {/* Appearance: Accent Color & Text Size */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Chat Theme &amp; Font Size
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3.5">
              <div className="space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                  <Palette className="w-3.5 h-3.5 sanvad-accent-text" />
                  <span>Accent Color</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {ACCENT_OPTIONS.map((opt) => {
                    const selected = accentColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={savingAppearance}
                        onClick={() => void handleChangeAppearance({ accentColor: opt.id })}
                        className={`min-h-[42px] px-2 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          selected
                            ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center text-white"
                          style={{ backgroundColor: opt.swatch }}
                        >
                          {selected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                  <Type className="w-3.5 h-3.5 sanvad-accent-text" />
                  <span>Message Text Size</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {FONT_SIZE_OPTIONS.map((opt) => {
                    const selected = fontSize === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={savingAppearance}
                        onClick={() => void handleChangeAppearance({ fontSize: opt.id })}
                        className={`min-h-[40px] px-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          selected
                            ? 'sanvad-accent-bg border-transparent shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {opt.label} ({opt.sample})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live preview */}
              <div className="pt-2 flex justify-end">
                <div className="sanvad-accent-bg px-3.5 py-2 rounded-2xl rounded-tr-sm max-w-[85%] shadow-xs">
                  <p className="sanvad-msg-text">
                    Namaste! Yeh aapki chat theme aur text size ka live preview hai ✨
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* App Actions: Wallpaper, Theme, Install, Guide, Sign Out */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            {typeof totalAppUsers === 'number' && totalAppUsers > 0 && (
              <div className="px-3.5 py-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/50 flex items-center justify-between text-xs">
                <span className="font-medium text-teal-800 dark:text-teal-200 inline-flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>Total registered users on Sanvad</span>
                </span>
                <span className="font-bold text-teal-900 dark:text-teal-100 tabular-nums">
                  {totalAppUsers}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
              {onOpenWallpaper && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWallpaper();
                  }}
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Palette className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  <span>Wallpapers</span>
                </button>
              )}
              <PWAInstallButton />
            </div>

            {onOpenTutorial && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTutorial();
                }}
                className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 hover:bg-teal-50 dark:hover:bg-teal-950/60 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <BookOpen className="w-4 h-4" />
                <span>App Guide &amp; Mobile Install Tutorial</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void onSignOut()}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
