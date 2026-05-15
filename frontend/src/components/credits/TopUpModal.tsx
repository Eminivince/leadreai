'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { CREDIT_PACKAGES, type CreditPackage } from '@leadreai/shared';
import { PrimaryButton, GhostButton } from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * Top-up modal — package selection + Paystack inline popup.
 *
 * Paystack flow: server initialises the transaction and returns an
 * accessCode. We pass it to PaystackPop.newTransaction so the popup
 * appears inline — the user never leaves the page. After success we
 * call /paystack/verify to grant credits server-side.
 *
 * Stripe flow: redirects in a new tab (Checkout requires a redirect;
 * this is the least disruptive option until Stripe embeds are wired).
 * ───────────────────────────────────────────────────────────────── */

interface PaystackPopInstance {
  newTransaction(options: {
    accessCode: string;
    onSuccess: (transaction: { reference: string }) => void;
    onCancel: () => void;
  }): void;
}

declare global {
  interface Window {
    // PaystackPop v2 is a class — must be instantiated with `new`
    PaystackPop?: new () => PaystackPopInstance;
  }
}

interface TopUpInitResponse {
  success: true;
  data: { url: string; accessCode: string; reference: string };
}

interface VerifyResponse {
  success: true;
  data: { credits?: number; packageId?: string; already_processed?: boolean };
}

function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.PaystackPop) { resolve(); return; }
    const existing = document.getElementById('paystack-inline-js');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'paystack-inline-js';
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack script'));
    document.head.appendChild(script);
  });
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
          ? 'border-[color:var(--ember)] bg-[color:var(--paper-3)]'
          : 'border-[color:var(--rule)] hover:border-[color:var(--ink-2)] bg-[color:var(--paper)]'
      }`}
    >
      {selected && (
        <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[color:var(--ember)]" />
      )}
      <div className="min-w-0">
        <div className=" text-[22px] leading-tight text-[color:var(--ink)]">
          {pkg.label}
        </div>
        {pkg.tagline && (
          <div className="mt-0.5 italic text-[12.5px] text-[color:var(--ink-2)]">
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
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!topUpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTopUp();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [topUpOpen, closeTopUp]);

  async function handlePaystack() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await loadPaystackScript();
      if (!window.PaystackPop) throw new Error('Paystack script not available');

      const res = await apiFetch<TopUpInitResponse>(
        '/api/v1/credits/paystack/topup',
        { method: 'POST', body: JSON.stringify({ packageId: selectedId }) },
      );
      const { accessCode } = res.data;

      const popup = new window.PaystackPop();
      popup.newTransaction({
        accessCode,
        onSuccess: async (transaction) => {
          try {
            await apiFetch<VerifyResponse>(
              '/api/v1/credits/paystack/verify',
              { method: 'POST', body: JSON.stringify({ reference: transaction.reference }) },
            );
            await qc.invalidateQueries({ queryKey: ['credits'] });
            toast.success('Credits added — you\'re all set.');
            closeTopUp();
          } catch {
            toast.error('Payment received but credit grant failed — please contact support.');
          }
          setBusy(false);
        },
        onCancel: () => {
          setBusy(false);
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start Paystack checkout.');
      setBusy(false);
    }
  }

  async function handleStripe() {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ success: true; data: { url: string } }>(
        '/api/v1/credits/stripe/topup',
        { method: 'POST', body: JSON.stringify({ packageId: selectedId }) },
      );
      window.open(res.data.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start Stripe checkout.');
    } finally {
      setBusy(false);
    }
  }

  if (!topUpOpen) return null;

  const selectedPkg = CREDIT_PACKAGES.find((p) => p.id === selectedId);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <button
        aria-label="Close"
        onClick={closeTopUp}
        className="absolute inset-0 bg-[color:var(--ink)]/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="relative w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-[560px] bg-[color:var(--paper)] border-0 sm:border sm:border-[color:var(--rule)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 sm:py-5 border-b border-[color:var(--rule)] shrink-0">
          <div className="min-w-0">
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Top up
            </div>
            <h2
              id="topup-title"
              className="mt-1 text-[22px] sm:text-[26px] leading-[1.05] text-[color:var(--ink)]"
            >
              Buy <em className="italic text-[color:var(--ember)]">dispatches</em>.
            </h2>
            <p className="mt-1 italic text-[12.5px] text-[color:var(--ink-2)]">
              One credit covers one dispatch, regardless of lead count.
            </p>
          </div>
          <button
            onClick={closeTopUp}
            className="-mr-1.5 w-10 h-10 inline-flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 sm:py-6 flex flex-col gap-2 flex-1 overflow-y-auto">
          {CREDIT_PACKAGES.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              selected={selectedId === pkg.id}
              onSelect={() => setSelectedId(pkg.id)}
            />
          ))}
        </div>

        {/* Footer — payment provider buttons */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-2 sm:pt-0 flex flex-col gap-4 shrink-0 border-t sm:border-t-0 border-[color:var(--rule)]">
          <div className="flex flex-col gap-3 pt-3 sm:pt-0">
            <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              {selectedPkg
                ? `${selectedPkg.credits} dispatches — $${selectedPkg.priceUsd} — choose provider`
                : 'Select a package above'}
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
              <GhostButton
                type="button"
                onClick={closeTopUp}
                disabled={busy}
                className="w-full sm:w-auto justify-center"
              >
                Cancel
              </GhostButton>
              <PrimaryButton
                type="button"
                onClick={() => void handlePaystack()}
                disabled={!selectedId || busy}
                className="w-full sm:w-auto justify-center"
              >
                {busy ? 'Opening…' : 'Pay with Paystack'}
              </PrimaryButton>
              <GhostButton
                type="button"
                onClick={() => void handleStripe()}
                disabled={!selectedId || busy}
                className="w-full sm:w-auto justify-center"
              >
                Stripe (new tab)
              </GhostButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
