'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useCredits } from '@/hooks/useCredits';
import {
  SectionHead,
  ForthcomingPanel,
  PrimaryButton,
  GhostButton,
} from '@/components/settings/primitives';
import { planConfig, type CreditTransaction } from '@leadreai/shared';

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
    case 'dispatch':              return 'Dispatch';
    case 'dispatch.refund':       return 'Refund — failed dispatch';
    case 'topup.test':            return 'Top-up (test)';
    case 'topup.stripe':          return 'Top-up';
    case 'subscription.renewal':  return 'Monthly renewal';
    case 'subscription.change':   return 'Plan change';
    case 'adjustment':            return 'Adjustment';
    case 'signup':                return 'Sign-up grant';
    default:                      return reason;
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
    <div className="relative flex-1 min-w-[260px]">
      <div className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/25" aria-hidden />
      <div className="relative bg-[color:var(--paper-3)] border border-[color:var(--rule)] p-5 md:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--forest)]">
            {kicker}
          </span>
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
            {label}
          </span>
        </div>
        <div className=" text-[48px] leading-none tabular-nums text-[color:var(--ink)]">
          {value.toLocaleString()}
        </div>
        {sub && (
          <div className="mt-3  text-[12.5px] leading-[1.5] text-[color:var(--ink-2)]">
            {sub}
          </div>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
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
      {/* Plan */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="01" title="Subscription" />
        <div className="md:pl-[54px]">
          {creditsLoading ? (
            <div className="py-6  italic text-[14px] text-[color:var(--ink-2)]">
              Loading plan…
            </div>
          ) : (
            <div className="relative">
              <div
                className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/25"
                aria-hidden
              />
              <div className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] p-6 md:p-7">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--forest)]">
                    Current plan
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                    {credits?.subscriptionRenewsAt
                      ? `Renews ${fmtDate(credits.subscriptionRenewsAt)}`
                      : 'No renewal scheduled'}
                  </span>
                </div>
                <h3 className=" text-[44px] md:text-[56px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
                  {cfg.label}
                </h3>
                <p className="mt-2  italic text-[15px] text-[color:var(--ink-2)]">
                  {cfg.tagline}
                </p>

                {/* Monthly allowance rail */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-2 text-[11px] font-mono tracking-[0.16em] uppercase">
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
                          ? 'h-full bg-[color:var(--rust)]'
                          : 'h-full bg-[color:var(--forest)]'
                      }
                      style={{ width: `${monthlyPct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-6 pt-5 border-t border-dashed border-[color:var(--rule)] flex items-center justify-between gap-4 flex-wrap">
                  <Link
                    href="/pricing"
                    className=" italic text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
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
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead
          n="02"
          title={
            <>
              Credits{' '}
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] not-italic ml-3 tabular-nums">
                {totalBalance.toLocaleString()} total
              </span>
            </>
          }
        />
        <div className="md:pl-[54px]">
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
          <p className="mt-5  italic text-[12.5px] text-[color:var(--ink-2)] max-w-[620px]">
            A search draws from the monthly allowance first; top-ups cover overage. Payments
            aren&rsquo;t wired yet — the Top up and Change plan buttons credit your account
            instantly for testing the ledger.
          </p>
        </div>
      </section>

      {/* Ledger */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead
          n="03"
          title={
            <>
              Ledger{' '}
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] not-italic ml-3">
                last {txns.length} {txns.length === 1 ? 'entry' : 'entries'}
              </span>
            </>
          }
        />
        <div className="md:pl-[54px]">
          {txnsLoading ? (
            <div className="py-6  italic text-[14px] text-[color:var(--ink-2)]">
              Loading ledger…
            </div>
          ) : txns.length === 0 ? (
            <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 py-10 text-center">
              <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Blank page
              </span>
              <h4 className="mt-2  text-[22px] text-[color:var(--ink)]">
                No transactions yet.
              </h4>
              <p className="mt-1  italic text-[13px] text-[color:var(--ink-2)]">
                Run a search, top up, or subscribe — all leave a row here.
              </p>
            </div>
          ) : (
            <div className="border-t border-[color:var(--rule)]">
              {txns.map((t, i) => {
                const isCredit = t.kind === 'credit';
                const bucketTone =
                  t.bucket === 'monthly'
                    ? 'text-[color:var(--forest)] border-[color:var(--forest)]/40'
                    : 'text-[color:var(--ink-2)] border-[color:var(--rule)]';
                return (
                  <div
                    key={t._id}
                    className="grid grid-cols-[40px_1fr_auto_auto_auto] gap-4 items-baseline py-3 border-b border-[color:var(--rule)]/70"
                  >
                    <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0">
                      <div className=" text-[13.5px] text-[color:var(--ink)] truncate">
                        {txnLabel(t.reason)}
                      </div>
                      {t.description && (
                        <div className=" italic text-[12px] text-[color:var(--ink-2)] truncate">
                          {t.description}
                        </div>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[9.5px] tracking-[0.16em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${bucketTone}`}
                    >
                      {t.bucket}
                    </span>
                    <span
                      className={`font-mono text-[13px] tabular-nums whitespace-nowrap ${
                        isCredit ? 'text-[color:var(--forest)]' : 'text-[color:var(--ink)]'
                      }`}
                    >
                      {isCredit ? '+' : ''}
                      {t.delta.toLocaleString()}
                    </span>
                    <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] tabular-nums whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · bal {t.balanceAfter.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Usage */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="04" title="Usage" />
        <div className="md:pl-[54px]">
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
