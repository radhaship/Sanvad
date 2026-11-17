import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface GeminiMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface GeminiAssistantModalProps {
  userName: string;
  hasActiveChat: boolean;
  onSendToActiveChat?: (text: string) => Promise<void>;
  onClose: () => void;
}

const STARTER_PROMPTS = [
  'Goa trip ka 3-day plan aur group poll options suggest karo',
  'Friends group ke liye ek funny weekend message likho',
  'Dinner plan decide karne ke liye 4 mast options batao',
];

export const GeminiAssistantModal: React.FC<GeminiAssistantModalProps> = ({
  userName,
  hasActiveChat,
  onSendToActiveChat,
  onClose,
}) => {
  const [messages, setMessages] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceSpeak, setVoiceSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sharedId, setSharedId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );

  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (ttsSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [ttsSupported]);

  const speakText = (text: string) => {
    if (!ttsSupported || !voiceSpeak) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (rawText: string, viaVoice = false) => {
    const trimmed = rawText.trim();
    if (!trimmed || loading) return;

    setError(null);
    const userMsg: GeminiMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName,
          voiceMode: viaVoice || voiceSpeak,
          messages: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Could not get a response from Gemini.');
      }

      const botMsg: GeminiMessage = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: data.reply,
      };
      setMessages((prev) => [...prev, botMsg]);
      if (voiceSpeak) {
        speakText(data.reply);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const toggleListening = () => {
    if (!speechSupported) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechCtor =
      (window as unknown as Record<string, new () => SpeechRecognitionInstance>).SpeechRecognition ||
      (window as unknown as Record<string, new () => SpeechRecognitionInstance>)
        .webkitSpeechRecognition;

    if (!SpeechCtor) return;
    const recognition = new SpeechCtor();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      setListening(false);
      if (transcript) {
        void sendMessage(transcript, true);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setError(null);
    setListening(true);
    recognition.start();
  };

  const handleCopy = async (msg: GeminiMessage) => {
    await navigator.clipboard.writeText(msg.text);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId((c) => (c === msg.id ? null : c)), 1800);
  };

  const handleShareToChat = async (msg: GeminiMessage) => {
    if (!onSendToActiveChat) return;
    await onSendToActiveChat(msg.text);
    setSharedId(msg.id);
    setTimeout(() => setSharedId((s) => (s === msg.id ? null : s)), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-lg h-[88dvh] sm:h-[640px] flex flex-col rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-600 to-sky-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Gemini AI Assistant
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Chat or talk in English, Hindi, or Hinglish
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {ttsSupported && (
              <button
                type="button"
                onClick={() => {
                  if (voiceSpeak) window.speechSynthesis.cancel();
                  setVoiceSpeak((v) => !v);
                }}
                className={`min-w-[38px] min-h-[38px] px-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  voiceSpeak
                    ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title={voiceSpeak ? 'Mute voice replies' : 'Speak replies aloud'}
                aria-label="Toggle voice replies"
              >
                {voiceSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="hidden sm:inline">{voiceSpeak ? 'Voice On' : 'Voice'}</span>
              </button>
            )}
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                  if (ttsSupported) window.speechSynthesis.cancel();
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="New conversation"
                aria-label="New conversation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Close Gemini Assistant"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto chat-scroll p-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/60">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/70 dark:border-teal-800/60 flex items-center justify-center text-teal-700 dark:text-teal-300">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Hey {userName}! Kuch bhi poochho ya baat karo
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ask questions, draft replies, plan group trips, or tap the mic to talk with voice.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="text-left text-xs px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500/60 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-xs ${
                      isUser
                        ? 'bg-teal-700 text-white rounded-tr-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                  {!isUser && (
                    <div className="mt-1 flex items-center gap-2 px-1">
                      <button
                        type="button"
                        onClick={() => void handleCopy(msg)}
                        className="text-[11px] font-medium text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>

                      {hasActiveChat && onSendToActiveChat && (
                        <button
                          type="button"
                          onClick={() => void handleShareToChat(msg)}
                          className="text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          {sharedId === msg.id ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Share2 className="w-3 h-3" />
                          )}
                          <span>{sharedId === msg.id ? 'Sent to chat' : 'Send to chat'}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {loading && (
            <div className="flex items-start">
              <div className="rounded-2xl rounded-tl-sm bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-300">
                Gemini is thinking...
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
          className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
        >
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              className={`min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl transition-colors cursor-pointer shrink-0 ${
                listening
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={listening ? 'Stop listening' : 'Talk with voice'}
              aria-label={listening ? 'Stop listening' : 'Talk with voice'}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={listening ? 'Listening...' : 'Ask Gemini anything...'}
            className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
          />

          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white transition-colors cursor-pointer shrink-0"
            aria-label="Send to Gemini"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
