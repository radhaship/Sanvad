import React, { useState } from 'react';
import {
  BarChart3,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Moon,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { FIREBASE_PROJECT_ID } from '../lib/firebase';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  onSignIn: () => Promise<void>;
  isDark: boolean;
  onToggleTheme: () => void;
  error: string | null;
  onClearError?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onSignIn,
  isDark,
  onToggleTheme,
  error,
  onClearError,
}) => {
  const [loading, setLoading] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isDomainAuthError = Boolean(
    error && (error.includes('not authorized') || error.includes('unauthorized-domain'))
  );

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onSignIn();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F7F8FA] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* 3-Zone Top Bar */}
      <header className="w-full max-w-6xl mx-auto px-5 py-4 flex items-center justify-between gap-6">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <img src="/pwa-192x192.png" alt="Sanvad" className="w-8 h-8 rounded-lg object-cover shadow-xs" />
          <span className="font-display text-lg font-bold tracking-tight">Sanvad</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <PWAInstallButton compact />
          <button
            type="button"
            onClick={onToggleTheme}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8 md:py-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left Hero */}
        <section className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
            Free forever · No subscription · Works like an app
          </p>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.12] [text-wrap:balance]">
            Chat with friends, share photos, and decide together with live polls.
          </h1>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
            Personal 1-on-1 conversations and lively group rooms with instant delivery ticks,
            live online status, custom profile photos, and installable PWA support on Android,
            iPhone, and desktop.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void handleClick()}
              disabled={loading}
              className="min-h-[48px] px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white font-semibold text-sm inline-flex items-center justify-center gap-3 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                />
              </svg>
              <span>{loading ? 'Signing in...' : 'Continue with Google'}</span>
            </button>
            <PWAInstallButton />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-300 max-w-lg space-y-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <span>{error}</span>
                {onClearError && (
                  <button
                    type="button"
                    onClick={onClearError}
                    aria-label="Dismiss sign-in message"
                    className="shrink-0 p-1 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {isDomainAuthError && currentHost && (
                <div className="pt-2 border-t border-rose-200/80 dark:border-rose-800/70 space-y-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-rose-200 dark:border-rose-800 font-mono text-[11px] break-all text-slate-800 dark:text-slate-200">
                      {currentHost}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopyHost()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-semibold hover:bg-rose-100/70 dark:hover:bg-rose-900/40 cursor-pointer"
                    >
                      {copiedHost ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedHost ? 'Copied' : 'Copy Domain'}</span>
                    </button>
                  </div>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 text-rose-800 dark:text-rose-200 hover:opacity-80"
                  >
                    <span>Open Firebase Authorized Domains</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Personal & Group Chats</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Direct 1-on-1 rooms and invite-link groups with real-time online status.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <BarChart3 className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Group Decision Polls</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Create instant polls with live vote counts to finalize plans quickly.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <ImageIcon className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Fast Photo Sharing</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Share compressed photos with captions and update your profile avatar anytime.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Delivery & Read Ticks</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Know when messages are sent, delivered, and seen by your friends.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Preview Card */}
        <section className="lg:col-span-5">
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-teal-700 text-white flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Weekend Goa Trip</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    4 members · 3 online
                  </p>
                </div>
              </div>
              <Lock className="w-4 h-4 text-slate-400" />
            </div>

            <div className="p-5 space-y-4 bg-[#F7F8FA] dark:bg-[#0E1420]">
              <div className="flex flex-col items-start max-w-[85%]">
                <span className="text-[11px] font-medium text-slate-500 mb-1 ml-1">Aarav</span>
                <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 text-sm">
                  Guys, let&apos;s finalize the stay before tonight!
                </div>
              </div>

              <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <p className="text-xs font-medium text-teal-700 dark:text-teal-400">
                  Group Poll · 4 votes
                </p>
                <p className="text-sm font-semibold">Where should we book for Saturday?</p>
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-xl border border-teal-600/40 bg-teal-50/50 dark:bg-teal-950/30 px-3 py-2 flex items-center justify-between text-xs">
                    <span className="font-medium">Beachside Villa (Baga)</span>
                    <span className="font-semibold tabular-nums text-teal-700 dark:text-teal-300">
                      75%
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Boutique Hostel (Anjuna)</span>
                    <span className="tabular-nums">25%</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="rounded-2xl rounded-tr-sm bg-teal-700 text-white px-3.5 py-2.5 text-sm flex items-end gap-2">
                  <span>Villa locked! Sending photos soon</span>
                  <CheckCheck className="w-4 h-4 text-sky-300 shrink-0" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
