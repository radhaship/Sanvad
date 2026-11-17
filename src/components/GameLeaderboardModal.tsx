import React, { useEffect, useMemo, useState } from 'react';
import { Award, Flame, Gamepad2, Trophy, X } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type { GameScoreEntry } from '../types/chat';
import { Avatar } from './Avatar';

interface GameLeaderboardModalProps {
  chatId: string;
  chatTitle: string;
  currentUid: string;
  onClose: () => void;
}

export const GameLeaderboardModal: React.FC<GameLeaderboardModalProps> = ({
  chatId,
  chatTitle,
  currentUid,
  onClose,
}) => {
  const [scores, setScores] = useState<GameScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) {
      setLoading(false);
      return;
    }
    const path = 'game_scores';
    const q = query(collection(db, 'game_scores'), where('chatId', '==', chatId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as GameScoreEntry);
        setScores(list);
        setLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [chatId]);

  const leaderboard = useMemo(() => {
    const map = new Map<
      string,
      { uid: string; displayName: string; photoUrl: string; totalPoints: number; gamesPlayed: number }
    >();

    scores.forEach((s) => {
      if (!s.uid) return;
      const existing = map.get(s.uid);
      if (existing) {
        existing.totalPoints += s.points || 0;
        existing.gamesPlayed += 1;
        if (s.displayName && s.displayName !== 'User') existing.displayName = s.displayName;
        if (s.photoUrl) existing.photoUrl = s.photoUrl;
      } else {
        map.set(s.uid, {
          uid: s.uid,
          displayName: s.displayName || 'Friend',
          photoUrl: s.photoUrl || '',
          totalPoints: s.points || 0,
          gamesPlayed: 1,
        });
      }
    });

    const arr = Array.from(map.values());
    arr.sort((a, b) => b.totalPoints - a.totalPoints);
    return arr;
  }, [scores]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                Game Leaderboard
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Top players in {chatTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close leaderboard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3">
          {loading ? (
            <div className="py-12 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">Loading leaderboard...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Gamepad2 className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No games played yet!
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Play Truth or Dare, roll Dice, or flip Coins in Chat Mini Games to score points and take 1st place!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, idx) => {
                const rank = idx + 1;
                const isYou = entry.uid === currentUid;
                const badgeColor =
                  rank === 1
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                    : rank === 2
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    : rank === 3
                    ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800'
                    : 'bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800';

                return (
                  <div
                    key={entry.uid}
                    className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                      isYou
                        ? 'bg-teal-50/70 dark:bg-teal-950/35 border-teal-200 dark:border-teal-800'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${badgeColor}`}
                      >
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                      </div>
                      <Avatar src={entry.photoUrl} name={entry.displayName} size="md" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {entry.displayName} {isYou && <span className="text-[10px] text-teal-600 font-semibold">(You)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.gamesPlayed} game session{entry.gamesPlayed === 1 ? '' : 's'} played
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-extrabold text-teal-700 dark:text-teal-400 tabular-nums">
                        {entry.totalPoints} pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
