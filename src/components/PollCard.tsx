import React, { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Lock } from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { castPollVote, closePoll } from '../services/chatService';
import type { Chat, Poll, PollVote } from '../types/chat';

interface PollCardProps {
  chat: Chat;
  pollId: string;
  currentUid: string;
  currentUserName: string;
}

export const PollCard: React.FC<PollCardProps> = ({
  chat,
  pollId,
  currentUid,
  currentUserName,
}) => {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [votes, setVotes] = useState<PollVote[]>([]);
  const [votingIdx, setVotingIdx] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const pollPath = `chats/${chat.id}/polls/${pollId}`;
    const unsubPoll = onSnapshot(
      doc(db, 'chats', chat.id, 'polls', pollId),
      (snap) => {
        if (snap.exists()) {
          setPoll(snap.data() as Poll);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, pollPath)
    );

    const votesPath = `chats/${chat.id}/polls/${pollId}/votes`;
    const votesQuery = query(
      collection(db, 'chats', chat.id, 'polls', pollId, 'votes'),
      where('visibleToUids', 'array-contains', currentUid)
    );
    const unsubVotes = onSnapshot(
      votesQuery,
      (snap) => {
        setVotes(snap.docs.map((d) => d.data() as PollVote));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, votesPath)
    );

    return () => {
      unsubPoll();
      unsubVotes();
    };
  }, [chat.id, pollId, currentUid]);

  if (!poll) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 w-72 sm:w-80">
        <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        <div className="mt-3 space-y-2">
          <div className="h-9 bg-slate-100 dark:bg-slate-700/60 rounded-xl animate-pulse" />
          <div className="h-9 bg-slate-100 dark:bg-slate-700/60 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const totalVotes = votes.length;
  const myVote = votes.find((v) => v.voterId === currentUid);
  const canClose =
    !poll.isClosed && (poll.createdBy === currentUid || chat.adminUids.includes(currentUid));

  const handleVote = async (optionIndex: number) => {
    if (poll.isClosed || votingIdx !== null) return;
    setVotingIdx(optionIndex);
    try {
      await castPollVote(chat, poll.id, { uid: currentUid, displayName: currentUserName }, optionIndex);
    } finally {
      setVotingIdx(null);
    }
  };

  const handleClose = async () => {
    if (!canClose || closing) return;
    setClosing(true);
    try {
      await closePoll(chat.id, poll.id);
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 w-[280px] sm:w-[340px] shadow-xs text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 font-medium text-teal-700 dark:text-teal-400">
          <BarChart3 className="w-3.5 h-3.5" />
          Poll by {poll.creatorName}
        </span>
        <span className="tabular-nums">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          {poll.isClosed ? ' · Closed' : ''}
        </span>
      </div>

      <h4 className="mt-2 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
        {poll.question}
      </h4>

      <div className="mt-3 space-y-2">
        {poll.options.map((opt, idx) => {
          const optionVotes = votes.filter((v) => v.optionIndex === idx);
          const count = optionVotes.length;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isSelected = myVote?.optionIndex === idx;

          return (
            <button
              key={`${poll.id}_opt_${idx}`}
              type="button"
              disabled={poll.isClosed || votingIdx !== null}
              onClick={() => void handleVote(idx)}
              className={`relative w-full text-left overflow-hidden rounded-xl border min-h-[42px] px-3 py-2 transition-colors cursor-pointer disabled:cursor-default ${
                isSelected
                  ? 'border-teal-600 dark:border-teal-500 bg-teal-50/40 dark:bg-teal-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/60 dark:bg-slate-900/40'
              }`}
            >
              {/* Proportional background progress bar */}
              <div
                aria-hidden="true"
                style={{ width: `${pct}%` }}
                className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${
                  isSelected
                    ? 'bg-teal-500/20 dark:bg-teal-500/25'
                    : 'bg-slate-200/70 dark:bg-slate-700/50'
                }`}
              />
              <div className="relative flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-100">
                  {isSelected && (
                    <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
                  )}
                  <span className="break-words">{opt}</span>
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                  {pct}% ({count})
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {votes.length > 0 && (
        <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
          Voted: {votes.map((v) => v.voterName).slice(0, 4).join(', ')}
          {votes.length > 4 ? ` +${votes.length - 4} more` : ''}
        </p>
      )}

      {canClose && (
        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/80 flex justify-end">
          <button
            type="button"
            disabled={closing}
            onClick={() => void handleClose()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 px-2 py-1 rounded-lg transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{closing ? 'Closing...' : 'Close Poll'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
