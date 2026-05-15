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
 * Growth plan → shows Stripe and Paystack provider buttons.
 * Free plan → instant downgrade via test-subscribe (no payment).
 * Enterprise → contact sales link.
 * ───────────────────────────────────────────────────────────────── */

interface SubscribeResponse {
 success: true;
 data: { plan: PlanTier; monthlyAfter: number; renewsAt: string };
}

interface CheckoutResponse {
 success: true;
 data: { url: string };
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
     ? 'border-[color:var(--ember)] bg-[color:var(--paper-3)]'
     : 'border-[color:var(--rule)] hover:border-[color:var(--ink-2)] bg-[color:var(--paper)]'
   }`}
  >
   {selected && (
    <span className="absolute left-0 top-3 bottom-3 w-[2px] bg-[color:var(--ember)]" />
   )}
   <div className="flex items-start justify-between gap-4 mb-1">
    <div>
     <div className="flex items-center gap-2">
      <span className=" text-[24px] leading-tight text-[color:var(--ink)]">
       {plan.label}
      </span>
      {current && (
       <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ember)] border border-[color:var(--ember)]/40 px-1.5 py-0.5">
        Current
       </span>
      )}
     </div>
     <div className="mt-0.5 italic text-[12.5px] text-[color:var(--ink-2)]">
      {plan.tagline}
     </div>
    </div>
    <div className="text-right shrink-0">
     <div className=" text-[20px] leading-none text-[color:var(--ink)] tabular-nums">
      {priceLabel(plan)}
     </div>
    </div>
   </div>
   <div className="mt-3 pt-3 border-t border-dashed border-[color:var(--rule)]/70 flex items-baseline justify-between gap-3">
    <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
     Monthly allowance
    </span>
    <span className="font-mono text-[14px] tabular-nums text-[color:var(--ink)]">
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
 const [busy, setBusy] = useState(false);

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

 // Free downgrade uses the test-subscribe stub (no payment needed)
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

 async function handleCheckout(provider: 'stripe' | 'paystack') {
  setBusy(true);
  try {
   const res = await apiFetch<CheckoutResponse>(
    `/api/v1/credits/${provider}/subscribe`,
    { method: 'POST', body: JSON.stringify({ planId: selected }) },
   );
   window.location.href = res.data.url;
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Failed to start checkout.');
   setBusy(false);
  }
 }

 function handleFreeDowngrade() {
  subscribe.mutate('free');
 }

 if (!changePlanOpen) return null;

 const isEnterprise = selected === 'enterprise';
 const isSamePlan = selected === currentPlan;
 const isPaid = selected !== 'free' && selected !== 'enterprise';

 return (
  <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
   <button
    aria-label="Close"
    onClick={closeChangePlan}
    className="absolute inset-0 bg-[color:var(--ink)]/35 backdrop-blur-[2px]"
   />
   <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="changeplan-title"
    className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[640px] bg-[color:var(--paper)] border-0 sm:border sm:border-[color:var(--rule)] shadow-2xl flex flex-col overflow-hidden"
   >
    <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-[color:var(--rule)] shrink-0">
     <div className="min-w-0">
      <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
       Change plan
      </div>
      <h2
       id="changeplan-title"
       className="mt-1 text-[22px] sm:text-[26px] leading-[1.05] text-[color:var(--ink)]"
      >
       Pick a <em className="italic text-[color:var(--ember)]">subscription</em>.
      </h2>
      <p className="mt-1 italic text-[12.5px] text-[color:var(--ink-2)]">
       Subscriptions refill a monthly allowance. Top-ups stack on top.
      </p>
     </div>
     <button
      onClick={closeChangePlan}
      className="-mr-1.5 w-10 h-10 inline-flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0"
      aria-label="Close"
     >
      <CloseIcon />
     </button>
    </div>

    <div className="px-5 sm:px-6 py-5 sm:py-6 flex flex-col gap-3 flex-1 overflow-y-auto">
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

    <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-3 sm:pt-0 flex flex-col gap-4 shrink-0 border-t sm:border-t-0 border-[color:var(--rule)]">
     {/* Growth plan — show payment provider buttons */}
     {!isEnterprise && !isSamePlan && isPaid && (
      <div className="flex flex-col gap-3">
       <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
        Choose payment provider
       </p>
       <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
        <GhostButton
         type="button"
         onClick={() => void handleCheckout('paystack')}
         disabled={busy}
         className="w-full sm:w-auto justify-center"
        >
         Pay with Paystack
        </GhostButton>
        <PrimaryButton
         type="button"
         onClick={() => void handleCheckout('stripe')}
         disabled={busy}
         className="w-full sm:w-auto justify-center"
        >
         Pay with Stripe
        </PrimaryButton>
       </div>
      </div>
     )}

     {/* Downgrade to free — instant, no payment */}
     {!isEnterprise && !isSamePlan && selected === 'free' && (
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
       <GhostButton
        type="button"
        onClick={closeChangePlan}
        disabled={subscribe.isPending}
        className="w-full sm:w-auto justify-center"
       >
        Cancel
       </GhostButton>
       <PrimaryButton
        type="button"
        onClick={handleFreeDowngrade}
        disabled={subscribe.isPending}
        className="w-full sm:w-auto justify-center"
       >
        {subscribe.isPending ? 'Switching…' : 'Switch to free'}
       </PrimaryButton>
      </div>
     )}

     {/* Enterprise — contact sales */}
     {isEnterprise && (
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3">
       <GhostButton type="button" onClick={closeChangePlan} className="w-full sm:w-auto justify-center">
        Cancel
       </GhostButton>
       <PrimaryButton
        type="button"
        onClick={() => {
         window.location.href = 'mailto:sales@leadreai.app?subject=Enterprise+plan';
        }}
        className="w-full sm:w-auto justify-center"
       >
        Contact sales
       </PrimaryButton>
      </div>
     )}

     {/* Same plan — no action needed */}
     {isSamePlan && (
      <div className="flex items-center justify-end gap-3">
       <GhostButton type="button" onClick={closeChangePlan} className="w-full sm:w-auto justify-center">
        Close
       </GhostButton>
      </div>
     )}
    </div>
   </div>
  </div>
 );
}
