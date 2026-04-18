'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '../store/useAppStore.js';
import { apiFetch } from '../lib/api.js';
import type { ApiResponse, User } from '@leadreai/shared';

export function useAuth(redirectIfUnauth = false) {
  const { user, setUser } = useAppStore();
  const router = useRouter();

  useEffect(() => {
    if (user) return;
    apiFetch<ApiResponse<User>>('/api/v1/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => {
        if (redirectIfUnauth) router.push('/login');
      });
  }, [user, setUser, router, redirectIfUnauth]);

  return { user };
}
