'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Workflow } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';
import { Pagination } from '@/components/shared/Pagination';
import { SectionTabs } from '@/components/shared/SectionTabs';

const PAGE_SIZE = 20;

/* ─────────────────────────────────────────────────────────────────
 * Workflows index — saved research recipes.
 *
 * A Workflow = a table template + column bindings + optional agent
 * seed query. Running a workflow produces a fresh table; if the
 * workflow has a seed, it also dispatches a prospecting job.
 *
 * No "new workflow" primary action here — workflows are born from
 * existing tables ("Save as workflow" on the table detail page).
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
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

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function WorkflowsIndexPage() {
  const { workspaceId } = useWorkspace();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<Paged<Workflow>>>(
        `/api/v1/workspaces/${workspaceId}/workflows?limit=100`,
      ),
    enabled: Boolean(workspaceId),
  });

  const workflows = data?.data?.data ?? [];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
      {/* Header — Workflows is a sub-view of Tables now. The title
          reads "Tables" with the Workflows tab active so users feel
          they're inside one section, not on a separate top-level. */}
      <section className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
            Tables
          </h1>
          <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
            {isLoading ? '...' : workflows.length}
          </span>
          <SectionTabs
            tabs={[
              { key: 'tables',    label: 'Tables',    href: '/dashboard/tables' },
              { key: 'workflows', label: 'Workflows', href: '/dashboard/workflows' },
            ]}
            className="sm:ml-2"
          />
        </div>
        <PageHelp
          title="Workflows"
          body="Saved research templates. A workflow captures a table's column definitions and optional search query — run it to produce a fresh table in one click."
          tips={[
            'Save any table as a workflow from the table detail page.',
            'Workflows with a seed query will also kick off a new prospecting search.',
            'Great for recurring research like weekly competitor tracking.',
          ]}
        />
      </section>

      {isLoading && (
        <div className="py-16 text-center">
          <span className="font-mono text-[12px] text-[color:var(--ink-3)]">
            Loading workflows…
          </span>
        </div>
      )}

      {!isLoading && workflows.length === 0 && (
        <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-12 text-center">
          <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">
            No workflows yet
          </h3>
          <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[420px] mx-auto leading-[1.55]">
            Shape a table the way you want it — columns, enrichments, a seed
            search — then hit{' '}
            <span className="font-medium text-[color:var(--ink)]">
              Save as workflow
            </span>{' '}
            on the table detail page to replay it later.
          </p>
          <Link
            href="/dashboard/tables"
            className="mt-5 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
          >
            Go to tables
            <ArrowEast className="w-3 h-3" />
          </Link>
        </div>
      )}

      {workflows.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {workflows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((w) => (
              <WorkflowCard key={w._id} workflow={w} />
            ))}
          </div>
          <Pagination
            page={page}
            total={workflows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={workflows.length === 1 ? 'workflow' : 'workflows'}
          />
        </>
      )}
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const hasSeed = Boolean(workflow.seed);
  // Surface seed query when there's no description so the card has
  // something concrete to show. Trimmed to a single readable line.
  const seedQuery = hasSeed
    ? (workflow.seed as { rawQuery?: string }).rawQuery ?? ''
    : '';
  const colCount = workflow.tableTemplate.columns.length;
  const enrichedCount = workflow.tableTemplate.columns.filter(
    (c) => c.definition?.type === 'enriched',
  ).length;
  const lastRunAt = workflow.stats?.lastRunAt;
  const timesRun = workflow.stats?.timesRun ?? 0;

  return (
    <Link
      href={`/dashboard/workflows/${workflow._id}`}
      className="group bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl p-4 flex flex-col gap-3 hover:border-[color:var(--ink-3)] hover:bg-[color:var(--paper-2)]/30 transition-colors"
    >
      {/* Top row — row-type tag (left) + seeded indicator (right) */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)] capitalize">
          {workflow.tableTemplate.rowType}
        </span>
        {hasSeed && (
          <span
            title="This workflow seeds a new table via an agent search"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06] px-2 h-6"
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]"
              aria-hidden
            />
            <span className="font-mono text-[10px] tracking-[0.04em] text-[color:var(--ember-2)]">
              seeded
            </span>
          </span>
        )}
      </div>

      {/* Title + description / seed-query fallback */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[14.5px] font-semibold text-[color:var(--ink)] leading-snug truncate">
          {workflow.name}
        </h3>
        {workflow.description ? (
          <p className="text-[12.5px] text-[color:var(--ink-2)] mt-1 leading-[1.5] line-clamp-2">
            {workflow.description}
          </p>
        ) : seedQuery ? (
          <p className="text-[12.5px] text-[color:var(--ink-3)] mt-1 leading-[1.5] line-clamp-2">
            <span className="font-mono text-[10px] tracking-[0.04em] uppercase text-[color:var(--ink-3)]/80 mr-1">
              seed
            </span>
            {seedQuery.length > 110 ? seedQuery.slice(0, 108) + '…' : seedQuery}
          </p>
        ) : (
          <p className="text-[12.5px] text-[color:var(--ink-3)] mt-1 italic-none">
            No description
          </p>
        )}
      </div>

      {/* Footer — tabular-nums on both halves */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color:var(--rule)] font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
        <span>
          {colCount}<span className="text-[color:var(--ink-3)]/60 ml-0.5">col</span>
          {enrichedCount > 0 && (
            <span className="text-[color:var(--ember-2)] ml-2">
              {enrichedCount}<span className="text-[color:var(--ember-2)]/60 ml-0.5">enr</span>
            </span>
          )}
        </span>
        <span>
          {timesRun > 0 ? (
            <>
              {timesRun}× run
              {lastRunAt && (
                <span className="text-[color:var(--ink-3)]/60 ml-1.5">
                  · {relativeDate(lastRunAt)}
                </span>
              )}
            </>
          ) : (
            <span className="text-[color:var(--ink-3)]/70">never run</span>
          )}
        </span>
      </div>
    </Link>
  );
}
