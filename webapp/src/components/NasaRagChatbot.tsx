import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Rocket,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  askNasaRagAssistant,
  VERIFOUR_FALLBACK_NOTICE_EN,
  VERIFOUR_FALLBACK_NOTICE_VI,
  VERIFOUR_OPENAI_KEY_STORAGE,
  type RagActionId,
  type RagActionSuggestion,
  type RagChatTurn,
  type RagLiveContext,
} from '../lib/nasaRag';

export interface NasaRagChatbotProps {
  liveContext: RagLiveContext;
  onTriggerAction: (action: RagActionId) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ChatMessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
  actions?: RagActionSuggestion[];
  usedFallback?: boolean;
  fallbackReason?: string;
}

const STARTER_QUESTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: '5 Workspaces & 7 UI Sections',
    prompt: 'Hướng dẫn dùng 5 workspace và 7 mục giao diện trên màn hình?',
  },
  {
    label: 'NASA Data vs Mazarico 2011 / Barker 2023',
    prompt: 'Nguồn dữ liệu NASA & vì sao kết quả khác Mazarico 2011 / Barker 2023?',
  },
  {
    label: 'Viability Formula & 240 m Scope',
    prompt: 'Giải thích công thức Viability Index và giới hạn 240 m?',
  },
  {
    label: '3D Rover, Flight Mode & Cameras',
    prompt: 'Cách điều khiển Rover 3D, Flight Mode và Camera?',
  },
  {
    label: 'Dec 31, 2028 Eclipse & Libration',
    prompt: 'Giải thích nhật thực toàn phần 31/12/2028 và bình động libration?',
  },
];

function createWelcomeMessage(liveContext: RagLiveContext): ChatMessageItem {
  return {
    id: 'welcome',
    role: 'assistant',
    content:
      `Xin chào! Tôi là **VeriFour NASA RAG Assistant**. Tôi kết hợp thông số mô phỏng trực tiếp tại **${liveContext.selectedSite.short_name}** với kho tri thức đối chiếu từ **NASA JPL Horizons DE441**, **LRO LOLA LDEM_75S_240M** và các công bố khoa học (Mazarico 2011, Gläser 2018, Barker 2023).\n` +
      `- Bấm 1 trong **5 câu hỏi gợi ý** bên trên hoặc gõ câu hỏi bằng tiếng Việt / English.\n` +
      `- Có thể nhập OpenAI API key ở biểu tượng chìa khóa (hoặc dùng chế độ **Offline NASA RAG** tự động khi chưa có key).`,
    citations: [
      'NASA JPL Horizons DE441 (MOON_ME)',
      'NASA LRO LOLA LDEM_75S_240M',
    ],
    actions: [
      { id: 'open_tour', label: 'Start 7-Section UI Tour' },
      { id: 'deploy_rover', label: 'Deploy 3D Rover Here' },
    ],
  };
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-50">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-slate-800/90 px-1 py-0.5 font-mono text-xs text-amber-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function stripLeadingFallbackNotice(content: string): string {
  const trimmed = content.trim();
  for (const notice of [VERIFOUR_FALLBACK_NOTICE_VI, VERIFOUR_FALLBACK_NOTICE_EN]) {
    if (trimmed.startsWith(notice)) {
      return trimmed.slice(notice.length).trimStart();
    }
  }
  return trimmed;
}

