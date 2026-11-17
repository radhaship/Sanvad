import React, { useMemo, useState } from 'react';
import { Dices, Flame, Gamepad2, HelpCircle, Send, Shuffle, Sparkles, Trophy, X } from 'lucide-react';
import { recordMiniGameResult } from '../services/chatService';
import type { Chat, MiniGameType, PublicUser } from '../types/chat';
import { GameLeaderboardPanel } from './GameLeaderboard';

type GameTab = 'tod' | 'challenge' | 'wyr' | 'lucky' | 'leaderboard';

const TRUTHS = [
  'What is one funny secret nobody in this chat knows about you?',
  'Who in your contact list do you text the most and why?',
  'What was the most embarrassing autocorrect you ever sent?',
  'Apne phone ki last saved photo ke peeche ki kahani batao!',
  'Agar ek din ke liye invisible ho jao, toh sabse pehle kya karoge?',
  'Which habit of yours annoys your friends the most?',
  'Kaunsi movie dekh kar aapko sabse zyada rona ya hasi aayi thi?',
  'What is a bold dream you have never told anyone out loud?',
];

const DARES = [
  'Send a 5-second voice note singing your favourite song right now!',
  'Change your Sanvad About/Status to "Chai Lover 24/7 ☕" for 1 hour!',
  'Reply to the next 3 messages using ONLY emojis — no words allowed!',
  'Chat me apni gallery ki ek random funny ya scenic photo share karo!',
  'Type a full compliment for the person above you with your eyes closed!',
  'Write a 2-line Hinglish shayari about someone in this chat right now!',
  'Send a selfie making the funniest face you can!',
  'Speak like a news reporter in a voice message summarizing today’s chat!',
];

const CHALLENGES = [
  '30-Second Story Challenge: Chat me 3 emojis bhejo aur baaki sab guess karenge ki kaunsi movie hai!',
  'Speed Round: Agle 60 seconds me sabko apna favourite street food likhna hai!',
  'No-Vowel Challenge: Apna agla message bina A, E, I, O, U use kiye likho!',
  'Compliment Chain: Har koi apne se upar wale member ke baare me 1 achi baat likhega!',
  'Photo Hunt: 2 minute ke andar apne aas-paas ki koi neeli (blue) cheez ki photo click karke bhejo!',
  'Voice Acting Challenge: Ek famous Bollywood dialogue apni aawaz me record karke bhejo!',
];

const WOULD_YOU_RATHER: Array<{ question: string; a: string; b: string }> = [
  {
    question: 'Would you rather give up Chai/Coffee forever or give up Biryani/Pizza?',
    a: 'Give up Chai/Coffee ☕',
    b: 'Give up Biryani/Pizza 🍕',
  },
  {
    question: 'Would you rather travel 100 years into the past or 100 years into the future?',
    a: '100 years in the Past ⏳',
    b: '100 years in the Future 🚀',
  },
  {
    question: 'Would you rather have free flights for life or a free dream house?',
    a: 'Free Flights Forever ✈️',
    b: 'Free Dream House 🏡',
  },
  {
    question: 'Would you rather always speak in rhymes or sing everything you say?',
    a: 'Speak in Rhymes 🎭',
    b: 'Sing Everything 🎤',
  },
  {
    question: 'Would you rather go on a spontaneous Goa trip or a peaceful Ladakh road trip?',
    a: 'Goa Beach Trip 🏖️',
    b: 'Ladakh Road Trip 🏔️',
  },
];

