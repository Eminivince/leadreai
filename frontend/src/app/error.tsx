'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Top-level route-error boundary. Catches anything thrown in a
 * route segment that the segment's own error.tsx doesn't handle.
 * Inherits the root layout (sidebar, chrome) — only the route body
 * is replaced. Use a minimal in-page fallback so the user can keep
 * navigating to other parts of the app instead of being stuck on a
 * white screen.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'route' } });
    console.error('[route-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-[color:var(--rule)] bg-[color:var(--paper-2)] p-6 text-center">
        <h2 className="text-lg font-semibold text-[color:var(--ink)]">Something went wrong</h2>
        <p className="mt-2 text-sm text-[color:var(--ink-2)]">
          We hit an unexpected error loading this page.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-[color:var(--ink-3)]">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-5 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-4 py-2 text-sm text-[color:var(--ink)] hover:bg-[color:var(--paper-3)]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/dashboard')}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
