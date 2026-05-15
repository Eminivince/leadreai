'use client';

import { toast } from 'sonner';
import {
 useHubSpotStatus,
 useHubSpotSyncLog,
 useTriggerHubSpotSync,
 useDisconnectHubSpot,
} from '@/hooks/useHubSpot';
import { getAccessToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ─────────────────────────────────────────────────────────────────
 * HubSpotPanel — drawer body for the HubSpot card.
 *
 * Connected state: shows portal ID, sync toggles, last dispatched time,
 * and a sync-log list styled as a dossier ledger. Actions: "Dispatch
 * now" (manual sync), "Disconnect" (remove OAuth).
 *
 * Disconnected state: big serif headline + Connect-via-OAuth CTA that
 * redirects to the backend OAuth start route. On return, the page
 * reads ?crm=connected and auto-opens this drawer.
 * ───────────────────────────────────────────────────────────────── */

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

function relativeTime(iso?: string | null): string {
 if (!iso) return '—';
 const diff = Math.max(0, Date.now() - new Date(iso).getTime());
 const min = Math.floor(diff / 60_000);
 if (min < 1) return 'just now';
 if (min < 60) return `${min} min ago`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${hr} hr ago`;
 return `${Math.floor(hr / 24)}d ago`;
}

export function HubSpotPanel({ workspaceId }: { workspaceId: string }) {
 const { data: status, isLoading } = useHubSpotStatus(workspaceId);
 const { data: syncLog } = useHubSpotSyncLog(workspaceId);
 const syncMutation = useTriggerHubSpotSync(workspaceId);
 const disconnectMutation = useDisconnectHubSpot(workspaceId);

 if (isLoading) {
  return (
   <div className="h-24 bg-[color:var(--paper-2)] border border-dashed border-[color:var(--rule)] rounded-sm flex items-center justify-center">
    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
     Loading status…
    </span>
   </div>
  );
 }

 const handleConnect = () => {
  const token = getAccessToken();
  const url = new URL(`${API_BASE}/api/v1/workspaces/${workspaceId}/crm/hubspot/connect`);
  if (token) url.searchParams.set('token', token);
  window.location.href = url.toString();
 };

 const handleSync = async () => {
  try {
   await syncMutation.mutateAsync();
   toast.success('Dispatched to HubSpot');
  } catch {
   toast.error('Sync failed');
  }
 };

 const handleDisconnect = async () => {
  try {
   await disconnectMutation.mutateAsync();
   toast.success('HubSpot disconnected');
  } catch {
   toast.error('Failed to disconnect');
  }
 };

 if (!status?.connected) {
  return (
   <div className="flex flex-col gap-5">
    <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-2)] rounded-sm p-6">
     <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
      Not filed
     </span>
     <h3 className="mt-2 text-[24px] leading-[1.15] text-[color:var(--ink)]">
      Wire LeadreAI to your <em className="italic text-[color:var(--ember)]">HubSpot portal</em>.
     </h3>
     <p className="mt-2 text-[13.5px] leading-[1.55] text-[color:var(--ink-2)]">
      We use the official HubSpot OAuth flow. You&rsquo;ll approve the scopes in a browser tab and
      return here automatically. No credentials ever touch our servers in cleartext.
     </p>
    </div>

    <div>
     <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
      Scopes requested
     </span>
     <ul className="mt-3 border-t border-[color:var(--rule)]">
      {[
       'Read / write companies',
       'Read / write contacts',
       'Read existing owners (for assignment)',
      ].map((s) => (
       <li
        key={s}
        className="flex items-baseline gap-3 py-2.5 border-b border-[color:var(--rule)]/70 text-[13px] text-[color:var(--ink-2)]"
       >
        <span className="font-mono text-[10px] tracking-[0.2em] text-[color:var(--ink-3)]">
         ·
        </span>
        {s}
       </li>
      ))}
     </ul>
    </div>

    <button
     onClick={handleConnect}
     className="group inline-flex items-center justify-between gap-4 w-full bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-3.5 rounded-full hover:bg-[color:var(--ember)] transition-colors"
    >
     <span className=" text-[14px] font-medium">
      Connect via OAuth
     </span>
     <ArrowEast className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
    </button>
   </div>
  );
 }

 // Connected state
 const meta: Array<{ label: string; value: React.ReactNode; mono?: boolean }> = [
  { label: 'Portal', value: status.portalId ?? '—', mono: true },
  { label: 'Last dispatched', value: relativeTime(status.lastSyncAt) },
  { label: 'Auto on complete', value: status.autoSyncOnJobComplete ? 'Enabled' : 'Off' },
  { label: 'Sync', value: status.syncEnabled ? 'Enabled' : 'Paused' },
 ];

 return (
  <div className="flex flex-col gap-7">
   {/* Status summary */}
   <div>
    <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ember)]">
     On the wire
    </span>
    <h3 className="mt-2 text-[24px] leading-[1.15] text-[color:var(--ink)]">
     Connected to portal{' '}
     <span className="font-mono text-[18px] text-[color:var(--ember)]">
      {status.portalId}
     </span>
    </h3>
   </div>

   <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-5 border-t border-[color:var(--rule)]">
    {meta.map((m) => (
     <div key={m.label}>
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
       {m.label}
      </span>
      <div
       className={`mt-1 text-[color:var(--ink)] ${
        m.mono
         ? 'font-mono text-[13px]'
         : ' text-[14px]'
       }`}
      >
       {m.value}
      </div>
     </div>
    ))}
   </div>

   {/* Sync log — the ledger */}
   <div>
    <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
     Dispatch ledger
    </span>
    <div className="mt-3 border-t border-[color:var(--rule)]">
     {syncLog === undefined ? (
      <div className="py-6 text-center italic text-[13px] text-[color:var(--ink-3)]">
       Loading ledger…
      </div>
     ) : syncLog.length === 0 ? (
      <div className="py-6 text-center italic text-[13px] text-[color:var(--ink-3)]">
       No dispatches recorded yet.
      </div>
     ) : (
      <>
       <div className="grid grid-cols-[1fr_60px_50px_50px_40px] gap-3 py-2 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] border-b border-[color:var(--rule)]">
        <span>When</span>
        <span>Dir.</span>
        <span className="text-right">Cos.</span>
        <span className="text-right">Ctcs.</span>
        <span className="text-right">Err.</span>
       </div>
       {syncLog.slice(0, 8).map((entry) => (
        <div
         key={entry.syncedAt}
         className="grid grid-cols-[1fr_60px_50px_50px_40px] gap-3 py-2 border-b border-[color:var(--rule)]/70 items-baseline"
        >
         <span className="font-mono text-[11px] text-[color:var(--ink-2)]">
          {relativeTime(entry.syncedAt)}
         </span>
         <span className=" italic text-[12px] text-[color:var(--ink-2)] capitalize">
          {entry.direction}
         </span>
         <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink)] text-right">
          {entry.companiesSynced}
         </span>
         <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink)] text-right">
          {entry.contactsSynced}
         </span>
         <span
          className={`font-mono text-[12px] tabular-nums text-right ${
           entry.errors > 0 ? 'text-[color:var(--warn)]' : 'text-[color:var(--ink-3)]'
          }`}
         >
          {entry.errors}
         </span>
        </div>
       ))}
      </>
     )}
    </div>
   </div>

   {/* Actions */}
   <div className="pt-6 border-t border-[color:var(--rule)] flex items-center justify-between gap-3">
    <button
     onClick={handleDisconnect}
     disabled={disconnectMutation.isPending}
     className=" italic text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--warn)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--warn)] transition disabled:opacity-60"
    >
     {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
    </button>
    <button
     onClick={handleSync}
     disabled={syncMutation.isPending}
     className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-60"
    >
     {syncMutation.isPending ? 'Dispatching…' : 'Dispatch now'}
     <ArrowEast className="w-3 h-3" />
    </button>
   </div>
  </div>
 );
}
