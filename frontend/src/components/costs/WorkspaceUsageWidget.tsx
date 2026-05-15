'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, CostCategory } from '@leadreai/shared';
import { fmtUsd } from './JobCostCard';

/* ─────────────────────────────────────────────────────────────────
 * WorkspaceUsageWidget — rolling 30-day cost summary + CSV export.
 *
 * Small, informational widget. Lives on the dashboard between
 * "Compose" and "Active dispatch" so the number sits quietly beside
 * the user's primary action instead of hiding in a settings page.
 *
 * CSV export hits /workspaces/:w/usage/export — same date window. We
 * trigger the download via a hidden anchor with download attr; fetch-
 * then-blob would also work but requires extra state juggling for
 * cookies/auth. Direct anchor links inherit the session cookie.
 * ───────────────────────────────────────────────────────────────── */

interface WorkspaceUsageReport {
 range: { from: string; to: string };
 totalUSD: number;
 byCategory: Record<CostCategory, number>;
 byDay: Array<{ date: string; totalUSD: number }>;
 topJobs: Array<{ jobId: string; totalUSD: number; eventCount: number }>;
 eventCount: number;
}

interface WorkspaceUsageWidgetProps {
 workspaceId: string;
 /** Days of history. Default 30. */
 windowDays?: number;
}

export function WorkspaceUsageWidget({
 workspaceId,
 windowDays = 30,
}: WorkspaceUsageWidgetProps) {
 const { data, isLoading } = useQuery({
  queryKey: ['workspace-usage', workspaceId, windowDays],
  queryFn: () =>
   apiFetch<ApiResponse<WorkspaceUsageReport>>(
    `/api/v1/workspaces/${workspaceId}/usage`,
   ),
  enabled: Boolean(workspaceId),
  staleTime: 60_000,
 });

 const report = data?.data;

 if (isLoading && !report) return null; // don't render a placeholder — silent until data arrives
 if (!report) return null;

 // Hide entirely when the workspace has no spend in the window — the
 // widget is a status light, not required chrome.
 if (report.totalUSD === 0 && report.eventCount === 0) return null;

 // Tiny 14-point sparkline from `byDay` — last 14 days only even if
 // the report covers 30. Anchors it to the last two weeks so the
 // user sees "recent trend" not "a month ago."
 const sparkDays = report.byDay.slice(-14);
 const max = Math.max(...sparkDays.map((d) => d.totalUSD), 0.001);

 // Top category for the one-line caption.
 const topCategory = (Object.entries(report.byCategory) as Array<[CostCategory, number]>)
  .filter(([, v]) => v > 0)
  .sort((a, b) => b[1] - a[1])[0];

 return (
  <section className="relative">
   <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-3">
     <span className="block w-8 h-px bg-[color:var(--ink)]" />
     <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
      Ledger · last {windowDays} days
     </span>
    </div>
    <a
     href={`/api/v1/workspaces/${workspaceId}/usage/export`}
     className="inline-flex items-center gap-1.5 italic text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ember)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ember)] transition"
    >
     Export CSV
    </a>
   </div>

   <div className="bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm px-5 md:px-6 py-4 md:py-5">
    <div className="flex items-baseline justify-between gap-6 flex-wrap">
     <div>
      <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block">
       Spend
      </span>
      <div className="mt-1 text-[40px] leading-none tabular-nums text-[color:var(--ink)]">
       {fmtUsd(report.totalUSD)}
      </div>
      {topCategory && (
       <p className="mt-2 italic text-[12.5px] text-[color:var(--ink-2)]">
        Mostly {humanCategory(topCategory[0])} · {fmtUsd(topCategory[1])} (
        {Math.round((topCategory[1] / report.totalUSD) * 100)}%)
       </p>
      )}
     </div>

     {/* Sparkline */}
     {sparkDays.length > 0 && (
      <div className="flex items-end gap-[2px] h-[48px]">
       {sparkDays.map((d) => {
        const h = Math.max(2, Math.round((d.totalUSD / max) * 48));
        return (
         <div
          key={d.date}
          title={`${d.date}: ${fmtUsd(d.totalUSD)}`}
          className="w-[6px] bg-[color:var(--ember)]/70 hover:bg-[color:var(--ember)] transition-colors"
          style={{ height: `${h}px` }}
         />
        );
       })}
      </div>
     )}
    </div>

    <div className="mt-4 pt-4 border-t border-dashed border-[color:var(--rule)] flex items-center gap-6 flex-wrap font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
     <span>
      {report.eventCount.toLocaleString()} line item{report.eventCount === 1 ? '' : 's'}
     </span>
     <span>{report.topJobs.length} jobs incurred cost</span>
    </div>
   </div>
  </section>
 );
}

function humanCategory(c: CostCategory): string {
 switch (c) {
  case 'llm': return 'LLM tokens';
  case 'serp': return 'web search';
  case 'file_fetch': return 'file fetch';
  case 'transcription': return 'transcription';
  case 'scrape': return 'page scrape';
  case 'embedding': return 'embeddings';
  default: return c;
 }
}
