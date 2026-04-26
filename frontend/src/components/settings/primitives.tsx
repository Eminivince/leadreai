'use client';

import React from 'react';

/* ─────────────────────────────────────────────────────────────────
 * Shared UI primitives for settings sub-pages.
 *
 * Keeps the editorial input treatment consistent across Account,
 * Workspace, Knowledge base, Suppression, API keys, Billing.
 * ───────────────────────────────────────────────────────────────── */

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] block mb-2">
      {children}
    </span>
  );
}

export const HairlineInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function HairlineInput({ className = '', ...props }, ref) {
    return (
      <div className="border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)] transition-colors">
        <input
          ref={ref}
          {...props}
          className={`block w-full bg-transparent py-2 outline-none font-[family-name:var(--font-barlow)] text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] disabled:text-[color:var(--ink-3)] disabled:cursor-not-allowed ${className}`}
        />
      </div>
    );
  },
);

export function HairlineTextarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)] transition-colors">
      <textarea
        {...props}
        className={`block w-full bg-transparent py-2 outline-none font-[family-name:var(--font-barlow)] text-[14px] leading-[1.55] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] resize-none ${className}`}
      />
    </div>
  );
}

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
    <div className="border-b border-[color:var(--rule)]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full bg-transparent py-2 outline-none font-[family-name:var(--font-barlow)] text-[14px] text-[color:var(--ink)] appearance-none cursor-pointer"
      >
        {children}
      </select>
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
 * Section header with a large forest-green numeral + editorial rule
 * + italic serif title. Used on every settings sub-page to number
 * the sections in a given route (01, 02, 03 per page).
 */
export function SectionHead({ n, title }: { n: string; title: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-5 mb-6">
      <span className="font-[family-name:var(--font-instrument-serif)] italic text-[28px] leading-none text-[color:var(--forest)] tabular-nums">
        {n}
      </span>
      <div className="flex-1 border-t border-[color:var(--rule)] pb-0.5" />
      <span className="font-[family-name:var(--font-instrument-serif)] italic text-[18px] text-[color:var(--ink)] self-end pb-0.5">
        {title}
      </span>
    </div>
  );
}

/** A paper-3 "forthcoming" panel — used on sections that need backend
 *  work we haven't shipped yet. Honesty over pretense. */
export function ForthcomingPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-sm p-5">
      <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
        Forthcoming
      </span>
      <h4 className="mt-2 font-[family-name:var(--font-instrument-serif)] text-[20px] leading-[1.15] text-[color:var(--ink)]">
        {title}
      </h4>
      <div className="mt-2 font-[family-name:var(--font-barlow)] text-[13px] leading-[1.55] text-[color:var(--ink-2)] max-w-[560px]">
        {children}
      </div>
    </div>
  );
}

/** Primary dark-ink button with arrow, matches CTAs across the product. */
export function PrimaryButton({
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${rest.className ?? ''}`}
    >
      <span>{children}</span>
      <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/** Secondary outline button (paper-3 bg, hairline border, ink text) */
export function GhostButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)] border border-[color:var(--rule)] bg-[color:var(--paper-3)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full transition disabled:opacity-60 disabled:cursor-not-allowed ${rest.className ?? ''}`}
    >
      {children}
    </button>
  );
}
