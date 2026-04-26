'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { apiFetch } from '../lib/api';
import type { ApiResponse, Workspace } from '@leadreai/shared';

export function useWorkspace() {
  const { workspace, setWorkspace } = useAppStore();
  const [isLoading, setIsLoading] = useState(!workspace);

  useEffect(() => {
    if (workspace) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    apiFetch<ApiResponse<Workspace[]>>('/api/v1/workspaces')
      .then(({ data }) => {
        if (data.length > 0) setWorkspace(data[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [workspace, setWorkspace]);

  return { workspaceId: workspace?._id ?? null, isLoading };
}
