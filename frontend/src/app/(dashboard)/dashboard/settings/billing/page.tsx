'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useCredits } from '@/hooks/useCredits';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  SectionHead,
  ForthcomingPanel,
  PrimaryButton,
  GhostButton,
  Label,
  HairlineInput,
} from '@/components/settings/primitives';
import { planConfig, type CreditTransaction, type Workspace } from '@leadreai/shared';

/**
 * Billing & usage.
 *
 *   Plan card      — current tier, monthly allowance, renews-at, change plan
 *   Balances       — monthly bucket + top-up bucket side by side
 *   Ledger         — last 30 rows with bucket chip per entry
 *   Usage          — workspace stats (forthcoming)
 */

interface TxnPage {
  data: CreditTransaction[];
  total: number;
  page: number;
  limit: number;
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function txnLabel(reason: CreditTransaction['reason']): string {
  switch (reason) {
    case 'dispatch':                return 'Dispatch';
    case 'dispatch.refund':         return 'Refund — failed dispatch';
    case 'topup.test':              return 'Top-up (test)';
    case 'topup.stripe':            return 'Top-up (Stripe)';
    case 'topup.paystack':          return 'Top-up (Paystack)';
    case 'subscription.renewal':    return 'Monthly renewal';
    case 'subscription.change':     return 'Plan change';
    case 'subscription.paystack':   return 'Subscription (Paystack)';
    case 'adjustment':              return 'Adjustment';
    case 'signup':                  return 'Sign-up grant';
    default:                        return reason;
  }
}

function BalanceCard({
  label,
  kicker,
  value,
  sub,
  action,
}: {
  label: string;
  kicker: string;
  value: number;
  sub?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[240px] rounded-xl border border-[color:var(--rule)] bg-white p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[10px] tracking-[0.04em] uppercase text-[color:var(--ember-2)]">
          {kicker}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]">
          {label}
        </span>
      </div>
      <div className="font-mono text-[32px] md:text-[36px] leading-none tabular-nums text-[color:var(--ink)]">
        {value.toLocaleString()}
      </div>
      {sub && (
        <div className="mt-2.5 text-[12.5px] leading-[1.5] text-[color:var(--ink-2)]">
          {sub}
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * Reads payment-provider return params from the URL and shows the
 * appropriate toast, then cleans the URL.
 */
function PaymentReturnHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();

  useEffect(() => {
    const stripe = params.get('stripe');
    const paystack = params.get('paystack');

    if (stripe === 'subscribed' || paystack === 'subscribed') {
      toast.success('Subscription activated. Your monthly credits will refresh shortly.');
      void qc.invalidateQueries({ queryKey: ['credits'] });
      void qc.invalidateQueries({ queryKey: ['credit-transactions'] });
      router.replace('/dashboard/settings/billing');
    } else if (stripe === 'topped_up' || paystack === 'topped_up') {
      toast.success('Top-up complete. Credits have been added to your account.');
      void qc.invalidateQueries({ queryKey: ['credits'] });
      void qc.invalidateQueries({ queryKey: ['credit-transactions'] });
      router.replace('/dashboard/settings/billing');
    } else if (stripe === 'cancelled') {
      toast.info('Checkout cancelled. No charge was made.');
      router.replace('/dashboard/settings/billing');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function BillingSettingsPage() {
  const { openTopUp, openChangePlan } = useAppStore();
  const { data: credits, isLoading: creditsLoading } = useCredits();

  const { data: txnsRes, isLoading: txnsLoading } = useQuery({
    queryKey: ['credit-transactions'],
    queryFn: () =>
      apiFetch<{ success: true; data: TxnPage }>('/api/v1/credits/transactions?limit=30'),
  });
  const txns = txnsRes?.data?.data ?? [];

  const plan = credits?.plan ?? 'free';
  const cfg = planConfig(plan);
  const monthlyBalance = credits?.monthlyCreditsBalance ?? 0;
  const topupBalance = credits?.creditsBalance ?? 0;
  const totalBalance = credits?.totalCreditsBalance ?? monthlyBalance + topupBalance;

  const monthlyUsed = Math.max(0, cfg.monthlyCredits - monthlyBalance);
  const monthlyPct =
    cfg.monthlyCredits > 0
      ? Math.min(100, Math.round((monthlyUsed / cfg.monthlyCredits) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-14">
      {/* Handle payment provider return params */}
      <Suspense fallback={null}>
        <PaymentReturnHandler />
      </Suspense>

      {/* Plan */}
      <section>
        <SectionHead n="01" title="Subscription" />
        <div className="">
          {creditsLoading ? (
            <div className="py-6  text-[14px] text-[color:var(--ink-2)]">
              Loading plan…
            </div>
          ) : (
            <div className="relative">
              <div
                className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/25"
                aria-hidden
              />
              <div className="relative bg-white border-2 border-[color:var(--ember)] rounded-xl p-6 md:p-7">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ember)]">
                    Current plan
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
                    {credits?.subscriptionRenewsAt
                      ? `Renews ${fmtDate(credits.subscriptionRenewsAt)}`
                      : 'No renewal scheduled'}
                  </span>
                </div>
                <h3 className="text-[22px] md:text-[26px] font-semibold tracking-[-0.01em] text-[color:var(--ink)]">
                  {cfg.label}
                </h3>
                <p className="mt-1 text-[13px] text-[color:var(--ink-2)] leading-[1.55]">
                  {cfg.tagline}
                </p>

                {/* Monthly allowance rail */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2 text-[11px] font-mono tracking-[0.04em]">
                    <span className="text-[color:var(--ink-3)]">
                      This month
                    </span>
                    <span className="text-[color:var(--ink-2)] tabular-nums">
                      {monthlyUsed.toLocaleString()} / {cfg.monthlyCredits.toLocaleString()} used
                    </span>
                  </div>
                  <div className="h-[3px] bg-[color:var(--rule)]/40 overflow-hidden">
                    <div
                      className={
                        monthlyPct > 80
                          ? 'h-full bg-[color:var(--warn)]'
                          : 'h-full bg-[color:var(--ember)]'
                      }
                      style={{ width: `${monthlyPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-dashed border-[color:var(--rule)] flex items-center justify-between gap-4 flex-wrap">
                  <Link
                    href="/pricing"
                    className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
                  >
                    Compare plans on the pricing page
                  </Link>
                  <GhostButton type="button" onClick={openChangePlan}>
                    Change plan
                  </GhostButton>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Balances */}
      <section>
        <SectionHead
          n="02"
          title={
            <>
              Credits{' '}
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] not-italic ml-3 tabular-nums">
                {totalBalance.toLocaleString()} total
              </span>
            </>
          }
        />
        <div className="">
          <div className="flex flex-wrap gap-5">
            <BalanceCard
              kicker="Monthly"
              label={`${cfg.label} allowance`}
              value={monthlyBalance}
              sub={
                <>
                  Resets {credits?.subscriptionRenewsAt
                    ? fmtDate(credits.subscriptionRenewsAt)
                    : 'on subscribe'}
                  . Unused monthly credits <em className="italic">do not</em> roll over.
                </>
              }
            />
            <BalanceCard
              kicker="Top-up"
              label="One-off purchases"
              value={topupBalance}
              sub={<>Persists forever. Consumed <em className="italic">after</em> the monthly bucket runs out.</>}
              action={
                <PrimaryButton type="button" onClick={openTopUp}>
                  Top up
                </PrimaryButton>
              }
            />
          </div>
          <p className="mt-5 text-[12.5px] text-[color:var(--ink-2)] max-w-[620px]">
            A search draws from the monthly allowance first; top-ups cover overage. Pay with Stripe
            or Paystack — both redirect to a hosted checkout and return here on completion.
          </p>
        </div>
      </section>

      {/* Ledger */}
      <section>
        <SectionHead
          n="03"
          title={
            <>
              Ledger{' '}
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] not-italic ml-3">
                last {txns.length} {txns.length === 1 ? 'entry' : 'entries'}
              </span>
            </>
          }
        />
        <div className="">
          {txnsLoading ? (
            <div className="py-6  text-[14px] text-[color:var(--ink-2)]">
              Loading ledger…
            </div>
          ) : txns.length === 0 ? (
            <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 py-10 text-center">
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
                Blank page
              </span>
              <h4 className="mt-2  text-[22px] text-[color:var(--ink)]">
                No transactions yet.
              </h4>
              <p className="mt-1  text-[13px] text-[color:var(--ink-2)]">
                Run a search, top up, or subscribe — all leave a row here.
              </p>
            </div>
          ) : (
            <div className="border-t border-[color:var(--rule)]">
              {txns.map((t, i) => {
                const isCredit = t.kind === 'credit';
                const bucketTone =
                  t.bucket === 'monthly'
                    ? 'text-[color:var(--ember)] border-[color:var(--ember)]/40'
                    : 'text-[color:var(--ink-2)] border-[color:var(--rule)]';
                return (
                  <div
                    key={t._id}
                    className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[40px_1fr_auto_auto_auto] gap-2 sm:gap-4 items-baseline py-3 border-b border-[color:var(--rule)]/70"
                  >
                    <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className=" text-[13.5px] text-[color:var(--ink)] truncate">
                        {txnLabel(t.reason)}
                      </div>
                      {t.description && (
                        <div className=" text-[12px] text-[color:var(--ink-2)] truncate">
                          {t.description}
                        </div>
                      )}
                    </div>
                    <span
                      className={`hidden sm:inline font-mono text-[9.5px] tracking-[0.04em] px-2 py-0.5 border bg-[color:var(--paper-3)] ${bucketTone}`}
                    >
                      {t.bucket}
                    </span>
                    <span
                      className={`font-mono text-[13px] tabular-nums whitespace-nowrap ${
                        isCredit ? 'text-[color:var(--ember)]' : 'text-[color:var(--ink)]'
                      }`}
                    >
                      {isCredit ? '+' : ''}
                      {t.delta.toLocaleString()}
                    </span>
                    <span className="hidden sm:inline font-mono text-[10px] tracking-[0.04em] text-[color:var(--ink-3)] tabular-nums whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · bal {t.balanceAfter.toLocaleString()}
                    </span>
                    <span className="sm:hidden col-start-2 -mt-2 font-mono text-[10px] tracking-[0.04em] text-[color:var(--ink-3)] tabular-nums">
                      {t.bucket} · {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · bal {t.balanceAfter.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Budget (Task #15 / #23 frontend) */}
      <section>
        <SectionHead n="04" title="Monthly budget" />
        <BudgetPanel />
      </section>

      {/* Usage */}
      <section>
        <SectionHead n="05" title="Usage" />
        <div className="">
          <ForthcomingPanel title="Workspace usage metrics.">
            Searches run, leads collected, exports shipped, and credits consumed per workspace — all
            tracked server-side but not yet wired to an API. We&rsquo;ll surface a full dashboard on
            this page and on the upcoming Analytics section.
          </ForthcomingPanel>
        </div>
      </section>
    </div>
  );
}

/**
 * Budget panel — per-workspace monthly USD cap + alert threshold.
 * Crossing the threshold mints a `budget.threshold` notification via
 * the hourly checker; this UI is the lever that controls it.
 */
function BudgetPanel() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<{ success: true; data: Workspace & { budget?: { monthlyCapUSD?: number; alertThresholdPct?: number; alertedAt?: string } } }>(`/api/v1/workspaces/${workspaceId}`),
    enabled: Boolean(workspaceId),
  });
  const ws = data?.data;
  const budget = ws?.budget;

  const [cap, setCap] = useState('');
  const [threshold, setThreshold] = useState('80');

  useEffect(() => {
    setCap(budget?.monthlyCapUSD != null ? String(budget.monthlyCapUSD) : '');
    setThreshold(budget?.alertThresholdPct != null ? String(budget.alertThresholdPct) : '80');
  }, [budget?.monthlyCapUSD, budget?.alertThresholdPct]);

  const save = useMutation({
    mutationFn: (payload: { monthlyCapUSD: number | null; alertThresholdPct?: number }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ budget: payload }),
      }),
    onSuccess: () => {
      toast.success('Budget updated.');
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed.'),
  });

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <p className="text-[13px] text-[color:var(--ink-2)] leading-[1.55]">
        When month-to-date spend crosses the threshold, you&rsquo;ll get an in-app
        notification. Set the cap to 0 (or clear it) to disable alerts.
      </p>

      <div>
        <Label>Monthly cap (USD)</Label>
        <HairlineInput
          type="number"
          step="0.01"
          min="0"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="e.g. 200"
        />
      </div>

      <div>
        <Label>Alert at % of cap</Label>
        <HairlineInput
          type="number"
          min="1"
          max="100"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <GhostButton
          onClick={() => save.mutate({ monthlyCapUSD: null })}
          disabled={save.isPending || !budget?.monthlyCapUSD}
        >
          Clear budget
        </GhostButton>
        <PrimaryButton
          onClick={() => {
            const capN = Number(cap);
            const thN = Number(threshold);
            if (Number.isNaN(capN) || capN < 0) {
              toast.error('Cap must be a non-negative number');
              return;
            }
            if (Number.isNaN(thN) || thN < 1 || thN > 100) {
              toast.error('Threshold must be 1–100');
              return;
            }
            save.mutate({ monthlyCapUSD: capN, alertThresholdPct: thN });
          }}
          disabled={save.isPending}
        >
          {save.isPending ? 'Saving…' : 'Save budget'}
        </PrimaryButton>
      </div>

      {budget?.monthlyCapUSD ? (
        <p className="text-[11px] text-[color:var(--ink-3)] font-mono">
          Current cap ${budget.monthlyCapUSD.toFixed(2)} · alert at {budget.alertThresholdPct ?? 80}%
          {budget.alertedAt ? ` · last alert ${new Date(budget.alertedAt).toLocaleDateString()}` : ''}
        </p>
      ) : null}
    </div>
  );
}
