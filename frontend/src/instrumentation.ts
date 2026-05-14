/**
 * Next.js auto-runs this file at server start when present. We use it to
 * register Sentry SDKs scoped to the right runtime (nodejs vs edge).
 *
 * No-op when SENTRY_DSN is unset — the body is import-only and the
 * sentry.*.config files gate on env themselves.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
}
