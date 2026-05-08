'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface GmailStatus {
  connected: boolean;
  email?: string;
  fromName?: string;
  tokenExpiresAt?: string;
}

export function useGmailStatus(workspaceId: string | null) {
  return useQuery({
    queryKey: ['gmail-status', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ success: true; data: GmailStatus }>(
        `/api/v1/workspaces/${workspaceId}/email-sender/gmail/status`
      );
      return res.data;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => (query.state.data?.connected ? false : 5000),
  });
}

export function useDisconnectGmail(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/email-sender/gmail/disconnect`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail-status', workspaceId] }),
  });
}

export type { GmailStatus };
