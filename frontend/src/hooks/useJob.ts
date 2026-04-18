'use client';

import { useState, useEffect } from 'react';
import { getAccessToken } from '@/lib/auth';

interface JobProgress {
  type: string;
  status?: string;
  percentage?: number;
  stage?: string;
  message?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function useJob(
  workspaceId: string | null,
  jobId: string | null,
  onFinished?: () => void,
) {
  const [progress, setProgress] = useState<JobProgress | null>(null);

  useEffect(() => {
    if (!workspaceId || !jobId) return;

    const token = getAccessToken();
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/jobs/${jobId}/stream${params}`;
    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as JobProgress;
        if (data.type === 'heartbeat') return;

        // Normalise terminal events so liveStatus updates correctly
        if (data.type === 'complete') {
          setProgress({ ...data, status: 'complete' });
          es.close();
          onFinished?.();
          return;
        }
        if (data.type === 'error') {
          setProgress({ ...data, status: 'failed' });
          es.close();
          onFinished?.();
          return;
        }

        setProgress(data);
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
  }, [workspaceId, jobId, onFinished]);

  return {
    status: progress?.status ?? null,
    percentage: progress?.percentage ?? null,
    stage: progress?.stage ?? null,
  };
}
