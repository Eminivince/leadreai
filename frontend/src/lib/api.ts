import { getAccessToken, setAccessToken, clearTokens } from './auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

  // Attempt token refresh on 401
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers,
      });
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
