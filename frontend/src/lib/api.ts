import { getAccessToken, setAccessToken, clearTokens } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * `ApiError` carries the upstream status so callers can branch (e.g.
 * render a session-expired toast on 401, vs a generic toast otherwise).
 * `Error` alone forces caller code to parse the message string, which is
 * brittle as backend copy evolves.
 */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const data = (await res.json()) as { data: { accessToken: string } };
  setAccessToken(data.data.accessToken);
  return data.data.accessToken;
}

/**
 * Redirect the user to the login screen after we lose the session.
 *
 * `returnTo` preserves the current path so they land back where they were
 * after re-auth instead of always being dumped on the dashboard root. The
 * SSR guard avoids `window` access on the server-side render path (the
 * api client is callable from RSC contexts).
 */
function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const current = window.location.pathname + window.location.search;
  const returnTo = encodeURIComponent(current);
  // Use replace so the broken page doesn't sit in history.
  window.location.replace(`/login?returnTo=${returnTo}`);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  // 401 — try one refresh + retry. If refresh fails, redirect to login so
  // the user isn't stuck staring at a "Session expired" toast on a page
  // they can't recover from.
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers,
      });
    } else {
      redirectToLogin();
      // Throw so callers don't continue executing on a logged-out path.
      throw new ApiError('Session expired', 401, 'SESSION_EXPIRED');
    }
  }

  // 429 — bubble the Retry-After header up so callers can surface a
  // useful toast ("rate-limited, retry in 12s") instead of a bare HTTP
  // status. We don't auto-retry here because the backoff is usually
  // workload-specific (a search call wants different UX than a bulk
  // import).
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '0');
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30;
    throw new ApiError(
      `Too many requests — try again in ${seconds}s.`,
      429,
      'RATE_LIMITED',
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = (body as { error?: { message?: string; code?: string } })?.error;
    throw new ApiError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code);
  }

  return res.json() as Promise<T>;
}
