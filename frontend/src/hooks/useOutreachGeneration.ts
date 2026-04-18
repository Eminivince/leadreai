'use client';

import { useState, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface GenerateResponse {
  success: true;
  data: { bullmqJobId: string };
}

interface UseOutreachGenerationOptions {
  workspaceId: string;
  campaignId: string;
  onComplete?: () => void;
}

export function useOutreachGeneration({
  workspaceId,
  campaignId,
  onComplete,
}: UseOutreachGenerationOptions) {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  const startGeneration = useCallback(async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setIsComplete(false);
    setDone(0);
    setTotal(0);
    setError(null);

    try {
      // POST to kick off generation
      await apiFetch<GenerateResponse>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/generate`,
        { method: 'POST' }
      );

      // Connect to SSE stream
      const token = getAccessToken();
      const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/generate/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('draft_created', (ev: MessageEvent) => {
        try {
          const payload = JSON.parse(ev.data as string) as { done: number; total: number };
          setDone(payload.done);
          setTotal(payload.total);
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('generation_complete', () => {
        setIsGenerating(false);
        setIsComplete(true);
        es.close();
        esRef.current = null;
        onComplete?.();
      });

      es.onerror = () => {
        setIsGenerating(false);
        setError('Generation stream disconnected.');
        es.close();
        esRef.current = null;
      };
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : 'Failed to start generation.');
    }
  }, [workspaceId, campaignId, isGenerating, onComplete]);

  return { done, total, percentage, isComplete, isGenerating, error, startGeneration };
}
