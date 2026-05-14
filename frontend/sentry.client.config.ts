import * as Sentry from '@sentry/nextjs';

/**
 * Frontend Sentry init — runs on the browser. Mirrors the backend setup
 * so a single DSN can feed errors from web + API + workers.
 *
 * Disabled when NEXT_PUBLIC_SENTRY_DSN is unset (local dev default).
 * The env var must be prefixed `NEXT_PUBLIC_` because Sentry initialises
 * in the browser bundle, which can't read server-only env vars.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    initialScope: { tags: { service: 'frontend-web' } },
    // Filter cancelled fetches and chunk-load errors that aren't actionable.
    ignoreErrors: [
      'AbortError',
      'ChunkLoadError',
      'ResizeObserver loop completed with undelivered notifications.',
    ],
  });
}
