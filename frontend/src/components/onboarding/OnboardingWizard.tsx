'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { ApiResponse } from '@leadreai/shared';

/**
 * 4-step first-run onboarding wizard. Renders only when the account
 * is new (< 30 days) and the user hasn't yet completed or dismissed
 * the flow. Each step explains what to do, links to the relevant
 * surface, and offers a "Mark as done" button that hits
 * /auth/me/onboarding/complete-step. The backend stamps completedAt
 * once all four steps are done; we re-read state after each mutation
 * so the wizard self-closes on the final step.
 *
 * Deliberately non-blocking — the user can dismiss at any time. We
 * don't gate any feature on it.
 */

type StepKey = 'market' | 'sender' | 'knowledge' | 'first-search';

interface OnboardingState {
 steps: readonly StepKey[];
 completedSteps: StepKey[];
 dismissedAt?: string;
 completedAt?: string;
 isNewAccount: boolean;
}

interface StepDef {
 key: StepKey;
 n: number;
 title: string;
 body: string;
 ctaLabel: string;
 ctaHref: string;
}

const STEPS: readonly StepDef[] = [
 {
  key: 'market',
  n: 1,
  title: 'Tell us where you sell',
  body:
   "Set your primary market on the workspace settings. We tune source coverage for thin markets like Nigeria and lean global elsewhere.",
  ctaLabel: 'Open workspace settings',
  ctaHref: '/dashboard/settings/workspace',
 },
 {
  key: 'sender',
  n: 2,
  title: 'Connect a sender mailbox',
  body:
   "Hook up the inbox you'll send from — Gmail or SMTP. We need this before any campaign can reach a real lead.",
  ctaLabel: 'Set up sender',
  ctaHref: '/dashboard/settings/email',
 },
 {
  key: 'knowledge',
  n: 3,
  title: 'Upload a knowledge doc',
  body:
   "Drop in a one-pager about your product. Outreach will quote from it instead of generic boilerplate, which lifts reply rates noticeably.",
  ctaLabel: 'Add knowledge',
  ctaHref: '/dashboard/settings/knowledge-base',
 },
 {
  key: 'first-search',
  n: 4,
  title: 'Run your first search',
  body:
   "Describe who you want to reach on the Dashboard. Results land on Leads with provenance — every email is traceable.",
  ctaLabel: 'Go to Search',
  ctaHref: '/dashboard',
 },
];

const STORAGE_DISMISSED_KEY = 'onboarding-wizard-dismissed-session';

