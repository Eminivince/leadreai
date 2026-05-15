'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useJob } from '@/hooks/useJob';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { PageHelp } from '@/components/ui/PageHelp';
import type {
  ApiResponse,
  ProspectingJob,
  ClarificationQuestion,
  ClarificationAnswer,
  PolicyDecision,
  JobActivityLogEntry,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Dashboard — refined B2B SaaS surface.
 *
 * Composition (top → bottom):
 *   1. MetricsStrip   — live counters in tabular-nums (signature)
 *   2. Compose        — the primary action, with focus-ring textarea
 *   3. ActiveDispatch — the running/most-recent job, expanded card
 *   4. RecentDispatches — past jobs as a hoverable table
 *
 * Cost is intentionally NOT shown here — the credits chip in the
 * Topbar carries balance awareness; the 30-day usage widget moved
 * to settings/billing. Per-job cost lives on the lead detail view.
 * ───────────────────────────────────────────────────────────────── */

const EXAMPLE_QUERIES = [
  'Top 20 fintech companies in Nigeria with recent funding — give me CEO name and work email.',
  'Managing partners at mid-tier Nigerian law firms, excluding the big five.',
  'Procurement leads at mid-sized Kenyan manufacturers (not blue-chip).',
  'Series A+ SaaS companies in Lagos using Salesforce — Head of Engineering preferred.',
];

function ArrowEast({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2 8h12M10 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`${className} animate-spin`} aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const SEARCH_LOADING_COPY = [
  'Analysing query…',
  'Checking policy…',
  'Generating questions…',
];

/* ── Compose — hero query input ─────────────────────────────── */
function Compose({
  onSubmit,
  isSubmitting,
  isDimmed = false,
  error,
  initialPrompt,
}: {
  onSubmit: (q: string) => Promise<string | null>;
  isSubmitting: boolean;
  /** Dim + disable the composer while a clarification round is in flight. */
  isDimmed?: boolean;
  error: string | null;
  initialPrompt?: string;
}) {
  const { workspaceId } = useWorkspace();
  const { openTopUp } = useAppStore();
  const qc = useQueryClient();
  const [value, setValue] = useState(initialPrompt ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [loadingCopyIdx, setLoadingCopyIdx] = useState(0);
  const [devBusy, setDevBusy] = useState(false);

  const isInsufficientCredits = error?.startsWith('Insufficient credits') ?? false;

  async function handleDevAddCredits() {
    setDevBusy(true);
    try {
      await apiFetch('/api/v1/credits/test-topup', {
        method: 'POST',
        body: JSON.stringify({ amount: 10 }),
      });
      await qc.invalidateQueries({ queryKey: ['credits'] });
    } finally {
      setDevBusy(false);
    }
  }

  useEffect(() => {
    if (!isSubmitting) { setLoadingCopyIdx(0); return; }
    const id = setInterval(() => setLoadingCopyIdx((p) => (p + 1) % SEARCH_LOADING_COPY.length), 2200);
    return () => clearInterval(id);
  }, [isSubmitting]);

  // Focus + scroll into view the moment a prefilled prompt lands (e.g.
  // the user came here from the Library detail page). Textarea stays a
  // controlled input so typing works normally afterward.
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setValue(initialPrompt);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  // Surface how many Library docs will ground the next dispatch — the
  // `read_document` tool is auto-called on every job, so this makes the
  // "your docs are in scope" fact visible instead of silent.
  const { data: libraryData } = useQuery({
    queryKey: ['library-ready-count', workspaceId],
    queryFn: () =>
      apiFetch<{
        success: true;
        data: {
          data: Array<{ status: string }>;
          total: number;
        };
      }>(`/api/v1/workspaces/${workspaceId}/library?limit=100`),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
  const readyLibraryCount = (libraryData?.data?.data ?? []).filter(
    (d) => d.status === 'ready',
  ).length;

  async function handleSubmit() {
    const trimmed = value.trim();
    if (trimmed.length < 10) return;
    const jobId = await onSubmit(trimmed);
    if (jobId) setValue('');
  }

  return (
    <section
      className={`relative transition-opacity ${isDimmed ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
      aria-hidden={isDimmed || undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
          New search
        </span>
        <PageHelp
          title="New search"
          body="Describe the contacts you need and the AI builds a list of leads. One credit covers the whole job."
          tips={[
            'Be specific — include industry, geography, seniority, or funding stage.',
            'You can ask for extra columns like revenue, headcount, or LinkedIn URL.',
            'Running searches appear below. Click them to watch progress in real time.',
          ]}
        />
      </div>

      <div>
        {/* Compose card — quiet by default. Soft amber glow ring on
            focus-within so the textarea + the submit button read as
            one connected surface. The same ring stays lit while the
            request is in-flight, signalling activity without yanking
            colour. Replaces the old broadsheet headline + dashed
            border treatment. */}
        <div
          className={`relative bg-[color:var(--paper)] border rounded-xl transition-all duration-200 focus-within:border-[color:var(--ember)]/60 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ember)_8%,transparent)] ${
            isSubmitting
              ? 'border-[color:var(--ember)]/60 shadow-[0_0_0_4px_color-mix(in_srgb,var(--ember)_8%,transparent)]'
              : 'border-[color:var(--rule)]'
          }`}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Top 50 Nigerian fintechs with Series-B funding. CEO name, work email, phone..."
            rows={3}
            className="block w-full bg-transparent resize-none px-5 pt-5 pb-3 text-[15.5px] md:text-[16.5px] leading-[1.55] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3 px-5 pb-4">
            <span className="font-mono text-[10.5px] tabular-nums tracking-[0.04em] text-[color:var(--ink-3)]">
              {value.length === 0
                ? 'Min 10 characters'
                : value.length < 10
                  ? `${10 - value.length} more`
                  : `${value.length} chars · ⌘↵`}
            </span>
            <button
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || value.trim().length < 10}
              className={`group inline-flex items-center gap-1.5 px-3.5 h-8 rounded-md text-[12.5px] font-medium tabular-nums transition-all disabled:cursor-not-allowed ${
                isSubmitting
                  ? 'bg-[color:var(--ember)] text-white'
                  : 'bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] disabled:opacity-40 disabled:hover:bg-[color:var(--ink)]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <SpinIcon className="w-3 h-3 shrink-0" />
                  <span key={loadingCopyIdx} className="animate-[fadeIn_200ms_ease-out]">
                    {SEARCH_LOADING_COPY[loadingCopyIdx]}
                  </span>
                </>
              ) : (
                <>
                  Run
                  <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error banner — soft red bar with status dot */}
        {error && (
          <div className="mt-3 flex items-start gap-3 rounded-lg border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-4 py-3 text-[13px] text-[color:var(--ink)]">
            <span className="mt-[6px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--warn)] block mb-0.5">
                Rejected
              </span>
              <span className="text-[color:var(--ink-2)]">{error}</span>
              {isInsufficientCredits && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={openTopUp}
                    className="inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3 h-7 rounded-md text-[12px] font-medium hover:bg-[color:var(--ember)] transition-colors"
                  >
                    Buy credits
                  </button>
                  {process.env.NODE_ENV === 'development' && (
                    <button
                      type="button"
                      onClick={() => void handleDevAddCredits()}
                      disabled={devBusy}
                      className="inline-flex items-center gap-1.5 border border-[color:var(--rule)] px-3 h-7 rounded-md text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink-2)] transition-colors disabled:opacity-50"
                    >
                      {devBusy ? 'Adding…' : 'Dev: +10 credits'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Library-in-scope chip — small, mono, sits with the suggestions */}
        {readyLibraryCount > 0 && (
          <div className="mt-4">
            <Link
              href="/dashboard/library"
              title="The agent reads these before every search"
              className="inline-flex items-center gap-2 rounded-md border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06] hover:border-[color:var(--ember)]/60 px-2.5 h-7 transition-colors"
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" aria-hidden />
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ember-2)] tabular-nums">
                {readyLibraryCount} {readyLibraryCount === 1 ? 'doc' : 'docs'} in scope
              </span>
            </Link>
          </div>
        )}

        {/* Example chips */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] mr-1.5">
            Try
          </span>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => {
                setValue(q);
                inputRef.current?.focus();
              }}
              className="text-[12px] text-[color:var(--ink-2)] bg-[color:var(--paper-2)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] rounded-md px-2.5 py-1 transition-colors"
            >
              {q.length > 64 ? q.slice(0, 62) + '\u2026' : q}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Clarify loading panel — while /jobs/clarify is in-flight ──
 *
 * The clarify call takes anywhere from 3s on a cache-hit to 40s+ on a
 * cold LLM. We don't try to predict a completion target — the earlier
 * "~12s typical" was guesswork and when it was wrong it damaged trust.
 * Instead we show an honest elapsed counter, a looping indeterminate
 * bar (no fake percentage), and rotating subcopy that narrates the
 * three backend stages in aggregate.
 *
 * After 20s we pivot the subcopy to acknowledge the longer-than-usual
 * wait so the user isn't left wondering whether we're stuck.
 */
function ClarifyLoadingPanel({ query, startedAt }: { query: string; startedAt: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsedMs = Math.max(0, now - startedAt);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const runningLong = elapsedMs > 20_000;

  // Rolling subcopy — narrates what's happening in aggregate. Once we
  // cross 20s we swap to a "still working" variant so the UI stops
  // promising "almost done" indefinitely.
  const phases = runningLong
    ? [
        'Still verifying — this search needs extra reasoning.',
        'Cross-checking policy and intent.',
        'Refining the clarifying questions.',
      ]
    : [
        'Checking policy boundaries.',
        'Parsing your intent.',
        'Generating clarifying questions.',
      ];
  const phaseIdx = Math.min(phases.length - 1, Math.floor(elapsedMs / 3500));
  const phaseText = phases[phaseIdx];

  return (
    <section className="relative">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="block w-8 h-px bg-[color:var(--ember)]" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)]">
            Verifying
          </span>
          {/* Tiny pulsing dot so the panel never feels static */}
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] animate-pulse"
            aria-hidden
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          {elapsedSec}s elapsed
        </span>
      </div>

      <div className="bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm px-6 md:px-8 py-7 md:py-8">
        <h3 className=" text-[28px] md:text-[34px] leading-[1.05] text-[color:var(--ink)]">
          Verifying your <em className="italic text-[color:var(--ember)]">search</em>…
        </h3>
        {query && (
          <p className="mt-3  italic text-[14.5px] text-[color:var(--ink-2)] line-clamp-2">
            &ldquo;{query}&rdquo;
          </p>
        )}

        <div className="mt-6">
          {/* Indeterminate sweep — the bar doesn't claim to know how
              long this will take, so it doesn't pretend. CSS-driven in
              globals.css::indeterminate-bar. */}
          <div className="indeterminate-bar h-[2px] bg-[color:var(--rule)]/40" aria-hidden />
          <p
            key={phaseText}
            className="mt-3  text-[13.5px] text-[color:var(--ink-2)] animate-[fadeIn_280ms_ease-out]"
          >
            {phaseText}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Clarification panel — AI checklist after initial query ───
 *
 * Renders when the backend's /jobs/clarify returned at least one question.
 * Required questions must be answered before "Start search" enables;
 * optional questions can be skipped. "Edit query" sends the user back to
 * the composer with their original text preserved.
 */
function ClarificationPanel({
  query,
  questions,
  answers,
  onChange,
  onSubmit,
  onEditQuery,
  isSubmitting,
  error,
}: {
  query: string;
  questions: ClarificationQuestion[];
  answers: Record<string, string | string[]>;
  onChange: (next: Record<string, string | string[]>) => void;
  onSubmit: () => void;
  onEditQuery: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const { openTopUp } = useAppStore();
  const qc = useQueryClient();
  const [devBusy, setDevBusy] = useState(false);
  const isInsufficientCredits = error?.startsWith('Insufficient credits') ?? false;

  async function handleDevAddCredits() {
    setDevBusy(true);
    try {
      await apiFetch('/api/v1/credits/test-topup', {
        method: 'POST',
        body: JSON.stringify({ amount: 10 }),
      });
      await qc.invalidateQueries({ queryKey: ['credits'] });
    } finally {
      setDevBusy(false);
    }
  }

  const requiredAnswered = questions
    .filter((q) => q.required)
    .every((q) => {
      const a = answers[q.id];
      if (q.type === 'multi') return Array.isArray(a) && a.length > 0;
      return typeof a === 'string' && a.trim().length > 0;
    });

  const setAnswer = (id: string, value: string | string[]) => {
    onChange({ ...answers, [id]: value });
  };

  return (
    <section className="relative">
      <div className="flex items-center gap-3 mb-6">
        <span className="block w-8 h-px bg-[color:var(--ember)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)]">
          Before we search — a few clarifying questions
        </span>
      </div>

      {/* Query echo — read-only reminder of what they asked */}
      <div className="mb-6 border-l-2 border-[color:var(--rule)] pl-4 max-w-[880px]">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] mb-1">
          Your query
        </div>
        <p className=" italic text-[18px] md:text-[20px] leading-[1.4] text-[color:var(--ink)]">
          &ldquo;{query}&rdquo;
        </p>
      </div>

      <p className="mb-8  text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[680px]">
        The agent would rather ask than guess. Answer what you can — required items are marked. Skipping an optional question just lets the agent infer.
      </p>

      <div className="flex flex-col gap-8 max-w-[880px]">
        {questions.map((q, i) => (
          <QuestionRow
            key={q.id}
            index={i}
            question={q}
            answer={answers[q.id]}
            onChange={(v) => setAnswer(q.id, v)}
          />
        ))}
      </div>

      {error && (
        <div className="mt-6 border-l-2 border-[color:var(--warn)] bg-[color:var(--paper-3)] px-4 py-3 max-w-[880px]  text-[13px] text-[color:var(--ink)]">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--warn)] block mb-1">
            Rejected
          </span>
          <span>{error}</span>
          {isInsufficientCredits && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={openTopUp}
                className="inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3 py-1.5 rounded-full text-[12px] font-medium hover:bg-[color:var(--ember)] transition-colors"
              >
                Buy credits
              </button>
              {process.env.NODE_ENV === 'development' && (
                <button
                  type="button"
                  onClick={() => void handleDevAddCredits()}
                  disabled={devBusy}
                  className="inline-flex items-center gap-1.5 border border-[color:var(--rule)] px-3 py-1.5 rounded-full text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink-2)] transition-colors disabled:opacity-50"
                >
                  {devBusy ? 'Adding…' : 'Dev: Add 10 credits'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-10 flex items-center gap-3 flex-wrap">
        <button
          onClick={onSubmit}
          disabled={!requiredAnswered || isSubmitting}
          title={
            !requiredAnswered ? 'Answer the required questions first'
              : isSubmitting ? 'Running the search…'
              : undefined
          }
          className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Starting the search…' : 'Start the search'}
          <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </button>
        <button
          onClick={onEditQuery}
          disabled={isSubmitting}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] inline-flex items-center gap-2 disabled:opacity-50"
        >
          Edit query
        </button>
      </div>
    </section>
  );
}

function QuestionRow({
  index,
  question,
  answer,
  onChange,
}: {
  index: number;
  question: ClarificationQuestion;
  answer: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-4 mb-3">
        <span className=" italic text-[22px] leading-none text-[color:var(--ink-3)] tabular-nums shrink-0">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className=" text-[15px] text-[color:var(--ink)]">
              {question.question}
            </span>
            {question.required ? (
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--warn)]">
                Required
              </span>
            ) : (
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Optional
              </span>
            )}
          </div>
          {question.rationale && (
            <p className="mt-1  italic text-[12.5px] text-[color:var(--ink-2)]">
              {question.rationale}
            </p>
          )}
        </div>
      </div>

      <div className="ml-[38px]">
        {question.type === 'text' && (
          <div className="border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)] transition-colors">
            <input
              type="text"
              value={typeof answer === 'string' ? answer : ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder ?? 'Type an answer'}
              className="w-full bg-transparent py-2 outline-none  text-[14.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
            />
          </div>
        )}

        {question.type === 'single' && (question.options ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(question.options ?? []).map((opt) => {
              const on = answer === opt;
              return (
                <button
                  key={opt}
                  onClick={() => onChange(opt)}
                  className={`h-9 px-4 rounded-full  text-[12.5px] transition-colors ${
                    on
                      ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                      : 'border border-[color:var(--rule)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink)]'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        )}

        {question.type === 'multi' && (question.options ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(question.options ?? []).map((opt) => {
              const selected = Array.isArray(answer) && answer.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => {
                    const current = Array.isArray(answer) ? answer : [];
                    const next = selected ? current.filter((x) => x !== opt) : [...current, opt];
                    onChange(next);
                  }}
                  className={`h-9 px-4 rounded-full  text-[12.5px] transition-colors ${
                    selected
                      ? 'bg-[color:var(--ember)] text-[color:var(--paper)]'
                      : 'border border-[color:var(--rule)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink)]'
                  }`}
                >
                  {selected ? '✓ ' : ''}{opt}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Refusal panel — policy guardrail triggered ─────────────── */
const REFUSAL_CATEGORY_COPY: Record<string, { label: string; lede: string }> = {
  privacy: {
    label: 'Privacy',
    lede: 'This query would need personal contact info for private individuals — which we don’t harvest.',
  },
  sensitive: {
    label: 'Sensitive attributes',
    lede: 'Targeting by health, religion, politics, or similar protected categories isn’t something this platform does.',
  },
  stalking: {
    label: 'Private individuals',
    lede: 'We don’t track or surface private individuals outside their public professional capacity.',
  },
  low_quality: {
    label: 'Data quality',
    lede: 'Inferred “interest” for private individuals is fabricated — we’d give you numbers that look real but aren’t.',
  },
  unsupported: {
    label: 'Out of scope',
    lede: 'This is outside the kind of research the platform runs.',
  },
};

function RefusalPanel({
  query,
  policy,
  onTryReframe,
  onDismiss,
}: {
  query: string;
  policy: PolicyDecision;
  onTryReframe: (suggestion: string) => void;
  onDismiss: () => void;
}) {
  const category = policy.category ?? 'unsupported';
  const copy = REFUSAL_CATEGORY_COPY[category] ?? REFUSAL_CATEGORY_COPY.unsupported!;
  const suggestions = policy.suggestions ?? [];

  return (
    <section className="relative">
      <div className="flex items-center gap-3 mb-6">
        <span className="block w-8 h-px bg-[color:var(--warn)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--warn)]">
          Can&rsquo;t run this search — {copy.label.toLowerCase()}
        </span>
      </div>

      {/* Query echo */}
      <div className="mb-6 border-l-2 border-[color:var(--rule)] pl-4 max-w-[880px]">
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] mb-1">
          Your query
        </div>
        <p className=" italic text-[18px] md:text-[20px] leading-[1.4] text-[color:var(--ink)]">
          &ldquo;{query}&rdquo;
        </p>
      </div>

      {/* Lede + reason */}
      <div className="max-w-[720px] mb-8">
        <h2 className=" text-[28px] md:text-[34px] leading-[1.1] text-[color:var(--ink)] mb-3">
          {copy.lede}
        </h2>
        {policy.reason && (
          <p className=" text-[14.5px] leading-[1.6] text-[color:var(--ink-2)]">
            {policy.reason}
          </p>
        )}
      </div>

      {/* Reframe suggestions */}
      {suggestions.length > 0 && (
        <div className="max-w-[880px] mb-8">
          <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] mb-3">
            Try one of these instead
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onTryReframe(s)}
                className="group text-left border border-[color:var(--rule)] bg-[color:var(--paper-3)] hover:border-[color:var(--ember)] hover:bg-[color:var(--ember)]/5 rounded-sm px-4 py-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className=" italic text-[18px] leading-none text-[color:var(--ink-3)] group-hover:text-[color:var(--ember)] tabular-nums shrink-0 mt-1">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1  text-[14px] leading-[1.55] text-[color:var(--ink)]">
                    {s}
                  </span>
                  <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--ember)] mt-1.5 transition-colors" />
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3  italic text-[12.5px] text-[color:var(--ink-3)]">
            Click a suggestion to use it, or write your own.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={onDismiss}
          className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-5 py-2.5 rounded-full  text-[13px] transition-colors"
        >
          Edit my query
        </button>
      </div>
    </section>
  );
}

/* ── Status chip ────────────────────────────────────────────── */
function StatusChip({ status }: { status: ProspectingJob['status'] }) {
  const map: Record<ProspectingJob['status'], { label: string; color: string }> = {
    queued:        { label: 'Queued',        color: 'text-[color:var(--ink-2)] bg-[color:var(--paper-2)]' },
    parsing:       { label: 'Parsing',       color: 'text-[color:var(--ember)] bg-[color:var(--paper-3)]' },
    collecting:    { label: 'Collecting',    color: 'text-[color:var(--ember)] bg-[color:var(--paper-3)]' },
    enriching:     { label: 'Enriching',     color: 'text-[color:var(--ember)] bg-[color:var(--paper-3)]' },
    deduplicating: { label: 'Finalizing',    color: 'text-[color:var(--ember)] bg-[color:var(--paper-3)]' },
    complete:      { label: 'Complete',      color: 'text-[color:var(--ember)] bg-[color:var(--paper-3)]' },
    failed:        { label: 'Failed',        color: 'text-[color:var(--warn)] bg-[color:var(--paper-3)]' },
    cancelled:     { label: 'Cancelled',     color: 'text-[color:var(--ink-2)] bg-[color:var(--paper-2)]' },
  };
  const chip = map[status] ?? map.queued;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2 py-0.5 border border-[color:var(--rule)] ${chip.color}`}
    >
      {status !== 'complete' && status !== 'failed' && status !== 'cancelled' && (
        <span className="block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] animate-pulse" />
      )}
      {chip.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

/* ── Library citations — surfaces read_document hits ────────── */
interface Citation {
  documentId: string;
  title: string;
  fileType: string;
  chunks: number;
  topSimilarity: number;
}

function LibraryCitations({ job }: { job: ProspectingJob }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = ((job as any).activityLog ?? []) as Array<{
    step?: string;
    meta?: { citations?: Citation[] };
  }>;

  // Collapse multiple read_document events into a per-doc max-similarity +
  // summed chunk count. The same doc may be cited across several turns;
  // we want one card per doc, not a pile of duplicates.
  const byDoc = new Map<string, Citation>();
  for (const entry of log) {
    if (entry.step !== 'library_citation') continue;
    for (const c of entry.meta?.citations ?? []) {
      const prev = byDoc.get(c.documentId);
      if (prev) {
        prev.chunks += c.chunks;
        prev.topSimilarity = Math.max(prev.topSimilarity, c.topSimilarity);
      } else {
        byDoc.set(c.documentId, { ...c });
      }
    }
  }
  const citations = [...byDoc.values()].sort((a, b) => b.topSimilarity - a.topSimilarity);
  if (citations.length === 0) return null;

  return (
    <div className="mt-5 pt-5 border-t border-[color:var(--rule)]">
      <div className="flex items-center gap-3 mb-3">
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ember)]">
          Cited from your Library
        </span>
        <span className="flex-1 h-px bg-[color:var(--ember)]/20" />
      </div>
      <ul className="flex flex-wrap gap-2">
        {citations.map((c) => (
          <li key={c.documentId}>
            <Link
              href={`/dashboard/library/${c.documentId}`}
              className="group inline-flex items-center gap-2 border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/5 hover:border-[color:var(--ember)] rounded-full px-3 py-1 transition-colors"
              title={`${c.chunks} chunk${c.chunks === 1 ? '' : 's'} · top similarity ${Math.round(
                c.topSimilarity * 100,
              )}%`}
            >
              <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ember)]">
                {c.fileType}
              </span>
              <span className=" italic text-[12.5px] text-[color:var(--ink)] max-w-[220px] truncate">
                {c.title}
              </span>
              <span className="font-mono text-[9.5px] tabular-nums text-[color:var(--ember)]">
                ×{c.chunks}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Live audit trail — the agent's running decisions ────────
 *
 * Streams every activity-log entry via SSE (useJob hook) while the
 * dispatch is live, and falls back to the persisted Mongo log once
 * the job terminates. Default-open when active so the user can watch
 * the agent reason; default-closed on terminal jobs — the receipt has
 * already been filed.
 *
 * Counters (leads found / discarded / tools) are derived from entry
 * `step` strings; these are the canonical names the worker emits
 * (see workers/src/pipeline/leadWriter.ts + agent.ts). If you rename
 * a step there, the counter here silently drops to zero — keep them
 * in sync or switch to a `category` field.
 *
 * Auto-scroll pauses when the user scrolls up (tail -f UX). A tiny
 * "Jump to latest" pill appears so they can catch back up.
 */
function AuditTrail({ job }: { job: ProspectingJob }) {
  const { workspaceId } = useWorkspace();
  const isActive =
    job.status === 'queued' ||
    job.status === 'parsing' ||
    job.status === 'collecting' ||
    job.status === 'enriching' ||
    job.status === 'deduplicating';

  // Live SSE feed while active; fall back to the frozen Mongo log once
  // the job is terminal so the section remains useful retrospectively.
  const { activityLog: liveLog } = useJob(
    isActive ? workspaceId : null,
    isActive ? job._id : null,
  );
  const entries: JobActivityLogEntry[] = useMemo(
    () => (isActive && liveLog.length > 0 ? liveLog : (job.activityLog ?? [])),
    [isActive, liveLog, job.activityLog],
  );

  const [open, setOpen] = useState(isActive);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Re-open when the job transitions from idle → active (e.g. a fresh
  // dispatch lands in this card). Closing stays sticky past that.
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  // Auto-scroll only if the user hasn't manually scrolled up. We
  // detect "at bottom" with a 24px threshold because render-timing
  // means scrollTop is sometimes a few pixels off exact.
  useEffect(() => {
    if (!open || !autoScroll || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, open, autoScroll]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  }

  // Derive counters from step names. These match the worker's emission
  // points in workers/src/pipeline/*.ts — keep synced when adding
  // new emission sites.
  const counts = useMemo(() => {
    let found = 0;
    let discarded = 0;
    let tools = 0;
    let errors = 0;
    for (const e of entries) {
      const s = e.step;
      if (s === 'lead_written' || s === 'lead_upserted' || s === 'lead_found' || s === 'lead_merged') found += 1;
      else if (s === 'lead_discarded' || s === 'lead_rejected' || s === 'duplicate_skipped') discarded += 1;
      else if (s === 'tool_call' || s === 'agent_tool') tools += 1;
      else if (s === 'error' || s === 'pipeline_error') errors += 1;
    }
    return { found, discarded, tools, errors };
  }, [entries]);

  if (entries.length === 0 && !isActive) return null;

  return (
    <div className="mt-6 pt-5 border-t border-[color:var(--rule)]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            Audit trail
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] stream-dot" aria-hidden />
              <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ember)]">
                live
              </span>
            </span>
          )}
          <span className="font-mono text-[10px] text-[color:var(--ink-3)] truncate">
            · {entries.length} step{entries.length === 1 ? '' : 's'}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] transition">
          {open ? '— hide' : '+ show'}
        </span>
      </button>

      {open && (
        <>
          {/* Counters strip — one-line summary of what's happened so far */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
            <Counter label="Leads found" value={counts.found} tone="positive" />
            <Counter label="Discarded" value={counts.discarded} tone="muted" />
            <Counter label="Tool calls" value={counts.tools} tone="muted" />
            <Counter label="Errors" value={counts.errors} tone={counts.errors > 0 ? 'negative' : 'muted'} />
          </div>

          {/* Scrolling log */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="mt-4 max-h-[360px] overflow-y-auto border border-[color:var(--rule)] rounded-sm bg-[color:var(--paper)]"
          >
            {entries.length === 0 ? (
              <p className="px-4 py-6  italic text-[13px] text-[color:var(--ink-3)] text-center">
                Waiting for the agent to file its first step…
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--rule)]/60">
                {entries.map((line, i) => (
                  <AuditEntry key={`${line.at}-${i}`} entry={line} />
                ))}
              </ul>
            )}
          </div>

          {/* Jump-to-latest pill — appears when the user has scrolled up
              while the feed keeps landing new entries at the bottom. */}
          {isActive && !autoScroll && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }}
                className="inline-flex items-center gap-1.5 border border-[color:var(--rule)] hover:border-[color:var(--ink)] bg-[color:var(--paper)] px-3 py-1 rounded-full font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
              >
                ↓ jump to latest
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'negative' | 'muted';
}) {
  const valueColor =
    tone === 'positive'
      ? 'text-[color:var(--ember)]'
      : tone === 'negative'
        ? 'text-[color:var(--warn)]'
        : 'text-[color:var(--ink)]';
  return (
    <div>
      <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] block">
        {label}
      </span>
      <span className={` text-[20px] tabular-nums leading-none ${valueColor}`}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

/* Step → tone mapping. Step names come from the worker pipeline; keep
 * synced with workers/src/pipeline/**. Unknown steps render as neutral. */
function stepTone(step: string): 'positive' | 'negative' | 'warning' | 'neutral' {
  if (step === 'lead_written' || step === 'lead_upserted' || step === 'lead_found' || step === 'lead_merged') return 'positive';
  if (step === 'lead_discarded' || step === 'lead_rejected' || step === 'duplicate_skipped') return 'warning';
  if (step === 'error' || step === 'pipeline_error' || step === 'critic_stop') return 'negative';
  return 'neutral';
}

function AuditEntry({ entry }: { entry: JobActivityLogEntry }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const tone = stepTone(entry.step);
  const stepClass =
    tone === 'positive'
      ? 'text-[color:var(--ember)] border-[color:var(--ember)]/40'
      : tone === 'warning'
        ? 'text-[color:var(--ember-2,#a9542d)] border-[color:var(--rule)]'
        : tone === 'negative'
          ? 'text-[color:var(--warn)] border-[color:var(--warn)]/40'
          : 'text-[color:var(--ink-2)] border-[color:var(--rule)]';

  const hasMeta = entry.meta && Object.keys(entry.meta).length > 0;
  let timeStr = '';
  try {
    timeStr = new Date(entry.at).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    timeStr = entry.at;
  }

  return (
    <li className="px-3 py-2">
      <div className="flex items-baseline gap-3">
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]">
          {timeStr}
        </span>
        <span
          className={`shrink-0 inline-flex items-center border px-1.5 py-0.5 rounded-full font-mono text-[9px] tracking-[0.14em] uppercase ${stepClass}`}
        >
          {entry.step}
        </span>
        <span className="min-w-0  text-[13px] text-[color:var(--ink)] leading-snug">
          {entry.message}
        </span>
        {hasMeta && (
          <button
            onClick={() => setMetaOpen((v) => !v)}
            className="ml-auto shrink-0 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
          >
            {metaOpen ? 'less' : 'more'}
          </button>
        )}
      </div>
      {hasMeta && metaOpen && (
        <pre className="mt-1.5 ml-[84px] max-h-40 overflow-auto bg-[color:var(--paper-3)]/60 border border-[color:var(--rule)] rounded-sm px-2 py-1.5 font-mono text-[10px] text-[color:var(--ink-2)] whitespace-pre-wrap">
          {JSON.stringify(entry.meta, null, 2)}
        </pre>
      )}
    </li>
  );
}

/* ── Active Dispatch (most recent running/recent job) ──────── */
function ActiveDispatch({ job }: { job: ProspectingJob }) {
  const pct = job.progress?.percentage ?? 0;
  const stage = job.progress?.currentStage ?? 'pending';
  const found = job.progress?.leadsFoundSoFar ?? 0;
  const target = job.parsedIntent?.targetCount ?? '—';
  const schema = job.parsedIntent?.outputSchema ?? [];
  const dossierId = job._id.slice(-4).toUpperCase();
  const isLive = job.status !== 'complete' && job.status !== 'failed' && job.status !== 'cancelled';

  return (
    <section className="relative">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-2">
          {/* Live-pulse dot when the job is still running, dimmed dot
              when terminal. Replaces the "Active search" + amber rule
              eyebrow which was a broadsheet motif. */}
          {isLive ? (
            <span className="relative inline-flex">
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" />
              <span className="absolute inset-0 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-60 animate-ping" />
            </span>
          ) : (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)]" />
          )}
          <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
            {isLive ? 'Running' : 'Latest search'}
          </span>
        </div>
        <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
          #{dossierId}
        </span>
      </div>

      {/* Single calm card — no decorative paper-shadow, no dashed
          rules, no italic subject quote. The status pill, the metric
          row, and the progress bar do all the work. */}
      <div className="relative bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl overflow-hidden">
        {/* Header — relative time + status pill */}
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-3 border-b border-[color:var(--rule)]">
          <span className="font-mono text-[10.5px] text-[color:var(--ink-3)]">
            Started {relativeTime(job.createdAt)}
          </span>
          <StatusChip status={job.status} />
        </div>

        {/* Body — query, then metrics, then progress */}
        <div className="px-5 md:px-6 py-5">
          <p className="text-[15px] md:text-[16.5px] leading-[1.55] text-[color:var(--ink)] font-medium">
            {job.rawQuery}
          </p>

          {/* 3-cell metric row — tabular-nums dominates */}
          <div className="mt-5 grid grid-cols-3 gap-x-6 gap-y-4 pt-5 border-t border-[color:var(--rule)]">
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Stage
              </span>
              <div className="mt-1.5 text-[14px] text-[color:var(--ink)] capitalize">
                {(stage || '—').replace(/_/g, ' ')}
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Leads
              </span>
              <div className="mt-1 font-mono text-[26px] leading-none tabular-nums text-[color:var(--ink)]">
                {found}
                <span className="text-[12px] text-[color:var(--ink-3)] ml-1">
                  / {target}
                </span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Progress
              </span>
              <div className="mt-2.5">
                <div className="h-[3px] rounded-full bg-[color:var(--paper-3)] overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--ember)] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)]">
                  {pct}%
                </div>
              </div>
            </div>
          </div>

          {/* Library citations (if the agent cited any workspace docs) */}
          <LibraryCitations job={job} />

          {/* Live audit trail — every tool call, every decision */}
          <AuditTrail job={job} />

          {/* Output schema columns (if any) — small mono chips */}
          {schema.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[color:var(--rule)]">
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Requested columns
              </span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {schema.map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-2)] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-md px-2 py-1"
                  >
                    {c.label}
                    <span className="font-mono text-[10px] text-[color:var(--ink-3)]">
                      {c.type}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer — auto-refresh hint + view-all-leads link */}
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-3 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/40">
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
            {isLive ? 'Auto-refreshing' : 'Final'}
          </span>
          <Link
            href={`/dashboard/leads?jobId=${job._id}`}
            className="group inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--ink)] hover:text-[color:var(--ember)] transition-colors"
          >
            View all leads
            <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Recent dispatches table ───────────────────────────────────
 * Tightened from the broadsheet "italic-quote stack" into a clean
 * row-based table. Each row reads at a glance: time, query, lead
 * count, status, action. Hairline dividers, hover tint, click
 * anywhere on the row to drill in. Keeps density high — recent
 * searches are reference material, not the page's hero.
 * ─────────────────────────────────────────────────────────────── */
function RecentDispatches({ jobs }: { jobs: ProspectingJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
          Recent searches
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
          {jobs.length}
        </span>
      </div>

      <div className="rounded-xl border border-[color:var(--rule)] overflow-hidden bg-[color:var(--paper)]">
        {jobs.map((j, idx) => {
          const leads = j.result?.totalLeadsFound ?? j.progress?.leadsFoundSoFar ?? 0;
          const target = j.parsedIntent?.targetCount ?? '—';
          return (
            <Link
              key={j._id}
              href={`/dashboard/leads?jobId=${j._id}`}
              className={`group flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 hover:bg-[color:var(--paper-2)] transition-colors ${
                idx > 0 ? 'border-t border-[color:var(--rule)]' : ''
              }`}
            >
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] shrink-0 w-14">
                {relativeTime(j.createdAt)}
              </span>
              <p className="flex-1 min-w-0 text-[13.5px] leading-[1.45] text-[color:var(--ink)] truncate">
                {j.rawQuery}
              </p>
              <span className="font-mono text-[11px] tabular-nums text-[color:var(--ink-2)] hidden md:inline shrink-0 w-14 text-right">
                {leads}<span className="text-[color:var(--ink-3)]">/{target}</span>
              </span>
              <div className="shrink-0">
                <StatusChip status={j.status} />
              </div>
              <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── Empty state ──────────────────────────────────────────────
 * No prior searches. Soft card pointing the user back to the
 * compose box. No editorial italic, no decorative dashed border. */
function EmptyState() {
  return (
    <section>
      <div className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 p-6 md:p-8 flex items-start gap-4">
        <div className="shrink-0 w-9 h-9 rounded-lg bg-[color:var(--ember)]/10 border border-[color:var(--ember)]/30 flex items-center justify-center">
          <ArrowEast className="w-3.5 h-3.5 text-[color:var(--ember-2)] -rotate-90" />
        </div>
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold text-[color:var(--ink)] leading-[1.3]">
            Ready when you are
          </h3>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[560px]">
            Type a sentence in the box above describing who you&rsquo;re looking for. The
            agent returns a list of contacts with source links you can verify.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ── Metrics strip — page signature ───────────────────────────
 * Three live counters at the top of the page: jobs running now,
 * leads delivered in the last 7 days, library docs in scope.
 * Tabular-nums dominate; mono labels sit below in muted ink. The
 * cells are anchored by hairline dividers, no individual cards —
 * the strip reads as one continuous instrument panel.
 * ─────────────────────────────────────────────────────────────── */
function MetricsStrip({ jobs }: { jobs: ProspectingJob[] }) {
  const { workspaceId } = useWorkspace();

  // Live count of in-flight jobs (anything that isn't complete/failed/cancelled).
  const liveCount = jobs.filter(
    (j) => j.status !== 'complete' && j.status !== 'failed' && j.status !== 'cancelled',
  ).length;

  // Leads delivered in the last 7 days, summed across completed jobs.
  // Cheap client-side rollup — we already have the recent jobs list.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const leadsThisWeek = jobs
    .filter((j) => j.status === 'complete' && new Date(j.createdAt).getTime() >= sevenDaysAgo)
    .reduce((acc, j) => acc + (j.result?.totalLeadsFound ?? 0), 0);

  // Library docs in scope — same query the Compose hook already runs.
  // staleTime matches so React Query dedupes and we don't refetch.
  const { data: libraryData } = useQuery({
    queryKey: ['library-ready-count', workspaceId],
    queryFn: () =>
      apiFetch<{
        success: true;
        data: { data: Array<{ status: string }>; total: number };
      }>(`/api/v1/workspaces/${workspaceId}/library?limit=100`),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
  const libraryReady = (libraryData?.data?.data ?? []).filter((d) => d.status === 'ready').length;

  const cells: Array<{ label: string; value: number; href?: string; live?: boolean }> = [
    { label: 'Running', value: liveCount, live: liveCount > 0 },
    { label: 'Leads · 7d', value: leadsThisWeek, href: '/dashboard/leads' },
    { label: 'Library', value: libraryReady, href: '/dashboard/library' },
  ];

  return (
    <section
      className="grid grid-cols-3 rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden"
      aria-label="Workspace metrics"
    >
      {cells.map((c, i) => {
        const inner = (
          <div className="px-5 md:px-6 py-4 md:py-5 h-full flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              {c.live && (
                <span className="relative inline-flex">
                  <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" />
                  <span className="absolute inset-0 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-60 animate-ping" />
                </span>
              )}
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
                {c.label}
              </span>
            </div>
            <div className="font-mono text-[28px] md:text-[32px] leading-none tabular-nums text-[color:var(--ink)]">
              {c.value}
            </div>
          </div>
        );
        const cellClasses = `${i > 0 ? 'border-l border-[color:var(--rule)]' : ''} ${c.href ? 'group hover:bg-[color:var(--paper-2)] transition-colors' : ''}`;
        return c.href ? (
          <Link key={c.label} href={c.href} className={cellClasses}>
            {inner}
          </Link>
        ) : (
          <div key={c.label} className={cellClasses}>
            {inner}
          </div>
        );
      })}
    </section>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function DashboardPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);

  // If we landed here with ?prefill=..., seed the composer once and
  // scrub the query param so a reload doesn't re-apply it.
  useEffect(() => {
    const p = searchParams.get('prefill');
    if (p && p.trim()) {
      setInitialPrompt(p);
      router.replace('/dashboard', { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: jobsData } = useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob[]> & { total: number }>(
        `/api/v1/workspaces/${workspaceId}/jobs?limit=20`,
      ),
    enabled: !!workspaceId,
    refetchInterval: 6_000, // poll while the page is open so live jobs animate
  });

  const jobs = useMemo(() => jobsData?.data ?? [], [jobsData]);

  // Split: active = most recent job that isn't terminal-old, recents = older
  const { activeJob, recentJobs } = useMemo(() => {
    if (jobs.length === 0) return { activeJob: null, recentJobs: [] };
    const [head, ...rest] = jobs;
    return { activeJob: head ?? null, recentJobs: rest.slice(0, 10) };
  }, [jobs]);

  // Clarification step state. When `questions.length > 0`, the compose
  // panel is dimmed and a ClarificationPanel is shown for the user to
  // answer before the job actually runs. When `refusal` is set, a
  // RefusalPanel replaces the clarification flow.
  const [clarifyingQuery, setClarifyingQuery] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [refusal, setRefusal] = useState<PolicyDecision | null>(null);
  const [phase, setPhase] = useState<'idle' | 'clarifying' | 'answering' | 'submitting' | 'refused'>('idle');
  // Timestamp captured the moment the clarify fetch starts. Powers the
  // elapsed-seconds counter and the typical-duration bar in the
  // ClarifyLoadingPanel. Reset when the phase transitions.
  const [clarifyStartedAt, setClarifyStartedAt] = useState<number | null>(null);
  // `inFlightQuery` holds the raw text mid-clarify so the loading panel
  // can echo it back ("Verifying 'top Nigerian fintechs...'"). Kept
  // separate from `clarifyingQuery` which is only set after questions
  // return — we want the echo even when clarifying isn't done yet.
  const [inFlightQuery, setInFlightQuery] = useState<string>('');

  async function createJob(rawQuery: string, clarifications?: ClarificationAnswer[]): Promise<string | null> {
    if (!workspaceId) return null;
    try {
      const res = await apiFetch<{ success: true; data: { _id: string } }>(
        `/api/v1/workspaces/${workspaceId}/jobs`,
        { method: 'POST', body: JSON.stringify({ rawQuery, ...(clarifications ? { clarifications } : {}) }) },
      );
      await queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-stats', workspaceId] });
      return res.data._id;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Could not run that search. Try again.');
    }
  }

  /**
   * First leg: when the user files a query, we ask the backend to
   * generate clarifying questions. If the AI decides the query is
   * already specific enough and returns zero questions, we skip
   * the clarification step entirely and go straight to the job.
   */
  async function handleSubmit(rawQuery: string): Promise<string | null> {
    if (!workspaceId) return null;
    setIsSubmitting(true);
    setSubmitError(null);
    setRefusal(null);
    setInFlightQuery(rawQuery);
    setClarifyStartedAt(Date.now());
    setPhase('clarifying');
    try {
      const clarifyRes = await apiFetch<{
        success: true;
        data: { policy: PolicyDecision; questions: ClarificationQuestion[] };
      }>(
        `/api/v1/workspaces/${workspaceId}/jobs/clarify`,
        { method: 'POST', body: JSON.stringify({ rawQuery }) },
      );

      // Policy refusal short-circuits — show the refusal panel, don't run
      // clarifier or create a job. The user stays on this query until
      // they reframe.
      if (clarifyRes.data.policy.decision === 'refuse') {
        setRefusal(clarifyRes.data.policy);
        setClarifyingQuery(rawQuery);
        setPhase('refused');
        return null;
      }

      const qs = clarifyRes.data.questions ?? [];

      if (qs.length === 0) {
        // Allowed + no clarifications needed — file the job immediately.
        const jobId = await createJob(rawQuery);
        setPhase('idle');
        return jobId;
      }

      // Seed default answers: single-selects get nothing (user chooses);
      // multi-selects and text get an empty value.
      const seed: Record<string, string | string[]> = {};
      for (const q of qs) {
        seed[q.id] = q.type === 'multi' ? [] : '';
      }
      setAnswers(seed);
      setQuestions(qs);
      setClarifyingQuery(rawQuery);
      setPhase('answering');
      return null; // don't let Compose clear yet; we'll do it on confirm.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read that query. Try again.';
      setSubmitError(msg);
      setPhase('idle');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleTryReframe(suggestion: string): void {
    // Replace the composer's value with the clicked reframe. Clear all
    // clarify/refusal state so the user submits fresh.
    setInitialPrompt(suggestion);
    setRefusal(null);
    setQuestions([]);
    setAnswers({});
    setClarifyingQuery(null);
    setPhase('idle');
    setSubmitError(null);
  }

  function handleDismissRefusal(): void {
    // Send the user back to the composer with their original text so they
    // can rewrite it themselves.
    if (clarifyingQuery) setInitialPrompt(clarifyingQuery);
    setRefusal(null);
    setClarifyingQuery(null);
    setPhase('idle');
    setSubmitError(null);
  }

  /**
   * Second leg: the user has answered (or skipped optional questions).
   * Build the ClarificationAnswer[] payload and file the job.
   */
  async function handleConfirmClarify(): Promise<void> {
    if (!clarifyingQuery) return;
    setPhase('submitting');
    setSubmitError(null);
    const payload: ClarificationAnswer[] = questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: answers[q.id] ?? (q.type === 'multi' ? [] : ''),
    }));
    try {
      await createJob(clarifyingQuery, payload);
      // Reset — the new job will appear in ActiveDispatch via the poll.
      setQuestions([]);
      setAnswers({});
      setClarifyingQuery(null);
      setInitialPrompt(undefined);
      setPhase('idle');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not run that search. Try again.');
      setPhase('answering');
    }
  }

  function handleEditQuery(): void {
    // Send the user back to the composer with their original query.
    // Bumping `initialPrompt` re-seeds the textarea via Compose's effect.
    if (clarifyingQuery) setInitialPrompt(clarifyingQuery);
    setQuestions([]);
    setAnswers({});
    setClarifyingQuery(null);
    setPhase('idle');
    setSubmitError(null);
  }

  const showClarification = phase === 'answering' || phase === 'submitting';
  const showRefusal = phase === 'refused' && refusal !== null;
  const showClarifyLoading = phase === 'clarifying' && clarifyStartedAt !== null;
  const composerDimmed = showClarification || showRefusal || showClarifyLoading;

  return (
    <div className="relative">
      {/* Subtle dot grid behind the page — barely-there texture that
          gives the surface depth in dark mode and keeps light mode from
          feeling sterile. Pure CSS, no asset, theme-aware via tokens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55] [background-image:radial-gradient(color-mix(in_srgb,var(--ink)_8%,transparent)_1px,transparent_1px)] [background-size:24px_24px]"
      />

      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 flex flex-col gap-6 sm:gap-8 md:gap-10">
        {/* Welcome strip — only when the workspace has truly never
            run a search. Disappears the moment a job exists, so
            returning users never see it. Calmly tells the user that
            this page is the entry point and the example chips below
            are real prompts they can click. We use jobsData itself
            as the loaded-marker (the query has no isLoading binding
            in this scope) so we don't flash the welcome strip while
            the initial fetch is in flight. */}
        {jobsData !== undefined && jobs.length === 0 && (
          <div className="animate-fade-up flex items-start gap-3 rounded-xl border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.04] px-4 py-3">
            <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] shrink-0" aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-[color:var(--ink)] leading-tight">
                Welcome — let&rsquo;s find you some prospects.
              </p>
              <p className="mt-1 text-[12.5px] text-[color:var(--ink-2)] leading-[1.5]">
                Describe who you&rsquo;re looking for in the box below — try one of the
                example briefs to see how it works. Results land on{' '}
                <Link
                  href="/dashboard/leads"
                  className="text-[color:var(--ink)] hover:text-[color:var(--ember)] underline underline-offset-2 decoration-[color:var(--rule)] hover:decoration-[color:var(--ember)] transition-colors"
                >
                  Leads
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {/* Stagger the page reveal — each block fades up shortly after
            the previous one. animate-fade-up + stagger-N classes are
            already declared in globals.css. Restrained on purpose. */}
        <div className="animate-fade-up stagger-1">
          <MetricsStrip jobs={jobs} />
        </div>

        <div className="animate-fade-up stagger-2">
          <Compose
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting || phase === 'clarifying'}
            isDimmed={composerDimmed}
            error={submitError && !composerDimmed ? submitError : null}
            initialPrompt={initialPrompt}
          />
        </div>

        {showClarifyLoading && (
          <ClarifyLoadingPanel
            query={inFlightQuery}
            startedAt={clarifyStartedAt!}
          />
        )}
        {showClarification && (
          <ClarificationPanel
            query={clarifyingQuery ?? ''}
            questions={questions}
            answers={answers}
            onChange={setAnswers}
            onSubmit={() => void handleConfirmClarify()}
            onEditQuery={handleEditQuery}
            isSubmitting={phase === 'submitting'}
            error={submitError}
          />
        )}
        {showRefusal && (
          <RefusalPanel
            query={clarifyingQuery ?? ''}
            policy={refusal!}
            onTryReframe={handleTryReframe}
            onDismiss={handleDismissRefusal}
          />
        )}

        <div className="animate-fade-up stagger-3">
          {activeJob ? <ActiveDispatch job={activeJob} /> : <EmptyState />}
        </div>

        <div className="animate-fade-up stagger-4">
          <RecentDispatches jobs={recentJobs} />
        </div>
      </div>
    </div>
  );
}
