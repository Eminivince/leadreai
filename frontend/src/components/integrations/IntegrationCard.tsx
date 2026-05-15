'use client';

import type { IntegrationMeta } from './catalog';

/* ─────────────────────────────────────────────────────────────────
 * IntegrationCard — anatomy:
 *  [STATUS KICKER]             (top-left mono label)
 *  Wordmark                 (big serif name)
 *  Tagline                 (italic barlow)
 *  Optional meta grid            (e.g. HubSpot portal ID)
 *  [Action button / forthcoming badge]   (bottom-right)
 *
 * Live + connected cards glow slightly with a forest-green top border;
 * live + disconnected cards use ink hairlines; forthcoming cards are
 * muted on paper-2 with no action.
 * ───────────────────────────────────────────────────────────────── */

export type CardStatus = 'on-the-wire' | 'not-filed' | 'forthcoming';

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

function StatusChip({ status }: { status: CardStatus }) {
 const map: Record<CardStatus, { label: string; tone: string }> = {
  'on-the-wire': { label: 'On the wire', tone: 'text-[color:var(--ember)] border-[color:var(--ember)]/40' },
  'not-filed':  { label: 'Not filed',  tone: 'text-[color:var(--ink-2)] border-[color:var(--rule)]' },
  'forthcoming': { label: 'Forthcoming', tone: 'text-[color:var(--ink-3)] border-[color:var(--rule)]/60' },
 };
 const chip = map[status];
 return (
  <span
   className={`inline-flex items-center font-mono text-[9.5px] tracking-[0.18em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${chip.tone}`}
  >
   {chip.label}
  </span>
 );
}

export interface CardMetaEntry {
 label: string;
 value: React.ReactNode;
 mono?: boolean;
}

export function IntegrationCard({
 meta,
 status,
 metaEntries,
 onOpen,
}: {
 meta: IntegrationMeta;
 status: CardStatus;
 metaEntries?: CardMetaEntry[];
 onOpen?: () => void;
}) {
 const isForthcoming = status === 'forthcoming';
 const isConnected = status === 'on-the-wire';

 const actionLabel = isForthcoming
  ? null
  : isConnected
   ? 'Manage'
   : meta.id === 'hubspot'
    ? 'Connect via OAuth'
    : 'Configure';

 return (
  <button
   type="button"
   disabled={isForthcoming}
   onClick={onOpen}
   className={`group relative text-left transition-colors ${
    isForthcoming
     ? 'cursor-default'
     : 'hover:bg-[color:var(--paper-3)]'
   }`}
  >
   <div
    className={`relative h-full border bg-[color:var(--paper)] p-6 rounded-sm transition-all ${
     isConnected
      ? 'border-[color:var(--ember)]/40'
      : isForthcoming
       ? 'border-[color:var(--rule)]/60 bg-[color:var(--paper-2)]/60 opacity-85'
       : 'border-[color:var(--rule)]'
    }`}
   >
    {/* Top row: status chip */}
    <div className="flex items-center justify-between mb-5">
     <StatusChip status={status} />
     {!isForthcoming && (
      <span
       className={`font-mono text-[10px] tracking-[0.18em] uppercase transition-opacity ${
        isConnected
         ? 'text-[color:var(--ink-3)] opacity-0 group-hover:opacity-100'
         : 'text-[color:var(--ink-3)] opacity-0 group-hover:opacity-100'
       }`}
      >
       {actionLabel} →
      </span>
     )}
    </div>

    {/* Wordmark + tagline */}
    <h3 className=" text-[28px] leading-[1.05] tracking-[-0.01em] text-[color:var(--ink)]">
     {meta.name}
    </h3>
    <p className="mt-1.5 italic text-[13px] leading-[1.4] text-[color:var(--ink-2)]">
     {meta.tagline}
    </p>

    {/* Meta grid (only for connected / configurable live integrations) */}
    {metaEntries && metaEntries.length > 0 && (
     <div className="mt-5 pt-4 border-t border-dashed border-[color:var(--rule)] grid grid-cols-2 gap-x-4 gap-y-3">
      {metaEntries.map((entry) => (
       <div key={entry.label} className="min-w-0">
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
         {entry.label}
        </span>
        <div
         className={`mt-0.5 truncate text-[color:var(--ink)] ${
          entry.mono
           ? 'font-mono text-[12px]'
           : ' text-[13px]'
         }`}
        >
         {entry.value}
        </div>
       </div>
      ))}
     </div>
    )}

    {/* Bottom action */}
    {!isForthcoming && (
     <div
      className={`mt-5 pt-4 border-t border-[color:var(--rule)] flex items-center justify-between ${
       metaEntries && metaEntries.length > 0 ? '' : ''
      }`}
     >
      <span
       className={` text-[12.5px] font-medium ${
        isConnected ? 'text-[color:var(--ink-2)]' : 'text-[color:var(--ink)]'
       }`}
      >
       {actionLabel}
      </span>
      <ArrowEast className="w-3 h-3 text-[color:var(--ink-2)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition-transform" />
     </div>
    )}

    {isForthcoming && (
     <div className="mt-5 pt-4 border-t border-[color:var(--rule)]/50">
      <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
       — forthcoming
      </span>
     </div>
    )}
   </div>
  </button>
 );
}
