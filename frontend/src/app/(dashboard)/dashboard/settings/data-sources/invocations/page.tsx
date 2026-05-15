'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type {
 ApiResponse,
 DataSourceInvocation,
 DataSourceSummary,
 InvocationStatus,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Invocation log — every data-source call ever made in this workspace.
 *
 * Filters: data source, status. Clicking a row opens a drawer with the
 * full input/output JSON + cost + latency. Refetches every 5s while
 * auto-refresh toggle is on (defaults ON so the page feels live).
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> { data: T[]; total: number; page: number; limit: number }

export default function InvocationsPage() {
 const { workspaceId } = useWorkspace();
 const [filterSource, setFilterSource] = useState<string>('');
 const [filterStatus, setFilterStatus] = useState<InvocationStatus | ''>('');
 const [page, setPage] = useState(1);
 const [autoRefresh, setAutoRefresh] = useState(true);
 const [activeId, setActiveId] = useState<string | null>(null);

 const { data: sourcesResp } = useQuery({
  queryKey: ['data-sources', workspaceId],
  queryFn: () => apiFetch<ApiResponse<DataSourceSummary[]>>(
   `/api/v1/workspaces/${workspaceId}/data-sources`,
  ),
  enabled: Boolean(workspaceId),
 });
 const sources = useMemo(() => sourcesResp?.data ?? [], [sourcesResp]);
 const sourceById = useMemo(
  () => Object.fromEntries(sources.map((s) => [s.id, s])),
  [sources],
 );

 const query = useMemo(() => {
  const p = new URLSearchParams();
  p.set('page', String(page));
  p.set('limit', '50');
  if (filterSource) p.set('dataSourceId', filterSource);
  if (filterStatus) p.set('status', filterStatus);
  return p.toString();
 }, [page, filterSource, filterStatus]);

 const { data, isLoading } = useQuery({
  queryKey: ['invocations', workspaceId, query],
  queryFn: () => apiFetch<ApiResponse<Paged<DataSourceInvocation>>>(
   `/api/v1/workspaces/${workspaceId}/invocations?${query}`,
  ),
  enabled: Boolean(workspaceId),
  refetchInterval: autoRefresh ? 5_000 : false,
 });

 const invocations = data?.data?.data ?? [];
 const total = data?.data?.total ?? 0;

 const active = activeId ? invocations.find((i) => i._id === activeId) : null;

 return (
  <div className="flex flex-col gap-6">
   {/* Header */}
   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-[color:var(--rule)]">
    <div className="flex items-center gap-2 text-[13px]">
     <Link
      href="/dashboard/settings/data-sources"
      className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors font-medium"
     >
      ← Data sources
     </Link>
     <span className="text-[color:var(--ink-3)]">/</span>
     <span className="text-[color:var(--ink-2)] font-semibold">
      Invocation log
     </span>
    </div>
    <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink-2)] cursor-pointer">
     <input
      type="checkbox"
      checked={autoRefresh}
      onChange={(e) => setAutoRefresh(e.target.checked)}
      className="accent-[color:var(--ember)]"
     />
     Auto-refresh
    </label>
   </div>

   {/* Filters */}
   <div className="flex flex-wrap items-center gap-3">
    <select
     value={filterSource}
     onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
     className="border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] bg-transparent py-1.5 text-[13px] text-[color:var(--ink)] outline-none"
    >
     <option value="">All sources</option>
     {sources.map((s) => (
      <option key={s.id} value={s.id}>{s.name}</option>
     ))}
    </select>
    <select
     value={filterStatus}
     onChange={(e) => { setFilterStatus(e.target.value as InvocationStatus | ''); setPage(1); }}
     className="border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] bg-transparent py-1.5 text-[13px] text-[color:var(--ink)] outline-none"
    >
     <option value="">Any status</option>
     <option value="success">Success</option>
     <option value="failed">Failed</option>
     <option value="rate_limited">Rate limited</option>
     <option value="auth_failed">Auth failed</option>
     <option value="invalid_input">Invalid input</option>
     <option value="pending">Pending</option>
    </select>
    <span className="ml-auto text-[12.5px] text-[color:var(--ink-3)]">
     {total.toLocaleString()} events
    </span>
   </div>

   {/* Table */}
   <div className="border-t border-[color:var(--rule)]">
    {isLoading && invocations.length === 0 && (
     <p className="py-6 text-[13px] text-[color:var(--ink-3)]">
      Loading events…
     </p>
    )}
    {!isLoading && invocations.length === 0 && (
     <p className="py-6 text-[13px] text-[color:var(--ink-3)]">
      No invocations match the current filters.
     </p>
    )}

    {invocations.map((inv) => (
     <button
      key={inv._id}
      onClick={() => setActiveId(inv._id)}
      className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[110px_1fr_auto_auto_auto] gap-2 sm:gap-4 items-baseline py-3 border-b border-[color:var(--rule)] text-left hover:bg-[color:var(--paper-3)]/50 transition"
     >
      <span className="hidden sm:inline font-mono text-[10px] text-[color:var(--ink-3)]">
       {formatTime(inv.occurredAt)}
      </span>
      <div className="min-w-0">
       <div className=" text-[13.5px] text-[color:var(--ink)] truncate">
        {sourceById[inv.dataSourceId]?.name ?? inv.dataSourceId}
       </div>
       <div className="font-mono text-[10px] text-[color:var(--ink-3)] truncate mt-0.5">
        {summarizeInput(inv.input)}
       </div>
       <div className="sm:hidden font-mono text-[10px] text-[color:var(--ink-3)] mt-1 flex flex-wrap items-center gap-2">
        <span>{formatTime(inv.occurredAt)}</span>
        <span>·</span>
        <span className="tabular-nums">{typeof inv.latencyMs === 'number' ? `${inv.latencyMs}ms` : '—'}</span>
        <span>·</span>
        <span className="tabular-nums">{typeof inv.costUSD === 'number' ? fmtUsd(inv.costUSD) : '—'}</span>
       </div>
      </div>
      <StatusChip status={inv.status} />
      <span className="hidden sm:inline font-mono text-[10px] text-[color:var(--ink-3)] tabular-nums min-w-[60px] text-right">
       {typeof inv.latencyMs === 'number' ? `${inv.latencyMs}ms` : '—'}
      </span>
      <span className="hidden sm:inline font-mono text-[10px] text-[color:var(--ink-3)] tabular-nums min-w-[60px] text-right">
       {typeof inv.costUSD === 'number' ? fmtUsd(inv.costUSD) : '—'}
      </span>
     </button>
    ))}
   </div>

   {/* Pagination */}
   {total > 50 && (
    <div className="flex items-center justify-between gap-3">
     <button
      onClick={() => setPage(Math.max(1, page - 1))}
      disabled={page === 1}
      className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
     >
      ← Newer
     </button>
     <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
      Page {page} of {Math.ceil(total / 50)}
     </span>
     <button
      onClick={() => setPage(page + 1)}
      disabled={page * 50 >= total}
      className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
     >
      Older →
     </button>
    </div>
   )}

   {active && (
    <InvocationDrawer
     invocation={active}
     source={sourceById[active.dataSourceId]}
     onClose={() => setActiveId(null)}
    />
   )}
  </div>
 );
}

