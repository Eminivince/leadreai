'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../lib/api';
import type { ApiResponse, User } from '@leadreai/shared';

export function useAuth(redirectIfUnauth = false) {
  const { user, setUser } = useAppStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(!user);

  useEffect(() => {
    if (user) return;
    apiFetch<ApiResponse<User>>('/api/v1/auth/me')
      .then(({ data }) => {
        setUser(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
        if (redirectIfUnauth) router.push('/login');
      });
  }, [user, setUser, router, redirectIfUnauth]);

  return { user, isLoading };
}
