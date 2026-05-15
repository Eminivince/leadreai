'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppStore } from '@/store/useAppStore';
import {
  SectionHead,
  Label,
  HairlineInput,
  PrimaryButton,
} from '@/components/settings/primitives';
import type { Workspace } from '@leadreai/shared';

/**
 * Agency client workspaces (Task #25 frontend, Task #11 backend).
 *
 * Parent-workspace owners + admins manage their client sub-workspaces
 * here. The backend's authorize() middleware grants parent-owner /
 * admin owner-level access in each client, so navigating into one
 * "just works" — no token swap needed.
 */
export default function ClientWorkspacesPage() {
  const { workspaceId } = useWorkspace();
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['client-workspaces', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: Workspace[] }>(
        `/api/v1/workspaces/${workspaceId}/clients`,
      ),
    enabled: Boolean(workspaceId),
  });

  const clients = data?.data ?? [];

  const [name, setName] = useState('');
  const [clientLabel, setClientLabel] = useState('');

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ success: true; data: Workspace }>(`/api/v1/workspaces/${workspaceId}/clients`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), clientLabel: clientLabel.trim() || undefined }),
      }),
    onSuccess: () => {
      toast.success('Client workspace created.');
      setName('');
      setClientLabel('');
      qc.invalidateQueries({ queryKey: ['client-workspaces', workspaceId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Create failed.'),
  });

  return (
    <div className="flex flex-col gap-12">
      <div>
        <SectionHead n="01" title="Client workspaces" />
        <p className="text-[13px] text-[color:var(--ink-2)] max-w-[600px] leading-[1.55]">
          Sub-workspaces for each agency client. Branding, suppression
          lists, leads, and campaigns stay isolated between clients —
          but you (as the parent owner / admin) keep owner-level access
          everywhere.
        </p>
      </div>

      <section className="max-w-xl">
        <h3 className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] mb-3">
          New client
        </h3>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Workspace name</Label>
            <HairlineInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Corp"
              disabled={create.isPending}
            />
          </div>
          <div>
            <Label>Client label (optional, shown on exports)</Label>
            <HairlineInput
              value={clientLabel}
              onChange={(e) => setClientLabel(e.target.value)}
              placeholder="Acme Corp — Q2 2026"
              disabled={create.isPending}
            />
          </div>
          <div className="flex items-center justify-end">
            <PrimaryButton
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending ? 'Creating…' : 'Create client'}
            </PrimaryButton>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] mb-3">
          Existing ({clients.length})
        </h3>
        {isLoading ? (
          <p className="text-[13px] italic text-[color:var(--ink-3)]">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="text-[13px] text-[color:var(--ink-3)]">
            No client workspaces yet. Create one above to start.
          </p>
        ) : (
          <ul className="border-t border-[color:var(--rule)]">
            {clients.map((c) => (
              <li
                key={c._id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 border-b border-[color:var(--rule)] py-3"
              >
                <div>
                  <div className="text-[14px] font-medium text-[color:var(--ink)]">{c.name}</div>
                  {c.clientLabel ? (
                    <div className="text-[12px] text-[color:var(--ink-3)]">{c.clientLabel}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWorkspace(c);
                    router.push('/dashboard');
                  }}
                  className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
                  aria-label={`Switch to ${c.name}`}
                >
                  Switch →
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
