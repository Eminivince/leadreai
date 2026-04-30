'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { CREDIT_PACKAGES, type CreditPackage } from '@leadreai/shared';
import { PrimaryButton, GhostButton } from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * Top-up modal — editorial packet selection.
 *
 * Packages come from the shared catalogue (CREDIT_PACKAGES). Today
 * this POSTs to /credits/test-topup which just increments the balance
 * and writes a ledger row — the modal is explicit about being a test
 * placeholder until Stripe is wired. The catalogue, the card layout,
 * and the button contract are what Stripe will replace; the surface
 * stays identical.
 * ───────────────────────────────────────────────────────────────── */

interface TopUpResponse {
  success: true;
  data: { balanceAfter: number; transactionId: string; credited: number };
}

function CloseIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PackageCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: CreditPackage;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full flex items-center justify-between gap-4 p-4 text-left border transition-colors ${
        selected
          ? 'border-[color:var(--ink)] bg-[color:var(--paper-3)]'
          : 'border-[color:var(--rule)] hover:border-[color:var(--ink-2)] bg-[color:var(--paper)]'
      }`}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[color:var(--forest)]" />
      )}
      <div className="min-w-0">
        <div className=" text-[22px] leading-tight text-[color:var(--ink)]">
          {pkg.label}
        </div>
        {pkg.tagline && (
          <div className="mt-0.5  italic text-[12.5px] text-[color:var(--ink-2)]">
            {pkg.tagline}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className=" text-[20px] leading-none text-[color:var(--ink)] tabular-nums">
          ${pkg.priceUsd}
        </div>
        <div className="mt-1 font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] tabular-nums">
          ${(pkg.priceUsd / pkg.credits).toFixed(2)} / cr
        </div>
      </div>
    </button>
  );
}

export function TopUpModal() {
  const { topUpOpen, closeTopUp } = useAppStore();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>(CREDIT_PACKAGES[1]?.id ?? CREDIT_PACKAGES[0]?.id ?? '');

  useEffect(() => {
    if (!topUpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTopUp();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [topUpOpen, closeTopUp]);

  const topUp = useMutation({
    mutationFn: (packageId: string) =>
      apiFetch<TopUpResponse>('/api/v1/credits/test-topup', {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      }),
    onSuccess: (res) => {
      const pkg = CREDIT_PACKAGES.find((p) => p.id === selectedId);
      toast.success(
        `Balance ${res.data.balanceAfter.toLocaleString()}. +${res.data.credited} credits ${
          pkg ? `(${pkg.label})` : ''
        }.`,
      );
      void qc.invalidateQueries({ queryKey: ['credits'] });
      void qc.invalidateQueries({ queryKey: ['credit-transactions'] });
      closeTopUp();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Top-up failed.'),
  });

  if (!topUpOpen) return null;

  const selectedPkg = CREDIT_PACKAGES.find((p) => p.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={closeTopUp}
        className="absolute inset-0 bg-[color:var(--ink)]/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="relative w-full max-w-[560px] bg-[color:var(--paper)] border border-[color:var(--rule)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[color:var(--rule)]">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Top up
            </div>
            <h2
              id="topup-title"
              className="mt-1  text-[26px] leading-[1.05] text-[color:var(--ink)]"
            >
              Buy <em className="italic text-[color:var(--forest)]">dispatches</em>.
            </h2>
            <p className="mt-1  italic text-[12.5px] text-[color:var(--ink-2)]">
              One credit covers one dispatch, regardless of lead count.
            </p>
          </div>
          <button
            onClick={closeTopUp}
            className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col gap-2">
          {CREDIT_PACKAGES.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={selectedId === pkg.id}
              onSelect={() => setSelectedId(pkg.id)}
            />
          ))}
        </div>

        {/* Footer — placeholder notice + CTAs */}
        <div className="px-6 pb-6 flex flex-col gap-4">
          <div className="border-l-2 border-[color:var(--rust)] pl-3 py-1">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--rust)]">
              Placeholder
            </p>
            <p className="mt-1  italic text-[12.5px] text-[color:var(--ink-2)] leading-[1.5]">
              Payments aren&rsquo;t wired yet. Clicking below credits your account instantly without
              charging a card — use it to test the ledger. Stripe Checkout ships next.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <GhostButton type="button" onClick={closeTopUp} disabled={topUp.isPending}>
              Cancel
            </GhostButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                if (!selectedId) return;
                topUp.mutate(selectedId);
              }}
              disabled={!selectedId || topUp.isPending}
            >
              {topUp.isPending
                ? 'Crediting…'
                : selectedPkg
                  ? `Add ${selectedPkg.credits} credits`
                  : 'Top up'}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
