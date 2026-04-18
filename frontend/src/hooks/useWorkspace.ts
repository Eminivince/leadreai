'use client';

import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../lib/api';
import type { ApiResponse, Workspace } from '@leadreai/shared';

export function useWorkspace() {
  const { workspace, setWorkspace } = useAppStore();

  useEffect(() => {
    if (workspace) return;
    apiFetch<ApiResponse<Workspace[]>>('/api/v1/workspaces')
      .then(({ data }) => {
        if (data.length > 0) setWorkspace(data[0] ?? null);
      })
      .catch(() => {});
  }, [workspace, setWorkspace]);

  return { workspaceId: workspace?._id ?? null };
}
