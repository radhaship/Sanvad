import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ListChecks,
  Plus,
  Search,
  Send,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { LIMITS } from '../lib/validation';
import {
  addGroupChecklistItem,
  deleteGroupChecklistItem,
  toggleGroupChecklistItem,
  updateGroupChecklistItem,
} from '../services/chatService';
import type { Chat, ChecklistCategory, ChecklistItem, PublicUser } from '../types/chat';

interface GroupChecklistModalProps {
  chat: Chat;
  currentUser: { uid: string; displayName: string };
  members: PublicUser[];
  items: ChecklistItem[];
  onShareSummary: (summaryText: string) => Promise<void>;
  onClose: () => void;
}

const CATEGORIES: Array<{ id: ChecklistCategory; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'travel', label: 'Travel & Ride' },
  { id: 'food', label: 'Food & Snacks' },
  { id: 'stay', label: 'Stay & Gear' },
  { id: 'budget', label: 'Budget / Tickets' },
];

export const GroupChecklistModal: React.FC<GroupChecklistModalProps> = ({
  chat,
  currentUser,
  members,
  items,
  onShareSummary,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ChecklistCategory>('travel');
  const [note, setNote] = useState('');
  const [assignedUid, setAssignedUid] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'done' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = chat.adminUids.includes(currentUser.uid);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) =>
        a.uid === currentUser.uid
          ? -1
          : b.uid === currentUser.uid
          ? 1
          : a.displayName.localeCompare(b.displayName)
      ),
    [members, currentUser.uid]
  );

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.completed).length;
    const minePending = items.filter(
      (i) => !i.completed && i.assignedToUid === currentUser.uid
    ).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, minePending, pct };
  }, [items, currentUser.uid]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'pending' && item.completed) return false;
      if (filter === 'done' && !item.completed) return false;
      if (filter === 'mine' && item.assignedToUid !== currentUser.uid) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.assignedToName.toLowerCase().includes(q) ||
        item.note.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search, currentUser.uid]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding || !title.trim()) return;
    setError(null);
    setAdding(true);
    try {
      const targetMember = sortedMembers.find((m) => m.uid === assignedUid) || null;
      await addGroupChecklistItem({
        chat,
        creator: currentUser,
        title,
        category,
        note,
        assignedTo: targetMember
          ? { uid: targetMember.uid, displayName: targetMember.displayName }
          : null,
      });
      setTitle('');
      setNote('');
      setAssignedUid('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add checklist item.');
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (item: ChecklistItem) => {
    if (busyId) return;
    setError(null);
    setBusyId(item.id);
    try {
      await toggleGroupChecklistItem(chat.id, item, currentUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReassign = async (item: ChecklistItem, nextUid: string) => {
    if (busyId) return;
    setError(null);
    setBusyId(item.id);
    try {
      const target = sortedMembers.find((m) => m.uid === nextUid);
      await updateGroupChecklistItem(chat.id, item.id, {
        title: item.title,
        category: item.category,
        note: item.note,
        assignedToUid: target ? target.uid : '',
        assignedToName: target ? target.displayName : '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reassign item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ChecklistItem) => {
    if (busyId) return;
    setError(null);
    setBusyId(item.id);
    try {
      await deleteGroupChecklistItem(chat.id, item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete item.');
    } finally {
      setBusyId(null);
    }
  };

  const handleShareToChat = async () => {
    if (sharing || items.length === 0) return;
    setSharing(true);
    try {
      const previewLines = items
        .slice(0, 10)
        .map((i) => {
          const mark = i.completed ? '✅' : '⬜';
          const who = i.assignedToName ? ` (@${i.assignedToName})` : '';
          return `${mark} ${i.title}${who}`;
        })
        .join('\n');
      const more = items.length > 10 ? `\n...and ${items.length - 10} more items` : '';
      const summary = `📋 [${chat.name} · Trip & Hangout Checklist (${stats.completed}/${stats.total} Done)]\n${previewLines}${more}`;
      await onShareSummary(summary);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share checklist summary.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ListChecks className="w-5 h-5 sanvad-accent-text shrink-0" />
              <span className="truncate">Trip &amp; Hangout Checklist</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {chat.name} · {members.length} members synced live
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close checklist"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Progress Strip */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700 dark:text-slate-200 tabular-nums">
              {stats.completed} of {stats.total} completed ({stats.pct}%)
            </span>
            {stats.minePending > 0 && (
              <span className="sanvad-accent-text tabular-nums">
                {stats.minePending} assigned to you
              </span>
            )}
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full sanvad-accent-bg transition-all duration-300"
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto chat-scroll p-4 sm:p-5 space-y-4">
          {error && (
            <div
              role="alert"
              className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {/* Add New Checklist Item */}
          <form
            onSubmit={(e) => void handleAddItem(e)}
            className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3.5 space-y-2.5"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={LIMITS.CHECKLIST_TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add item (e.g., Book tempo traveller, Snacks, Bluetooth speaker)..."
                className="flex-1 min-w-0 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="submit"
                disabled={adding || !title.trim()}
                className="min-h-[42px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{adding ? '...' : 'Add'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ChecklistCategory)}
                aria-label="Category"
                className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                value={assignedUid}
                onChange={(e) => setAssignedUid(e.target.value)}
                aria-label="Assign member"
                className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
              >
                <option value="">Assign: Anyone</option>
                {sortedMembers.map((m) => (
                  <option key={m.uid} value={m.uid}>
                    {m.uid === currentUser.uid ? `${m.displayName} (You)` : m.displayName}
                  </option>
                ))}
              </select>

              <input
                type="text"
                maxLength={LIMITS.CHECKLIST_NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note / cost (optional)"
                className="min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </form>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex-1">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'done', label: 'Done' },
                  { id: 'mine', label: 'Mine' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`min-h-[34px] px-2 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                    filter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter items..."
                className="w-full min-h-[38px] pl-1.5 bg-transparent text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Checklist Items */}
          {filteredItems.length === 0 ? (
            <div className="text-center py-8 space-y-1.5 text-slate-500 dark:text-slate-400">
              <ListChecks className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {items.length === 0 ? 'Checklist is empty' : 'No matching items'}
              </p>
              <p className="text-xs">
                {items.length === 0
                  ? 'Add travel, food, stay, or budget tasks and assign friends!'
                  : 'Try switching filters or clearing the search.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
              {filteredItems.map((item) => {
                const canDelete = item.createdBy === currentUser.uid || isAdmin;
                const isMine = item.assignedToUid === currentUser.uid;
                const catLabel =
                  CATEGORIES.find((c) => c.id === item.category)?.label || item.category;

                return (
                  <div
                    key={item.id}
                    className={`p-3 flex items-start gap-2.5 transition-colors ${
                      item.completed ? 'bg-slate-50/70 dark:bg-slate-800/30' : ''
                    }`}
                  >
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void handleToggle(item)}
                      className="min-w-[40px] min-h-[40px] -ml-1 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                      aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <p
                        className={`text-sm font-medium break-words ${
                          item.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {item.title}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{catLabel}</span>
                        {item.note && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-slate-600 dark:text-slate-300">{item.note}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>Added by {item.createdByName}</span>
                        {item.completed && item.completedByName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              Checked by {item.completedByName}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Responsibility Assigner */}
                      <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                        <select
                          value={item.assignedToUid}
                          disabled={busyId === item.id}
                          onChange={(e) => void handleReassign(item, e.target.value)}
                          aria-label={`Assign ${item.title}`}
                          className={`min-h-[32px] px-2 rounded-lg border text-[11px] font-medium cursor-pointer ${
                            isMine
                              ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                              : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <option value="">Unassigned</option>
                          {sortedMembers.map((m) => (
                            <option key={m.uid} value={m.uid}>
                              {m.uid === currentUser.uid ? `${m.displayName} (You)` : m.displayName}
                            </option>
                          ))}
                        </select>

                        {!isMine && !item.completed && (
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => void handleReassign(item, currentUser.uid)}
                            className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3 sanvad-accent-text" />
                            <span>Claim</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void handleDelete(item)}
                        className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer shrink-0"
                        title="Delete item"
                        aria-label="Delete item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={sharing || items.length === 0}
            onClick={() => void handleShareToChat()}
            className="min-h-[42px] px-4 rounded-xl sanvad-accent-bg disabled:opacity-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{sharing ? 'Sharing...' : 'Share Summary to Chat'}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
