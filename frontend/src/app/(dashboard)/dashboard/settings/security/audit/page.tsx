'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  SectionHead,
  Label,
  HairlineInput,
  PrimaryButton,
} from '@/components/settings/primitives';
import type { Workspace } from '@leadreai/shared';

/**
 * Audit retention (Task #24 frontend, Task #21 backend).
 *
 * Per-row TTL replaces the previous global 90-day TTL. 0 means
 * "keep forever" — regulated buyers + enterprise plans use this.
 */
export default function AuditRetentionPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: Workspace & { auditRetentionDays?: number } }>(
        `/api/v1/workspaces/${workspaceId}`,
      ),
    enabled: Boolean(workspaceId),
  });

  const initial = data?.data?.auditRetentionDays;
  const [days, setDays] = useState('90');

  useEffect(() => {
    setDays(initial != null ? String(initial) : '90');
  }, [initial]);

  const save = useMutation({
    mutationFn: (val: number | null) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ auditRetentionDays: val }),
      }),
    onSuccess: () => {
      toast.success('Retention updated.');
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed.'),
  });

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHead n="01" title="Audit retention" />
        <p className="text-[13px] text-[color:var(--ink-2)] max-w-[600px] leading-[1.55]">
          How long audit-log rows survive for this workspace. Affects every
          credit move, workflow run, payment event, and security-relevant
          action. Default 90 days. Set to 0 to keep forever (regulatory
          hold).
        </p>
      </div>

      <div className="flex flex-col gap-5 max-w-md">
        <div>
          <Label>Retention (days)</Label>
          <HairlineInput
            type="number"
            min="0"
            max="3650"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={isLoading}
          />
          <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
            0 = forever · max 3650 (10 years). Changes propagate within 5
            minutes; existing rows expire on their original schedule.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <PrimaryButton
            onClick={() => {
              const n = Number(days);
              if (!Number.isInteger(n) || n < 0 || n > 3650) {
                toast.error('Days must be an integer 0–3650');
                return;
              }
              save.mutate(n);
            }}
            disabled={save.isPending || isLoading}
          >
            {save.isPending ? 'Saving…' : 'Save retention'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
