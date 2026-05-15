'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';

/**
 * SAML SSO landing page (Task #29).
 *
 * The ACS handler on the backend redirects here with
 *   /auth/sso/complete#token=<accessToken>
 * The token is in the URL fragment — not the query string — so the
 * server never sees it in its access logs (browsers don't send the
 * fragment in the Referer header either, and our nginx/Vercel log
 * lines never capture #...). We pull it out, drop it into in-memory
 * auth state, scrub the URL with history.replaceState, then route to
 * /dashboard. The refresh cookie was already set during ACS.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function SsoCompletePage() {
  const router = useRouter();
  const { setUser } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
    if (!token) {
      setError("We didn't receive a sign-in token. Please try again.");
      setTimeout(() => router.replace('/login?error=oauth_bootstrap_failed'), 1800);
      return;
    }
    setAccessToken(token);
    // Strip the fragment so a refresh doesn't replay the token.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    (async () => {
      try {
        const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!meRes.ok) throw new Error('me_failed');
        const meJson = (await meRes.json()) as { success: boolean; data: unknown };
        setUser(meJson.data as never);
        router.replace('/dashboard');
      } catch {
        setError("We couldn't finish signing you in. Please try again.");
        setTimeout(() => router.replace('/login?error=oauth_bootstrap_failed'), 1800);
      }
    })();
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="min-h-screen w-full bg-[color:var(--paper)] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white border border-[color:var(--rule)] rounded-2xl p-8 text-center">
        <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
          Authenticating
        </span>
        <h1 className="mt-3 font-display font-normal text-[30px] tracking-[-0.01em] leading-[1.15] text-[color:var(--ink)]">
          Signing you <span className="italic text-[color:var(--ember)]">in.</span>
        </h1>
        <p className="mt-3 font-sans text-[13.5px] text-[color:var(--ink-3)] leading-[1.6]">
          {error ?? "Completing the SSO handshake. You'll be redirected in a moment."}
        </p>

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
      </div>
    </main>
  );
}
