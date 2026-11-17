import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownTextProps {
  text: string;
  onDarkBubble?: boolean;
  currentUserHandle?: string;
  searchQuery?: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderSearchHighlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const regex = new RegExp(`(${escapeRegExp(q)})`, 'gi');
  const segments = text.split(regex);
  return segments.map((seg, i) =>
    seg.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-amber-300/90 text-slate-900 rounded px-0.5">
        {seg}
      </mark>
    ) : (
      <React.Fragment key={i}>{seg}</React.Fragment>
    )
  );
}

function renderInlineMarkdown(
  line: string,
  onDarkBubble: boolean,
  currentUserHandle: string,
  searchQuery: string
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match inline code, markdown links, bold, italic, strikethrough, raw URLs, or @mentions
  const tokenRegex =
    /(`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s<>"'`)\]]+|@[a-z0-9_-]{3,30})/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`t-${keyIdx++}`}>
          {renderSearchHighlight(line.slice(lastIndex, match.index), searchQuery)}
        </React.Fragment>
      );
    }

    const token = match[0];

    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className={`px-1.5 py-0.5 rounded-md text-[0.88em] font-mono ${
            onDarkBubble
              ? 'bg-black/25 text-teal-50'
              : 'bg-slate-100 dark:bg-slate-900 text-teal-800 dark:text-teal-300 border border-slate-200/70 dark:border-slate-700'
          }`}
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
      if (linkMatch) {
        nodes.push(
          <a
            key={`a-${keyIdx++}`}
            data-no-bubble-menu
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={`underline underline-offset-2 font-medium break-all ${
              onDarkBubble ? 'text-teal-100 hover:text-white' : 'sanvad-accent-text hover:opacity-80'
            }`}
          >
            {renderSearchHighlight(linkMatch[1], searchQuery)}
          </a>
        );
      } else {
        nodes.push(
          <React.Fragment key={`t-${keyIdx++}`}>
            {renderSearchHighlight(token, searchQuery)}
          </React.Fragment>
        );
      }
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={`b-${keyIdx++}`} className="font-bold">
          {renderInlineMarkdown(token.slice(2, -2), onDarkBubble, currentUserHandle, searchQuery)}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push(
        <del key={`s-${keyIdx++}`} className="opacity-75">
          {renderInlineMarkdown(token.slice(2, -2), onDarkBubble, currentUserHandle, searchQuery)}
        </del>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {renderInlineMarkdown(token.slice(1, -1), onDarkBubble, currentUserHandle, searchQuery)}
        </em>
      );
    } else if (/^https?:\/\//i.test(token)) {
      nodes.push(
        <a
          key={`u-${keyIdx++}`}
          data-no-bubble-menu
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline underline-offset-2 break-all ${
            onDarkBubble ? 'text-teal-100 hover:text-white' : 'sanvad-accent-text hover:opacity-80'
          }`}
        >
          {renderSearchHighlight(token, searchQuery)}
        </a>
      );
    } else if (/^@[a-z0-9_-]{3,30}$/i.test(token)) {
      const isSelfMention =
        currentUserHandle && token.slice(1).toLowerCase() === currentUserHandle.toLowerCase();
      nodes.push(
        <span
          key={`m-${keyIdx++}`}
          className={`font-semibold px-1 py-0.5 rounded-md ${
            onDarkBubble
              ? 'bg-white/20 text-white'
              : isSelfMention
              ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
              : 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
          }`}
        >
          {renderSearchHighlight(token, searchQuery)}
        </span>
      );
    } else {
      nodes.push(
        <React.Fragment key={`t-${keyIdx++}`}>
          {renderSearchHighlight(token, searchQuery)}
        </React.Fragment>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(
      <React.Fragment key={`t-${keyIdx++}`}>
        {renderSearchHighlight(line.slice(lastIndex), searchQuery)}
      </React.Fragment>
    );
  }

  return nodes;
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div
      data-no-bubble-menu
      onClick={(e) => e.stopPropagation()}
      className="my-2 rounded-xl overflow-hidden border border-slate-700/60 bg-slate-950 text-slate-100 text-xs"
    >
      <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={(e) => void handleCopy(e)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono leading-relaxed text-[12px]">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  onDarkBubble = false,
  currentUserHandle = '',
  searchQuery = '',
}) => {
  const segments = text.split(/(```[\w-]*\n[\s\S]*?```)/g);

  const renderMarkdownBlock = (chunk: string, chunkIdx: number) => {
    const lines = chunk.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
        elements.push(
          <hr
            key={`hr-${chunkIdx}-${i}`}
            className={`my-2 ${
              onDarkBubble ? 'border-white/20' : 'border-slate-200 dark:border-slate-700'
            }`}
          />
        );
        i++;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const sizeClass =
          level === 1 ? 'text-[1.06em] font-bold' : level === 2 ? 'text-[1.02em] font-bold' : 'font-semibold';
        elements.push(
          <p key={`h-${chunkIdx}-${i}`} className={`${sizeClass} mt-1.5 mb-0.5 leading-snug`}>
            {renderInlineMarkdown(headingMatch[2], onDarkBubble, currentUserHandle, searchQuery)}
          </p>
        );
        i++;
        continue;
      }

      if (trimmed.startsWith('> ')) {
        const quoteLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('> ')) {
          quoteLines.push(lines[i].trim().slice(2));
          i++;
        }
        elements.push(
          <blockquote
            key={`q-${chunkIdx}-${i}`}
            className={`my-1.5 pl-2.5 border-l-2 italic text-[0.95em] ${
              onDarkBubble
                ? 'border-teal-200/70 text-teal-50/95'
                : 'border-teal-500/70 text-slate-600 dark:text-slate-300'
            }`}
          >
            {quoteLines.map((ql, qIdx) => (
              <p key={qIdx} className="leading-relaxed">
                {renderInlineMarkdown(ql, onDarkBubble, currentUserHandle, searchQuery)}
              </p>
            ))}
          </blockquote>
        );
        continue;
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
          i++;
        }
        elements.push(
          <ul key={`ul-${chunkIdx}-${i}`} className="my-1 pl-4 space-y-1 list-disc">
            {items.map((item, itemIdx) => (
              <li key={itemIdx} className="leading-relaxed">
                {renderInlineMarkdown(item, onDarkBubble, currentUserHandle, searchQuery)}
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
          i++;
        }
        elements.push(
          <ol key={`ol-${chunkIdx}-${i}`} className="my-1 pl-4 space-y-1 list-decimal">
            {items.map((item, itemIdx) => (
              <li key={itemIdx} className="leading-relaxed">
                {renderInlineMarkdown(item, onDarkBubble, currentUserHandle, searchQuery)}
              </li>
            ))}
          </ol>
        );
        continue;
      }

      elements.push(
        <p key={`p-${chunkIdx}-${i}`} className="leading-relaxed break-words">
          {renderInlineMarkdown(line, onDarkBubble, currentUserHandle, searchQuery)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <div className="sanvad-msg-text space-y-1 break-words [overflow-wrap:anywhere]">
      {segments.map((seg, idx) => {
        const fencedMatch = seg.match(/^```([\w-]*)\n([\s\S]*?)```$/);
        if (fencedMatch) {
          return (
            <CodeBlock
              key={`cb-${idx}`}
              language={fencedMatch[1] || 'code'}
              code={fencedMatch[2].replace(/\n$/, '')}
            />
          );
        }
        if (!seg.trim()) return null;
        return <React.Fragment key={`mb-${idx}`}>{renderMarkdownBlock(seg, idx)}</React.Fragment>;
      })}
    </div>
  );
};
