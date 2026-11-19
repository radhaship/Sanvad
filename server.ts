import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const distDir = path.join(__dirname, 'dist');
const hasDistBuild = fs.existsSync(path.join(distDir, 'index.html'));
const runningWithTsx =
  process.execArgv.some((arg) => arg.includes('tsx')) ||
  process.argv.some((arg) => arg.includes('tsx'));
const isProduction =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' && !runningWithTsx && hasDistBuild);

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeTurnsForGemini(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const turn of turns) {
    if (merged.length === 0 && turn.role !== 'user') {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.text = `${prev.text}\n\n${turn.text}`.slice(0, 4000);
    } else {
      merged.push({ role: turn.role, text: turn.text.trim().slice(0, 4000) });
    }
  }
  return merged;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });

  app.post('/api/gemini/chat', async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        messages?: ChatTurn[];
        userName?: string;
        voiceMode?: boolean;
        persona?: 'baatcheet_ai' | 'assistant';
        imageData?: string;
      };

      const userName = typeof body?.userName === 'string' ? body.userName.trim().slice(0, 50) : '';
      const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
      const sanitizedTurns = normalizeTurnsForGemini(
        rawMessages
          .filter(
            (m): m is ChatTurn =>
              Boolean(m) &&
              (m.role === 'user' || m.role === 'model') &&
              typeof m.text === 'string' &&
              m.text.trim().length > 0
          )
          .slice(-16)
      );

      if (sanitizedTurns.length === 0 && typeof body?.imageData !== 'string') {
        res.status(400).json({ error: 'Message cannot be empty.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({
          error:
            'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      const contents: Array<{
        role: 'user' | 'model';
        parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
      }> = sanitizedTurns.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      // Attach optional image to the latest user turn for multimodal Q&A
      if (typeof body?.imageData === 'string' && body.imageData.startsWith('data:image/')) {
        const match = body.imageData.match(
          /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i
        );
        if (match && match[2].length <= 600_000) {
          const imagePart = {
            inlineData: {
              mimeType: match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase(),
              data: match[2],
            },
          };
          const lastIdx = contents.length - 1;
          if (lastIdx >= 0 && contents[lastIdx].role === 'user') {
            contents[lastIdx].parts.unshift(imagePart);
          } else {
            contents.push({
              role: 'user',
              parts: [imagePart, { text: 'Please analyze this image and explain it helpfully.' }],
            });
          }
        }
      }

      const ai = getGeminiClient();
      const voiceInstruction = body?.voiceMode
        ? ' Keep your response concise, natural, and conversational (2-4 sentences) so it sounds great when spoken aloud.'
        : body?.persona === 'baatcheet_ai'
        ? ' Format your replies cleanly in Markdown (use short headings, bullet points, **bold** key phrases, and fenced ```code``` blocks when sharing code) while keeping total length concise and under 3200 characters.'
        : ' Keep your responses helpful, warm, and well-structured.';

      const assistantIdentity =
        body?.persona === 'baatcheet_ai'
          ? 'You are BaatCheet AI, the built-in smart chatbot assistant inside the Sanvad (BaatCheet) chat app.'
          : 'You are Sanvad Assistant, a friendly conversational AI built into the Sanvad chat app.';

      const systemInstruction = `${assistantIdentity}${
        userName ? ` You are chatting with ${userName}.` : ''
      } Respond naturally in the same language or script the user writes in (such as English, Hindi, or Hinglish).${voiceInstruction}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const reply = (response.text ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'No response generated. Please try again.' });
        return;
      }

      res.json({ reply });
    } catch (error) {
      const errObj = error as { status?: number; message?: string };
      const status = typeof errObj?.status === 'number' && errObj.status >= 400 ? errObj.status : 502;
      const rawMsg = errObj?.message || 'AI service could not respond right now.';
      console.error(`Gemini chat error (${status}):`, rawMsg.slice(0, 200));

      if (status === 403 || rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Gemini API key is invalid or missing permissions. Check GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Gemini AI rate limit reached. Please wait a moment and try again.',
        });
        return;
      }
      const safeDetail = rawMsg
        .replace(/AIza[0-9A-Za-z\-_]+/g, '[redacted]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
      res.status(status).json({
        error: safeDetail
          ? `BaatCheet AI error (${status}): ${safeDetail}`
          : 'BaatCheet AI could not respond right now. Please try again.',
      });
    }
  });

  // In-memory cache for link previews
  const linkPreviewCache = new Map<
    string,
    {
      expiresAt: number;
      data: {
        url: string;
        domain: string;
        title: string;
        description: string;
        image: string;
        isYouTube: boolean;
        youtubeId?: string;
      };
    }
  >();

  const extractYouTubeId = (rawUrl: string): string | null => {
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
  };

  const isPrivateHost = (hostname: string): boolean => {
    const h = hostname.toLowerCase();
    if (
      h === 'localhost' ||
      h === '0.0.0.0' ||
      h === '::1' ||
      h === '[::1]' ||
      h.endsWith('.local') ||
      h.endsWith('.internal')
    ) {
      return true;
    }
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
    const m = h.match(/^172\.(\d+)\./);
    if (m) {
      const second = Number(m[1]);
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  };

  const decodeEntities = (str: string): string =>
    str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const extractMetaTag = (html: string, keys: string[]): string => {
    for (const key of keys) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
        'i'
      );
      const m1 = html.match(r1);
      if (m1?.[1]) return decodeEntities(m1[1]);
      const r2 = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
        'i'
      );
      const m2 = html.match(r2);
      if (m2?.[1]) return decodeEntities(m2[1]);
    }
    return '';
  };

  app.get('/api/link-preview', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl || rawUrl.length > 1000) {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isPrivateHost(parsed.hostname)) {
      res.status(400).json({ error: 'Unsupported URL' });
      return;
    }

    const cacheKey = parsed.href;
    const cached = linkPreviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    const domain = parsed.hostname.replace(/^www\./, '');
    const youtubeId = extractYouTubeId(parsed.href);

    if (youtubeId) {
      let title = 'YouTube Video';
      let description = 'Watch video right inside Sanvad';
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(
            `https://www.youtube.com/watch?v=${youtubeId}`
          )}&format=json`,
          { signal: AbortSignal.timeout(3500) }
        );
        if (oembedRes.ok) {
          const json = (await oembedRes.json()) as { title?: string; author_name?: string };
          if (json.title) title = String(json.title).slice(0, 140);
          if (json.author_name) description = `YouTube · ${String(json.author_name).slice(0, 80)}`;
        }
      } catch {
        // Fallback title/description
      }

      const payload = {
        url: parsed.href,
        domain: 'youtube.com',
        title,
        description,
        image: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        isYouTube: true,
        youtubeId,
      };
      if (linkPreviewCache.size >= 150) {
        const firstKey = linkPreviewCache.keys().next().value;
        if (firstKey) linkPreviewCache.delete(firstKey);
      }
      linkPreviewCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60 * 1000, data: payload });
      res.json(payload);
      return;
    }

    let title = domain;
    let description = parsed.pathname !== '/' ? `${domain}${parsed.pathname}`.slice(0, 160) : parsed.href;
    let image = '';

    try {
      const response = await fetch(parsed.href, {
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SanvadPreview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('text/html')) {
        const rawHtml = (await response.text()).slice(0, 200000);
        const ogTitle = extractMetaTag(rawHtml, ['og:title', 'twitter:title']);
        const titleTagMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
        const parsedTitle = ogTitle || (titleTagMatch?.[1] ? decodeEntities(titleTagMatch[1]) : '');
        if (parsedTitle) title = parsedTitle.slice(0, 140);

        const ogDesc = extractMetaTag(rawHtml, ['og:description', 'twitter:description', 'description']);
        if (ogDesc) description = ogDesc.slice(0, 220);

        const ogImg = extractMetaTag(rawHtml, ['og:image', 'twitter:image', 'og:image:url']);
        if (ogImg) {
          try {
            const imgUrl = new URL(ogImg, parsed.origin);
            if (imgUrl.protocol === 'http:' || imgUrl.protocol === 'https:') {
              image = imgUrl.href;
            }
          } catch {
            image = '';
          }
        }
      }
    } catch {
      // Return graceful domain fallback
    }

    const payload = {
      url: parsed.href,
      domain,
      title,
      description,
      image,
      isYouTube: false,
    };
    if (linkPreviewCache.size >= 150) {
      const firstKey = linkPreviewCache.keys().next().value;
      if (firstKey) linkPreviewCache.delete(firstKey);
    }
    linkPreviewCache.set(cacheKey, { expiresAt: Date.now() + 30 * 60 * 1000, data: payload });
    res.json(payload);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', (_req: Request, res: Response) => {
      res
        .set('Cache-Control', 'no-store, no-cache, must-revalidate')
        .type('application/javascript')
        .send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return \`\${pathname}?\${queryToInject}\${search ? "&" + search.slice(1) : ""}\${hash || ""}\`;
}
export class ErrorOverlay {}
`);
    });

    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sanvad server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
