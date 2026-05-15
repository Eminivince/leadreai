'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, JobCostBreakdown, CostCategory } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * JobCostCard — per-job cost breakdown, editorial shell.
 *
 * Reads GET /workspaces/:w/jobs/:jobId/cost. Polls while the job is
 * in-flight (poll stops once the job is terminal). Shows:
 *  - Total USD (hero)
 *  - Per-category totals (llm / serp / file_fetch / scrape / transcription / embedding)
 *  - Per-provider rollup (top 5)
 *
 * Matches the paper/serif aesthetic of the dashboard's ActiveDispatch
 * card so the job detail surface reads as one continuous document.
 * ───────────────────────────────────────────────────────────────── */

interface JobCostCardProps {
 workspaceId: string;
 jobId: string;
 /** Stop polling once this is true (job is terminal). */
 frozen?: boolean;
}

const CATEGORY_LABEL: Record<CostCategory, string> = {
 llm: 'LLM tokens',
 serp: 'Web search',
 file_fetch: 'File fetch',
 transcription: 'Transcription',
 scrape: 'Page scrape',
 embedding: 'Embeddings',
 email_send: 'Email send',
};

export function JobCostCard({ workspaceId, jobId, frozen = false }: JobCostCardProps) {
 const { data, isLoading, error } = useQuery({
  queryKey: ['job-cost', workspaceId, jobId],
  queryFn: () =>
   apiFetch<ApiResponse<JobCostBreakdown>>(
    `/api/v1/workspaces/${workspaceId}/jobs/${jobId}/cost`,
   ),
  enabled: Boolean(workspaceId && jobId),
  refetchInterval: frozen ? false : 10_000,
 });

 if (isLoading && !data) {
  return (
   <div className="py-4 italic text-[13px] text-[color:var(--ink-3)]">
    Tallying costs…
   </div>
  );
 }

 if (error || !data?.data) {
  return (
   <div className="py-4 italic text-[13px] text-[color:var(--ink-3)]">
    Costs unavailable right now.
   </div>
  );
 }

 const { summary, byProvider } = data.data;
 const total = summary.totalUSD;
 // Non-zero category rows only — a job that didn't scrape shouldn't show a 0 scrape row.
 const categoryRows = (Object.entries(summary.byCategory) as Array<[CostCategory, number]>)
  .filter(([, v]) => v > 0)
  .sort((a, b) => b[1] - a[1]);
 const topProviders = byProvider.slice(0, 5);

 return (
  <section className="relative">
   <div className="flex items-center gap-3 mb-5">
    <span className="block w-8 h-px bg-[color:var(--ink)]" />
    <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
     Receipt
    </span>
    <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] ml-auto">
     {summary.eventCount} line{summary.eventCount === 1 ? '' : 's'}
    </span>
   </div>

   <div className="relative">
    <div
     className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/20 rounded-sm"
     aria-hidden
    />
    <div className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm">
     {/* Hero — total */}
     <div className="flex items-baseline justify-between gap-4 px-5 md:px-6 py-5 border-b border-dashed border-[color:var(--rule)]">
      <div>
       <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block">
        Total cost
       </span>
       <div className="mt-1 text-[44px] md:text-[56px] leading-none tabular-nums text-[color:var(--ink)]">
        {fmtUsd(total)}
       </div>
      </div>
      {total > 0 && (
       <span className=" italic text-[12.5px] text-[color:var(--ink-3)] text-right">
        Tallied from provider receipts at
        <br />
        the unit prices in effect at call time.
       </span>
      )}
     </div>

     {/* By category */}
     <div className="px-5 md:px-6 py-5">
      {categoryRows.length === 0 ? (
       <div className=" italic text-[13px] text-[color:var(--ink-3)]">
        No cost events recorded for this dispatch yet.
       </div>
      ) : (
       <table className="w-full">
        <tbody>
         {categoryRows.map(([cat, amount]) => (
          <tr key={cat} className="border-b border-[color:var(--rule)]/40 last:border-b-0">
           <td className="py-2.5 pr-3 text-[13.5px] text-[color:var(--ink-2)]">
            {CATEGORY_LABEL[cat]}
           </td>
           <td className="py-2.5 pr-3 w-[40%]">
            <Bar value={amount} max={total} />
           </td>
           <td className="py-2.5 text-right font-mono text-[12.5px] tabular-nums text-[color:var(--ink)] min-w-[70px]">
            {fmtUsd(amount)}
           </td>
           <td className="py-2.5 pl-3 text-right font-mono text-[10px] text-[color:var(--ink-3)] min-w-[48px]">
            {total > 0 ? `${Math.round((amount / total) * 100)}%` : '—'}
           </td>
          </tr>
         ))}
        </tbody>
       </table>
      )}
     </div>

     {/* Per-provider detail */}
     {topProviders.length > 0 && (
      <div className="px-5 md:px-6 pb-5 pt-1 border-t border-dashed border-[color:var(--rule)]">
       <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-3 mt-4">
        Providers
       </span>
       <div className="flex flex-col">
        {topProviders.map((p, i) => (
         <div
          key={`${p.category}-${p.provider}-${p.modelSlug ?? i}`}
          className="grid grid-cols-[1fr_auto_auto] gap-4 items-baseline py-1.5 border-b border-[color:var(--rule)]/30 last:border-b-0"
         >
          <span className=" text-[13px] text-[color:var(--ink)] truncate">
           <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] mr-2">
            {CATEGORY_LABEL[p.category]}
           </span>
           {p.modelSlug ?? p.provider}
          </span>
          <span className="font-mono text-[11px] text-[color:var(--ink-3)] tabular-nums">
           {p.eventCount} call{p.eventCount === 1 ? '' : 's'}
          </span>
          <span className="font-mono text-[12.5px] text-[color:var(--ink)] tabular-nums min-w-[70px] text-right">
           {fmtUsd(p.totalUSD)}
          </span>
         </div>
        ))}
       </div>
      </div>
     )}
    </div>
   </div>
  </section>
 );
}

// ── Helpers ──

function Bar({ value, max }: { value: number; max: number }) {
 const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
 return (
  <div className="relative h-[3px] bg-[color:var(--rule)]/40 rounded-full overflow-hidden">
   <div
    className="absolute inset-y-0 left-0 bg-[color:var(--ember)]"
    style={{ width: `${pct}%` }}
   />
  </div>
 );
}

/** Formats a USD amount appropriate to its magnitude:
 *  >= $1  → "$1.24"
 *  >= $0.01 → "$0.42"
 *  < $0.01 → "$0.0042" (4 decimals so sub-cent costs aren't flattened to "$0.00")
 *  = 0   → "$0.00"
 */
export function fmtUsd(n: number): string {
 if (!Number.isFinite(n) || n === 0) return '$0.00';
 if (n >= 1) return `$${n.toFixed(2)}`;
 if (n >= 0.01) return `$${n.toFixed(2)}`;
 return `$${n.toFixed(4)}`;
}
