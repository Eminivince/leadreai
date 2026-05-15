'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Campaign } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Campaign detail — analytics-first view of a saved + (optionally)
 * activated campaign. Refreshed to match the rest of the redesigned
 * dashboard: dot-pill status, mono tabular metrics, hairline rows,
 * rounded-xl cards. Pause/resume controls available when applicable.
 * ───────────────────────────────────────────────────────────────── */

interface SequenceStepLite {
  stepNumber: number;
  channel: string;
  delayDays: number;
  useAI?: boolean;
  goal?: string;
  tone?: string;
  emailTemplate?: { subject?: string; body?: string };
}

interface StatsResponse {
  campaign: Campaign;
  sequence: { _id: string; name: string; status: string; steps: SequenceStepLite[] } | null;
  enrollments: {
    active: number; paused: number; completed: number; stopped: number;
    bounced: number; unsubscribed: number; replied: number; total: number;
  };
  perStep: Array<{ stepNumber: number; sent: number; bounced: number; replied: number }>;
  campaignStats: {
    totalLeads: number; draftsCreated: number; sent: number;
    opened: number; replied: number; bounced: number;
  };
  replyClassification?: {
    positive: number;
    ooo: number;
    bounce: number;
    unknown: number;
  };
}

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Status pill — dot + lowercase mono. Same shape used on the
 * campaigns list and dashboard. Active state pulses; everything
 * else stays still.
 */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; dot: string; text: string; border: string; pulse: boolean }> = {
    active:    { label: 'active',    dot: 'bg-[color:var(--ember)]',   text: 'text-[color:var(--ember-2)]', border: 'border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06]', pulse: true },
    paused:    { label: 'paused',    dot: 'bg-[color:var(--warn)]',     text: 'text-[color:var(--warn)]',     border: 'border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04]',    pulse: false },
    draft:     { label: 'draft',     dot: 'bg-[color:var(--ink-3)]',    text: 'text-[color:var(--ink-2)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
    completed: { label: 'completed', dot: 'bg-[color:var(--ink-3)]',    text: 'text-[color:var(--ink-2)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
    archived:  { label: 'archived',  dot: 'bg-[color:var(--ink-3)]/60', text: 'text-[color:var(--ink-3)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
  };
  const m = map[status] ?? map.draft!;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 h-6 ${m.border}`}>
      {m.pulse ? (
        <span className="relative inline-flex">
          <span className={`relative inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} />
          <span className={`absolute inset-0 inline-block w-1.5 h-1.5 rounded-full ${m.dot} opacity-60 animate-ping`} />
        </span>
      ) : (
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} />
      )}
      <span className={`font-mono text-[10.5px] ${m.text}`}>{m.label}</span>
    </span>
  );
}

/**
 * KPI cell — one of a row inside a rounded-xl card. Tabular-nums
 * carry the number; mono lowercase carries the label. Same visual
 * register as the dashboard's MetricsStrip so the two surfaces feel
 * like one product.
 */
