'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse, User } from '@leadreai/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface VerifyResponse {
  accessToken: string;
  user: User;
  isNew: boolean;
}

function MagicLinkVerifyContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAppStore();
  const [state, setState] = useState<'working' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const token = params.get('token');
    if (!token) {
      setState('error');
      setErrorMessage('Missing sign-in token. Ask for a new link.');
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/magic-link/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          throw new Error(
            body?.error?.message ?? 'This sign-in link is invalid, expired, or already used.',
          );
        }
        const json = (await res.json()) as ApiResponse<VerifyResponse>;
        setAccessToken(json.data.accessToken);
        setUser(json.data.user);
        router.replace('/dashboard');
      } catch (err) {
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    })();
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen w-full bg-[color:var(--paper)] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-[color:var(--rule)] rounded-2xl p-8 text-center">
        <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
          {state === 'working' ? 'Signing you in' : 'Something went wrong'}
        </span>
        <h1 className="mt-3 font-display font-normal text-[30px] tracking-[-0.01em] leading-[1.15] text-[color:var(--ink)]">
          {state === 'working' ? (
            <>
              Verifying your <span className="italic text-[color:var(--ember)]">magic link.</span>
            </>
          ) : (
            <>
              That link didn&rsquo;t <span className="italic text-[color:var(--warn)]">work.</span>
            </>
          )}
        </h1>
        <p className="mt-3 font-sans text-[13.5px] text-[color:var(--ink-3)] leading-[1.6]">
          {state === 'working'
            ? 'One moment — trading your one-time token for a session.'
            : errorMessage || 'The link is invalid, expired, or already used.'}
        </p>

        {state === 'working' ? (
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-80 animate-pulse" />
            <span
              className="w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-60 animate-pulse"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-40 animate-pulse"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        ) : (
          <div className="mt-7 flex items-center justify-center">
            <Link
              href="/login"
              className="bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity"
            >
              Request a new link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

export default function MagicLinkVerifyPage() {
  return (
    <Suspense>
      <MagicLinkVerifyContent />
    </Suspense>
  );
}
