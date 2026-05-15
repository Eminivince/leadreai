'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  Label,
  HairlineInput,
  SectionHead,
  PrimaryButton,
} from '@/components/settings/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/**
 * API keys — press credentials.
 * Reuses the same endpoints the old settings page used:
 *   GET    /workspaces/:id/api-keys
 *   POST   /workspaces/:id/api-keys   { name }
 *   DELETE /workspaces/:id/api-keys/:keyId
 * The generated raw key is shown exactly once in a highlighted panel.
 */

interface ApiKeyMeta {
  _id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

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

export default function ApiKeysSettingsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: ApiKeyMeta[] }>(
        `/api/v1/workspaces/${workspaceId}/api-keys`,
      ),
    enabled: !!workspaceId,
    select: (r) => r.data,
  });
  const keys = data ?? [];

  const createMutation = useMutation({
    mutationFn: (keyName: string) =>
      apiFetch<{ success: true; data: { key: string; prefix: string; name: string } }>(
        `/api/v1/workspaces/${workspaceId}/api-keys`,
        { method: 'POST', body: JSON.stringify({ name: keyName }) },
      ),
    onSuccess: (res) => {
      setFreshKey(res.data.key);
      setName('');
      qc.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to issue key.'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Credential revoked.');
      qc.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
      setRevokeTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke.');
      setRevokeTarget(null);
    },
  });

  // Target row for the revoke-confirmation modal. Holds id+name so the modal
  // can show which key is about to die.
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="flex flex-col gap-14">
      {/* Issue a key */}
      <section>
        <SectionHead n="01" title="Issue a credential" />
        <div className="">
          <p className=" text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[620px] mb-6">
            Keys are scoped to this workspace. The raw key is shown once at issue time and is not
            recoverable afterward — copy it to your secrets store before leaving this page.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              createMutation.mutate(name.trim());
            }}
            className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-end"
          >
            <div>
              <Label>Credential name</Label>
              <HairlineInput
                placeholder="e.g. Production · CI pipeline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <PrimaryButton
              type="submit"
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? 'Issuing…' : 'Issue key'}
            </PrimaryButton>
          </form>

          {freshKey && (
            <div className="mt-5 border border-[color:var(--ember)]/40 bg-[color:var(--ember-bg)] rounded-lg p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ember)]">
                  Copy now — won&rsquo;t be shown again
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(freshKey);
                    toast.success('Copied.');
                  }}
                  className=" text-[12.5px] text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
                >
                  Copy to clipboard
                </button>
              </div>
              <code className="block break-all font-mono text-[13px] text-[color:var(--ink)] select-all">
                {freshKey}
              </code>
            </div>
          )}
        </div>
      </section>

      {/* Active keys */}
      <section>
        <SectionHead
          n="02"
          title={
            <>
              Active credentials{' '}
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] not-italic ml-3">
                {keys.length}
              </span>
            </>
          }
        />
        <div className="">
          {isLoading ? (
            <div className="py-12 text-center  text-[14px] text-[color:var(--ink-2)]">
              Loading credentials…
            </div>
          ) : keys.length === 0 ? (
            <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-md py-12 text-center">
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
                No credentials
              </span>
              <h4 className="mt-2  text-[20px] text-[color:var(--ink)]">
                Issue your first key above.
              </h4>
            </div>
          ) : (
            <div className="border-t border-[color:var(--rule)]">
              {keys.map((k) => (
                <div
                  key={k._id}
                  className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_140px_40px] gap-2 sm:gap-4 sm:items-center py-3 border-b border-[color:var(--rule)]/70"
                >
                  <div className="min-w-0 flex items-start justify-between gap-2 sm:block">
                    <div className="min-w-0">
                      <div className=" text-[13.5px] font-medium text-[color:var(--ink)] truncate">
                        {k.name}
                      </div>
                      <div className="font-mono text-[11px] text-[color:var(--ink-3)] truncate mt-0.5">
                        {k.prefix}••••
                      </div>
                    </div>
                    <button
                      onClick={() => setRevokeTarget({ id: k._id, name: k.name })}
                      disabled={revokeMutation.isPending}
                      className="sm:hidden p-2 -mr-2 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60 shrink-0"
                      title="Revoke"
                      aria-label={`Revoke API key ${k.name}`}
                    >
                      <TrashGlyph />
                    </button>
                  </div>
                  <span className="font-mono text-[10px] text-[color:var(--ink-3)]">
                    issued {new Date(k.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="font-mono text-[10px] text-[color:var(--ink-3)]">
                    {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'never used'}
                  </span>
                  <button
                    onClick={() => setRevokeTarget({ id: k._id, name: k.name })}
                    disabled={revokeMutation.isPending}
                    className="hidden sm:inline-flex p-2 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60 items-center justify-center"
                    title="Revoke"
                    aria-label={`Revoke API key ${k.name}`}
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
        open={revokeTarget !== null}
        onOpenChange={(next) => { if (!next) setRevokeTarget(null); }}
        title="Revoke this API key?"
        description="Any service still using this key will stop working immediately. This cannot be undone."
        itemName={revokeTarget?.name}
        confirmLabel="Revoke key"
        loading={revokeMutation.isPending}
        onConfirm={() => { if (revokeTarget) revokeMutation.mutate(revokeTarget.id); }}
      />
    </div>
  );
}