function Kpi({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="px-4 md:px-5 py-4 flex flex-col gap-1.5">
      <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
        {label}
      </span>
      <div
        className={`font-mono text-[24px] md:text-[28px] leading-none tabular-nums ${
          accent ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-2)]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Section primitive — drops the editorial chapter numeral + italic
 * title. Now a clean header row with mono numeral + 14.5/600 title.
 */
function Section({ chapter, title, children, action }: {
  chapter: string;
  title: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[10.5px] tabular-nums tracking-[0.04em] text-[color:var(--ink-3)]">
            {chapter}
          </span>
          <h2 className="text-[14.5px] font-semibold text-[color:var(--ink)] tracking-[-0.005em]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = (params.campaignId as string) ?? '';
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['campaign-stats', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<ApiResponse<StatsResponse>>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/stats`,
      ),
    enabled: !!workspaceId && !!campaignId,
    refetchInterval: 15_000,
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'pause' | 'resume'>(null);

  async function runAction(action: 'pause' | 'resume') {
    if (!workspaceId || !campaignId || busy) return;
    setBusy(action);
    setActionError(null);
    try {
      await apiFetch<ApiResponse<unknown>>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/${action}`,
        { method: 'POST' },
      );
      await qc.invalidateQueries({ queryKey: ['campaign-stats', workspaceId, campaignId] });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-16 text-center">
        <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading campaign…</span>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-16 text-center">
        <p className="text-[14px] font-medium text-[color:var(--warn)]">
          Couldn&rsquo;t load this campaign.
        </p>
        <button
          onClick={() => router.push('/dashboard/campaigns')}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
        >
          <ArrowEast className="w-3 h-3 rotate-180" />
          Back to campaigns
        </button>
      </div>
    );
  }

  const { campaign, sequence, enrollments, perStep, campaignStats, replyClassification } = data.data;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 animate-fade-up">
      {/* Header — breadcrumb + title row + actions */}
      <section className="mb-5 sm:mb-6">
        <div className="flex items-center gap-1.5 mb-3 font-mono text-[10.5px] text-[color:var(--ink-3)]">
          <Link
            href="/dashboard/campaigns"
            className="hover:text-[color:var(--ink)] transition-colors"
          >
            Campaigns
          </Link>
          <span className="text-[color:var(--ink-3)]/60">/</span>
          <span className="text-[color:var(--ink-2)] truncate max-w-[180px] sm:max-w-[480px]">{campaign.name}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)] truncate">
                {campaign.name}
              </h1>
              <StatusPill status={campaign.status} />
            </div>
            {campaign.description && (
              <p className="mt-1 text-[13px] text-[color:var(--ink-2)] leading-[1.5] max-w-[680px]">
                {campaign.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {campaign.status === 'active' && (
              <button
                onClick={() => void runAction('pause')}
                disabled={busy !== null}
                className="inline-flex items-center h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors disabled:opacity-50"
              >
                {busy === 'pause' ? 'Pausing…' : 'Pause'}
              </button>
            )}
            {campaign.status === 'paused' && (
              <button
                onClick={() => void runAction('resume')}
                disabled={busy !== null}
                className="inline-flex items-center h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ember)] text-white hover:bg-[color:var(--ember-2)] transition-colors disabled:opacity-50"
              >
                {busy === 'resume' ? 'Resuming…' : 'Resume'}
              </button>
            )}
          </div>
        </div>
      </section>

      {actionError && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-4 py-3 text-[13px] text-[color:var(--ink)]">
          <span className="mt-[6px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
          <span className="text-[color:var(--ink-2)]">{actionError}</span>
        </div>
      )}

      {/* KPI strip — single rounded-xl card with mono tabular numbers */}
      <Section chapter="01" title="At a glance">
        <div
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden"
          aria-label="Campaign metrics"
        >
          {[
            { label: 'Enrolled',     value: enrollments.total,                                                accent: true },
            { label: 'Active',       value: enrollments.active,                                              accent: false },
            { label: 'Sent',         value: campaignStats.sent,                                              accent: false },
            { label: 'Replied',      value: enrollments.replied + campaignStats.replied,                     accent: false },
            { label: 'Bounced',      value: enrollments.bounced + campaignStats.bounced,                     accent: false },
            { label: 'Unsubscribed', value: enrollments.unsubscribed,                                        accent: false },
          ].map((c, i) => (
            <div
              key={c.label}
              className={`${i > 0 ? 'border-l border-t md:border-t-0 border-[color:var(--rule)]' : ''}`}
            >
              <Kpi label={c.label} value={c.value} accent={c.accent} />
            </div>
          ))}
        </div>
        <p className="mt-3 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
          {enrollments.paused > 0 ? `${enrollments.paused} paused · ` : ''}
          {enrollments.completed > 0 ? `${enrollments.completed} completed · ` : ''}
          {enrollments.stopped > 0 ? `${enrollments.stopped} stopped · ` : ''}
          {enrollments.total === 0 && 'Not activated yet — enroll leads from the campaigns index.'}
        </p>

        {replyClassification &&
        (replyClassification.positive +
          replyClassification.ooo +
          replyClassification.bounce +
          replyClassification.unknown) > 0 ? (
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
              replies by class:
            </span>
            <ClassChip label="positive" count={replyClassification.positive} tone="positive" />
            <ClassChip label="OOO" count={replyClassification.ooo} tone="neutral" />
            <ClassChip label="bounce" count={replyClassification.bounce} tone="warn" />
            <ClassChip label="unknown" count={replyClassification.unknown} tone="neutral" />
          </div>
        ) : null}
      </Section>

      {/* Per-step sequence */}
      <Section chapter="02" title="Per-step">
        {sequence ? (
          <div className="rounded-xl border border-[color:var(--rule)] overflow-hidden bg-[color:var(--paper)]">
            <div className="overflow-x-auto">
            {sequence.steps.map((step, idx) => {
              const stats = perStep.find((p) => p.stepNumber === step.stepNumber) ?? { sent: 0, bounced: 0, replied: 0 };
              return (
                <div
                  key={step.stepNumber}
                  className={`grid grid-cols-[36px_auto_1fr_auto_auto_auto] gap-3 md:gap-4 items-center px-4 md:px-5 py-3 min-w-[560px] ${
                    idx > 0 ? 'border-t border-[color:var(--rule)]' : ''
                  }`}
                >
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full font-mono text-[11px] tabular-nums text-[color:var(--ink-3)] border border-[color:var(--rule)] bg-[color:var(--paper-2)]">
                    {step.stepNumber}
                  </span>
                  <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] uppercase">
                    {step.channel}{step.useAI ? ' · ai' : ''}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13.5px] text-[color:var(--ink)] font-medium truncate">
                      {step.emailTemplate?.subject || (
                        <span className="text-[color:var(--ink-3)] font-normal">No subject</span>
                      )}
                    </div>
                    <div className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] mt-0.5 truncate">
                      Day {step.delayDays}
                      {step.tone ? ` · ${step.tone}` : ''}
                      {step.goal ? ` · ${step.goal}` : ''}
                    </div>
                  </div>
                  <StepCount label="sent" n={stats.sent} />
                  <StepCount label="repl" n={stats.replied} />
                  <StepCount label="bnc" n={stats.bounced} tone={stats.bounced > 0 ? 'warn' : 'muted'} />
                </div>
              );
            })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 p-6 text-center">
            <p className="text-[13px] text-[color:var(--ink-2)]">
              This campaign has no linked sequence.
              <span className="text-[color:var(--ink-3)] ml-1">(Legacy campaigns predate the builder update.)</span>
            </p>
          </div>
        )}
      </Section>

      {/* Notes */}
      <Section chapter="03" title="Notes">
        <ul className="text-[12.5px] text-[color:var(--ink-2)] space-y-1.5 leading-[1.55]">
          <li>
            Stats refresh every 15 seconds.
            <span className="text-[color:var(--ink-3)] ml-1">Sent counter is maintained by the sequence worker per successful delivery.</span>
          </li>
          <li>
            Reply + bounce ingestion comes online with the webhook milestone; those columns will stay at zero until then.
          </li>
          <li>
            AI-generated drafts are persisted under{' '}
            <Link
              href={`/dashboard/leads?campaignId=${campaign._id}`}
              className="text-[color:var(--ink)] hover:text-[color:var(--ember)] underline underline-offset-[3px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ember)] transition-colors"
            >
              leads
            </Link>{' '}
            for audit.
          </li>
        </ul>
      </Section>
    </div>
  );
}

function StepCount({ label, n, tone = 'muted' }: { label: string; n: number; tone?: 'muted' | 'warn' }) {
  const numCls = tone === 'warn' && n > 0
    ? 'text-[color:var(--warn)]'
    : n > 0 ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-3)]';
  return (
    <div className="w-[60px] text-right">
      <div className={`font-mono text-[16px] leading-none tabular-nums ${numCls}`}>
        {n}
      </div>
      <div className="mt-1 font-mono text-[9.5px] tracking-[0.04em] text-[color:var(--ink-3)]">
        {label}
      </div>
    </div>
  );
}

/**
 * Reply classification chip (Task #26). Three tones so the eye picks
 * positives apart from bounces at a glance — but no semantic colour
 * for OOO/unknown since those are reads-needed-by-human bins.
 */
function ClassChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: 'positive' | 'warn' | 'neutral';
}) {
  const map = {
    positive:
      'border-[color:var(--ember)]/40 bg-[color:var(--ember)]/[0.08] text-[color:var(--ember-2,#3b6e44)]',
    warn:
      'border-[color:var(--warn)]/40 bg-[color:var(--warn)]/[0.06] text-[color:var(--warn)]',
    neutral:
      'border-[color:var(--rule)] bg-[color:var(--paper-2)] text-[color:var(--ink-2)]',
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] tracking-[0.04em] tabular-nums ${map[tone]}`}
    >
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </span>
  );
}
