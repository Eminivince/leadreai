'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Workspace } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * WebhookPanel — drawer body for the outbound webhook card.
 *
 * Reads / writes workspace.settings.webhookUrl via the same PATCH
 * /workspaces/:id endpoint used elsewhere. URL is saved in plain text
 * (no secret) — we POST to it with { event, jobId, workspaceId, ... }.
 * Future enhancement: HMAC signing; for now, users can gate the
 * endpoint on a shared secret in the query string.
 * ───────────────────────────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
 return (
  <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] block mb-2">
   {children}
  </span>
 );
}

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

const EVENTS = [
 { key: 'job:complete', label: 'Dispatch complete', detail: 'Fires when a dispatch finishes compiling its dossier.' },
 { key: 'job:failed',  label: 'Dispatch failed',  detail: 'Fires when a dispatch errors out and abandons.' },
];

const SAMPLE_PAYLOAD = `{
 "event": "job:complete",
 "workspaceId": "wks_9f4a2",
 "jobId": "job_2406",
 "status": "complete",
 "totalLeadsFound": 47,
 "durationMs": 251003
}`;

export function WebhookPanel({ workspaceId }: { workspaceId: string }) {
 const qc = useQueryClient();
 const { data: workspaceData, isLoading } = useQuery({
  queryKey: ['workspace', workspaceId],
  queryFn: () => apiFetch<ApiResponse<Workspace>>(`/api/v1/workspaces/${workspaceId}`),
  enabled: !!workspaceId,
 });

 const existingUrl = workspaceData?.data?.settings?.webhookUrl ?? '';
 const [url, setUrl] = useState('');
 const [dirty, setDirty] = useState(false);

 useEffect(() => {
  if (!dirty) setUrl(existingUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [existingUrl]);

 const saveMutation = useMutation({
  mutationFn: (nextUrl: string) =>
   apiFetch(`/api/v1/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ settings: { webhookUrl: nextUrl || null } }),
   }),
  onSuccess: () => {
   toast.success(url ? 'Cable route saved.' : 'Cable removed.');
   setDirty(false);
   qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
  },
  onError: (err) => {
   toast.error(err instanceof Error ? err.message : 'Failed to save.');
  },
 });

 const connected = !!existingUrl;

 if (isLoading) {
  return (
   <div className="h-24 bg-[color:var(--paper-2)] border border-dashed border-[color:var(--rule)] rounded-sm flex items-center justify-center">
    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
     Loading cable…
    </span>
   </div>
  );
 }

 return (
  <form
   onSubmit={(e) => {
    e.preventDefault();
    saveMutation.mutate(url.trim());
   }}
   className="flex flex-col gap-7"
  >
   <div>
    <span
     className={`font-mono text-[9.5px] tracking-[0.22em] uppercase ${
      connected ? 'text-[color:var(--ember)]' : 'text-[color:var(--ink-3)]'
     }`}
    >
     {connected ? 'On the wire' : 'Not filed'}
    </span>
    <h3 className="mt-2 text-[22px] leading-[1.2] text-[color:var(--ink)]">
     {connected ? (
      <>
       Cable dispatched to{' '}
       <em className="italic text-[color:var(--ember)]">your endpoint</em>.
      </>
     ) : (
      <>
       Wire LeadreAI to <em className="italic text-[color:var(--ember)]">your own endpoint</em>.
      </>
     )}
    </h3>
    <p className="mt-2 text-[13.5px] leading-[1.55] text-[color:var(--ink-2)]">
     We POST a small JSON payload to the URL below whenever a dispatch finishes. Use it to pipe
     events into Slack (via Incoming Webhooks), Zapier, or anywhere HTTP can reach.
    </p>
   </div>

   <div>
    <Label>Endpoint URL</Label>
    <div className="border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)] transition-colors">
     <input
      type="url"
      placeholder="https://hooks.example.com/leadreai?secret=…"
      value={url}
      onChange={(e) => {
       setDirty(true);
       setUrl(e.target.value);
      }}
      className="block w-full bg-transparent py-2 outline-none font-mono text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
     />
    </div>
    <p className="mt-2 italic text-[12.5px] text-[color:var(--ink-2)]">
     HMAC signing is not yet available. Gate your endpoint on a shared secret in the URL for now.
    </p>
   </div>

   {/* Events */}
   <div>
    <Label>Events we cable</Label>
    <ul className="border-t border-[color:var(--rule)]">
     {EVENTS.map((ev) => (
      <li
       key={ev.key}
       className="flex items-baseline gap-4 py-3 border-b border-[color:var(--rule)]/70"
      >
       <span className="font-mono text-[11px] text-[color:var(--ember)] shrink-0 w-[130px]">
        {ev.key}
       </span>
       <div className="min-w-0 flex-1">
        <div className=" text-[13.5px] text-[color:var(--ink)]">
         {ev.label}
        </div>
        <div className=" italic text-[12px] text-[color:var(--ink-2)] mt-0.5">
         {ev.detail}
        </div>
       </div>
      </li>
     ))}
    </ul>
   </div>

   {/* Sample payload */}
   <div>
    <Label>Sample payload</Label>
    <pre className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm p-4 overflow-x-auto font-mono text-[12px] leading-[1.5] text-[color:var(--ink)] whitespace-pre">
     {SAMPLE_PAYLOAD}
    </pre>
   </div>

   {/* Actions */}
   <div className="pt-5 border-t border-[color:var(--rule)] flex items-center justify-between gap-4">
    {connected && (
     <button
      type="button"
      onClick={() => {
       setUrl('');
       setDirty(true);
       saveMutation.mutate('');
      }}
      disabled={saveMutation.isPending}
      className=" italic text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--warn)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--warn)] transition disabled:opacity-60"
     >
      Remove cable
     </button>
    )}
    <button
     type="submit"
     disabled={saveMutation.isPending || (!dirty && !!existingUrl)}
     className="group ml-auto inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-3 rounded-full text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
     {saveMutation.isPending ? 'Saving…' : connected ? 'Save cable' : 'File this cable'}
     <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
    </button>
   </div>
  </form>
 );
}
