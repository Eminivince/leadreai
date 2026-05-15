'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, LeadFile, Lead } from '@leadreai/shared';
import {
  HairlineInput,
  HairlineTextarea,
  Label,
  PrimaryButton,
  GhostButton,
  ArrowEast,
} from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * File detail — the leads of one curated set.
 *
 * Actions: rename, archive/unarchive, start a campaign from this file,
 * and remove individual leads. Each row links to the lead drawer in
 * the leads page for the full dossier view.
 * ───────────────────────────────────────────────────────────────── */

interface PagedLeads {
  data: Lead[];
  total: number;
  page: number;
  limit: number;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·';
}

function TrashIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
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

/* ── Rename drawer ───────────────────────────────────────────── */
function RenameDrawer({
  open,
  onClose,
  file,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  file: LeadFile;
  onSaved: () => void;
}) {
  const { workspaceId } = useWorkspace();
  const [name, setName] = useState(file.name);
  const [description, setDescription] = useState(file.description ?? '');

  const saveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/files/${file._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      }),
    onSuccess: () => {
      toast.success('File updated.');
      onSaved();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-[color:var(--ink)]/25 backdrop-blur-[1px]"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-[color:var(--paper)] border-l border-[color:var(--rule)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-[color:var(--rule)]">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Edit file
            </div>
            <h2 className=" text-[22px] leading-[1.1] text-[color:var(--ink)] mt-1">
              Rename this file.
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
            aria-label="Close drawer"
          >
            <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
              <path
                d="m3 3 10 10M13 3 3 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            saveMutation.mutate();
          }}
        >
          <div>
            <Label>Name</Label>
            <HairlineInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
            />
          </div>
          <div>
            <Label>Description (optional)</Label>
            <HairlineTextarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this file exists, who it's for."
              maxLength={1000}
            />
          </div>
          <div className="mt-auto flex items-center justify-end gap-3 pt-4">
            <GhostButton type="button" onClick={onClose}>
              Cancel
            </GhostButton>
            <PrimaryButton type="submit" disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving\u2026' : 'Save'}
            </PrimaryButton>
          </div>
        </form>
      </aside>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function FileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const fileId = params.fileId as string;
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [renameOpen, setRenameOpen] = useState(false);

  const { data: fileData, isLoading: fileLoading } = useQuery({
    queryKey: ['file', workspaceId, fileId],
    queryFn: () =>
      apiFetch<ApiResponse<LeadFile>>(`/api/v1/workspaces/${workspaceId}/files/${fileId}`),
    enabled: !!workspaceId && !!fileId,
  });
  const file = fileData?.data;

  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['file-leads', workspaceId, fileId],
    queryFn: () =>
      apiFetch<ApiResponse<PagedLeads>>(
        `/api/v1/workspaces/${workspaceId}/files/${fileId}/leads?limit=200`,
      ),
    enabled: !!workspaceId && !!fileId,
  });
  const leads = leadsData?.data?.data ?? [];

  const removeMutation = useMutation({
    mutationFn: (leadId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/files/${fileId}/leads`, {
        method: 'DELETE',
        body: JSON.stringify({ leadIds: [leadId] }),
      }),
    onSuccess: () => {
      toast.success('Removed from file.');
      void qc.invalidateQueries({ queryKey: ['file-leads', workspaceId, fileId] });
      void qc.invalidateQueries({ queryKey: ['file', workspaceId, fileId] });
      void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to remove.'),
  });

  const archiveMutation = useMutation({
    mutationFn: (archived: boolean) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/files/${fileId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived }),
      }),
    onSuccess: (_d, archived) => {
      toast.success(archived ? 'Archived.' : 'Restored.');
      void qc.invalidateQueries({ queryKey: ['file', workspaceId, fileId] });
      void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed.'),
  });

  if (fileLoading) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-16  italic text-[14px] text-[color:var(--ink-2)] text-center">
        Loading file…
      </div>
    );
  }

  if (!file) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          Missing
        </span>
        <h1 className="mt-3  text-[32px] text-[color:var(--ink)]">
          File not found.
        </h1>
        <p className="mt-2  italic text-[14px] text-[color:var(--ink-2)]">
          It may have been deleted.{' '}
          <Link
            href="/dashboard/files"
            className="underline decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
          >
            Back to files
          </Link>
          .
        </p>
      </div>
    );
  }

  const isArchived = !!file.archivedAt;
  const sourceLabel = file.source === 'job' ? 'Auto-filed from a dispatch' : 'Curated by hand';

  return (
    <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-10 md:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-5 sm:mb-6 font-mono text-[10px] tracking-[0.22em] uppercase">
        <Link href="/dashboard/files" className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition">
          Files
        </Link>
        <span className="text-[color:var(--ink-3)]">/</span>
        <span className="text-[color:var(--ink-2)] truncate max-w-[180px] sm:max-w-[360px]">{file.name}</span>
      </div>

      {/* Header */}
      <section className="mb-6 sm:mb-10 pb-6 sm:pb-8 border-b border-[color:var(--rule)]">
        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            {isArchived ? 'Archived file' : 'Active file'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6 flex-wrap">
          <div className="max-w-[780px]">
            <h1 className=" text-[30px] sm:text-[40px] md:text-[54px] leading-[0.98] tracking-[-0.015em] text-[color:var(--ink)]">
              {file.name}
            </h1>
            {file.description && (
              <p className="mt-4  italic text-[15px] leading-[1.55] text-[color:var(--ink-2)] max-w-[640px]">
                {file.description}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              <span>{sourceLabel}</span>
              {file.source === 'job' && file.sourceJobId && (
                <Link
                  href={`/dashboard/leads?jobId=${file.sourceJobId}`}
                  className="text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition underline decoration-[color:var(--rule)]"
                >
                  View dispatch
                </Link>
              )}
              <span>{file.leadIds.length} lead{file.leadIds.length === 1 ? '' : 's'}</span>
              <span>Updated {relativeTime(file.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <GhostButton onClick={() => setRenameOpen(true)}>Rename</GhostButton>
            <GhostButton onClick={() => archiveMutation.mutate(!isArchived)}>
              {isArchived ? 'Restore' : 'Archive'}
            </GhostButton>
            <button
              onClick={() => router.push('/dashboard/campaigns')}
              disabled={file.leadIds.length === 0 || isArchived}
              title={
                file.leadIds.length === 0
                  ? 'File is empty — nothing to campaign yet.'
                  : isArchived
                    ? 'Restore the file before starting a campaign.'
                    : undefined
              }
              className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Start a campaign <ArrowEast className="w-3 h-3" />
            </button>
          </div>
        </div>
      </section>

      {/* Leads table */}
      {leadsLoading ? (
        <div className="py-16 text-center  italic text-[14px] text-[color:var(--ink-2)]">
          Loading leads…
        </div>
      ) : leads.length === 0 ? (
        <div className="py-20 text-center">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            Empty
          </span>
          <h3 className="mt-3  text-[28px] text-[color:var(--ink)]">
            No leads in this file yet.
          </h3>
          <p className="mt-2  italic text-[14px] text-[color:var(--ink-2)]">
            Open the leads archive and use &ldquo;Save to file&rdquo; to curate a set.
          </p>
          <div className="mt-5">
            <Link
              href="/dashboard/leads"
              className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors"
            >
              Open leads archive <ArrowEast className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b-2 border-[color:var(--ink)]">
                <th className="text-left py-3 px-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Company
                </th>
                <th className="text-left py-3 px-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Contact
                </th>
                <th className="text-left py-3 px-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Primary email
                </th>
                <th className="text-left py-3 px-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  Industry
                </th>
                <th className="text-right py-3 pr-3 pl-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] w-[48px]">
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const contact = lead.contactSummary?.topContact;
                const email = lead.emails?.[0]?.address;
                return (
                  <tr
                    key={lead._id}
                    className="border-b border-[color:var(--rule)]/70 hover:bg-[color:var(--paper-3)]/60 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <Link
                        href={`/dashboard/leads/${lead._id}`}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <div className="w-8 h-8 rounded-sm bg-[color:var(--paper-2)] border border-[color:var(--rule)] flex items-center justify-center shrink-0  italic text-[12px] text-[color:var(--ink)]">
                          {initials(lead.companyName)}
                        </div>
                        <div className="min-w-0">
                          <div className=" font-medium text-[13.5px] text-[color:var(--ink)] truncate">
                            {lead.companyName}
                          </div>
                          <div className="font-mono text-[10.5px] text-[color:var(--ink-3)] truncate">
                            {lead.companyDomain ?? '\u2014'}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-3 px-3">
                      {contact?.fullName ? (
                        <>
                          <div className=" text-[13px] text-[color:var(--ink)] truncate">
                            {contact.fullName}
                          </div>
                          <div className=" italic text-[12px] text-[color:var(--ink-2)] truncate leading-tight">
                            {contact.title || '\u2014'}
                          </div>
                        </>
                      ) : (
                        <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 max-w-[240px]">
                      {email ? (
                        <span className="font-mono text-[11.5px] text-[color:var(--ink)] truncate block">
                          {email}
                        </span>
                      ) : (
                        <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className=" text-[13px] text-[color:var(--ink-2)] truncate block">
                        {lead.industry ?? '\u2014'}
                      </span>
                    </td>
                    <td className="py-3 pr-3 pl-3 text-right">
                      <button
                        onClick={() => removeMutation.mutate(lead._id)}
                        disabled={removeMutation.isPending}
                        className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60"
                        title="Remove from file"
                      >
                        <TrashIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <RenameDrawer
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        file={file}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['file', workspaceId, fileId] });
          void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
        }}
      />
    </div>
  );
}
