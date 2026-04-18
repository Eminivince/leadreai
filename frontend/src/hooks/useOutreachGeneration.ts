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

      // Backend sends generic `data: {...}\n\n` messages (not named events) — use onmessage
      es.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data as string) as Record<string, unknown>;
          if (data.type === 'draft_created') {
            setDone(Number(data.done) || 0);
            setTotal(Number(data.total) || 0);
          } else if (data.type === 'generation_complete') {
            setIsGenerating(false);
            setIsComplete(true);
            es.close();
            esRef.current = null;
            onComplete?.();
          } else if (data.type === 'bootstrap') {
            setDone(Number(data.done) || 0);
            setTotal(Number(data.total) || 0);
          }
        } catch {
          // ignore parse errors
        }
      };

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
