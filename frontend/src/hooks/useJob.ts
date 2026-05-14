'use client';

import { useState, useEffect, useRef } from 'react';
import { getAccessToken } from '@/lib/auth';
import type { JobActivityLogEntry } from '@leadreai/shared';

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
  const [activityLog, setActivityLog] = useState<JobActivityLogEntry[]>([]);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!workspaceId || !jobId) return;

    setActivityLog([]);

    const token = getAccessToken();
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/jobs/${jobId}/stream${params}`;
    const es = new EventSource(url, { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as JobProgress & {
          type?: string;
          entries?: JobActivityLogEntry[];
          at?: string;
          step?: string;
          message?: string;
          meta?: Record<string, unknown>;
        };
        if (data.type === 'heartbeat') return;

        if (data.type === 'activity_bootstrap' && Array.isArray(data.entries)) {
          setActivityLog(data.entries);
          return;
        }

        if (data.type === 'activity' && data.at && data.step && data.message) {
          setActivityLog((prev) =>
            [...prev, { at: data.at!, step: data.step!, message: data.message!, meta: data.meta }].slice(-250),
          );
          return;
        }

        // Normalise terminal events so liveStatus updates correctly
        if (data.type === 'complete') {
          setProgress({ ...data, status: 'complete' });
          es.close();
          onFinishedRef.current?.();
          return;
        }
        if (data.type === 'error') {
          setProgress({ ...data, status: 'failed' });
          es.close();
          onFinishedRef.current?.();
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
  }, [workspaceId, jobId]);

  return {
    status: progress?.status ?? null,
    percentage: progress?.percentage ?? null,
    stage: progress?.stage ?? null,
    activityLog,
  };
}
