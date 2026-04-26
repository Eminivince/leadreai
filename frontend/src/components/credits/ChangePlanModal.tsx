'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useCredits } from '@/hooks/useCredits';
import { PLAN_CONFIG, type PlanTier, type PlanConfig } from '@leadreai/shared';
import { PrimaryButton, GhostButton } from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * Change plan modal — swaps the user's subscription tier.
 *
 * Posts to /credits/test-subscribe today (dev placeholder). When
 * Stripe lands, this modal will hit /credits/checkout-session and
 * redirect to Checkout; the card UI + selection state stay identical.
 * ───────────────────────────────────────────────────────────────── */

interface SubscribeResponse {
  success: true;
  data: { plan: PlanTier; monthlyAfter: number; renewsAt: string };
}

function CloseIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function priceLabel(p: PlanConfig): string {
  if (p.priceUsd === 0) return 'Free';
  if (p.priceUsd === null) return 'Contact us';
  return `$${p.priceUsd}/mo`;
}

function PlanCard({
  plan,
  current,
  selected,
  onSelect,
}: {
  plan: PlanConfig;
  current: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full text-left border transition-colors p-5 ${
        selected
          ? 'border-[color:var(--ink)] bg-[color:var(--paper-3)]'
          : 'border-[color:var(--rule)] hover:border-[color:var(--ink-2)] bg-[color:var(--paper)]'
      }`}
    >
      {selected && (
        <span className="absolute left-0 top-3 bottom-3 w-[2px] bg-[color:var(--forest)]" />
      )}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-instrument-serif)] text-[24px] leading-tight text-[color:var(--ink)]">
              {plan.label}
            </span>
            {current && (
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] tracking-[0.18em] uppercase text-[color:var(--forest)] border border-[color:var(--forest)]/40 px-1.5 py-0.5">
                Current
              </span>
            )}
          </div>
          <div className="mt-0.5 font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-2)]">
            {plan.tagline}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-[family-name:var(--font-instrument-serif)] text-[20px] leading-none text-[color:var(--ink)] tabular-nums">
            {priceLabel(plan)}
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-dashed border-[color:var(--rule)]/70 flex items-baseline justify-between gap-3">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          Monthly allowance
        </span>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[14px] tabular-nums text-[color:var(--ink)]">
          {plan.monthlyCredits.toLocaleString()} dispatches
        </span>
      </div>
    </button>
  );
}

export function ChangePlanModal() {
  const { changePlanOpen, closeChangePlan } = useAppStore();
  const { data: credits } = useCredits();
  const currentPlan = credits?.plan ?? 'free';
  const qc = useQueryClient();
  const [selected, setSelected] = useState<PlanTier>(currentPlan);

  useEffect(() => {
    if (changePlanOpen) setSelected(currentPlan);
  }, [changePlanOpen, currentPlan]);

  useEffect(() => {
    if (!changePlanOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeChangePlan();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [changePlanOpen, closeChangePlan]);

  const subscribe = useMutation({
    mutationFn: (plan: PlanTier) =>
      apiFetch<SubscribeResponse>('/api/v1/credits/test-subscribe', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      }),
    onSuccess: (res) => {
      toast.success(`Plan set to ${res.data.plan}. Monthly allowance: ${res.data.monthlyAfter}.`);
      void qc.invalidateQueries({ queryKey: ['credits'] });
      void qc.invalidateQueries({ queryKey: ['credit-transactions'] });
      closeChangePlan();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Subscribe failed.'),
  });

  if (!changePlanOpen) return null;

  const isEnterprise = selected === 'enterprise';
  const isSamePlan = selected === currentPlan;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={closeChangePlan}
        className="absolute inset-0 bg-[color:var(--ink)]/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="changeplan-title"
        className="relative w-full max-w-[640px] bg-[color:var(--paper)] border border-[color:var(--rule)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[color:var(--rule)]">
          <div>
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Change plan
            </div>
            <h2
              id="changeplan-title"
              className="mt-1 font-[family-name:var(--font-instrument-serif)] text-[26px] leading-[1.05] text-[color:var(--ink)]"
            >
              Pick a <em className="italic text-[color:var(--forest)]">subscription</em>.
            </h2>
            <p className="mt-1 font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-2)]">
              Subscriptions refill a monthly allowance. Top-ups stack on top.
            </p>
          </div>
          <button
            onClick={closeChangePlan}
            className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col gap-3">
          {PLAN_CONFIG.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              current={p.id === currentPlan}
              selected={selected === p.id}
              onSelect={() => setSelected(p.id)}
            />
          ))}
        </div>

        <div className="px-6 pb-6 flex flex-col gap-4">
          <div className="border-l-2 border-[color:var(--rust)] pl-3 py-1">
            <p className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--rust)]">
              Placeholder
            </p>
            <p className="mt-1 font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-2)] leading-[1.5]">
              Billing isn&rsquo;t wired yet. Subscribing sets your plan and refills the monthly
              allowance instantly. Stripe Checkout ships next.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <GhostButton type="button" onClick={closeChangePlan} disabled={subscribe.isPending}>
              Cancel
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                if (isEnterprise || isSamePlan) return;
                subscribe.mutate(selected);
              }}
              disabled={isEnterprise || isSamePlan || subscribe.isPending}
              title={
                isEnterprise
                  ? 'Contact us for Bureau.'
                  : isSamePlan
                    ? 'Already on this plan.'
                    : undefined
              }
            >
              {subscribe.isPending
                ? 'Subscribing…'
                : isEnterprise
                  ? 'Contact sales'
                  : isSamePlan
                    ? 'Current plan'
                    : `Switch to ${PLAN_CONFIG.find((p) => p.id === selected)?.label ?? selected}`}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
