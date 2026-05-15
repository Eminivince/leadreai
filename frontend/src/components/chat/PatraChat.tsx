'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  success: true;
  data: { reply: string };
}

/* ── Inline Markdown renderer ────────────────────────────────────── */

type InlineNode = string | { tag: 'b' | 'i' | 'code'; text: string };

function parseInline(text: string): InlineNode[] {
  const result: InlineNode[] = [];
  // Split on **bold**, *italic*, `code`
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  const matches = Array.from(text.matchAll(re));
  let cursor = 0;
  for (const m of matches) {
    const start = m.index ?? 0;
    if (start > cursor) result.push(text.slice(cursor, start));
    if (m[1] !== undefined) result.push({ tag: 'b', text: m[1] });
    else if (m[2] !== undefined) result.push({ tag: 'i', text: m[2] });
    else if (m[3] !== undefined) result.push({ tag: 'code', text: m[3] });
    cursor = start + m[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

function InlineNodes({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (typeof n === 'string') return <span key={i}>{n}</span>;
        if (n.tag === 'b') return <strong key={i} className="font-semibold">{n.text}</strong>;
        if (n.tag === 'i') return <em key={i}>{n.text}</em>;
        return (
          <code key={i} className="bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded px-1 py-0.5 font-mono text-[11px]">
            {n.text}
          </code>
        );
      })}
    </>
  );
}

function Inline({ text }: { text: string }) {
  return <InlineNodes nodes={parseInline(text)} />;
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // HR
    if (/^-{3,}$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="border-[color:var(--rule)] my-2" />);
      i++;
      continue;
    }
    // H1
    if (line.startsWith('# ')) {
      nodes.push(<h1 key={key++} className="text-[15px] font-bold text-[color:var(--ink)] mt-3 mb-1"><Inline text={line.slice(2)} /></h1>);
      i++; continue;
    }
    // H2
    if (line.startsWith('## ')) {
      nodes.push(<h2 key={key++} className="text-[13.5px] font-bold text-[color:var(--ink)] mt-3 mb-1"><Inline text={line.slice(3)} /></h2>);
      i++; continue;
    }
    // H3
    if (line.startsWith('### ')) {
      nodes.push(<h3 key={key++} className="text-[13px] font-semibold text-[color:var(--ink)] mt-2 mb-0.5"><Inline text={line.slice(4)} /></h3>);
      i++; continue;
    }
    // Numbered list
    if (/^\d+\.\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i]!)) {
        const txt = lines[i]!.replace(/^\d+\.\s/, '');
        items.push(<li key={i}><Inline text={txt} /></li>);
        i++;
      }
      nodes.push(<ol key={key++} className="list-decimal list-inside flex flex-col gap-0.5 my-1 pl-1">{items}</ol>);
      continue;
    }
    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i]!)) {
        const txt = lines[i]!.replace(/^[-*]\s/, '');
        items.push(<li key={i}><Inline text={txt} /></li>);
        i++;
      }
      nodes.push(<ul key={key++} className="list-disc list-inside flex flex-col gap-0.5 my-1 pl-1">{items}</ul>);
      continue;
    }
    // Blank line
    if (line.trim() === '') { i++; continue; }
    // Paragraph
    nodes.push(<p key={key++} className="leading-[1.65]"><Inline text={line} /></p>);
    i++;
  }

  return <div className="flex flex-col gap-1.5 text-[13px]">{nodes}</div>;
}

/* ── Icons ──────────────────────────────────────────────────────── */
function PatraIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.06L2 22l4.94-1.37A9.96 9.96 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8.5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Typing dots ─────────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map((idx) => (
        <span
          key={idx}
          className="w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)] animate-bounce"
          style={{ animationDelay: `${idx * 0.15}s`, animationDuration: '0.9s' }}
        />
      ))}
    </div>
  );
}

/* ── Bubble ──────────────────────────────────────────────────────── */
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 ${
          isUser
            ? 'bg-[color:var(--ink)] text-[color:var(--paper)] text-[13px] leading-[1.6] whitespace-pre-wrap'
            : 'bg-[color:var(--paper-2)] border border-[color:var(--rule)] text-[color:var(--ink)]'
        }`}
      >
        {isUser ? msg.content : <MarkdownContent content={msg.content} />}
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */
export function PatraChat() {
  const { workspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !workspaceId) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    if (inputRef.current) inputRef.current.style.height = 'auto';

    try {
      const res = await apiFetch<ChatResponse>(
        `/api/v1/workspaces/${workspaceId}/chat`,
        { method: 'POST', body: JSON.stringify({ messages: history }) },
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong — please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, workspaceId]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Patra assistant"
        className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
          open
            ? 'bg-[color:var(--ink)]/80 scale-90'
            : 'bg-[color:var(--ink)] hover:bg-[color:var(--ember)] hover:scale-105'
        }`}
      >
        {open
          ? <CloseIcon className="w-4 h-4 text-[color:var(--paper)]" />
          : <PatraIcon className="w-5 h-5 text-[color:var(--paper)]" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-x-2 bottom-[72px] sm:inset-x-auto sm:bottom-[88px] sm:right-6 z-50 w-auto sm:w-[380px] mx-auto sm:mx-0 max-w-[calc(100vw-16px)] sm:max-w-[calc(100vw-24px)] h-[calc(100vh-96px)] sm:h-[min(560px,calc(100vh-120px))] flex flex-col bg-[color:var(--paper)] border border-[color:var(--rule)] shadow-2xl rounded-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--rule)] shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[color:var(--ink)] flex items-center justify-center">
                <PatraIcon className="w-3.5 h-3.5 text-[color:var(--paper)]" />
              </div>
              <div>
                <div className="text-[13.5px] font-semibold text-[color:var(--ink)] leading-tight">Patra</div>
                <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ember)] leading-tight">AI assistant</div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition rounded-md"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0">
            {isEmpty && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                <div className="w-10 h-10 rounded-full bg-[color:var(--paper-2)] border border-[color:var(--rule)] flex items-center justify-center text-[color:var(--ink-2)]">
                  <PatraIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-[color:var(--ink)] mb-1">Hi, I&rsquo;m Patra</div>
                  <p className="text-[12.5px] text-[color:var(--ink-3)] leading-[1.6] max-w-[240px]">
                    Ask me about finding leads, running campaigns, or anything on the platform.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 w-full mt-2">
                  {[
                    'How do I find Nigerian fintech leads?',
                    'Help me write a cold email opening line',
                    'What does the AI score mean?',
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="w-full text-left text-[12px] text-[color:var(--ink-2)] border border-[color:var(--rule)] rounded-lg px-3 py-2 hover:border-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, idx) => <Bubble key={idx} msg={msg} />)}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-xl">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-[color:var(--rule)] px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask Patra anything…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded-lg px-3 py-2.5 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none focus:border-[color:var(--ink-2)] transition-colors leading-[1.5] min-h-[40px]"
                style={{ height: 'auto' }}
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 rounded-lg bg-[color:var(--ink)] text-[color:var(--paper)] flex items-center justify-center hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40 shrink-0"
              >
                <SendIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="font-mono text-[9px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] mt-1.5 text-center">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </div>
      )}
    </>
  );
}
