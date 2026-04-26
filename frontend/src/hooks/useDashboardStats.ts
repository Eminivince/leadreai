'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface UsageStats {
  totalJobsRun: number;
  totalLeadsFound: number;
  totalExports: number;
  creditsUsed: number;
}

interface WorkspaceResponse {
  success: true;
  data: {
    _id: string;
    name: string;
    usageStats: UsageStats;
  };
}

export function useDashboardStats(workspaceId: string | null) {
  return useQuery({
    queryKey: ['workspace-stats', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<WorkspaceResponse>(
        `/api/v1/workspaces/${workspaceId}`,
      );
      return res.data.usageStats;
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}
