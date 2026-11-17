import React, { useEffect, useState } from 'react';
import { Delete, Lock, LogOut, ShieldCheck } from 'lucide-react';

const LOCK_STORAGE_PREFIX = 'sanvad_pin_hash_';

export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`sanvad:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getStoredAppLockHash(uid: string): string | null {
  try {
    return localStorage.getItem(`${LOCK_STORAGE_PREFIX}${uid}`);
  } catch {
    return null;
  }
}

export function setStoredAppLockHash(uid: string, hash: string): void {
  try {
    localStorage.setItem(`${LOCK_STORAGE_PREFIX}${uid}`, hash);
  } catch {
    // Ignore storage quota errors
  }
}

export function clearStoredAppLockHash(uid: string): void {
  try {
    localStorage.removeItem(`${LOCK_STORAGE_PREFIX}${uid}`);
  } catch {
    // Ignore storage errors
  }
}

interface AppLockScreenProps {
  uid: string;
  userName: string;
  onUnlock: () => void;
  onSignOut: () => Promise<void>;
}

export const AppLockScreen: React.FC<AppLockScreenProps> = ({
  uid,
  userName,
  onUnlock,
  onSignOut,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const verifyPin = async (candidate: string) => {
    if (checking) return;
    const expected = getStoredAppLockHash(uid);
    if (!expected) {
      onUnlock();
      return;
    }
    setChecking(true);
    try {
      const actual = await hashPin(candidate);
      if (actual === expected) {
        setPin('');
        setError(null);
        onUnlock();
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (checking || pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void verifyPin(next);
    }
  };

  const handleBackspace = () => {
    if (checking) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pin, checking]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0B0F17] text-white flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-xs flex flex-col items-center text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-400/30 flex items-center justify-center">
          <Lock className="w-7 h-7 text-teal-400" />
        </div>

        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold">Sanvad is Locked</h1>
          <p className="text-xs text-slate-400">Enter 4-digit PIN for {userName}</p>
        </div>

        {/* PIN dots */}
        <div className="flex items-center gap-4 py-1" aria-label={`Entered ${pin.length} of 4 digits`}>
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  filled
                    ? 'bg-teal-400 border-teal-400 scale-110'
                    : 'border-slate-600 bg-transparent'
                }`}
              />
            );
          })}
        </div>

        <div className="min-h-[20px]">
          {error ? (
            <p className="text-xs font-medium text-rose-400">{error}</p>
          ) : (
            <p className="text-[11px] text-slate-500 flex items-center gap-1 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
              <span>Privacy lock active</span>
            </p>
          )}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-lg font-semibold transition-all cursor-pointer tabular-nums"
            >
              {digit}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-lg font-semibold transition-all cursor-pointer tabular-nums"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Backspace"
            className="h-14 rounded-2xl bg-slate-800/40 hover:bg-slate-700/60 active:scale-95 flex items-center justify-center text-slate-300 transition-all cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={async () => {
            clearStoredAppLockHash(uid);
            await onSignOut();
          }}
          className="pt-2 text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Forgot PIN? Sign out to reset</span>
        </button>
      </div>
    </div>
  );
};