/* ── Drawer ──────────────────────────────────────────────────── */

function InvocationDrawer({
 invocation,
 source,
 onClose,
}: {
 invocation: DataSourceInvocation;
 source?: DataSourceSummary;
 onClose: () => void;
}) {
 return (
  <div className="fixed inset-0 z-[60] flex">
   <div className="hidden sm:block flex-1 bg-[color:var(--ink)]/30" onClick={onClose} aria-hidden />
   <div className="w-full sm:max-w-[640px] bg-[color:var(--paper)] border-l border-[color:var(--rule)] overflow-y-auto">
    <div className="px-5 sm:px-6 md:px-8 py-6 md:py-8 flex flex-col gap-6">
     <div className="flex items-start justify-between gap-4">
      <div>
       <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1">
        {formatTime(invocation.occurredAt)} · {invocation.triggeredBy}
       </span>
       <h2 className=" text-[26px] leading-[1.1] text-[color:var(--ink)]">
        {source?.name ?? invocation.dataSourceId}
       </h2>
       <div className="mt-1.5"><StatusChip status={invocation.status} /></div>
      </div>
      <button
       onClick={onClose}
       className=" text-[22px] leading-none text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
       aria-label="Close"
      >
       ×
      </button>
     </div>

     {/* Meta grid */}
     <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[color:var(--rule)]">
      <Stat label="Latency" value={typeof invocation.latencyMs === 'number' ? `${invocation.latencyMs}ms` : '—'} />
      <Stat label="Cost" value={typeof invocation.costUSD === 'number' ? fmtUsd(invocation.costUSD) : '—'} />
      <Stat label="Category" value={invocation.costCategory ?? '—'} />
     </div>

     {invocation.errorMessage && (
      <div className="border-l-2 border-[color:var(--warn)] px-3 py-2 text-[12.5px] text-[color:var(--ink)]">
       <span className="font-mono text-[9.5px] tracking-[0.06em] block mb-1 text-[color:var(--ink-3)]">
        Error
       </span>
       {invocation.errorMessage}
      </div>
     )}

     <JsonBlock label="Input" value={invocation.input} />
     {invocation.output && <JsonBlock label="Output" value={invocation.output} />}

     {/* Parent refs */}
     {(invocation.parentJobId || invocation.parentLeadId || invocation.parentTableRowId) && (
      <div className="border-t border-[color:var(--rule)] pt-4 flex flex-col gap-2">
       <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
        Context
       </span>
       {invocation.parentJobId && (
        <Link
         href={`/dashboard/leads?jobId=${invocation.parentJobId}`}
         className=" text-[13px] text-[color:var(--ink)] hover:text-[color:var(--success)] underline underline-offset-[4px] decoration-[color:var(--rule)]"
        >
         Parent job → {invocation.parentJobId}
        </Link>
       )}
       {invocation.parentLeadId && (
        <span className="font-mono text-[11px] text-[color:var(--ink-2)]">
         Lead: {invocation.parentLeadId}
        </span>
       )}
       {invocation.parentTableRowId && invocation.parentColumnKey && (
        <span className="font-mono text-[11px] text-[color:var(--ink-2)]">
         Row: {invocation.parentTableRowId} · Column: {invocation.parentColumnKey}
        </span>
       )}
      </div>
     )}
    </div>
   </div>
  </div>
 );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
 let json: string;
 try {
  json = JSON.stringify(value, null, 2);
 } catch {
  json = String(value);
 }
 return (
  <div>
   <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
    {label}
   </span>
   <pre className="font-mono text-[11px] leading-[1.5] bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all text-[color:var(--ink)] max-h-[360px] overflow-y-auto">
    {json}
   </pre>
  </div>
 );
}

