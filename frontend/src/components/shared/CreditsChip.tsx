'use client';

import { useCredits } from '@/hooks/useCredits';
import { useAppStore } from '@/store/useAppStore';

/**
 * Compact credit balance chip for the Topbar.
 *
 * Replaces the full WorkspaceUsageWidget on the dashboard body — the
 * point of moving it here is to keep the user aware of their balance
 * without making cost the visual headline of every dashboard visit.
 *
 * Click → opens the top-up modal. Hover surfaces the plan tier so
 * users on annual / enterprise plans don't keep getting nudged to
 * top up.
 */
export function CreditsChip({ className = '' }: { className?: string }) {
  const { data, isLoading } = useCredits();
  const { openTopUp } = useAppStore();

  if (isLoading || !data) {
    // Reserve the slot so the topbar doesn't reflow when data lands.
    return (
      <div
        aria-hidden
        className={`inline-flex items-center h-8 w-[88px] rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-2)] ${className}`}
      />
    );
  }

  const balance = data.totalCreditsBalance ?? data.creditsBalance;
  const isLow = balance <= 3;

  return (
    <button
      type="button"
      onClick={openTopUp}
      title={`${data.plan} plan · ${balance} credit${balance === 1 ? '' : 's'} remaining · click to top up`}
      className={`group inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border transition-colors ${
        isLow
          ? 'border-[color:var(--ember)]/40 bg-[color:var(--ember)]/5 hover:border-[color:var(--ember)]'
          : 'border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)]'
      } ${className}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          isLow ? 'bg-[color:var(--ember)]' : 'bg-[color:var(--ink-3)]'
        }`}
        aria-hidden
      />
      <span className="font-mono text-[11px] tabular-nums text-[color:var(--ink)]">
        {balance}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)] group-hover:text-[color:var(--ink-2)] transition-colors">
        cr
      </span>
    </button>
  );
}
