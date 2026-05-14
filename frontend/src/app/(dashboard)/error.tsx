'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Dashboard-scoped error boundary. Sits inside the dashboard layout so
 * the sidebar + topbar stay visible — the user can still navigate to
 * other dashboard pages after a panel-level failure rather than being
 * dumped to an out-of-shell error screen.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'dashboard' } });
    console.error('[dashboard-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 py-12">
      <div className="max-w-lg rounded-lg border border-[color:var(--rule)] bg-[color:var(--paper-2)] p-6 text-center">
        <h2 className="text-base font-semibold text-[color:var(--ink)]">This page hit an error</h2>
        <p className="mt-2 text-sm text-[color:var(--ink-2)]">
          You can try again, or pick a different section from the sidebar.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-[color:var(--ink-3)]">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