export function OnboardingWizard(): React.JSX.Element | null {
 const qc = useQueryClient();
 const [sessionDismissed, setSessionDismissed] = useState(false);

 useEffect(() => {
  if (typeof window === 'undefined') return;
  setSessionDismissed(sessionStorage.getItem(STORAGE_DISMISSED_KEY) === '1');
 }, []);

 const { data, isLoading } = useQuery<ApiResponse<OnboardingState>>({
  queryKey: ['onboarding-state'],
  queryFn: () => apiFetch<ApiResponse<OnboardingState>>('/api/v1/auth/me/onboarding'),
  staleTime: 60_000,
  retry: false,
 });

 const completeMutation = useMutation({
  mutationFn: (step: StepKey) =>
   apiFetch<ApiResponse<unknown>>('/api/v1/auth/me/onboarding/complete-step', {
    method: 'POST',
    body: JSON.stringify({ step }),
   }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-state'] }),
 });

 const dismissMutation = useMutation({
  mutationFn: () =>
   apiFetch<ApiResponse<unknown>>('/api/v1/auth/me/onboarding/dismiss', {
    method: 'POST',
   }),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-state'] }),
 });

 const state = data?.data;
 const completed = useMemo(
  () => new Set<StepKey>(state?.completedSteps ?? []),
  [state?.completedSteps],
 );
 const activeStep = useMemo(
  () => STEPS.find((s) => !completed.has(s.key)) ?? STEPS[STEPS.length - 1]!,
  [completed],
 );
 const [openStepKey, setOpenStepKey] = useState<StepKey | null>(null);
 const visibleStep =
  STEPS.find((s) => s.key === openStepKey) ?? activeStep;

 if (isLoading || !state) return null;
 if (sessionDismissed) return null;
 if (!state.isNewAccount) return null;
 if (state.dismissedAt) return null;
 if (state.completedAt) return null;
 if (state.completedSteps.length >= STEPS.length) return null;

 function handleSnooze(): void {
  if (typeof window !== 'undefined') {
   sessionStorage.setItem(STORAGE_DISMISSED_KEY, '1');
  }
  setSessionDismissed(true);
 }

 function handleSkipForever(): void {
  if (typeof window !== 'undefined') {
   sessionStorage.setItem(STORAGE_DISMISSED_KEY, '1');
  }
  setSessionDismissed(true);
  dismissMutation.mutate();
 }

 const allDone = state.completedSteps.length === STEPS.length;

 return (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4">
   <button
    aria-label="Close for this session"
    onClick={handleSnooze}
    className="absolute inset-0 bg-[color:var(--ink)]/30 backdrop-blur-[2px]"
   />
   <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboarding-title"
    className="relative w-full max-w-[540px] bg-[color:var(--paper)] border border-[color:var(--rule)] shadow-2xl"
   >
    {/* Header */}
    <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[color:var(--rule)]">
     <div>
      <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
       Get started · Step {visibleStep.n} of {STEPS.length}
      </div>
      <h2
       id="onboarding-title"
       className="mt-1 text-[22px] leading-[1.15] text-[color:var(--ink)]"
      >
       {visibleStep.title}
      </h2>
     </div>
     <button
      onClick={handleSnooze}
      className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0 text-[18px] leading-none"
      aria-label="Close for now"
      title="Close — we'll show this again next session"
     >
      ×
     </button>
    </div>

    {/* Body */}
    <div className="px-6 py-6">
     <p className="text-[13.5px] leading-[1.6] text-[color:var(--ink-2)]">
      {visibleStep.body}
     </p>

     <div className="mt-5 flex flex-wrap items-center gap-3">
      <Link
       href={visibleStep.ctaHref}
       onClick={handleSnooze}
       className="inline-flex items-center gap-2 bg-[color:var(--forest)] text-white px-4 py-2 text-[13px] font-medium hover:opacity-90 transition"
      >
       {visibleStep.ctaLabel}
       <span aria-hidden>→</span>
      </Link>
      <button
       type="button"
       disabled={completeMutation.isPending || completed.has(visibleStep.key)}
       onClick={() => completeMutation.mutate(visibleStep.key)}
       className="text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)] disabled:opacity-60 disabled:no-underline"
      >
       {completed.has(visibleStep.key)
        ? 'Done'
        : completeMutation.isPending
         ? 'Saving…'
         : 'Mark as done'}
      </button>
     </div>
    </div>

    {/* Stepper / footer */}
    <div className="px-6 py-4 border-t border-[color:var(--rule)] flex items-center justify-between gap-3">
     <div className="flex items-center gap-2">
      {STEPS.map((s) => {
       const isComplete = completed.has(s.key);
       const isActive = s.key === visibleStep.key;
       return (
        <button
         key={s.key}
         type="button"
         onClick={() => setOpenStepKey(s.key)}
         title={s.title}
         aria-label={`Go to step ${s.n}: ${s.title}`}
         className={`h-2 rounded-full transition-all ${
          isActive
           ? 'w-8 bg-[color:var(--forest)]'
           : isComplete
            ? 'w-2 bg-[color:var(--forest)]/60'
            : 'w-2 bg-[color:var(--rule)] hover:bg-[color:var(--ink-3)]'
         }`}
        />
       );
      })}
     </div>
     <button
      type="button"
      onClick={handleSkipForever}
      disabled={dismissMutation.isPending}
      className="text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)] disabled:opacity-60"
     >
      {dismissMutation.isPending ? 'Skipping…' : "Don't show again"}
     </button>
    </div>

    {allDone && (
     <div className="px-6 pb-5 -mt-2 text-[12px] text-[color:var(--ink-3)] italic">
      All set — you can close this.
     </div>
    )}
   </div>
  </div>
 );
}
