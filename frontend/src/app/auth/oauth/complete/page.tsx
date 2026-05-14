'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function safePath(input: string | null): string {
  if (!input) return '/dashboard';
  if (!input.startsWith('/') || input.startsWith('//')) return '/dashboard';
  return input;
}

function OAuthCompleteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const returnTo = safePath(params.get('returnTo'));

    (async () => {
      try {
        const refreshRes = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!refreshRes.ok) throw new Error('refresh_failed');
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
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#6b7280]">
          Authenticating
        </span>
        <h1 className="mt-3 font-extrabold text-[32px] tracking-[-0.03em] leading-tight text-[#111827]">
          Signing you <span className="text-[#f59e0b]">in.</span>
        </h1>
        <p className="mt-3 text-[14px] text-[#6b7280] leading-relaxed">
          {error ?? 'Finishing the handshake with Google. You\'ll be redirected in a moment.'}
        </p>

        <div className="mt-6 flex justify-center gap-1.5" aria-hidden="true">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] opacity-80 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] opacity-60 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] opacity-40 animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </main>
  );
}

export default function OAuthCompletePage() {
  return (
    <Suspense>
      <OAuthCompleteContent />
    </Suspense>
  );
}
