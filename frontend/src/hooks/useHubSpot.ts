'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface CrmStatus {
  connected: boolean;
  portalId?: string;
  syncEnabled?: boolean;
  autoSyncOnJobComplete?: boolean;
  lastSyncAt?: string;
  tokenExpiresAt?: string;
}

interface SyncLogEntry {
  syncedAt: string;
  direction: 'push' | 'pull';
  companiesSynced: number;
  contactsSynced: number;
  errors: number;
}

export function useHubSpotStatus(workspaceId: string | null) {
  return useQuery({
    queryKey: ['crm-status', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ success: true; data: CrmStatus }>(`/api/v1/workspaces/${workspaceId}/crm/hubspot/status`);
      return res.data;
    },
    enabled: !!workspaceId,
    refetchInterval: (query) => query.state.data?.connected ? false : 5000, // poll while not connected
  });
}

export function useHubSpotSyncLog(workspaceId: string | null) {
  return useQuery({
    queryKey: ['crm-sync-log', workspaceId],
    queryFn: async () => {
      const res = await apiFetch<{ success: true; data: SyncLogEntry[] }>(`/api/v1/workspaces/${workspaceId}/crm/hubspot/sync-log`);
      return res.data;
    },
    enabled: !!workspaceId,
  });
}

export function useTriggerHubSpotSync(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiFetch(`/api/v1/workspaces/${workspaceId}/crm/hubspot/sync`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-status', workspaceId] });
      qc.invalidateQueries({ queryKey: ['crm-sync-log', workspaceId] });
    },
  });
}

export function useDisconnectHubSpot(workspaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiFetch(`/api/v1/workspaces/${workspaceId}/crm/hubspot/disconnect`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-status', workspaceId] }),
  });
}

export type { CrmStatus, SyncLogEntry };
