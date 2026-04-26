'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';

/* ─────────────────────────────────────────────────────────────────
 * OAuth completion page.
 *
 * The OAuth callback on the backend sets a refresh_token cookie and
 * redirects here. We:
 *   1. Call /auth/refresh to trade the cookie for an access token
 *   2. Call /auth/me to fetch the user
 *   3. setAccessToken + setUser
 *   4. router.push(returnTo)
 *
 * No direct API call from the callback to the client means no tokens
 * travel through URL fragments — the session bootstrap is pure cookie.
 * ───────────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function safePath(input: string | null): string {
  if (!input) return '/dashboard';
  if (!input.startsWith('/') || input.startsWith('//')) return '/dashboard';
  return input;
}

export default function OAuthCompletePage() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    // StrictMode fires effects twice in dev; skip the second run so we
    // don't double-redirect.
    if (didRunRef.current) return;
    didRunRef.current = true;

    const returnTo = safePath(params.get('returnTo'));

    (async () => {
      try {
        const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!refreshRes.ok) {
          throw new Error('refresh_failed');
        }
        const refreshJson = (await refreshRes.json()) as {
          success: boolean;
          data?: { accessToken: string };
        };
        const accessToken = refreshJson.data?.accessToken;
        if (!accessToken) throw new Error('refresh_missing_token');
        setAccessToken(accessToken);

        const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!meRes.ok) throw new Error('me_failed');
        const meJson = (await meRes.json()) as { success: boolean; data: unknown };
        setUser(meJson.data as never);

        router.replace(returnTo);
      } catch {
        setError('We couldn\'t finish signing you in. Please try again.');
        setTimeout(() => router.replace('/login?error=oauth_bootstrap_failed'), 1800);
      }
    })();
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] flex items-center justify-center px-6">
      <div className="max-w-[420px] text-center">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          Authenticating
        </span>
        <h1 className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[36px] leading-tight text-[color:var(--ink)]">
          Filing your <em className="italic text-[color:var(--forest)]">press pass</em>.
        </h1>
        <p className="mt-3 font-[family-name:var(--font-barlow)] italic text-[13.5px] text-[color:var(--ink-2)] leading-[1.55]">
          {error ?? 'Finishing the handshake with Google. You\u2019ll land at the desk in a moment.'}
        </p>

        {/* subtle pulsing dot — entirely decorative */}
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
      </div>
    </main>
  );
}
