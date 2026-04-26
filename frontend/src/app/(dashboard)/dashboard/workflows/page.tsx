'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Workflow } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Workflows index — the Library of saved research recipes.
 *
 * A Workflow = a table template + column bindings + optional agent
 * seed query. Running a workflow produces a fresh table; if the
 * workflow has a seed, it also dispatches a prospecting job.
 *
 * No "new workflow" primary action here — workflows are born from
 * existing tables ("Save as workflow" on the table detail page).
 * That keeps the mental model simple: shape the table you want, then
 * save its shape.
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> { data: T[]; total: number; page: number; limit: number }

export default function WorkflowsIndexPage() {
  const { workspaceId } = useWorkspace();

  const { data, isLoading } = useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: () => apiFetch<ApiResponse<Paged<Workflow>>>(
      `/api/v1/workspaces/${workspaceId}/workflows?limit=100`,
    ),
    enabled: Boolean(workspaceId),
  });

  const workflows = data?.data?.data ?? [];

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-14">
      {/* Hero */}
      <section className="mb-10 flex items-end justify-between gap-6 flex-wrap">
        <div className="max-w-[720px]">
          <div className="flex items-center gap-3 mb-4">
            <span className="block w-8 h-px bg-[color:var(--ink)]" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
              Workflows
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-[44px] md:text-[60px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
            Research, <em className="italic text-[color:var(--forest)]">replayed</em>.
          </h1>
          <p className="mt-4 font-[family-name:var(--font-barlow)] text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
            Save a table&rsquo;s shape — columns, bindings, optional seed query — and replay it on a fresh sheet. Your weekly research loop, reduced to one click.
          </p>
        </div>
      </section>

      {isLoading && (
        <p className="font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-3)]">
          Loading workflows…
        </p>
      )}

      {!isLoading && workflows.length === 0 && (
        <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/50 rounded-sm p-10 text-center">
          <p className="font-[family-name:var(--font-instrument-serif)] italic text-[20px] text-[color:var(--ink)]">
            No workflows yet.
          </p>
          <p className="mt-2 font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink-2)] max-w-[480px] mx-auto">
            Shape a table the way you want it — columns, enrichments, a seed dispatch — then hit <span className="text-[color:var(--ink)]">Save as workflow</span> on the table detail page.
          </p>
          <Link
            href="/dashboard/tables"
            className="mt-5 inline-flex items-center gap-2 border border-[color:var(--rule)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)] transition"
          >
            Go to Tables →
          </Link>
        </div>
      )}

      {workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map((w) => (
            <WorkflowCard key={w._id} workflow={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const hasSeed = Boolean(workflow.seed);
  const colCount = workflow.tableTemplate.columns.length;
  const enrichedCount = workflow.tableTemplate.columns.filter(
    (c) => c.definition?.type === 'enriched',
  ).length;
  const lastRun = workflow.stats?.lastRunAt
    ? new Date(workflow.stats.lastRunAt).toLocaleDateString()
    : null;

  return (
    <Link
      href={`/dashboard/workflows/${workflow._id}`}
      className="group block border border-[color:var(--rule)] bg-[color:var(--paper)] rounded-sm p-5 hover:border-[color:var(--ink)] transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          {workflow.tableTemplate.rowType}
        </span>
        {hasSeed && (
          <span
            title="This workflow seeds a new table via an agent dispatch"
            className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] tracking-[0.18em] uppercase text-[color:var(--forest)]"
          >
            ● seeded
          </span>
        )}
      </div>
      <h3 className="font-[family-name:var(--font-instrument-serif)] text-[22px] leading-[1.1] text-[color:var(--ink)] mb-1">
        {workflow.name}
      </h3>
      {workflow.description && (
        <p className="font-[family-name:var(--font-barlow)] text-[13px] leading-[1.45] text-[color:var(--ink-2)] mb-3 line-clamp-2">
          {workflow.description}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
        <span>
          {colCount} col{colCount === 1 ? '' : 's'}
          {enrichedCount > 0 && (
            <span className="text-[color:var(--forest)] normal-case tracking-normal font-[family-name:var(--font-barlow)] ml-1 text-[11px]">
              · {enrichedCount} enriched
            </span>
          )}
        </span>
        <span>
          {workflow.stats?.timesRun > 0
            ? `run ${workflow.stats.timesRun}×${lastRun ? ` · ${lastRun}` : ''}`
            : 'never run'}
        </span>
      </div>
    </Link>
  );
}
