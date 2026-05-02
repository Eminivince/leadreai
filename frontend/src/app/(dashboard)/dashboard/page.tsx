'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useJob } from '@/hooks/useJob';
import { apiFetch } from '@/lib/api';
import { JobCostCard } from '@/components/costs/JobCostCard';
import { WorkspaceUsageWidget } from '@/components/costs/WorkspaceUsageWidget';
import type {
  ApiResponse,
  ProspectingJob,
  ClarificationQuestion,
  ClarificationAnswer,
  PolicyDecision,
  JobActivityLogEntry,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Dashboard — editorial broadsheet.
 *
 * One page, one job: the primary action is composing a new dispatch.
 * Everything else (running jobs, past dossiers) stacks below.
 *
 * Sections:
 *   1. Hero compose — big query input, example prompt chips
 *   2. Active dispatch — the most recent running/recent job, live
 *   3. Recent dispatches — editorial list of past jobs
 *
 * Stats, charts, and widgets live on Analytics (not here).
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
  const [value, setValue] = useState(initialPrompt ?? '');
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      <div className="flex items-center gap-3 mb-7">
        <span className="block w-8 h-px bg-[color:var(--ink)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          Create a search
        </span>
      </div>

      <h1 className=" text-[44px] md:text-[64px] leading-[0.94] tracking-[-0.015em] text-[color:var(--ink)] max-w-[880px]">
        Describe who you&rsquo;re <br className="hidden md:inline" />
        looking for. <em className="italic text-[color:var(--forest)]">We&rsquo;ll read</em> the rest.
      </h1>

      <div className="mt-8">
        <div className="bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded-sm">
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
            placeholder="e.g. Top 50 Nigerian fintechs with Series-B funding. CEO name, work email, phone."
            rows={3}
            className="block w-full bg-transparent resize-none px-5 py-4  italic text-[18px] md:text-[22px] leading-[1.4] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
          />
          <div className="flex items-center justify-between px-5 py-3 border-t border-[color:var(--rule)]">
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              {value.length === 0
                ? 'Min. 10 characters'
                : value.length < 10
                  ? `${10 - value.length} more characters`
                  : `${value.length} characters · ⌘↵ to run`}
            </span>
            <button
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || value.trim().length < 10}
              className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Running\u2026' : 'Run search'}
              <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-3 border-l-2 border-[color:var(--warn)] bg-[color:var(--paper-3)] px-4 py-3  text-[13px] text-[color:var(--ink)]">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--warn)] block mb-1">
              Rejected
            </span>
            {error}
          </div>
        )}

        {/* Library-in-scope chip — only when there's something to surface */}
        {readyLibraryCount > 0 && (
          <div className="mt-4 flex items-center gap-2.5 flex-wrap">
            <Link
              href="/dashboard/library"
              title="The agent reads these before every search"
              className="inline-flex items-center gap-2 border border-[color:var(--forest)]/40 bg-[color:var(--forest)]/5 text-[color:var(--forest)] hover:border-[color:var(--forest)] rounded-full px-3 py-1 transition-colors"
            >
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase">
                In scope
              </span>
              <span className=" italic text-[12.5px]">
                {readyLibraryCount} {readyLibraryCount === 1 ? 'document' : 'documents'} from your Library
              </span>
            </Link>
          </div>
        )}

        {/* Example chips */}
        <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-2">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] mr-1">
            Suggested
          </span>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => {
                setValue(q);
                inputRef.current?.focus();
              }}
              className=" italic text-[12.5px] text-[color:var(--ink-2)] bg-[color:var(--paper-2)] border border-[color:var(--rule)] hover:border-[color:var(--ink)] rounded-full px-3 py-1.5 transition-colors"
            >
              &ldquo;{q.length > 70 ? q.slice(0, 68) + '\u2026' : q}&rdquo;
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
          <span className="block w-8 h-px bg-[color:var(--forest)]" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--forest)]">
            Verifying
          </span>
          {/* Tiny pulsing dot so the panel never feels static */}
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] animate-pulse"
            aria-hidden
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          {elapsedSec}s elapsed
        </span>
      </div>

      <div className="bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm px-6 md:px-8 py-7 md:py-8">
        <h3 className=" text-[28px] md:text-[34px] leading-[1.05] text-[color:var(--ink)]">
          Verifying your <em className="italic text-[color:var(--forest)]">search</em>…
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
        <span className="block w-8 h-px bg-[color:var(--forest)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--forest)]">
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
          {error}
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
          className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      ? 'bg-[color:var(--forest)] text-[color:var(--paper)]'
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
                className="group text-left border border-[color:var(--rule)] bg-[color:var(--paper-3)] hover:border-[color:var(--forest)] hover:bg-[color:var(--forest)]/5 rounded-sm px-4 py-3 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className=" italic text-[18px] leading-none text-[color:var(--ink-3)] group-hover:text-[color:var(--forest)] tabular-nums shrink-0 mt-1">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1  text-[14px] leading-[1.55] text-[color:var(--ink)]">
                    {s}
                  </span>
                  <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--forest)] mt-1.5 transition-colors" />
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
    parsing:       { label: 'Parsing',       color: 'text-[color:var(--forest)] bg-[color:var(--paper-3)]' },
    collecting:    { label: 'Collecting',    color: 'text-[color:var(--forest)] bg-[color:var(--paper-3)]' },
    enriching:     { label: 'Enriching',     color: 'text-[color:var(--forest)] bg-[color:var(--paper-3)]' },
    deduplicating: { label: 'Finalizing',    color: 'text-[color:var(--forest)] bg-[color:var(--paper-3)]' },
    complete:      { label: 'Complete',      color: 'text-[color:var(--forest)] bg-[color:var(--paper-3)]' },
    failed:        { label: 'Failed',        color: 'text-[color:var(--warn)] bg-[color:var(--paper-3)]' },
    cancelled:     { label: 'Cancelled',     color: 'text-[color:var(--ink-2)] bg-[color:var(--paper-2)]' },
  };
  const chip = map[status] ?? map.queued;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase px-2 py-0.5 border border-[color:var(--rule)] ${chip.color}`}
    >
      {status !== 'complete' && status !== 'failed' && status !== 'cancelled' && (
        <span className="block w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] animate-pulse" />
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
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--forest)]">
          Cited from your Library
        </span>
        <span className="flex-1 h-px bg-[color:var(--forest)]/20" />
      </div>
      <ul className="flex flex-wrap gap-2">
        {citations.map((c) => (
          <li key={c.documentId}>
            <Link
              href={`/dashboard/library/${c.documentId}`}
              className="group inline-flex items-center gap-2 border border-[color:var(--forest)]/30 bg-[color:var(--forest)]/5 hover:border-[color:var(--forest)] rounded-full px-3 py-1 transition-colors"
              title={`${c.chunks} chunk${c.chunks === 1 ? '' : 's'} · top similarity ${Math.round(
                c.topSimilarity * 100,
              )}%`}
            >
              <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--forest)]">
                {c.fileType}
              </span>
              <span className=" italic text-[12.5px] text-[color:var(--ink)] max-w-[220px] truncate">
                {c.title}
              </span>
              <span className="font-mono text-[9.5px] tabular-nums text-[color:var(--forest)]">
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
  const entries: JobActivityLogEntry[] =
    isActive && liveLog.length > 0 ? liveLog : (job.activityLog ?? []);

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
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] stream-dot" aria-hidden />
              <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--forest)]">
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
      ? 'text-[color:var(--forest)]'
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
      ? 'text-[color:var(--forest)] border-[color:var(--forest)]/40'
      : tone === 'warning'
        ? 'text-[color:var(--rust,#a9542d)] border-[color:var(--rule)]'
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
  const workspaceId = job.workspaceId;
  const isTerminal = job.status === 'complete' || job.status === 'failed' || job.status === 'cancelled';

  return (
    <section className="relative">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="block w-8 h-px bg-[color:var(--forest)]" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            Active search
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          Search №.&nbsp;{dossierId}
        </span>
      </div>

      <div className="relative">
        {/* paper shadow */}
        <div
          className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/20 rounded-sm"
          aria-hidden
        />
        <div className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-5 md:px-6 py-3 border-b border-dashed border-[color:var(--rule)]">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)]">
              Filed {relativeTime(job.createdAt)}
            </span>
            <StatusChip status={job.status} />
          </div>

          {/* Body */}
          <div className="px-5 md:px-6 py-5 md:py-6">
            <div className="flex gap-4 md:gap-5">
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)] pt-[5px] shrink-0 w-14">
                Subject
              </span>
              <p className=" italic text-[19px] md:text-[22px] leading-[1.3] text-[color:var(--ink)]">
                &ldquo;{job.rawQuery}&rdquo;
              </p>
            </div>

            {/* Meta grid */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 pt-5 border-t border-[color:var(--rule)]">
              <div>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Stage
                </span>
                <div className="mt-1  text-[14px] text-[color:var(--ink)] capitalize">
                  {stage || '—'}
                </div>
              </div>
              <div>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Leads found
                </span>
                <div className="mt-1  text-[22px] leading-none tabular-nums text-[color:var(--ink)]">
                  {found}
                  <span className="font-mono text-[11px] text-[color:var(--ink-3)] ml-1">
                    / {target}
                  </span>
                </div>
              </div>
              <div>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Query type
                </span>
                <div className="mt-1  text-[14px] text-[color:var(--ink)] capitalize">
                  {job.parsedIntent?.queryType?.replace(/_/g, ' ') ?? '—'}
                </div>
              </div>
              <div>
                <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Progress
                </span>
                <div className="mt-2">
                  <div className="h-[2px] bg-[color:var(--rule)]/40 overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--forest)] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 font-mono text-[10px] tabular-nums text-[color:var(--ink-2)]">
                    {pct}%
                  </div>
                </div>
              </div>
            </div>

            {/* Library citations (if the agent cited any workspace docs) */}
            <LibraryCitations job={job} />

            {/* Live audit trail — every tool call, every decision */}
            <AuditTrail job={job} />

            {/* Output schema columns (if any) */}
            {schema.length > 0 && (
              <div className="mt-5 pt-5 border-t border-[color:var(--rule)]">
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
                  Requested columns
                </span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {schema.map((c) => (
                    <span
                      key={c.key}
                      className=" text-[12px] text-[color:var(--ink-2)] bg-[color:var(--paper)] border border-[color:var(--rule)] px-2.5 py-1"
                    >
                      {c.label}{' '}
                      <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                        · {c.type}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 px-5 md:px-6 py-3 border-t border-[color:var(--rule)]">
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
              Auto-refreshing
            </span>
            <Link
              href={`/dashboard/leads?jobId=${job._id}`}
              className="inline-flex items-center gap-1.5  text-[13px] text-[color:var(--ink)] hover:text-[color:var(--forest)] underline underline-offset-[5px] decoration-[color:var(--rule)] hover:decoration-[color:var(--forest)] transition"
            >
              View all leads
              <ArrowEast className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Receipt — cost breakdown. Polls while in-flight, freezes on terminal.
       *  Hidden entirely for jobs with zero cost (e.g. dry runs) to avoid
       *  a visually-distracting $0.00 block. */}
      <div className="mt-10">
        <JobCostCard workspaceId={workspaceId} jobId={job._id} frozen={isTerminal} />
      </div>
    </section>
  );
}

/* ── Recent dispatches list ────────────────────────────────── */
function RecentDispatches({ jobs }: { jobs: ProspectingJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-5">
        <span className="block w-8 h-px bg-[color:var(--ink)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          Past searches
        </span>
      </div>

      <div className="divide-y divide-[color:var(--rule)] border-t border-b border-[color:var(--rule)]">
        {jobs.map((j) => {
          const leads = j.result?.totalLeadsFound ?? j.progress?.leadsFoundSoFar ?? 0;
          const target = j.parsedIntent?.targetCount ?? '—';
          return (
            <Link
              key={j._id}
              href={`/dashboard/leads?jobId=${j._id}`}
              className="group grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 md:gap-6 items-baseline py-5 px-0 hover:bg-[color:var(--paper-3)]/60 transition-colors"
            >
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] shrink-0 w-16">
                {relativeTime(j.createdAt)}
              </span>
              <p className=" italic text-[16px] md:text-[18px] leading-[1.35] text-[color:var(--ink)] truncate">
                &ldquo;{j.rawQuery}&rdquo;
              </p>
              <span className="font-mono text-[11px] tabular-nums text-[color:var(--ink-2)] hidden md:inline">
                {leads}/{target}
              </span>
              <StatusChip status={j.status} />
              <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── Empty state ────────────────────────────────────────────── */
function EmptyState() {
  return (
    <section className="py-4">
      <div className="border border-dashed border-[color:var(--rule)] rounded-sm p-8 md:p-10 bg-[color:var(--paper-3)]/60">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          Get started
        </span>
        <h3 className="mt-3  text-[26px] md:text-[30px] leading-[1.1] tracking-[-0.01em] text-[color:var(--ink)]">
          Ready when you are. <em className="italic text-[color:var(--forest)]">Run your first search</em> above.
        </h3>
        <p className="mt-3  text-[14.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[600px]">
          A search is one query. Describe who you&rsquo;re looking for in a
          sentence. The dashboard will return a list with footnotes on every field.
          Three searches are free.
        </p>
      </div>
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

  const jobs = jobsData?.data ?? [];

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
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-14 flex flex-col gap-16 md:gap-20">
      <Compose
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting || phase === 'clarifying'}
        isDimmed={composerDimmed}
        error={submitError && !composerDimmed ? submitError : null}
        initialPrompt={initialPrompt}
      />
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
      {workspaceId && <WorkspaceUsageWidget workspaceId={workspaceId} />}
      {activeJob ? <ActiveDispatch job={activeJob} /> : <EmptyState />}
      <RecentDispatches jobs={recentJobs} />
    </div>
  );
}
