import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
        title="Install Sanvad as a free app"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            compact ? 'min-h-[40px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
          }`}
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Install Sanvad on iPhone
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="font-semibold text-teal-700 dark:text-teal-400">1.</span>
                  <span>
                    Tap the <strong className="inline-flex items-center gap-1">Share <Share className="w-3.5 h-3.5 inline" /></strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-semibold text-teal-700 dark:text-teal-400">2.</span>
                  <span>
                    Scroll down and select <strong>Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-semibold text-teal-700 dark:text-teal-400">3.</span>
                  <span>Launch Sanvad free like a native app anytime.</span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
