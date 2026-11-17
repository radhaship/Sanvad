import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';

interface TickMarksProps {
  pending?: boolean;
  deliveredCount: number;
  readCount: number;
  memberCount: number;
  isOwn: boolean;
  onDarkBubble?: boolean;
  readReceiptsEnabled?: boolean;
}

export const TickMarks: React.FC<TickMarksProps> = ({
  pending = false,
  deliveredCount,
  readCount,
  memberCount,
  isOwn,
  onDarkBubble = false,
  readReceiptsEnabled = true,
}) => {
  if (!isOwn) return null;

  if (pending) {
    return (
      <span title="Sending..." aria-label="Sending" className="inline-flex items-center">
        <Clock className={`w-3.5 h-3.5 ${onDarkBubble ? 'text-teal-200' : 'text-slate-400'}`} />
      </span>
    );
  }

  // Sender is always 1st entry in deliveredTo and readBy
  const otherRecipients = Math.max(1, memberCount - 1);
  const othersDelivered = Math.max(0, deliveredCount - 1);
  const othersRead = Math.max(0, readCount - 1);

  const isRead = readReceiptsEnabled && (memberCount <= 2 ? othersRead >= 1 : othersRead >= 1);
  const isDelivered = othersDelivered >= 1;

  if (isRead) {
    const label =
      memberCount > 2
        ? `Read by ${othersRead} of ${otherRecipients}`
        : 'Read';
    return (
      <span title={label} aria-label={label} className="inline-flex items-center">
        <CheckCheck
          className={`w-4 h-4 ${
            onDarkBubble ? 'text-sky-300' : 'text-sky-500 dark:text-sky-400'
          }`}
        />
      </span>
    );
  }

  if (isDelivered) {
    return (
      <span title="Delivered" aria-label="Delivered" className="inline-flex items-center">
        <CheckCheck
          className={`w-4 h-4 ${
            onDarkBubble ? 'text-teal-100/80' : 'text-slate-400 dark:text-slate-500'
          }`}
        />
      </span>
    );
  }

  return (
    <span title="Sent" aria-label="Sent" className="inline-flex items-center">
      <Check
        className={`w-3.5 h-3.5 ${
          onDarkBubble ? 'text-teal-100/80' : 'text-slate-400 dark:text-slate-500'
        }`}
      />
    </span>
  );
};
