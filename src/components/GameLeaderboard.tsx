import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Gamepad2,
  History,
  Loader2,
  Medal,
  Plus,
  Send,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { deleteMiniGameResult, recordMiniGameResult } from '../services/chatService';
import type { Chat, GameResult, MiniGameType, PublicUser } from '../types/chat';
import { Avatar } from './Avatar';

type LeaderboardFilter = 'all' | MiniGameType;

interface AggregatedPlayer {
  uid: string;
  displayName: string;
  handle: string;
  photoUrl: string;
  totalScore: number;
  wins: number;
  gamesPlayed: number;
  breakdown: Record<MiniGameType, number>;
  lastSummary: string;
  lastActivityMs: number;
}

const FILTER_OPTIONS: Array<{ id: LeaderboardFilter; label: string }> = [
  { id: 'all', label: 'All Games' },
  { id: 'tod', label: 'Truth/Dare' },
  { id: 'challenge', label: 'Challenges' },
  { id: 'lucky', label: 'Dice/Coin' },
  { id: 'wyr', label: 'Polls' },
];

const QUICK_AWARD_PRESETS: Array<{
  label: string;
  gameType: MiniGameType;
  points: number;
  isWin: boolean;
}> = [
  { label: 'Dare Completed (+20)', gameType: 'tod', points: 20, isWin: true },
  { label: 'Challenge Winner (+15)', gameType: 'challenge', points: 15, isWin: true },
  { label: 'Truth Answered (+10)', gameType: 'tod', points: 10, isWin: true },
  { label: 'Lucky Win (+15)', gameType: 'lucky', points: 15, isWin: true },
];

interface GameLeaderboardPanelProps {
  chat: Chat;
  currentUid: string;
  members: PublicUser[];
  onPlayGames?: () => void;
  onShareLeaderboard?: (summaryText: string) => Promise<void>;
}

