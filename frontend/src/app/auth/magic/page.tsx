'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse, User } from '@leadreai/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ─────────────────────────────────────────────────────────────────
 * Magic-link verify page.
 *
 * Lands here via the emailed link (?token=...). We POST the token
 * to /auth/magic-link/verify, which consumes it atomically and
 * either signs the user in or creates them + a starter workspace.
 * The response mirrors /auth/login: { accessToken, user } + a
 * refresh_token cookie, so the rest of the app is oblivious to
 * which auth path was used.
 * ───────────────────────────────────────────────────────────────── */

interface VerifyResponse {
  accessToken: string;
  user: User;
  isNew: boolean;
}

export default function MagicLinkVerifyPage() {
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
    <main className="min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] flex items-center justify-center px-6">
      <div className="max-w-[440px] text-center">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          {state === 'working' ? 'Signing you in' : 'We hit a snag'}
        </span>
        <h1 className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[36px] leading-tight text-[color:var(--ink)]">
          {state === 'working' ? (
            <>
              Checking your <em className="italic text-[color:var(--forest)]">press pass</em>.
            </>
          ) : (
            <>
              That link didn&rsquo;t <em className="italic text-[color:var(--rust)]">work</em>.
            </>
          )}
        </h1>
        <p className="mt-3 font-[family-name:var(--font-barlow)] italic text-[13.5px] text-[color:var(--ink-2)] leading-[1.55]">
          {state === 'working'
            ? 'One moment — trading your one-time token for a session.'
            : errorMessage || 'The link is invalid, expired, or already used.'}
        </p>

        {state === 'working' ? (
          <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] opacity-80 animate-pulse" />
            <span
              className="w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] opacity-60 animate-pulse"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] opacity-40 animate-pulse"
              style={{ animationDelay: '300ms' }}
            />
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
            >
              Request a new link
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
