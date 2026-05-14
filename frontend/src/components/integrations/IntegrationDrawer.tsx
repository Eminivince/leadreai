'use client';

import { useEffect } from 'react';
import type { IntegrationMeta } from './catalog';

/* ─────────────────────────────────────────────────────────────────
 * IntegrationDrawer — right-side drawer scaffold.
 *
 * Mirrors the pattern in `dashboard/leads/page.tsx` LeadDrawer so the
 * animation, overlay, Esc-to-close, and layout all match. Children
 * render the per-integration body (HubSpotPanel / EmailPanel / etc.).
 *
 * The integration catalogue provides name + tagline for the drawer
 * header; the panel owns its body + any footer actions.
 * ───────────────────────────────────────────────────────────────── */

function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
 );
}

export function IntegrationDrawer({
 meta,
 open,
 onClose,
 children,
}: {
 meta: IntegrationMeta | null;
 open: boolean;
 onClose: () => void;
 children: React.ReactNode;
}) {
 useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [open, onClose]);

 if (!open || !meta) return null;

 return (
  <div className="fixed inset-0 z-[70] flex justify-end pointer-events-none">
   <style>{`
    @keyframes ldwFadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes ldwSlide { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }
   `}</style>
   <div
    className="absolute inset-0 bg-[color:var(--ink)]/30 pointer-events-auto"
    style={{ animation: 'ldwFadeIn .18s ease-out both' }}
    onClick={onClose}
   />
   <div
    className="relative pointer-events-auto w-full max-w-[560px] h-full bg-[color:var(--paper)] border-l border-[color:var(--rule)] overflow-y-auto"
    style={{ animation: 'ldwSlide .26s cubic-bezier(.2,.9,.25,1) both' }}
   >
    {/* Top bar */}
    <div className="flex items-center justify-between px-7 md:px-8 pt-7 pb-4 border-b border-[color:var(--rule)]">
     <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
      Wire · {meta.id}
     </span>
     <button
      onClick={onClose}
      className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
      title="Close (Esc)"
     >
      <CloseIcon className="w-4 h-4" />
     </button>
    </div>

    {/* Header */}
    <div className="px-7 md:px-8 pt-6 pb-5 border-b border-[color:var(--rule)]">
     <h2 className=" text-[40px] md:text-[48px] leading-[1.02] tracking-[-0.01em] text-[color:var(--ink)]">
      {meta.name}
     </h2>
     <p className="mt-2 italic text-[14px] leading-[1.5] text-[color:var(--ink-2)]">
      {meta.tagline}
     </p>
    </div>

    {/* Body */}
    <div className="px-7 md:px-8 py-7 flex flex-col gap-7">{children}</div>

    {/* Esc hint */}
    <div className="pb-6 font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] text-center">
     Press Esc to close
    </div>
   </div>
  </div>
 );
}