function Stat({ label, value }: { label: string; value: string }) {
 return (
  <div>
   <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1">
    {label}
   </span>
   <div className=" text-[14px] text-[color:var(--ink)] tabular-nums">{value}</div>
  </div>
 );
}

function StatusChip({ status }: { status: InvocationStatus }) {
 const styles: Record<InvocationStatus, string> = {
  success: 'text-[color:var(--success)] border-[color:var(--success)]/40 bg-[color:var(--success)]/5',
  failed: 'text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/5',
  rate_limited: 'text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/5',
  auth_failed: 'text-[color:var(--warn)] border-[color:var(--warn)]/40 bg-[color:var(--warn)]/5',
  invalid_input: 'text-[color:var(--ink-2)] border-[color:var(--rule)] bg-[color:var(--paper-3)]',
  pending: 'text-[color:var(--ink-2)] border-[color:var(--rule)] bg-[color:var(--paper-3)]',
 };
 return (
  <span
   className={`inline-flex items-center px-2 py-0.5 border rounded-md font-mono text-[9.5px] tracking-[0.06em] whitespace-nowrap ${styles[status]}`}
  >
   {status.replace(/_/g, ' ')}
  </span>
 );
}

/* ── Helpers ─────────────────────────────────────────────────── */

function formatTime(iso: string): string {
 const d = new Date(iso);
 const now = Date.now();
 const diff = now - d.getTime();
 if (diff < 60_000) return 'just now';
 if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
 if (diff < 86400_000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function summarizeInput(input: Record<string, unknown>): string {
 try {
  const entries = Object.entries(input).slice(0, 3);
  if (entries.length === 0) return '(no input)';
  return entries
   .map(([k, v]) => `${k}=${shortValue(v)}`)
   .join(' · ');
 } catch {
  return '(input)';
 }
}

function shortValue(v: unknown): string {
 if (v === null || v === undefined) return '—';
 if (typeof v === 'string') return v.length > 40 ? `"${v.slice(0, 38)}…"` : `"${v}"`;
 if (typeof v === 'number' || typeof v === 'boolean') return String(v);
 if (Array.isArray(v)) return `[${v.length}]`;
 if (typeof v === 'object') return '{…}';
 return String(v);
}

function fmtUsd(n: number): string {
 if (!Number.isFinite(n) || n === 0) return '$0';
 if (n >= 1) return `$${n.toFixed(2)}`;
 if (n >= 0.01) return `$${n.toFixed(2)}`;
 return `$${n.toFixed(4)}`;
}