function pickRandom<T>(arr: readonly T[], exclude?: T): T {
  const pool = arr.length > 1 && exclude !== undefined ? arr.filter((x) => x !== exclude) : arr;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface MiniGameModalProps {
  chat: Chat;
  chatTitle: string;
  currentUser: { uid: string; displayName: string; photoUrl: string };
  members: PublicUser[];
  onSendMessage: (text: string, mentionedUids?: string[]) => Promise<void>;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
  onClose: () => void;
}

export const MiniGameModal: React.FC<MiniGameModalProps> = ({
  chat,
  chatTitle,
  currentUser,
  members,
  onSendMessage,
  onCreatePoll,
  onClose,
}) => {
  const currentUid = currentUser.uid;
  const [tab, setTab] = useState<GameTab>('tod');
  const [todMode, setTodMode] = useState<'truth' | 'dare'>('truth');
  const [todPrompt, setTodPrompt] = useState(() => pickRandom(TRUTHS));
  const [targetUid, setTargetUid] = useState<string>('');
  const [challengePrompt, setChallengePrompt] = useState(() => pickRandom(CHALLENGES));
  const [wyrQuestion, setWyrQuestion] = useState(WOULD_YOU_RATHER[0].question);
  const [wyrOptA, setWyrOptA] = useState(WOULD_YOU_RATHER[0].a);
  const [wyrOptB, setWyrOptB] = useState(WOULD_YOU_RATHER[0].b);
  const [wyrIdx, setWyrIdx] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [luckyResult, setLuckyResult] = useState<string>(
    'Tap Dice, Coin, or Pick Player to roll!'
  );
  const [luckyMeta, setLuckyMeta] = useState<{
    points: number;
    isWin: boolean;
    summary: string;
    winner?: PublicUser;
  } | null>(null);
  const [sending, setSending] = useState(false);

  const otherMembers = useMemo(
    () => members.filter((m) => m.uid !== currentUid),
    [members, currentUid]
  );

  const selectedMember = useMemo(
    () => otherMembers.find((m) => m.uid === targetUid) || null,
    [otherMembers, targetUid]
  );

  const handlePickRandomTarget = () => {
    if (otherMembers.length === 0) return;
    const pool =
      otherMembers.length > 1 && targetUid
        ? otherMembers.filter((m) => m.uid !== targetUid)
        : otherMembers;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    if (picked) setTargetUid(picked.uid);
  };

  const handleShuffleTod = (mode?: 'truth' | 'dare') => {
    const nextMode = mode || todMode;
    setTodMode(nextMode);
    setTodPrompt(
      nextMode === 'truth' ? pickRandom(TRUTHS, todPrompt) : pickRandom(DARES, todPrompt)
    );
  };

  const handleSpinTod = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setTimeout(() => {
      const randomMode: 'truth' | 'dare' = Math.random() < 0.5 ? 'truth' : 'dare';
      handleShuffleTod(randomMode);
      if (otherMembers.length > 0) {
        const picked = pickRandom(otherMembers);
        setTargetUid(picked.uid);
      }
      setIsSpinning(false);
    }, 320);
  };

  const logScoreBestEffort = async (params: {
    gameType: MiniGameType;
    points: number;
    isWin: boolean;
    summary: string;
    player?: { uid: string; displayName: string; photoUrl?: string };
  }) => {
    try {
      await recordMiniGameResult({
        chat,
        player: params.player || currentUser,
        recordedByUid: currentUid,
        gameType: params.gameType,
        points: params.points,
        isWin: params.isWin,
        summary: params.summary,
      });
    } catch {
      // Best-effort leaderboard logging without blocking chat send
    }
  };

  const handleSend = async (text: string, mentionedUids: string[] = []) => {
    if (sending || !text.trim()) return;
    setSending(true);
    try {
      await onSendMessage(text, mentionedUids);
      onClose();
    } finally {
      setSending(false);
    }
  };

  const handleSendTod = async () => {
    const mentionTag = selectedMember ? `@${selectedMember.handle} ` : '';
    const prefix = todMode === 'truth' ? '🎯 [Sanvad Game · Truth]' : '🔥 [Sanvad Game · Dare]';
    const fullText = `${prefix}\n${mentionTag}${todPrompt}`;
    await logScoreBestEffort({
      gameType: 'tod',
      points: todMode === 'dare' ? 15 : 10,
      isWin: true,
      summary: todMode === 'dare' ? 'Dare Card Played' : 'Truth Card Played',
    });
    await handleSend(fullText, selectedMember ? [selectedMember.uid] : []);
  };

  const handleSendChallenge = async () => {
    const mentionTag = selectedMember ? `@${selectedMember.handle} ` : '';
    const fullText = `⚡ [Sanvad Game · Challenge]\n${mentionTag}${challengePrompt}`;
    await logScoreBestEffort({
      gameType: 'challenge',
      points: 15,
      isWin: true,
      summary: 'Challenge Launched',
    });
    await handleSend(fullText, selectedMember ? [selectedMember.uid] : []);
  };

  const handleShuffleWyr = () => {
    const nextIdx = (wyrIdx + 1) % WOULD_YOU_RATHER.length;
    setWyrIdx(nextIdx);
    const next = WOULD_YOU_RATHER[nextIdx];
    setWyrQuestion(next.question);
    setWyrOptA(next.a);
    setWyrOptB(next.b);
  };

  const handleLaunchWyrPoll = async () => {
    if (sending || !wyrQuestion.trim() || !wyrOptA.trim() || !wyrOptB.trim()) return;
    setSending(true);
    try {
      await onCreatePoll(wyrQuestion.trim(), [wyrOptA.trim(), wyrOptB.trim()]);
      await logScoreBestEffort({
        gameType: 'wyr',
        points: 10,
        isWin: true,
        summary: 'Would You Rather Poll',
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  const handleRollDice = () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    setLuckyResult(`🎲 Dice Roll: You rolled a ${roll}!`);
    setLuckyMeta({
      points: roll === 6 ? 15 : 5,
      isWin: roll === 6,
      summary: roll === 6 ? 'Dice Roll Winner (6!)' : `Dice Roll (${roll})`,
    });
  };

  const handleFlipCoin = () => {
    const isHeads = Math.random() < 0.5;
    const side = isHeads ? 'Heads 🪙' : 'Tails 🪙';
    setLuckyResult(`🪙 Coin Toss Result: ${side}`);
    setLuckyMeta({
      points: isHeads ? 10 : 5,
      isWin: isHeads,
      summary: isHeads ? 'Coin Toss Heads Win' : 'Coin Toss Tails',
    });
  };

  const handlePickRandomPlayer = () => {
    const pool = members.length > 0 ? members : [];
    if (pool.length === 0) {
      setLuckyResult('🎯 Lucky Turn: Your turn!');
      setLuckyMeta({
        points: 10,
        isWin: true,
        summary: 'Lucky Turn Winner',
      });
      return;
    }
    const chosen = pickRandom(pool);
    setLuckyResult(`🎡 Spin Wheel Winner: @${chosen.handle} (${chosen.displayName}) — your turn next!`);
    setLuckyMeta({
      points: 15,
      isWin: true,
      summary: 'Spin Wheel Winner',
      winner: chosen,
    });
  };

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
              <Gamepad2 className="w-5 h-5 sanvad-accent-text shrink-0" />
              <span>Chat Mini Games</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Play with friends &amp; earn points in {chatTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close mini games"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Switcher Tabs */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            {(
              [
                { id: 'tod', label: 'Truth/Dare' },
                { id: 'challenge', label: 'Challenge' },
                { id: 'wyr', label: 'Poll' },
                { id: 'lucky', label: 'Dice/Spin' },
                { id: 'leaderboard', label: 'Ranks' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`min-h-[36px] px-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-1 ${
                  tab === item.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.id === 'leaderboard' && (
                  <Trophy className="w-3 h-3 text-amber-500 shrink-0" />
                )}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto chat-scroll p-5 space-y-4">
          {tab === 'leaderboard' ? (
            <GameLeaderboardPanel
              chat={chat}
              currentUid={currentUid}
              members={members}
              onPlayGames={() => setTab('tod')}
              onShareLeaderboard={async (summaryText) => {
                await onSendMessage(summaryText, []);
                onClose();
              }}
            />
          ) : (
            <>
              {/* Optional Target Friend Selector for ToD and Challenge */}
              {(tab === 'tod' || tab === 'challenge') && otherMembers.length > 0 && (
                <div>
                  <label
                    htmlFor="game-target"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Tag a friend (optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      id="game-target"
                      value={targetUid}
                      onChange={(e) => setTargetUid(e.target.value)}
                      className="flex-1 min-w-0 min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                    >
                      <option value="">Anyone in chat</option>
                      {otherMembers.map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.displayName} (@{m.handle})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handlePickRandomTarget}
                      className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      title="Pick a random friend from this chat"
                    >
                      <Shuffle className="w-3.5 h-3.5 sanvad-accent-text" />
                      <span>Random</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'tod' && (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleShuffleTod('truth')}
                      className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border cursor-pointer ${
                        todMode === 'truth'
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <HelpCircle className="w-4 h-4" />
                      <span>Truth</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShuffleTod('dare')}
                      className={`flex-1 min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 border cursor-pointer ${
                        todMode === 'dare'
                          ? 'bg-rose-600 border-rose-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <Flame className="w-4 h-4" />
                      <span>Dare</span>
                    </button>
                    <button
                      type="button"
                      disabled={isSpinning}
                      onClick={handleSpinTod}
                      className="min-h-[40px] px-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-70"
                      title="Spin wheel for Truth/Dare & friend"
                    >
                      <Shuffle className={`w-3.5 h-3.5 ${isSpinning ? 'animate-spin' : ''}`} />
                      <span>{isSpinning ? 'Spinning...' : 'Spin'}</span>
                    </button>
                  </div>

                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider sanvad-accent-text">
                      {todMode === 'truth' ? 'Truth Card (+10 pts)' : 'Dare Card (+15 pts)'}
                    </p>
                    <textarea
                      rows={3}
                      value={todPrompt}
                      onChange={(e) => setTodPrompt(e.target.value)}
                      className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleShuffleTod()}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>Next</span>
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void handleSendTod()}
                      className="flex-1 min-h-[44px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-60 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>{sending ? 'Sending...' : 'Send to Chat'}</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'challenge' && (
                <div className="space-y-3.5">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      Random Group / Friend Challenge (+15 pts)
                    </p>
                    <textarea
                      rows={3}
                      value={challengePrompt}
                      onChange={(e) => setChallengePrompt(e.target.value)}
                      className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white focus:outline-none resize-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setChallengePrompt(pickRandom(CHALLENGES, challengePrompt))}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>New Idea</span>
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void handleSendChallenge()}
                      className="flex-1 min-h-[44px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-60 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>{sending ? 'Sending...' : 'Drop Challenge'}</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'wyr' && (
                <div className="space-y-3.5">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 space-y-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider sanvad-accent-text">
                      Would You Rather (Live Interactive Poll · +10 pts)
                    </p>
                    <textarea
                      rows={2}
                      maxLength={140}
                      value={wyrQuestion}
                      onChange={(e) => setWyrQuestion(e.target.value)}
                      placeholder="Write a Would You Rather question..."
                      className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
                    />
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 w-5 text-center">A</span>
                        <input
                          type="text"
                          maxLength={80}
                          value={wyrOptA}
                          onChange={(e) => setWyrOptA(e.target.value)}
                          className="flex-1 min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 w-5 text-center">B</span>
                        <input
                          type="text"
                          maxLength={80}
                          value={wyrOptB}
                          onChange={(e) => setWyrOptB(e.target.value)}
                          className="flex-1 min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleShuffleWyr}
                      className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4" />
                      <span>Shuffle</span>
                    </button>
                    <button
                      type="button"
                      disabled={sending || !wyrQuestion.trim() || !wyrOptA.trim() || !wyrOptB.trim()}
                      onClick={() => void handleLaunchWyrPoll()}
                      className="flex-1 min-h-[44px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-60 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{sending ? 'Creating...' : 'Start Live Poll'}</span>
                    </button>
                  </div>
                </div>
              )}

              {tab === 'lucky' && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleRollDice}
                      className="min-h-[48px] rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer"
                    >
                      <Dices className="w-4 h-4 sanvad-accent-text" />
                      <span>Roll Dice</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFlipCoin}
                      className="min-h-[48px] rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer"
                    >
                      <span className="text-base leading-none">🪙</span>
                      <span>Coin Toss</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePickRandomPlayer}
                      className="min-h-[48px] rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer"
                    >
                      <Shuffle className="w-4 h-4 sanvad-accent-text" />
                      <span>Pick Turn</span>
                    </button>
                  </div>

                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-4 text-center space-y-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {luckyResult}
                    </p>
                    {luckyMeta && (
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        +{luckyMeta.points} pts {luckyMeta.winner ? `for ${luckyMeta.winner.displayName}` : 'on share'}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={sending || luckyResult.startsWith('Tap Dice')}
                    onClick={async () => {
                      const chosen =
                        luckyMeta?.winner ||
                        members.find((m) => luckyResult.includes(`@${m.handle}`));
                      if (luckyMeta) {
                        await logScoreBestEffort({
                          gameType: 'lucky',
                          points: luckyMeta.points,
                          isWin: luckyMeta.isWin,
                          summary: luckyMeta.summary,
                          player: luckyMeta.winner
                            ? {
                                uid: luckyMeta.winner.uid,
                                displayName: luckyMeta.winner.displayName,
                                photoUrl: luckyMeta.winner.photoUrl,
                              }
                            : currentUser,
                        });
                      }
                      await handleSend(
                        `🎲 [Sanvad Game · Lucky Spin]\n${luckyResult}`,
                        chosen ? [chosen.uid] : []
                      );
                    }}
                    className="w-full min-h-[44px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-50 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                    <span>{sending ? 'Sending...' : 'Share Result & Score'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
