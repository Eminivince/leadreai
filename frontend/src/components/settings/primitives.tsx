'use client';

import React from 'react';

/* ─────────────────────────────────────────────────────────────────
 * Shared UI primitives for settings sub-pages.
 *
 * Redesigned to match the rest of the app's B2B SaaS aesthetic:
 * mono lowercase labels (was tracking-[0.22em] uppercase), bordered
 * rounded-md inputs with soft amber focus rings (was border-b
 * underline-only), and a clean SectionHead (was 28px italic
 * chapter numeral + decorative rule + italic title).
 *
 * Every settings sub-page imports from here, so the redesign
 * cascades automatically. Pages still own their own copy and
 * data-fetching; only the rendering primitives changed.
 * ───────────────────────────────────────────────────────────────── */

export function Label({ children }: { children: React.ReactNode }) {
 return (
  <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
   {children}
  </span>
 );
}

export const HairlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
 function HairlineInput({ className = '', ...props }, ref) {
  return (
   <input
    ref={ref}
    {...props}
    className={`block w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--forest)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--forest)_8%,transparent)] disabled:bg-[color:var(--paper-2)] disabled:hover:border-[color:var(--rule)] disabled:cursor-not-allowed rounded-md px-3 h-9 outline-none text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition-colors ${className}`}
   />
  );
 },
);

export function HairlineTextarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
 return (
  <textarea
   {...props}
   className={`block w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--forest)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--forest)_8%,transparent)] rounded-md px-3 py-2 outline-none text-[13.5px] leading-[1.55] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] resize-none transition-colors ${className}`}
  />
 );
}

/**
 * Select with a native chevron in the right slot. Same shape as
 * HairlineInput so a row of mixed inputs aligns vertically.
 */
export function HairlineSelect({
 value,
 onChange,
 children,
}: {
 value: string;
 onChange: (v: string) => void;
 children: React.ReactNode;
}) {
 return (
  <div className="relative">
   <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="block w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--forest)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--forest)_8%,transparent)] rounded-md pl-3 pr-9 h-9 outline-none text-[13.5px] text-[color:var(--ink)] appearance-none cursor-pointer transition-colors"
   >
    {children}
   </select>
   <svg
    aria-hidden
    viewBox="0 0 16 16"
    fill="none"
    className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[color:var(--ink-3)]"
   >
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
   </svg>
  </div>
 );
}

export function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
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

/**
 * Section header — mono numeral + 14.5/600 title. Replaces the
 * editorial 28px italic numeral + decorative rule + italic title.
 * Used on every settings sub-page to number sections (01, 02, ...)
 * within the route's content.
 */
export function SectionHead({ n, title }: { n: string; title: React.ReactNode }) {
 return (
  <div className="flex items-baseline gap-2 mb-3">
   <span className="font-mono text-[10.5px] tabular-nums tracking-[0.04em] text-[color:var(--ink-3)]">
    {n}
   </span>
   <h2 className="text-[14.5px] font-semibold text-[color:var(--ink)] tracking-[-0.005em]">
    {title}
   </h2>
  </div>
 );
}

/**
 * "Forthcoming" panel — for sections that need backend work that
 * hasn't shipped yet. Honesty over pretending. Now a clean
 * rounded-md card with a small status-dot indicator instead of
 * the former dashed border + italic title.
 */
export function ForthcomingPanel({
 title,
 children,
}: {
 title: string;
 children: React.ReactNode;
}) {
 return (
  <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 px-4 py-3.5">
   <div className="flex items-center gap-2 mb-1">
    <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)]" aria-hidden />
    <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
     forthcoming
    </span>
   </div>
   <h4 className="text-[14px] font-semibold text-[color:var(--ink)] leading-snug">
    {title}
   </h4>
   <div className="mt-1 text-[12.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[560px]">
    {children}
   </div>
  </div>
 );
}

/** Primary filled button — ink fill, amber on hover. */
export function PrimaryButton({
 children,
 disabled,
 ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
 return (
  <button
   {...rest}
   disabled={disabled}
   className={`inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3.5 h-8 rounded-md text-[12.5px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[color:var(--ink)] ${rest.className ?? ''}`}
  >
   {children}
  </button>
 );
}

/** Secondary outline button — paper-2 bg, hairline border. */
export function GhostButton({
 children,
 ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
 return (
  <button
   {...rest}
   className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] px-3 h-8 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${rest.className ?? ''}`}
  >
   {children}
  </button>
 );
}
