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
 * activated campaign. Matches the editorial shell of the builder:
 * paper sections divided by hairline rules, numbered kickers, forest
 * for active state. Primary surfaces: KPIs, per-step breakdown,
 * pause/resume. Legacy bulk-draft review UI lives elsewhere.
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
}

const STATUS_STYLES: Record<string, string> = {
  draft:     'bg-[color:var(--paper-3)] text-[color:var(--ink-2)] border-[color:var(--rule)]',
  active:    'bg-[color:var(--forest)]/10 text-[color:var(--forest)] border-[color:var(--forest)]/40',
  paused:    'bg-[color:var(--warn)]/10 text-[color:var(--warn)] border-[color:var(--warn)]/40',
  completed: 'bg-[color:var(--paper-3)] text-[color:var(--ink-2)] border-[color:var(--rule)]',
  archived:  'bg-[color:var(--paper-3)] text-[color:var(--ink-3)] border-[color:var(--rule)]',
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.draft!;
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] tracking-[0.18em] uppercase ${cls}`}>
      {status}
    </span>
  );
}

function Kpi({ label, value, accent = false }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="border border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-sm p-5">
      <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block">
        {label}
      </span>
      <div className={`mt-2 font-[family-name:var(--font-instrument-serif)] text-[44px] leading-none tabular-nums ${accent ? 'text-[color:var(--forest)]' : 'text-[color:var(--ink)]'}`}>
        {value}
      </div>
    </div>
  );
}

function Section({ chapter, title, children, action }: {
  chapter: string;
  title: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="border-t border-[color:var(--rule)] pt-8 pb-2">
      <div className="flex items-baseline gap-5 mb-5">
        <span className="font-[family-name:var(--font-instrument-serif)] text-[36px] leading-none text-[color:var(--forest)]">
          {chapter}
        </span>
        <div className="flex-1 border-t border-[color:var(--rule)] pb-1" />
        <span className="font-[family-name:var(--font-instrument-serif)] italic text-[18px] text-[color:var(--ink)] self-end pb-0.5">
          {title}
        </span>
        {action && <div className="self-end pb-0.5">{action}</div>}
      </div>
      <div className="pl-0 md:pl-[54px]">{children}</div>
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
      <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-20 text-center font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-3)]">
        Loading campaign…
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-20 text-center">
        <p className="font-[family-name:var(--font-barlow)] text-[14px] text-[color:var(--warn)]">
          Couldn&rsquo;t load this campaign.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-4 font-[family-name:var(--font-jetbrains-mono)] text-[11px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Back to dispatches
        </button>
      </div>
    );
  }

  const { campaign, sequence, enrollments, perStep, campaignStats } = data.data;

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-12">
      {/* ── Header ────────────────────────────────── */}
      <section className="mb-10 flex items-end justify-between gap-6 flex-wrap">
        <div className="max-w-[720px]">
          <div className="flex items-center gap-3 mb-4">
            <Link
              href="/dashboard"
              className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
            >
              Dispatches
            </Link>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[color:var(--ink-3)]">/</span>
            <Link
              href="/dashboard/campaigns"
              className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
            >
              Campaigns
            </Link>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[color:var(--ink-3)]">/</span>
            <StatusPill status={campaign.status} />
          </div>
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-[44px] md:text-[56px] leading-[0.97] tracking-[-0.015em] text-[color:var(--ink)]">
            {campaign.name}
          </h1>
          {campaign.description && (
            <p className="mt-3 font-[family-name:var(--font-barlow)] text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
              {campaign.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'active' && (
            <button
              onClick={() => void runAction('pause')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] disabled:opacity-50 transition"
            >
              {busy === 'pause' ? 'Pausing…' : 'Pause'}
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => void runAction('resume')}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 bg-[color:var(--forest)] text-[color:var(--paper)] hover:bg-[color:var(--forest-2)] px-4 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium disabled:opacity-50 transition"
            >
              {busy === 'resume' ? 'Resuming…' : 'Resume'}
            </button>
          )}
        </div>
      </section>

      {actionError && (
        <div role="alert" className="mb-6 border border-[color:var(--warn)]/60 bg-[color:var(--warn)]/10 rounded-sm p-4 font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink)]">
          {actionError}
        </div>
      )}

      {/* ── KPI grid ────────────────────────────────── */}
      <Section chapter="01" title="At a glance">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Enrolled" value={enrollments.total} accent />
          <Kpi label="Active" value={enrollments.active} />
          <Kpi label="Sent" value={campaignStats.sent} />
          <Kpi label="Replied" value={enrollments.replied + campaignStats.replied} />
          <Kpi label="Bounced" value={enrollments.bounced + campaignStats.bounced} />
          <Kpi label="Unsubscribed" value={enrollments.unsubscribed} />
        </div>
        <p className="mt-4 font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-3)]">
          {enrollments.paused > 0 ? `${enrollments.paused} enrollments paused. ` : ''}
          {enrollments.completed > 0 ? `${enrollments.completed} completed. ` : ''}
          {enrollments.stopped > 0 ? `${enrollments.stopped} stopped. ` : ''}
          {enrollments.total === 0 && 'Not activated yet — enroll leads from the campaigns index.'}
        </p>
      </Section>

      {/* ── Per-step ────────────────────────────────── */}
      <Section chapter="02" title="Per-step">
        {sequence ? (
          <div className="border-t border-[color:var(--rule)]">
            {sequence.steps.map((step) => {
              const stats = perStep.find((p) => p.stepNumber === step.stepNumber) ?? { sent: 0, bounced: 0, replied: 0 };
              return (
                <div
                  key={step.stepNumber}
                  className="grid grid-cols-[48px_auto_1fr_auto_auto_auto] gap-4 items-center py-4 border-b border-[color:var(--rule)]"
                >
                  <span className="font-[family-name:var(--font-instrument-serif)] italic text-[26px] leading-none text-[color:var(--ink-3)] tabular-nums">
                    {String(step.stepNumber).padStart(2, '0')}
                  </span>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                    {step.channel}{step.useAI ? ' · AI' : ''}
                  </span>
                  <div className="min-w-0">
                    <div className="font-[family-name:var(--font-barlow)] text-[14px] text-[color:var(--ink)] truncate">
                      {step.emailTemplate?.subject || <span className="italic text-[color:var(--ink-3)]">No subject</span>}
                    </div>
                    <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] mt-1 truncate">
                      Day {step.delayDays}{step.tone ? ` · ${step.tone}` : ''}{step.goal ? ` · goal: ${step.goal}` : ''}
                    </div>
                  </div>
                  <StepCount label="sent" n={stats.sent} />
                  <StepCount label="replied" n={stats.replied} />
                  <StepCount label="bounced" n={stats.bounced} tone={stats.bounced > 0 ? 'warn' : 'muted'} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="font-[family-name:var(--font-barlow)] italic text-[13.5px] text-[color:var(--ink-3)]">
            This campaign has no linked sequence. (Legacy campaigns created before the builder update.)
          </p>
        )}
      </Section>

      {/* ── Activity footer ────────────────────────────────── */}
      <Section chapter="03" title="Notes">
        <ul className="font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink-2)] space-y-2">
          <li>Stats refresh every 15 seconds. <span className="text-[color:var(--ink-3)]">Sent counter is maintained by the sequence worker per successful delivery.</span></li>
          <li>Reply + bounce ingestion comes online with the webhook milestone; those columns will stay at zero until then.</li>
          <li>Drafts generated via AI per-send are persisted under <Link href={`/dashboard/leads?campaignId=${campaign._id}`} className="underline decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]">leads</Link> for audit.</li>
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
    <div className="w-[76px] text-right">
      <div className={`font-[family-name:var(--font-instrument-serif)] text-[22px] leading-none tabular-nums ${numCls}`}>
        {n}
      </div>
      <div className="mt-1 font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
        {label}
      </div>
    </div>
  );
}
