'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { Notification } from '@leadreai/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ListResponse {
  success: true;
  data: { data: Notification[]; total: number; page: number; limit: number };
}

interface CountResponse {
  success: true;
  data: { count: number };
}

/**
 * Single source of truth for the bell. Manages:
 *   · initial list fetch
 *   · initial unread count
 *   · EventSource subscription to /notifications/stream
 *   · local list + count state, updated on incoming 'notification' events
 *   · markRead / markAllRead, both optimistic
 *
 * The hook is designed to be instantiated once (in Topbar) — mount a
 * second instance and you'll double-book the EventSource.
 */
export function useNotifications() {
  const { workspaceId } = useWorkspace();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [listRes, countRes] = await Promise.all([
        apiFetch<ListResponse>(
          `/api/v1/workspaces/${workspaceId}/notifications?limit=30`,
        ),
        apiFetch<CountResponse>(
          `/api/v1/workspaces/${workspaceId}/notifications/unread-count`,
        ),
      ]);
      setItems(listRes.data.data);
      setUnread(countRes.data.count);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Initial hydrate
  useEffect(() => {
    if (!workspaceId) return;
    void refresh();
  }, [workspaceId, refresh]);

  // SSE subscription
  useEffect(() => {
    if (!workspaceId) return;
    const token = getAccessToken();
    const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/notifications/stream${
      token ? `?token=${encodeURIComponent(token)}` : ''
    }`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as {
          type?: string;
          notification?: Notification;
          unread?: number;
        };
        if (data.type === 'bootstrap' && typeof data.unread === 'number') {
          setUnread(data.unread);
        } else if (data.type === 'notification' && data.notification) {
          const n = data.notification;
          setItems((prev) => {
            // de-dup on _id (if refresh + push arrive in flight)
            if (prev.some((p) => p._id === n._id)) return prev;
            return [n, ...prev].slice(0, 100);
          });
          if (!n.readAt) setUnread((c) => c + 1);
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [workspaceId]);

  const markRead = useCallback(
    async (notificationId: string) => {
      if (!workspaceId) return;
      setItems((prev) =>
        prev.map((n) =>
          n._id === notificationId && !n.readAt
            ? { ...n, readAt: new Date().toISOString() }
            : n,
        ),
      );
      setUnread((c) => Math.max(0, c - 1));
      try {
        await apiFetch(
          `/api/v1/workspaces/${workspaceId}/notifications/${notificationId}/read`,
          { method: 'POST' },
        );
      } catch {
        void refresh(); // re-sync on failure
      }
    },
    [workspaceId, refresh],
  );

  const markAllRead = useCallback(async () => {
    if (!workspaceId) return;
    setItems((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
    setUnread(0);
    try {
      await apiFetch(
        `/api/v1/workspaces/${workspaceId}/notifications/read-all`,
        { method: 'POST' },
      );
    } catch {
      void refresh();
    }
  }, [workspaceId, refresh]);

  return { items, unread, isLoading, connected, markRead, markAllRead, refresh };
}
