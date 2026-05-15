'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  Label,
  HairlineInput,
  HairlineSelect,
  SectionHead,
  PrimaryButton,
} from '@/components/settings/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * Suppression list — emails and domains the engine must never contact.
 * Backed by:
 *   GET    /workspaces/:id/suppression            (paginated list)
 *   POST   /workspaces/:id/suppression            (add entry)
 *   DELETE /workspaces/:id/suppression/:entryId
 */

interface SuppressionEntry {
  _id: string;
  email?: string;
  domain?: string;
  reason: 'unsubscribe' | 'bounce' | 'manual' | 'competitor';
  addedAt: string;
}

interface SuppressionPage {
  data: SuppressionEntry[];
  total: number;
  page: number;
  limit: number;
}

const REASON_LABELS: Record<SuppressionEntry['reason'], string> = {
  unsubscribe: 'Unsubscribed',
  bounce: 'Hard bounce',
  manual: 'Manually added',
  competitor: 'Competitor',
};

function TrashGlyph({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SuppressionSettingsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [kind, setKind] = useState<'email' | 'domain'>('email');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState<SuppressionEntry['reason']>('manual');

  const { data, isLoading } = useQuery({
    queryKey: ['suppression', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: SuppressionPage }>(
        `/api/v1/workspaces/${workspaceId}/suppression?limit=100`,
      ),
    enabled: !!workspaceId,
  });
  const entries = data?.data?.data ?? [];

  const addMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/suppression`, {
        method: 'POST',
        body: JSON.stringify(
          kind === 'email'
            ? { email: value.trim().toLowerCase(), reason }
            : { domain: value.trim().toLowerCase(), reason },
        ),
      }),
    onSuccess: () => {
      toast.success('Added to blocklist.');
      setValue('');
      qc.invalidateQueries({ queryKey: ['suppression', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to add.'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/suppression/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Removed.');
      qc.invalidateQueries({ queryKey: ['suppression', workspaceId] });
      setRemoveTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to remove.');
      setRemoveTarget(null);
    },
  });

  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-14">
      {/* Add */}
      <section>
        <SectionHead n="01" title="Add to the blocklist" />
        <div className="">
          <p className=" text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[620px] mb-6">
            Entries here are honored by every search — the engine will skip any lead whose email
            matches, and any lead whose domain matches. Use it for competitors, test accounts, and
            anyone who has asked to be left alone.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!value.trim()) return;
              addMutation.mutate();
            }}
            className="grid grid-cols-1 md:grid-cols-[140px_1fr_200px_auto] gap-4 items-end"
          >
            <div>
              <Label>Kind</Label>
              <HairlineSelect value={kind} onChange={(v) => setKind(v as 'email' | 'domain')}>
                <option value="email">Email</option>
                <option value="domain">Domain</option>
              </HairlineSelect>
            </div>
            <div>
              <Label>{kind === 'email' ? 'Address' : 'Domain'}</Label>
              <HairlineInput
                type={kind === 'email' ? 'email' : 'text'}
                placeholder={kind === 'email' ? 'you@example.com' : 'example.com'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Reason</Label>
              <HairlineSelect
                value={reason}
                onChange={(v) => setReason(v as SuppressionEntry['reason'])}
              >
                <option value="manual">Manual</option>
                <option value="competitor">Competitor</option>
                <option value="unsubscribe">Unsubscribe</option>
                <option value="bounce">Bounce</option>
              </HairlineSelect>
            </div>
            <PrimaryButton
              type="submit"
              disabled={addMutation.isPending || !value.trim()}
            >
              {addMutation.isPending ? 'Adding…' : 'Block'}
            </PrimaryButton>
          </form>
        </div>
      </section>

      {/* List */}
      <section>
        <SectionHead
          n="02"
          title={
            <>
              Blocklist{' '}
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] not-italic ml-3">
                {entries.length}
              </span>
            </>
          }
        />
        <div className="">
          {isLoading ? (
            <div className="py-12 text-center  text-[14px] text-[color:var(--ink-2)]">
              Loading blocklist…
            </div>
          ) : entries.length === 0 ? (
            <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-md py-12 text-center">
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
                Empty
              </span>
              <h4 className="mt-2  text-[20px] text-[color:var(--ink)]">
                No suppressed entries yet.
              </h4>
            </div>
          ) : (
            <div className="border-t border-[color:var(--rule)]">
              {entries.map((entry) => (
                <div
                  key={entry._id}
                  className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_40px] gap-x-4 gap-y-1 items-center py-3 border-b border-[color:var(--rule)]/70"
                >
                  <span className="font-mono text-[13px] text-[color:var(--ink)] truncate min-w-0">
                    {entry.email ?? entry.domain ?? '—'}
                  </span>
                  <button
                    onClick={() => setRemoveTarget({ id: entry._id, name: entry.email ?? entry.domain ?? entry._id })}
                    disabled={removeMutation.isPending}
                    className="sm:hidden order-2 p-2 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60 justify-self-end"
                    title="Remove"
                    aria-label={`Remove suppression entry ${entry.email ?? entry.domain ?? ''}`}
                  >
                    <TrashGlyph />
                  </button>
                  <span className="col-span-2 sm:col-span-1 font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-3)] px-2 py-0.5 justify-self-start">
                    {REASON_LABELS[entry.reason]}
                  </span>
                  <span className="col-span-2 sm:col-span-1 font-mono text-[10px] text-[color:var(--ink-3)]">
                    {new Date(entry.addedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => setRemoveTarget({ id: entry._id, name: entry.email ?? entry.domain ?? entry._id })}
                    disabled={removeMutation.isPending}
                    className="hidden sm:inline-flex items-center justify-center p-2 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60"
                    title="Remove"
                    aria-label={`Remove suppression entry ${entry.email ?? entry.domain ?? ''}`}
                  >
                    <TrashGlyph />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(next) => { if (!next) setRemoveTarget(null); }}
        title="Remove from suppression list?"
        description="This address/domain will become contactable again. Add it back if outreach was paused for a reason."
        itemName={removeTarget?.name}
        confirmLabel="Remove"
        loading={removeMutation.isPending}
        onConfirm={() => { if (removeTarget) removeMutation.mutate(removeTarget.id); }}
      />
    </div>
  );
}
