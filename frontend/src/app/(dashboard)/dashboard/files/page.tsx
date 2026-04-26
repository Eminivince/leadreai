'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, LeadFileSummary } from '@leadreai/shared';
import {
  HairlineInput,
  HairlineTextarea,
  Label,
  PrimaryButton,
  GhostButton,
  ArrowEast,
} from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * The Files — an editorial catalogue of curated lead sets.
 *
 * Every dispatch auto-creates a file named after its query. Users can
 * also cut new files by hand, or curate leads across dispatches into
 * a single named set. Campaigns target files; so do exports.
 *
 * Filter strip tabs between All / From dispatches / Curated / Archived.
 * A "New file" button opens a right-drawer to create an empty file.
 * ───────────────────────────────────────────────────────────────── */

type Tab = 'all' | 'job' | 'manual' | 'archived';

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

function CloseIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── Card ────────────────────────────────────────────────────── */
function FileCard({ n, file }: { n: number; file: LeadFileSummary }) {
  const isArchived = !!file.archivedAt;
  const sourceLabel = file.source === 'job' ? 'From dispatch' : 'Curated';

  return (
    <Link
      href={`/dashboard/files/${file._id}`}
      className={`group relative flex flex-col border-t border-[color:var(--rule)] pt-5 pb-6 transition-opacity ${
        isArchived ? 'opacity-55 hover:opacity-80' : 'hover:bg-[color:var(--paper-3)]/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
          {String(n).padStart(2, '0')}
        </span>
        <span
          className={`font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.18em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${
            isArchived
              ? 'text-[color:var(--ink-3)] border-[color:var(--rule)]'
              : file.source === 'job'
                ? 'text-[color:var(--forest)] border-[color:var(--forest)]/40'
                : 'text-[color:var(--ink-2)] border-[color:var(--rule)]'
          }`}
        >
          {isArchived ? 'Archived' : sourceLabel}
        </span>
      </div>

      <h3 className="font-[family-name:var(--font-instrument-serif)] text-[22px] md:text-[26px] leading-[1.1] text-[color:var(--ink)] mb-1.5 tracking-[-0.005em]">
        {file.name}
      </h3>

      {file.description && (
        <p className="font-[family-name:var(--font-barlow)] italic text-[13px] text-[color:var(--ink-2)] leading-[1.45] mb-3 line-clamp-2">
          {file.description}
        </p>
      )}

      <div className="mt-auto pt-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-[family-name:var(--font-instrument-serif)] text-[28px] leading-none text-[color:var(--ink)] tabular-nums">
            {file.leadCount}
          </div>
          <div className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] mt-0.5">
            {file.leadCount === 1 ? 'Lead' : 'Leads'}
          </div>
        </div>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] tabular-nums">
          Updated {relativeTime(file.updatedAt)}
        </span>
      </div>

      <span className="absolute top-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--ink)]">
        <ArrowEast className="w-3 h-3" />
      </span>
    </Link>
  );
}

/* ── New-file drawer ─────────────────────────────────────────── */
function NewFileDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { workspaceId } = useWorkspace();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/files`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          leadIds: [],
        }),
      }),
    onSuccess: () => {
      toast.success('File opened.');
      setName('');
      setDescription('');
      onCreated();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create file.'),
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
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              New file
            </div>
            <h2 className="font-[family-name:var(--font-instrument-serif)] text-[22px] leading-[1.1] text-[color:var(--ink)] mt-1">
              Cut a fresh file.
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
            aria-label="Close drawer"
          >
            <CloseIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <form
          className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate();
          }}
        >
          <p className="font-[family-name:var(--font-barlow)] italic text-[13.5px] text-[color:var(--ink-2)] leading-[1.55]">
            Files are workspace-scoped sets of leads. Add leads from the leads page or via
            &ldquo;Save to file&rdquo; on any dispatch. You can target a file from a campaign.
          </p>

          <div>
            <Label>Name</Label>
            <HairlineInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q2 · Series A fintechs, warm intros"
              maxLength={200}
              autoFocus
              required
            />
          </div>

          <div>
            <Label>Description (optional)</Label>
            <HairlineTextarea
              rows={3}
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
            <PrimaryButton type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Opening\u2026' : 'Open file'}
            </PrimaryButton>
          </div>
        </form>
      </aside>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function FilesPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['files', workspaceId, tab === 'archived'],
    queryFn: () =>
      apiFetch<ApiResponse<{ data: LeadFileSummary[]; total: number }>>(
        `/api/v1/workspaces/${workspaceId}/files?limit=200${tab === 'archived' ? '&archived=true' : ''}`,
      ),
    enabled: !!workspaceId,
  });

  const allFiles = data?.data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allFiles.filter((f) => {
      if (tab === 'job' && f.source !== 'job') return false;
      if (tab === 'manual' && f.source !== 'manual') return false;
      if (tab === 'archived' && !f.archivedAt) return false;
      if (tab !== 'archived' && f.archivedAt) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [allFiles, tab, search]);

  const counts = useMemo(() => {
    const live = allFiles.filter((f) => !f.archivedAt);
    return {
      all: live.length,
      job: live.filter((f) => f.source === 'job').length,
      manual: live.filter((f) => f.source === 'manual').length,
      archived: allFiles.filter((f) => !!f.archivedAt).length,
    };
  }, [allFiles]);

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: 'all', label: 'All' },
    { k: 'job', label: 'From dispatches' },
    { k: 'manual', label: 'Curated' },
    { k: 'archived', label: 'Archived' },
  ];

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-12">
      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            The files
          </span>
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-[780px]">
            <h1 className="font-[family-name:var(--font-instrument-serif)] text-[44px] md:text-[60px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
              Curated <em className="italic text-[color:var(--forest)]">sets of leads</em>, named.
            </h1>
            <p className="mt-4 font-[family-name:var(--font-barlow)] text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
              Every dispatch auto-files its results. Cut new files by hand to group leads
              across runs — an ICP study, a short list, a reach-out round — then target
              them from a campaign.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <GhostButton onClick={() => setDrawerOpen(true)}>
              + New file
            </GhostButton>
            <Link
              href="/dashboard/leads"
              className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
            >
              Open the leads archive <ArrowEast className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6 pb-5 border-b border-[color:var(--rule)]">
        <div className="inline-flex items-center gap-0 rounded-full border border-[color:var(--rule)] bg-[color:var(--paper-3)] p-1">
          {TABS.map((t) => {
            const on = tab === t.k;
            const n = counts[t.k];
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full font-[family-name:var(--font-barlow)] text-[12.5px] transition-colors ${
                  on
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`font-[family-name:var(--font-jetbrains-mono)] text-[10px] tabular-nums ${
                    on ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
        <div className="w-[260px] md:w-[320px] border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full bg-transparent py-2 outline-none font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-16 text-center font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-2)]">
          Loading files…
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            Empty
          </span>
          <h3 className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[28px] text-[color:var(--ink)]">
            {tab === 'archived'
              ? 'Nothing in the archive.'
              : 'No files match yet.'}
          </h3>
          <p className="mt-2 font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-2)]">
            {tab === 'archived'
              ? 'Archive a file from its detail page when it’s run its course.'
              : 'Run a dispatch, or cut a new file by hand.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-2">
          {filtered.map((f, i) => (
            <FileCard key={f._id} n={i + 1} file={f} />
          ))}
        </div>
      )}

      <NewFileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['files', workspaceId] })}
      />
    </div>
  );
}
