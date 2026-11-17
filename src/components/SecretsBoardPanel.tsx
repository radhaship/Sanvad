import React, { useMemo, useState } from 'react';
import {
  EyeOff,
  Flag,
  Lock,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  checkModerationSafety,
  CONFESSION_EMOJIS,
  formatChatListTime,
  LIMITS,
} from '../lib/validation';
import {
  createConfessionPost,
  deleteConfessionPost,
  hideGroupConfession,
  reportConfessionPost,
  toggleConfessionReaction,
} from '../services/chatService';
import type {
  Chat,
  ConfessionCategory,
  ConfessionPost,
  ConfessionScope,
} from '../types/chat';

interface SecretsBoardPanelProps {
  currentUid: string;
  confessions: ConfessionPost[];
  ownConfessionIds: Set<string>;
  groupChats: Chat[];
}

const CATEGORIES: Array<{ id: ConfessionCategory; label: string }> = [
  { id: 'funny', label: 'Funny' },
  { id: 'crush', label: 'Crush' },
  { id: 'advice', label: 'Advice' },
  { id: 'rant', label: 'Rant' },
  { id: 'wholesome', label: 'Wholesome' },
];

export const SecretsBoardPanel: React.FC<SecretsBoardPanelProps> = ({
  currentUid,
  confessions,
  ownConfessionIds,
  groupChats,
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState('');
  const [category, setCategory] = useState<ConfessionCategory>('funny');
  const [scope, setScope] = useState<ConfessionScope>('community');
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groupChats[0]?.id || '');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'all' | 'community' | 'group'>('all');
  const [catFilter, setCatFilter] = useState<'all' | ConfessionCategory>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const adminGroupIds = useMemo(
    () => new Set(groupChats.filter((g) => g.adminUids.includes(currentUid)).map((g) => g.id)),
    [groupChats, currentUid]
  );

  const visibleConfessions = useMemo(() => {
    return confessions.filter((post) => {
      if (post.hidden) return false;
      if (scopeFilter !== 'all' && post.scope !== scopeFilter) return false;
      if (catFilter !== 'all' && post.category !== catFilter) return false;
      return true;
    });
  }, [confessions, scopeFilter, catFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (posting) return;
    setError(null);

    const safetyErr = checkModerationSafety(text);
    if (safetyErr) {
      setError(safetyErr);
      return;
    }

    const targetChat =
      scope === 'group'
        ? groupChats.find((g) => g.id === (selectedGroupId || groupChats[0]?.id)) || null
        : null;

    if (scope === 'group' && !targetChat) {
      setError('Join or create a group chat first to post a group secret.');
      return;
    }

    setPosting(true);
    try {
      await createConfessionPost({
        uid: currentUid,
        rawText: text,
        category,
        scope,
        targetChat,
      });
      setText('');
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish confession.');
    } finally {
      setPosting(false);
    }
  };

  const handleReact = async (post: ConfessionPost, emoji: string) => {
    if (busyId) return;
    setBusyId(post.id);
    try {
      await toggleConfessionReaction(post, currentUid, emoji);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reaction.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReport = async (post: ConfessionPost) => {
    if (busyId || (post.reportedBy || []).includes(currentUid)) return;
    setBusyId(post.id);
    try {
      await reportConfessionPost(post, currentUid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setBusyId(null);
    }
  };

  const handleHideByAdmin = async (post: ConfessionPost) => {
    if (busyId) return;
    setBusyId(post.id);
    try {
      await hideGroupConfession(post.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not moderate post.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (post: ConfessionPost, isAuthor: boolean) => {
    if (busyId) return;
    setBusyId(post.id);
    try {
      await deleteConfessionPost(post.id, isAuthor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete confession.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-3.5 space-y-3.5">
      {/* Header + CTA */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
            Confessions &amp; Secrets
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            100% anonymous · auto-moderated by members
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setComposerOpen((o) => !o);
          }}
          className="min-h-[38px] px-3 rounded-xl sanvad-accent-bg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          {composerOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          <span>{composerOpen ? 'Close' : 'Drop Secret'}</span>
        </button>
      </div>

      {/* Zero-PII Privacy Note */}
      <div className="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
        <Lock className="w-3.5 h-3.5 sanvad-accent-text shrink-0" />
        <span>
          Your name and avatar are never saved on confessions. Posts with 3+ reports hide automatically.
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[11px] font-semibold underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Anonymous Confession Composer */}
      {composerOpen && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3.5 space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Share Anonymously
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {text.length}/{LIMITS.CONFESSION_TEXT_MAX}
            </span>
          </div>

          <textarea
            rows={3}
            maxLength={LIMITS.CONFESSION_TEXT_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Koi funny secret, campus story, ya dil ki baat bina naam bataye likho..."
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 resize-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="confession-category"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Topic
              </label>
              <select
                id="confession-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ConfessionCategory)}
                className="w-full min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="confession-scope"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Audience
              </label>
              <select
                id="confession-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as ConfessionScope)}
                className="w-full min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                <option value="community">All Sanvad Users</option>
                {groupChats.length > 0 && <option value="group">Specific Group</option>}
              </select>
            </div>
          </div>

          {scope === 'group' && groupChats.length > 0 && (
            <div>
              <label
                htmlFor="confession-group"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Select Group
              </label>
              <select
                id="confession-group"
                value={selectedGroupId || groupChats[0].id}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="w-full min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium"
              >
                {groupChats.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="w-full min-h-[42px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-50 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{posting ? 'Posting Anonymously...' : 'Post Secret'}</span>
          </button>
        </form>
      )}

      {/* Scope Filter Bar */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'community', label: 'Community' },
            { id: 'group', label: 'My Groups' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setScopeFilter(item.id)}
            className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              scopeFilter === item.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Category Filter Bar */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        <button
          type="button"
          onClick={() => setCatFilter('all')}
          className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer transition-colors ${
            catFilter === 'all'
              ? 'sanvad-accent-bg'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          All Topics
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCatFilter(c.id)}
            className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer transition-colors ${
              catFilter === c.id
                ? 'sanvad-accent-bg'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {visibleConfessions.length === 0 ? (
        <div className="text-center py-10 space-y-2 text-slate-500 dark:text-slate-400">
          <Sparkles className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            No secrets posted yet
          </p>
          <p className="text-xs">
            Be the first to confess something funny or wholesome anonymously!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleConfessions.map((post) => {
            const isAuthor = ownConfessionIds.has(post.id);
            const isGroupAdmin = post.scope === 'group' && adminGroupIds.has(post.chatId);
            const hasReported = (post.reportedBy || []).includes(currentUid);
            const myReaction = post.reactions?.[currentUid];

            const emojiCounts = CONFESSION_EMOJIS.map((emoji) => ({
              emoji,
              count: Object.values(post.reactions || {}).filter((val) => val === emoji).length,
            }));

            return (
              <article
                key={post.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5"
              >
                {/* Unboxed clean metadata header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {post.alias}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span className="capitalize">{post.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[140px]">
                        {post.scope === 'group' ? post.chatName || 'Group' : 'Everyone'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{formatChatListTime(post.createdAt)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isAuthor && (
                      <button
                        type="button"
                        disabled={busyId === post.id}
                        onClick={() => void handleDelete(post, true)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                        title="Delete my secret"
                        aria-label="Delete my secret"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isGroupAdmin && !isAuthor && (
                      <button
                        type="button"
                        disabled={busyId === post.id}
                        onClick={() => void handleHideByAdmin(post)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50 cursor-pointer"
                        title="Hide inappropriate secret (Admin)"
                        aria-label="Hide secret"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!isAuthor && (
                      <button
                        type="button"
                        disabled={hasReported || busyId === post.id}
                        onClick={() => void handleReport(post)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
                          hasReported
                            ? 'text-amber-600 dark:text-amber-400 opacity-75'
                            : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/50'
                        }`}
                        title={hasReported ? 'Reported for review' : 'Report unsafe content'}
                        aria-label={hasReported ? 'Reported' : 'Report secret'}
                      >
                        {hasReported ? (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        ) : (
                          <Flag className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Confession text */}
                <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed">
                  {post.text}
                </p>

                {/* Reactions bar */}
                <div className="pt-1 flex items-center gap-1 flex-wrap">
                  {emojiCounts.map(({ emoji, count }) => {
                    const active = myReaction === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        disabled={busyId === post.id}
                        onClick={() => void handleReact(post, emoji)}
                        className={`min-h-[32px] px-2 rounded-lg text-xs inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-400 dark:border-teal-700 text-teal-800 dark:text-teal-200 font-semibold'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{emoji}</span>
                        {count > 0 && <span className="text-[11px] tabular-nums">{count}</span>}
                      </button>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