function renderFormattedMessage(content: string): React.ReactNode {
  const lines = content.split(/\r?\n/);
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-200">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" aria-hidden="true" />;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden="true" />
              <span className="flex-1">{renderInlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export const NasaRagChatbot: React.FC<NasaRagChatbotProps> = ({
  liveContext,
  onTriggerAction,
  open,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState<boolean>(false);
  const isOpen = open !== undefined ? open : internalOpen;

  const setDialogOpen = (next: boolean) => {
    if (open === undefined) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  };

  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    createWelcomeMessage(liveContext),
  ]);
  const [inputValue, setInputValue] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [keyPanelOpen, setKeyPanelOpen] = useState<boolean>(false);
  const [savedKey, setSavedKey] = useState<string>('');
  const [keyDraft, setKeyDraft] = useState<string>('');
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [keyStatusMsg, setKeyStatusMsg] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogId = useId();
  const keyInputId = useId();
  const chatInputId = useId();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(VERIFOUR_OPENAI_KEY_STORAGE)?.trim() ?? '';
      setSavedKey(stored);
      setKeyDraft(stored);
    } catch {
      // Ignore storage failures
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [isOpen, messages.length, isSending]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDialogOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = keyDraft.trim();
    if (typeof window !== 'undefined') {
      try {
        if (cleaned) {
          window.localStorage.setItem(VERIFOUR_OPENAI_KEY_STORAGE, cleaned);
        } else {
          window.localStorage.removeItem(VERIFOUR_OPENAI_KEY_STORAGE);
        }
      } catch {
        // Ignore storage failures
      }
    }
    setSavedKey(cleaned);
    setKeyStatusMsg(cleaned ? 'Key saved to localStorage.' : 'Browser key cleared.');
  };

  const handleClearKey = () => {
    setKeyDraft('');
    setSavedKey('');
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(VERIFOUR_OPENAI_KEY_STORAGE);
      } catch {
        // Ignore storage failures
      }
    }
    setKeyStatusMsg('Browser key removed.');
  };

  const sendQuery = async (rawPrompt: string) => {
    const query = rawPrompt.trim();
    if (!query || isSending) return;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
    };

    const historyPayload: RagChatTurn[] = messages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await askNasaRagAssistant({
        query,
        liveContext,
        history: historyPayload,
        apiKeyOverride: savedKey || undefined,
      });

      const assistantMsg: ChatMessageItem = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        citations: response.citations,
        actions: response.actions,
        usedFallback: response.usedFallback,
        fallbackReason: response.fallbackReason,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-err-${Date.now()}`,
          role: 'assistant',
          content: `${VERIFOUR_FALLBACK_NOTICE_VI}\n\nLỗi kết nối tạm thời (${msg}). Vui lòng thử lại hoặc xem mục About & Data.`,
          citations: ['NASA JPL Horizons DE441 (MOON_ME)', 'NASA LRO LOLA LDEM_75S_240M'],
          actions: [{ id: 'open_tour', label: 'Start 7-Section UI Tour' }],
          usedFallback: true,
          fallbackReason: msg,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuery(inputValue);
  };

  const handleResetChat = () => {
    setMessages([createWelcomeMessage(liveContext)]);
    inputRef.current?.focus();
  };

  const utcCompact =
    liveContext.utcIso.length >= 16
      ? `${liveContext.utcIso.slice(0, 16).replace('T', ' ')} UTC`
      : liveContext.utcIso;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={false}
        aria-controls={dialogId}
        className="fixed bottom-4 right-4 z-50 inline-flex min-h-[44px] items-center gap-2 rounded-full border border-cyan-400/60 bg-slate-950/95 px-4 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_14px_38px_-10px_rgba(34,211,238,0.45)] backdrop-blur-md transition hover:border-amber-300/75 hover:bg-slate-900 hover:text-white"
      >
        <Bot className="h-4 w-4 text-cyan-300" aria-hidden="true" />
        <span>NASA RAG AI · Hỏi Đáp &amp; Hướng Dẫn</span>
        <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
      </button>
    );
  }

  return (
    <section
      id={dialogId}
      role="dialog"
      aria-modal="false"
      aria-label="VeriFour NASA RAG Assistant"
      className="fixed bottom-4 right-4 z-50 flex max-h-[min(86vh,720px)] w-[min(94vw,430px)] flex-col overflow-hidden rounded-2xl border border-cyan-500/45 bg-slate-950/95 text-xs text-slate-100 shadow-[0_24px_60px_-15px_rgba(8,145,178,0.55)] backdrop-blur-xl"
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-slate-800 bg-[linear-gradient(135deg,rgba(8,47,73,0.72),rgba(15,23,42,0.95))] px-3.5 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
            <h2 className="truncate text-sm font-bold text-slate-50">
              VeriFour NASA RAG Assistant
            </h2>
          </div>
          <div className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-sky-500/35 bg-sky-950/60 px-2.5 py-0.5 text-xs font-medium text-sky-200">
            <Sparkles className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
            <span>JPL DE441 · LOLA 240m · Literature Cited</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setKeyPanelOpen((prev) => !prev);
              setKeyStatusMsg(null);
            }}
            aria-expanded={keyPanelOpen}
            title="Configure OpenAI API key in browser localStorage"
            className={`inline-flex min-h-[32px] items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition ${
              savedKey
                ? 'border-emerald-500/50 bg-emerald-950/60 text-emerald-200 hover:bg-emerald-900/70'
                : 'border-slate-700 bg-slate-900/90 text-slate-300 hover:border-cyan-400/50 hover:text-white'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{savedKey ? 'Key Set' : 'API Key'}</span>
          </button>

          {messages.length > 1 && (
            <button
              type="button"
              onClick={handleResetChat}
              aria-label="Reset conversation"
              title="Reset conversation"
              className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900/90 text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setDialogOpen(false)}
            aria-label="Close NASA RAG Assistant"
            className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-slate-700 bg-slate-900/90 text-slate-300 transition hover:border-rose-400/60 hover:bg-rose-950/40 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Collapsible API Key Storage Panel */}
      {keyPanelOpen && (
        <form
          onSubmit={handleSaveKey}
          className="space-y-2 border-b border-slate-800 bg-slate-900/85 px-3.5 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={keyInputId} className="text-xs font-semibold text-slate-200">
              OpenAI API Key (stored locally in browser)
            </label>
            <span className="text-xs text-slate-400">
              {savedKey ? 'Active' : 'Fallback RAG Mode'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              id={keyInputId}
              name="verifour-openai-key"
              type={showKeyText ? 'text' : 'password'}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder="sk-proj-..."
              autoComplete="off"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKeyText((v) => !v)}
              aria-label={showKeyText ? 'Hide API key' : 'Show API key'}
              className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
            >
              {showKeyText ? (
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500/25 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/60 hover:bg-cyan-500/35"
            >
              Save
            </button>
            {savedKey && (
              <button
                type="button"
                onClick={handleClearKey}
                className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/50"
              >
                Clear
              </button>
            )}
          </div>
          {keyStatusMsg && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{keyStatusMsg}</span>
            </div>
          )}
        </form>
      )}

      {/* Live Telemetry Summary Strip */}
      <div
        aria-label="Live lunar telemetry context"
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-slate-800/90 bg-slate-900/70 px-3.5 py-2 text-xs"
      >
        <span className="font-semibold text-amber-200">
          {liveContext.selectedSite.short_name}
        </span>
        <span className="text-slate-500">·</span>
        <span className="font-mono text-slate-300">{utcCompact}</span>
        <span className="text-slate-500">·</span>
        <span className="font-mono text-amber-300">
          Sun {liveContext.trackingPct.toFixed(0)}%
        </span>
        <span className="font-mono text-sky-300">
          DTE {liveContext.windowEarthPct.toFixed(0)}%
        </span>
        <span className="font-mono text-emerald-300">
          Score{' '}
          {liveContext.viabilityScore !== null
            ? liveContext.viabilityScore.toFixed(1)
            : 'n/a'}
        </span>
      </div>

      {/* 5 One-Click Starter Questions */}
      <div className="border-b border-slate-800/80 bg-slate-950/90 px-3.5 py-2">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
          <Compass className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span>Quick NASA Prompts (1-Click):</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STARTER_QUESTIONS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isSending}
              onClick={() => void sendQuery(item.prompt)}
              className="rounded-lg border border-slate-700/90 bg-slate-900/90 px-2 py-1 text-left text-xs font-medium text-slate-200 transition hover:border-cyan-400/60 hover:bg-cyan-950/40 hover:text-cyan-100 disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const bodyText = msg.usedFallback
            ? stripLeadingFallbackNotice(msg.content)
            : msg.content;

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[94%] rounded-2xl px-3 py-2.5 shadow-md ${
                  isUser
                    ? 'border border-cyan-500/40 bg-cyan-950/55 text-slate-50'
                    : 'border border-slate-800 bg-slate-900/90 text-slate-100'
                }`}
              >
                {!isUser && msg.usedFallback && (
                  <div
                    role="status"
                    className="mb-2 space-y-1 rounded-xl border border-amber-400/45 bg-amber-950/45 px-2.5 py-2 text-xs text-amber-100"
                  >
                    <div className="flex items-start gap-1.5 font-semibold text-amber-200">
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"
                        aria-hidden="true"
                      />
                      <span>{VERIFOUR_FALLBACK_NOTICE_VI}</span>
                    </div>
                    <p className="text-xs text-amber-200/90">{VERIFOUR_FALLBACK_NOTICE_EN}</p>
                  </div>
                )}

                {renderFormattedMessage(bodyText)}

                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1 border-t border-slate-800 pt-2">
                    {msg.citations.map((cit) => (
                      <span
                        key={cit}
                        className="rounded-md border border-slate-700 bg-slate-950/90 px-2 py-0.5 text-xs text-sky-200"
                      >
                        {cit}
                      </span>
                    ))}
                  </div>
                )}

                {!isUser && msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.actions.map((act) => (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => onTriggerAction(act.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/45 bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-500/25"
                      >
                        <Rocket className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{act.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-cyan-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <span>Querying NASA RAG corpus &amp; live telemetry…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-800 bg-slate-950 px-3.5 py-2.5"
      >
        <label htmlFor={chatInputId} className="sr-only">
          Ask VeriFour NASA RAG Assistant
        </label>
        <input
          ref={inputRef}
          id={chatInputId}
          name="nasa-rag-query"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Hỏi về dữ liệu NASA, công thức, Rover 3D..."
          disabled={isSending}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending || !inputValue.trim()}
          aria-label="Send question"
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-cyan-500/25 px-3 py-2 text-xs font-semibold text-cyan-100 ring-1 ring-cyan-400/60 transition hover:bg-cyan-500/35 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Send</span>
        </button>
      </form>
    </section>
  );
};
