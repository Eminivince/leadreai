'use client';

import { useState, useEffect } from 'react';

interface JobProgress {
  type: string;
  status?: string;
  percentage?: number;
  stage?: string;
  message?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function useJob(workspaceId: string | null, jobId: string | null) {
  const [progress, setProgress] = useState<JobProgress | null>(null);

  useEffect(() => {
    if (!workspaceId || !jobId) return;

    const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/jobs/${jobId}/stream`;
    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as JobProgress;
        if (data.type !== 'heartbeat') {
          setProgress(data);
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [workspaceId, jobId]);

  return {
    status: progress?.status ?? null,
    percentage: progress?.percentage ?? null,
    stage: progress?.stage ?? null,
  };
}
