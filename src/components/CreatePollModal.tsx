import React, { useState } from 'react';
import { BarChart3, Plus, Trash2, X } from 'lucide-react';
import { LIMITS } from '../lib/validation';

interface CreatePollModalProps {
  onClose: () => void;
  onSubmit: (question: string, options: string[]) => Promise<void>;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({ onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addOption = () => {
    if (options.length >= LIMITS.POLL_OPTIONS_MAX) return;
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= LIMITS.POLL_OPTIONS_MIN) return;
    setOptions(options.filter((_, idx) => idx !== index));
  };

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanQ = question.trim();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!cleanQ) {
      setError('Please enter a poll question.');
      return;
    }
    if (cleanOpts.length < LIMITS.POLL_OPTIONS_MIN) {
      setError('Please provide at least 2 options.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(cleanQ, cleanOpts);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create poll.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-teal-700 dark:text-teal-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Create Group Poll</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div>
            <label
              htmlFor="poll-question"
              className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
            >
              Question
            </label>
            <input
              id="poll-question"
              type="text"
              maxLength={LIMITS.POLL_QUESTION_MAX}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., Where should we meet tonight?"
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              autoFocus
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Options ({options.length}/{LIMITS.POLL_OPTIONS_MAX})
              </span>
              {options.length < LIMITS.POLL_OPTIONS_MAX && (
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Option
                </button>
              )}
            </div>

            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={LIMITS.POLL_OPTION_MAX}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                {options.length > LIMITS.POLL_OPTIONS_MIN && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                    aria-label={`Remove option ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
            >
              {submitting ? 'Creating...' : 'Send Poll'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
