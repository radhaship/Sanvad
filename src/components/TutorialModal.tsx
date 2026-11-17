import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Lock,
  MessageSquare,
  Mic,
  Search,
  Share,
  Smartphone,
  Sparkles,
  Star,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  getNotificationPermission,
  getSoundAlertsEnabled,
  playNotificationChime,
  requestBrowserNotificationPermission,
  setSoundAlertsEnabled,
  showMessagePushNotification,
} from '../lib/notifications';

interface TutorialModalProps {
  userName: string;
  userHandle: string;
  onClose: () => void;
  onNotificationStateChange?: () => void;
}

const TOTAL_STEPS = 5;

export const TutorialModal: React.FC<TutorialModalProps> = ({
  userName,
  userHandle,
  onClose,
  onNotificationStateChange,
}) => {
  const [step, setStep] = useState(0);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [permState, setPermState] = useState(getNotificationPermission);
  const [soundOn, setSoundOn] = useState(getSoundAlertsEnabled);
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  const handleEnableNotifications = async () => {
    setNotifFeedback(null);
    const result = await requestBrowserNotificationPermission();
    setPermState(result);
    onNotificationStateChange?.();
    if (result === 'granted') {
      playNotificationChime();
      await showMessagePushNotification({
        title: 'Sanvad Alerts Active',
        body: 'You will now get alerts for new messages!',
        tag: 'sanvad-test-alert',
      });
      setNotifFeedback('Notifications enabled!');
    } else if (result === 'denied') {
      setNotifFeedback('Blocked in browser settings. Tap the lock icon in your address bar to allow.');
    }
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundAlertsEnabled(next);
    setSoundOn(next);
    onNotificationStateChange?.();
    if (next) playNotificationChime();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/pwa-192x192.png" alt="Sanvad" className="w-8 h-8 rounded-xl shrink-0 object-cover shadow-xs" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Welcome to Sanvad
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Step {step + 1} of {TOTAL_STEPS} · Quick App Guide
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-5 pt-3 flex items-center gap-1.5 shrink-0">
          {[0, 1, 2, 3, 4].map((idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setStep(idx)}
              className={`h-1.5 flex-1 rounded-full transition-colors cursor-pointer ${
                idx <= step ? 'bg-teal-600 dark:bg-teal-400' : 'bg-slate-200 dark:bg-slate-800'
              }`}
              aria-label={`Go to step ${idx + 1}`}
            />
          ))}
        </div>

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto chat-scroll p-5 space-y-4">
          {step === 0 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/70 dark:border-teal-800/60 p-4 space-y-2">
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  Namaste {userName}!
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Sanvad ek fast, private aur real-time messaging app hai — jahan aap doston, groups
                  aur Status stories ke saath bilkul safe tareeke se jud sakte hain.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">100% Private Profile</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Anjaan logon ko aapka naam nahi dikhta. Sirf wahi dost aapse chat kar sakte
                      hain jinke paas aapka exact <strong>@{userHandle}</strong> handle ya Friend
                      Link hai.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Kaise Start Karein?</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Upar <strong>New Chat (+)</strong> icon dabakar dost ka{' '}
                      <strong>@handle</strong> search karein, Group banayein, ya Profile se apna
                      Friend Link share karein.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Sanvad ke Top Features
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Har chat aur status me aapko ye sabhi smart tools milte hain:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">WhatsApp-style Status</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      24-hour photo &amp; colored text stories, view counts &amp; replies.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-2.5">
                  <Mic className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Voice Messages</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mic dabakar bolkar aawaz bhejein (up to 45s).
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-2.5">
                  <Video className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Google Meet Calls</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      1-tap me chat ke andar video call link banayein.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start gap-2.5">
                  <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold">Forward &amp; Starred</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Messages forward karein aur important messages star karke save rakhein.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Mobile me App Install Kaise Karein
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Bina Play Store ke seedhe Home Screen par install karein (bilkul free).
                  </p>
                </div>
              </div>

              {isInstalled ? (
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-3.5 flex items-center gap-2.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Badhai ho! Sanvad aapke device me pehle se installed hai.</span>
                </div>
              ) : isInstallable ? (
                <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-teal-900 dark:text-teal-100">
                      1-Tap Install Ready
                    </p>
                    <p className="text-xs text-teal-700 dark:text-teal-300">
                      Abhi button dabakar Sanvad app install karein.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void install()}
                    className="min-h-[42px] px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install Now</span>
                  </button>
                </div>
              ) : null}

              <div className="space-y-2.5 text-xs">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1.5">
                  <p className="font-bold text-slate-800 dark:text-slate-100">
                    Android Phone (Google Chrome)
                  </p>
                  <ol className="space-y-1 text-slate-600 dark:text-slate-300 list-decimal list-inside">
                    <li>Chrome me upar right side ke <strong>3 dots (⋮)</strong> menu par tap karein.</li>
                    <li><strong>Install app</strong> ya <strong>Add to Home screen</strong> chunein.</li>
                    <li><strong>Install</strong> par click karein — Sanvad icon Home Screen par aa jayega!</li>
                  </ol>
                </div>

                <div
                  className={`rounded-xl border p-3.5 space-y-1.5 ${
                    isIOS
                      ? 'border-teal-400 dark:border-teal-600 bg-teal-50/40 dark:bg-teal-950/20'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <p className="font-bold text-slate-800 dark:text-slate-100">
                    iPhone / iPad (Safari)
                  </p>
                  <ol className="space-y-1 text-slate-600 dark:text-slate-300 list-decimal list-inside">
                    <li>
                      Safari ke niche toolbar me{' '}
                      <strong className="inline-flex items-center gap-1">
                        Share <Share className="w-3.5 h-3.5 inline" />
                      </strong>{' '}
                      button par tap karein.
                    </li>
                    <li>Niche scroll karke <strong>Add to Home Screen</strong> par tap karein.</li>
                    <li>Upar <strong>Add</strong> dabayein — ab Sanvad native app ki tarah khulega!</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Download className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    APK File Kaise Banayein (PWABuilder)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Agar aapko Android APK download karke kisi ko dena hai, to yeh simple step follow karein:
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs">
                <ol className="space-y-2.5 text-slate-700 dark:text-slate-300 list-decimal list-inside">
                  <li>
                    Apne app ka live URL copy karein (jo browser address bar me hai).
                  </li>
                  <li>
                    Apne phone ya computer par{' '}
                    <a
                      href="https://www.pwabuilder.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 dark:text-teal-400 font-bold inline-flex items-center gap-0.5 underline"
                    >
                      <span>pwabuilder.com</span>
                      <ExternalLink className="w-3 h-3 inline" />
                    </a>{' '}
                    website kholein.
                  </li>
                  <li>
                    Wahan URL paste karke <strong>Start</strong> par click karein (yeh aapke PWA manifest ko detect karega).
                  </li>
                  <li>
                    Jab analysis complete ho jaye, to <strong>Generate Android App (.apk)</strong> par click karein aur APK download kar lein!
                  </li>
                </ol>

                <div className="rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 p-3 text-teal-900 dark:text-teal-100">
                  <p className="font-semibold">Pro Tip:</p>
                  <p className="text-[11px] mt-0.5 opacity-90">
                    PWABuilder ek trusted official Microsoft tool hai jo kisi bhi modern PWA ko 2 minute me native Android APK me convert kar deta hai.
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <BellRing className="w-5 h-5" />
                </span>
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    Push Notifications &amp; Sound On Karein
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Naye messages aur @mentions ka turant alert paayein.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Bell className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <span>Push Notifications</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {permState === 'granted'
                        ? 'Enabled! New messages will show pop-up alerts.'
                        : permState === 'denied'
                        ? 'Blocked in browser settings.'
                        : permState === 'unsupported'
                        ? 'Not supported on this browser.'
                        : 'Allow Sanvad to notify you when new messages arrive.'}
                    </p>
                  </div>

                  {permState === 'granted' ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      <span>On</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={permState === 'unsupported'}
                      onClick={() => void handleEnableNotifications()}
                      className="min-h-[40px] px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Enable
                    </button>
                  )}
                </div>

                {notifFeedback && (
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                    {notifFeedback}
                  </p>
                )}

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <Volume2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <span>Message Sound Chime</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Naya message aane par soft chime bajegi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      soundOn
                        ? 'bg-teal-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {soundOn ? 'Sound On' : 'Muted'}
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
                Aap is guide ko kabhi bhi upar ke <strong>Guide (?)</strong> button ya Profile
                settings se dobara khol sakte hain.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-3 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Skip Tour
            </button>
          )}

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1))}
              className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Start Using Sanvad</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
