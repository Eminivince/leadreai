'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  Label,
  HairlineInput,
  HairlineTextarea,
  SectionHead,
  PrimaryButton,
} from '@/components/settings/primitives';
import type { Workspace, WorkspaceBranding } from '@leadreai/shared';

/**
 * White-label branding settings (Task #12 frontend).
 *
 * Edits the workspace's `branding` block — applied at export time to
 * CSV header comments + XLSX Cover sheet + proof-bundle `producedBy`.
 * Child client workspaces inherit parent branding when their own block
 * is unset.
 */
export default function BrandingSettingsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<{ success: true; data: Workspace }>(`/api/v1/workspaces/${workspaceId}`),
    enabled: Boolean(workspaceId),
  });

  const ws = data?.data;
  const initial = ws?.branding;

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [reportTitle, setReportTitle] = useState('');

  useEffect(() => {
    setDisplayName(initial?.displayName ?? '');
    setLogoUrl(initial?.logoUrl ?? '');
    setContactEmail(initial?.contactEmail ?? '');
    setReportTitle(initial?.reportTitle ?? '');
  }, [initial?.displayName, initial?.logoUrl, initial?.contactEmail, initial?.reportTitle]);

  const save = useMutation({
    mutationFn: (branding: WorkspaceBranding) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ branding }),
      }),
    onSuccess: () => {
      toast.success('Branding updated.');
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update branding.'),
  });

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHead n="01" title="Branding" />
        <p className="text-[13px] text-[color:var(--ink-2)] max-w-[600px] leading-[1.55]">
          Shown on exports + the proof-bundle cover sheet. Client
          sub-workspaces inherit this from the parent agency when left
          blank.
        </p>
      </div>

      <div className="flex flex-col gap-5 max-w-xl">
        <div>
          <Label>Display name</Label>
          <HairlineInput
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Acme Research"
            disabled={isLoading}
          />
        </div>
        <div>
          <Label>Logo URL</Label>
          <HairlineInput
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://your-cdn.com/logo.png"
            disabled={isLoading}
          />
          <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
            Paste a public image URL. Used on the XLSX cover sheet.
          </p>
        </div>
        <div>
          <Label>Contact email</Label>
          <HairlineInput
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="hello@acme.com"
            disabled={isLoading}
          />
        </div>
        <div>
          <Label>Report title</Label>
          <HairlineTextarea
            rows={2}
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            placeholder="Lead research export — Q2 2026"
            disabled={isLoading}
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <PrimaryButton
            onClick={() =>
              save.mutate({
                displayName: displayName.trim() || undefined,
                logoUrl: logoUrl.trim() || undefined,
                contactEmail: contactEmail.trim() || undefined,
                reportTitle: reportTitle.trim() || undefined,
              })
            }
            disabled={save.isPending || isLoading}
          >
            {save.isPending ? 'Saving…' : 'Save branding'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
