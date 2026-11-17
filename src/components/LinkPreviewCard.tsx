import React, { useEffect, useState } from 'react';
import { ExternalLink, Globe, Play, X } from 'lucide-react';

export interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  description: string;
  image: string;
  isYouTube: boolean;
  youtubeId?: string;
}

const clientPreviewCache = new Map<string, LinkPreviewData | null>();

export function extractFirstUrl(text: string): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"'`)\]]+/i);
  if (!match) return null;
  // Strip trailing punctuation often attached in sentences
  return match[0].replace(/[.,!?;:]+$/, '');
}

function extractYouTubeIdClient(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && /^[a-zA-Z0-9_-]{11}$/.test(seg) ? seg : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live')) {
        return /^[a-zA-Z0-9_-]{11}$/.test(parts[1]) ? parts[1] : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface LinkPreviewCardProps {
  url: string;
  isOwn: boolean;
}

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({ url, isOwn }) => {
  const fallbackYtId = extractYouTubeIdClient(url);
  const [data, setData] = useState<LinkPreviewData | null>(() => {
    if (clientPreviewCache.has(url)) {
      return clientPreviewCache.get(url) ?? null;
    }
    if (fallbackYtId) {
      return {
        url,
        domain: 'youtube.com',
        title: 'YouTube Video',
        description: 'Tap to play inside Sanvad',
        image: `https://i.ytimg.com/vi/${fallbackYtId}/hqdefault.jpg`,
        isYouTube: true,
        youtubeId: fallbackYtId,
      };
    }
    return null;
  });
  const [loading, setLoading] = useState<boolean>(() => !clientPreviewCache.has(url));
  const [playingInline, setPlayingInline] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    setPlayingInline(false);

    if (clientPreviewCache.has(url)) {
      setData(clientPreviewCache.get(url) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fetchPreview = async () => {
      try {
        const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) {
          if (!cancelled) {
            if (!fallbackYtId) {
              clientPreviewCache.set(url, null);
              setData(null);
            }
          }
          return;
        }
        const json = (await res.json()) as LinkPreviewData;
        clientPreviewCache.set(url, json);
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled && !fallbackYtId) {
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchPreview();
    return () => {
      cancelled = true;
    };
  }, [url, fallbackYtId]);

  if (loading && !data) {
    return (
      <div
        data-no-bubble-menu
        className={`mt-2 rounded-xl p-2.5 text-xs animate-pulse ${
          isOwn
            ? 'bg-black/15 text-white/80'
            : 'bg-slate-100 dark:bg-slate-900/70 text-slate-500 dark:text-slate-400'
        }`}
      >
        Loading link preview...
      </div>
    );
  }

  if (!data) return null;

  if (data.isYouTube && data.youtubeId) {
    return (
      <div
        data-no-bubble-menu
        onClick={(e) => e.stopPropagation()}
        className={`mt-2 rounded-xl overflow-hidden border ${
          isOwn
            ? 'bg-black/20 border-white/15 text-white'
            : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
        }`}
      >
        {playingInline ? (
          <div className="relative w-full aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${data.youtubeId}?autoplay=1&rel=0`}
              title={data.title || 'YouTube video player'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
            <button
              type="button"
              onClick={() => setPlayingInline(false)}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer"
              title="Close video player"
              aria-label="Close video player"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPlayingInline(true)}
            className="relative w-full aspect-video bg-slate-950 block overflow-hidden group cursor-pointer"
            aria-label={`Play ${data.title}`}
          >
            {data.image && !imgFailed ? (
              <img
                src={data.image}
                alt={data.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover opacity-90 group-hover:scale-[1.02] transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60 text-xs">
                YouTube Video
              </div>
            )}
            <div className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors flex items-center justify-center">
              <span className="w-12 h-12 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                <Play className="w-5 h-5 fill-current ml-0.5" />
              </span>
            </div>
          </button>
        )}

        <div className="p-2.5 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold leading-snug line-clamp-2">{data.title}</p>
            <p
              className={`text-[11px] mt-0.5 truncate ${
                isOwn ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              YouTube · {playingInline ? 'Playing in app' : 'Tap thumbnail to play'}
            </p>
          </div>
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              isOwn
                ? 'bg-white/15 hover:bg-white/25 text-white'
                : 'bg-slate-200/70 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
            title="Open on YouTube"
            aria-label="Open on YouTube"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <a
      data-no-bubble-menu
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`mt-2 block rounded-xl overflow-hidden border transition-colors ${
        isOwn
          ? 'bg-black/20 hover:bg-black/25 border-white/15 text-white'
          : 'bg-slate-50 hover:bg-slate-100/90 dark:bg-slate-900/80 dark:hover:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
      }`}
    >
      {data.image && !imgFailed && (
        <div className="w-full max-h-40 overflow-hidden bg-slate-200 dark:bg-slate-800">
          <img
            src={data.image}
            alt={data.title}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-36 object-cover"
          />
        </div>
      )}
      <div className="p-2.5 space-y-1">
        <div
          className={`flex items-center justify-between gap-2 text-[11px] ${
            isOwn ? 'text-white/75' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span className="inline-flex items-center gap-1 truncate font-medium">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{data.domain}</span>
          </span>
          <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
        </div>
        <p className="text-xs font-bold leading-snug line-clamp-2">{data.title}</p>
        {data.description && (
          <p
            className={`text-[11px] leading-relaxed line-clamp-2 ${
              isOwn ? 'text-white/80' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
};
