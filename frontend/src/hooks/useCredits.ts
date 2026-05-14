import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { PlanTier } from '@leadreai/shared';

export interface CreditsData {
  plan: PlanTier;
  planExpiresAt?: string;
  subscriptionRenewsAt?: string;
  monthlyCreditsBalance: number;
  creditsBalance: number;
  totalCreditsBalance: number;
}

export function useCredits() {
  return useQuery<CreditsData>({
    queryKey: ['credits'],
    queryFn: async () => {
      const res = await apiFetch<{ success: true; data: CreditsData }>(
        '/api/v1/auth/me/credits',
      );
      return res.data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
