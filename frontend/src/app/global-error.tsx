'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Root error boundary — catches errors that escape the root layout
 * itself. Has to render its own <html> + <body> because the root layout
 * is the thing that failed. Kept deliberately minimal: this is the
 * "everything is on fire" surface, not a place for product polish.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'global' } });
    console.error('[global-error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1.5rem', textAlign: 'center', color: '#1a1a1a' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Something went wrong</h1>
        <p style={{ marginTop: '0.75rem', color: '#555' }}>
          The app hit an unexpected error. You can try again, or reload the page.
        </p>
        {error.digest ? (
          <p style={{ marginTop: '0.5rem', color: '#888', fontSize: '0.875rem' }}>
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
