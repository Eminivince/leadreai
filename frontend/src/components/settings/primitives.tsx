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
  <span className="font-sans font-medium text-[12.5px] text-[color:var(--ink-2)] block mb-1.5">
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
    className={`block w-full bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] focus:border-[color:var(--ink)] focus:outline-none transition-colors disabled:bg-[color:var(--paper-2)] disabled:cursor-not-allowed ${className}`}
   />
  );
 },
);

export function HairlineTextarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
 return (
  <textarea
   {...props}
   className={`block w-full bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] focus:border-[color:var(--ink)] focus:outline-none resize-none transition-colors ${className}`}
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
    className="block w-full bg-white border border-[color:var(--rule)] rounded-lg pl-3.5 pr-9 py-2.5 text-[13.5px] text-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none appearance-none cursor-pointer transition-colors"
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

/** Primary filled button — ink fill, hover opacity. */
export function PrimaryButton({
 children,
 disabled,
 ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
 return (
  <button
   {...rest}
   disabled={disabled}
   className={`inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${rest.className ?? ''}`}
  >
   {children}
  </button>
 );
}

/** Secondary outline button — transparent bg, hairline border, ink on hover. */
export function GhostButton({
 children,
 ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
 return (
  <button
   {...rest}
   className={`inline-flex items-center gap-1.5 border border-[color:var(--rule)] bg-transparent text-[color:var(--ink-2)] font-sans font-medium text-[13px] px-5 py-2.5 rounded-lg hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${rest.className ?? ''}`}
  >
   {children}
  </button>
 );
}
