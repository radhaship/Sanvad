import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface ChatTurn {
  role: 'user' | 'model';
  text: string;
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

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
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
      return jsonResponse({ error: 'Message cannot be empty.' }, 400);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonResponse(
        {
          error:
            'GEMINI_API_KEY is missing in Netlify Environment Variables. Add GEMINI_API_KEY in Netlify Project configuration > Environment variables and redeploy.',
        },
        503
      );
    }

    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
    }> = sanitizedTurns.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

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

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

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
      return jsonResponse({ error: 'No response generated. Please try again.' }, 502);
    }

    return jsonResponse({ reply }, 200);
  } catch (error) {
    const errObj = error as { status?: number; message?: string };
    const status = typeof errObj?.status === 'number' && errObj.status >= 400 ? errObj.status : 502;
    const rawMsg = errObj?.message || 'AI service could not respond right now.';
    if (status === 403 || rawMsg.includes('API_KEY_INVALID') || rawMsg.includes('PERMISSION_DENIED')) {
      return jsonResponse(
        { error: 'Gemini API key is invalid or missing permissions.' },
        403
      );
    }
    if (status === 429 || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      return jsonResponse(
        { error: 'Gemini AI rate limit reached. Please wait a moment and try again.' },
        429
      );
    }
    const safeDetail = rawMsg
      .replace(/AIza[0-9A-Za-z\-_]+/g, '[redacted]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return jsonResponse(
      {
        error: safeDetail
          ? `BaatCheet AI error (${status}): ${safeDetail}`
          : 'BaatCheet AI could not respond right now. Please try again.',
      },
      status
    );
  }
}