export const GameLeaderboardPanel: React.FC<GameLeaderboardPanelProps> = ({
  chat,
  currentUid,
  members,
  onPlayGames,
  onShareLeaderboard,
}) => {
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeaderboardFilter>('all');
  const [showLogForm, setShowLogForm] = useState(false);
  const [awardPlayerUid, setAwardPlayerUid] = useState(currentUid);
  const [awardPresetIdx, setAwardPresetIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = chat.adminUids.includes(currentUid);

  useEffect(() => {
    setLoading(true);
    const path = `chats/${chat.id}/game_results`;
    const q = query(
      collection(db, 'chats', chat.id, 'game_results'),
      where('visibleToUids', 'array-contains', currentUid),
      limit(250)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as GameResult);
        list.sort(
          (a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now())
        );
        setResults(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [chat.id, currentUid]);

  const memberMap = useMemo(() => {
    const map: Record<string, PublicUser> = {};
    members.forEach((m) => {
      map[m.uid] = m;
    });
    return map;
  }, [members]);

  const filteredResults = useMemo(
    () => (filter === 'all' ? results : results.filter((r) => r.gameType === filter)),
    [results, filter]
  );

  const rankedPlayers = useMemo<AggregatedPlayer[]>(() => {
    const agg: Record<string, AggregatedPlayer> = {};

    for (const r of filteredResults) {
      const liveProfile = memberMap[r.playerId];
      if (!agg[r.playerId]) {
        agg[r.playerId] = {
          uid: r.playerId,
          displayName: liveProfile?.displayName || r.playerName || 'Player',
          handle: liveProfile?.handle || '',
          photoUrl: liveProfile?.photoUrl ?? r.playerPhoto ?? '',
          totalScore: 0,
          wins: 0,
          gamesPlayed: 0,
          breakdown: { tod: 0, challenge: 0, wyr: 0, lucky: 0 },
          lastSummary: r.summary,
          lastActivityMs: r.createdAt?.toMillis() ?? 0,
        };
      }
      const entry = agg[r.playerId];
      entry.totalScore += r.points || 0;
      if (r.isWin) entry.wins += 1;
      entry.gamesPlayed += 1;
      entry.breakdown[r.gameType] = (entry.breakdown[r.gameType] || 0) + (r.points || 0);
      const ts = r.createdAt?.toMillis() ?? 0;
      if (ts >= entry.lastActivityMs) {
        entry.lastActivityMs = ts;
        entry.lastSummary = r.summary;
      }
    }

    return Object.values(agg).sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.gamesPlayed - a.gamesPlayed;
    });
  }, [filteredResults, memberMap]);

  const handleLogWin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const preset = QUICK_AWARD_PRESETS[awardPresetIdx] || QUICK_AWARD_PRESETS[0];
    const targetMember = memberMap[awardPlayerUid] || members.find((m) => m.uid === awardPlayerUid);
    const playerInfo = targetMember
      ? {
          uid: targetMember.uid,
          displayName: targetMember.displayName,
          photoUrl: targetMember.photoUrl,
        }
      : { uid: currentUid, displayName: 'Player', photoUrl: '' };

    setError(null);
    setSubmitting(true);
    try {
      await recordMiniGameResult({
        chat,
        player: playerInfo,
        recordedByUid: currentUid,
        gameType: preset.gameType,
        points: preset.points,
        isWin: preset.isWin,
        summary: preset.label.replace(/\s*\(\+\d+\)$/, ''),
      });
      setShowLogForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log score.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareTopStandings = async () => {
    if (!onShareLeaderboard || rankedPlayers.length === 0 || sharing) return;
    setSharing(true);
    try {
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rankedPlayers.slice(0, 5).map((p, idx) => {
        const prefix = medals[idx] || `#${idx + 1}`;
        return `${prefix} ${p.displayName}: ${p.totalScore} pts (${p.wins} wins)`;
      });
      await onShareLeaderboard(`🏆 [Sanvad Game Leaderboard]\n${lines.join('\n')}`);
    } finally {
      setSharing(false);
    }
  };

  const renderRankBadge = (rankIndex: number) => {
    if (rankIndex === 0) {
      return (
        <div
          className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-xs"
          title="1st Place"
        >
          <Crown className="w-4 h-4 fill-current" />
        </div>
      );
    }
    if (rankIndex === 1) {
      return (
        <div
          className="w-8 h-8 rounded-xl bg-slate-200/80 dark:bg-slate-700/80 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0"
          title="2nd Place"
        >
          <Medal className="w-4 h-4" />
        </div>
      );
    }
    if (rankIndex === 2) {
      return (
        <div
          className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/60 border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300 flex items-center justify-center shrink-0"
          title="3rd Place"
        >
          <Award className="w-4 h-4" />
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold tabular-nums flex items-center justify-center shrink-0">
        #{rankIndex + 1}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs + quick action bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setFilter(opt.id)}
            className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
              filter === opt.id
                ? 'sanvad-accent-bg shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowLogForm((v) => !v)}
          className="flex-1 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 sanvad-accent-text" />
          <span>{showLogForm ? 'Cancel Log' : 'Award Win / Points'}</span>
        </button>
        {onShareLeaderboard && rankedPlayers.length > 0 && (
          <button
            type="button"
            disabled={sharing}
            onClick={() => void handleShareTopStandings()}
            className="min-h-[38px] px-3 rounded-xl sanvad-accent-bg disabled:opacity-60 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sharing ? 'Sharing...' : 'Share Rank'}</span>
          </button>
        )}
      </div>

      {/* Award Win / Log Points inline form */}
      {showLogForm && (
        <form
          onSubmit={(e) => void handleLogWin(e)}
          className="rounded-2xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/60 dark:bg-teal-950/30 p-3.5 space-y-2.5"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
            Record Mini-Game Win / Points
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={awardPlayerUid}
              onChange={(e) => setAwardPlayerUid(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.displayName} {m.uid === currentUid ? '(You)' : ''}
                </option>
              ))}
            </select>
            <select
              value={awardPresetIdx}
              onChange={(e) => setAwardPresetIdx(Number(e.target.value))}
              className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {QUICK_AWARD_PRESETS.map((p, idx) => (
                <option key={p.label} value={idx}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[38px] rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
          >
            {submitting ? 'Saving...' : 'Add Points to Leaderboard'}
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {/* Ranked Standings */}
      {loading ? (
        <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Loading real-time scores...
        </div>
      ) : rankedPlayers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              No scores recorded yet
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Play Truth or Dare, Challenges, Poll Games, or Dice/Coin Toss to climb the ranks!
            </p>
          </div>
          {onPlayGames && (
            <button
              type="button"
              onClick={onPlayGames}
              className="min-h-[38px] px-4 rounded-xl sanvad-accent-bg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Play Mini Games</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {rankedPlayers.map((player, idx) => {
            const isTop3 = idx < 3;
            const isSelf = player.uid === currentUid;
            return (
              <div
                key={player.uid}
                className={`rounded-2xl border p-3 flex items-center gap-3 transition-colors ${
                  idx === 0
                    ? 'bg-gradient-to-r from-amber-50/90 to-yellow-50/50 dark:from-amber-950/35 dark:to-slate-900 border-amber-300/80 dark:border-amber-800/70'
                    : idx === 1
                    ? 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-300/80 dark:border-slate-700'
                    : idx === 2
                    ? 'bg-orange-50/60 dark:bg-orange-950/25 border-orange-200/80 dark:border-orange-900/50'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                {renderRankBadge(idx)}

                <Avatar src={player.photoUrl} name={player.displayName} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                      {player.displayName}
                    </p>
                    {isSelf && (
                      <span className="px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 text-[10px] font-bold shrink-0">
                        You
                      </span>
                    )}
                    {isTop3 && (
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                        {idx === 0 ? '1st' : idx === 1 ? '2nd' : '3rd'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {player.wins} {player.wins === 1 ? 'win' : 'wins'} · {player.gamesPlayed}{' '}
                    {player.gamesPlayed === 1 ? 'game' : 'games'} · {player.lastSummary}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white flex items-center justify-end gap-1">
                    {idx === 0 && <Flame className="w-3.5 h-3.5 text-amber-500" />}
                    <span>{player.totalScore}</span>
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    pts
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Activity Log */}
      {filteredResults.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Recent Game Activity
          </p>
          <div className="space-y-1.5 max-h-44 overflow-y-auto chat-scroll pr-0.5">
            {filteredResults.slice(0, 8).map((item) => {
              const liveName = memberMap[item.playerId]?.displayName || item.playerName;
              const canDelete = item.recordedBy === currentUid || isAdmin;
              return (
                <div
                  key={item.id}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {liveName}
                    </span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">· {item.summary}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      +{item.points}
                    </span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => void deleteMiniGameResult(chat.id, item.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        title="Remove entry"
                        aria-label="Remove score entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface GameLeaderboardModalProps {
  chat: Chat;
  chatTitle: string;
  currentUid: string;
  members: PublicUser[];
  onOpenMiniGames: () => void;
  onShareLeaderboard: (summaryText: string) => Promise<void>;
  onClose: () => void;
}

export const GameLeaderboardModal: React.FC<GameLeaderboardModalProps> = ({
  chat,
  chatTitle,
  currentUid,
  members,
  onOpenMiniGames,
  onShareLeaderboard,
  onClose,
}) => {
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
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
              <span>Game Leaderboard</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Live rankings in {chatTitle}
            </p>
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

        <div className="overflow-y-auto chat-scroll p-5">
          <GameLeaderboardPanel
            chat={chat}
            currentUid={currentUid}
            members={members}
            onPlayGames={() => {
              onClose();
              onOpenMiniGames();
            }}
            onShareLeaderboard={async (summary) => {
              await onShareLeaderboard(summary);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};

export const GameHistoryPanel: React.FC<{
  chat: Chat;
  currentUid: string;
  members: PublicUser[];
}> = ({ chat, currentUid, members }) => {
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = chat.adminUids.includes(currentUid);

  useEffect(() => {
    setLoading(true);
    const path = `chats/${chat.id}/game_results`;
    const q = query(
      collection(db, 'chats', chat.id, 'game_results'),
      where('visibleToUids', 'array-contains', currentUid),
      limit(250)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as GameResult);
        list.sort(
          (a, b) => (b.createdAt?.toMillis() ?? Date.now()) - (a.createdAt?.toMillis() ?? Date.now())
        );
        setResults(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [chat.id, currentUid]);

  const memberMap = useMemo(() => {
    const map: Record<string, PublicUser> = {};
    members.forEach((m) => {
      map[m.uid] = m;
    });
    return map;
  }, [members]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <History className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No game history yet</p>
        <p className="text-xs text-slate-500">Play Truth or Dare, Challenges, or Dice games to see results here!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between pb-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Chronological Game Feed ({results.length})
        </h4>
      </div>
      <div className="space-y-2 max-h-[60dvh] overflow-y-auto chat-scroll pr-1">
        {results.map((item) => {
          const user = memberMap[item.playerId] || {
            displayName: item.playerName,
            photoUrl: '',
            handle: 'player',
          };
          const canDelete = item.recordedBy === currentUid || isAdmin;
          const timeStr = item.createdAt ? item.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          const dateStr = item.createdAt ? item.createdAt.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';

          const gameBadgeClass =
            item.gameType === 'tod'
              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
              : item.gameType === 'challenge'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
              : item.gameType === 'wyr'
              ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';

          const gameTypeName =
            item.gameType === 'tod'
              ? 'Truth or Dare'
              : item.gameType === 'challenge'
              ? 'Challenge'
              : item.gameType === 'wyr'
              ? 'Poll Game'
              : 'Lucky Dice/Coin';

          return (
            <div
              key={item.id}
              className="p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0">
                  <Avatar
                    src={user.photoUrl}
                    name={user.displayName}
                    size="md"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user.displayName}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${gameBadgeClass}`}>
                      {gameTypeName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {item.summary}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    {dateStr} at {timeStr}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg">
                  +{item.points} pts
                </span>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void deleteMiniGameResult(chat.id, item.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    title="Delete history entry"
                    aria-label="Delete history entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
