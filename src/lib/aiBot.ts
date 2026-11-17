import type { Chat, ChatMessage, PublicUser } from '../types/chat';

export const BAATCHEET_AI_UID = 'baatcheet_ai_bot';
export const BAATCHEET_AI_NAME = 'BaatCheet AI';
export const BAATCHEET_AI_HANDLE = 'baatcheet_ai';

const BOT_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f766e"/>
      <stop offset="55%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#4f46e5"/>
    </linearGradient>
    <linearGradient id="visor" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#bg)"/>
  <circle cx="64" cy="24" r="7" fill="#fde047"/>
  <rect x="61" y="29" width="6" height="12" rx="3" fill="#ffffff" opacity="0.9"/>
  <rect x="26" y="40" width="76" height="58" rx="22" fill="#ffffff"/>
  <rect x="18" y="58" width="10" height="22" rx="5" fill="#cbd5e1"/>
  <rect x="100" y="58" width="10" height="22" rx="5" fill="#cbd5e1"/>
  <rect x="36" y="51" width="56" height="26" rx="12" fill="url(#visor)"/>
  <circle cx="51" cy="64" r="5.5" fill="#2dd4bf"/>
  <circle cx="77" cy="64" r="5.5" fill="#2dd4bf"/>
  <path d="M51 85 Q64 93 77 85" stroke="#0f766e" stroke-width="4.5" stroke-linecap="round" fill="none"/>
</svg>`;

export const BAATCHEET_AI_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(BOT_AVATAR_SVG)}`;

export const BAATCHEET_AI_PUBLIC_PROFILE: PublicUser = {
  uid: BAATCHEET_AI_UID,
  displayName: BAATCHEET_AI_NAME,
  handle: BAATCHEET_AI_HANDLE,
  photoUrl: BAATCHEET_AI_AVATAR,
  bio: 'Your free Gemini AI assistant · Ask anything in English, Hindi, or Hinglish!',
  isOnline: true,
  discoverable: false,
  lastSeen: null,
  updatedAt: null,
};

export const BAATCHEET_AI_WELCOME_MESSAGE = `Namaste! Main **BaatCheet AI** hoon 🤖✨

Aap mujhse **English, Hindi, ya Hinglish** me kuch bhi pooch sakte hain:
- 🌴 **Trip & Hangout Plans** — itineraries, packing lists, budget ideas
- 💻 **Code & Study Help** — explanations, debugging, summaries
- ✍️ **Messages & Captions** — birthday wishes, group invites, emails
- 📸 **Photo Analysis** — koi bhi photo bhejo aur uske baare me poocho!

Neeche apna sawal type karein 👇`;

export const BAATCHEET_AI_STARTER_PROMPTS = [
  'Goa weekend trip plan banao 🌴',
  'Doston ke liye funny joke sunao 😂',
  'React useState short me samjhao 💻',
  'Birthday wish message likho 🎉',
];

export function isBaatCheetAIChat(chat: Pick<Chat, 'type' | 'memberUids'> | null | undefined): boolean {
  return Boolean(chat && chat.type === 'direct' && chat.memberUids.includes(BAATCHEET_AI_UID));
}

export function isBaatCheetAIMessage(msg: Pick<ChatMessage, 'senderId'> | null | undefined): boolean {
  return Boolean(msg && msg.senderId === BAATCHEET_AI_UID);
}

export async function askBaatCheetAI(params: {
  userName: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
  imageData?: string;
}): Promise<string> {
  const res = await fetch('/api/gemini/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: params.userName,
      messages: params.history,
      persona: 'baatcheet_ai',
      ...(params.imageData ? { imageData: params.imageData } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'BaatCheet AI could not respond right now. Please try again.');
  }
  const reply = (data.reply || '').trim();
  if (!reply) {
    throw new Error('BaatCheet AI returned an empty response.');
  }
  return reply;
}
