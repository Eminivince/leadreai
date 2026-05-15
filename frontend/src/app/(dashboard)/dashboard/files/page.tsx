'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, LeadFileSummary } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';
import { Pagination } from '@/components/shared/Pagination';
import { SectionTabs } from '@/components/shared/SectionTabs';

const PAGE_SIZE = 20;

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

function CheckIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 16 16" fill="none" className={className}>
   <path d="M2.5 8.5 6.5 12.5 13.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function ArchiveIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <polyline points="21 8 21 21 3 21 3 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <rect x="1" y="3" width="22" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
   <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
 );
}

function RestoreIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <polyline points="1 4 1 10 7 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M3.51 15a9 9 0 1 0 .49-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
 );
}

function TrashIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

/* ── Card ────────────────────────────────────────────────────── */
function FileCard({
 file,
 selectable,
 selected,
 onToggle,
}: {
 file: LeadFileSummary;
 selectable: boolean;
 selected: boolean;
 onToggle: (id: string) => void;
}) {
 const isArchived = !!file.archivedAt;

 return (
  <div className={`group relative bg-[color:var(--paper)] border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
   selected
    ? 'border-[color:var(--ink)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_8%,transparent)]'
    : 'border-[color:var(--rule)] hover:border-[color:var(--ink-3)] hover:bg-[color:var(--paper-2)]/30'
  } ${isArchived ? 'opacity-60' : ''}`}>

   {/* Checkbox — visible on hover or when anything is selected */}
   <button
    onClick={() => onToggle(file._id)}
    aria-label={selected ? 'Deselect file' : 'Select file'}
    className={`absolute top-3 left-3 z-10 w-4 h-4 rounded-[3px] border flex items-center justify-center transition-all ${
     selected
      ? 'bg-[color:var(--ink)] border-[color:var(--ink)] opacity-100'
      : `border-[color:var(--rule)] bg-[color:var(--paper)] ${selectable ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
    }`}
   >
    {selected && <CheckIcon className="w-2.5 h-2.5 text-[color:var(--paper)]" />}
   </button>

   {/* Card body — clicking navigates unless in selection mode */}
   <Link
    href={`/dashboard/files/${file._id}`}
    onClick={(e) => { if (selectable) e.preventDefault(); }}
    className="flex flex-col gap-3 flex-1"
    tabIndex={selectable ? -1 : undefined}
   >
    {/* Top row — restrained source label, no icon block, all token-driven */}
    <div className="flex items-center justify-between gap-2 pl-6">
     <span className="font-mono text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)] capitalize">
      {isArchived ? 'archived' : file.source === 'job' ? 'from search' : 'curated'}
     </span>
     {!isArchived && file.source === 'job' && (
      <span
       title="Created from a search dispatch"
       className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06] px-2 h-6"
      >
       <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" aria-hidden />
       <span className="font-mono text-[10px] tracking-[0.04em] text-[color:var(--ember-2)]">
        search
       </span>
      </span>
     )}
    </div>

    {/* Title + description fallback chain */}
    <div className="flex-1 min-w-0">
     <h3 className="text-[14.5px] font-semibold text-[color:var(--ink)] leading-snug truncate">
      {file.name}
     </h3>
     {file.description ? (
      <p className="text-[12.5px] text-[color:var(--ink-2)] mt-1 leading-[1.5] line-clamp-2">
       {file.description}
      </p>
     ) : (
      <p className="text-[12.5px] text-[color:var(--ink-3)] mt-1">
       No description
      </p>
     )}
    </div>

    {/* Footer — tabular-nums on both halves, mono throughout */}
    <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[color:var(--rule)] font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
     <span>
      <span className="text-[color:var(--ink)]">{file.leadCount.toLocaleString()}</span>
      <span className="text-[color:var(--ink-3)]/60 ml-1">{file.leadCount === 1 ? 'lead' : 'leads'}</span>
     </span>
     <span>{relativeTime(file.updatedAt)}</span>
    </div>
   </Link>
  </div>
 );
}

/* ── Bulk action bar ─────────────────────────────────────────── */
function BulkBar({
 count,
 tab,
 onArchive,
 onRestore,
 onDelete,
 onClear,
 busy,
 confirmDelete,
 onConfirmDelete,
 onCancelDelete,
}: {
 count: number;
 tab: Tab;
 onArchive: () => void;
 onRestore: () => void;
 onDelete: () => void;
 onClear: () => void;
 busy: boolean;
 confirmDelete: boolean;
 onConfirmDelete: () => void;
 onCancelDelete: () => void;
}) {
 return (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up">
   <div className="flex items-center gap-3 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-3 rounded-xl shadow-2xl border border-[color:var(--paper)]/10">
    <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">
     {count} selected
    </span>
    <div className="w-px h-5 bg-[color:var(--paper)]/20" />

    {tab !== 'archived' && (
     <button
      onClick={onArchive}
      disabled={busy}
      className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition disabled:opacity-40"
     >
      <ArchiveIcon className="w-3.5 h-3.5" />
      Archive
     </button>
    )}

    {tab === 'archived' && (
     <button
      onClick={onRestore}
      disabled={busy}
      className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition disabled:opacity-40"
     >
      <RestoreIcon className="w-3.5 h-3.5" />
      Restore
     </button>
    )}

    {!confirmDelete ? (
     <button
      onClick={onConfirmDelete}
      disabled={busy}
      className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--warn)] hover:opacity-80 transition-opacity disabled:opacity-40"
     >
      <TrashIcon className="w-3.5 h-3.5" />
      Delete
     </button>
    ) : (
     <div className="flex items-center gap-2">
      <span className="text-[12px] text-[color:var(--paper)]/85">Delete {count} file{count === 1 ? '' : 's'}?</span>
      <button
       onClick={onDelete}
       disabled={busy}
       className="text-[12.5px] font-semibold text-[color:var(--warn)] hover:opacity-80 underline disabled:opacity-40"
      >
       {busy ? 'Deleting…' : 'Yes, delete'}
      </button>
      <button onClick={onCancelDelete} className="text-[12px] text-[color:var(--paper)]/50 hover:text-[color:var(--paper)] transition-colors">
       Cancel
      </button>
     </div>
    )}

    <div className="w-px h-5 bg-[color:var(--paper)]/20" />
    <button
     onClick={onClear}
     className="p-1 text-[color:var(--paper)]/50 hover:text-[color:var(--paper)] transition rounded"
     aria-label="Clear selection"
    >
     <CloseIcon className="w-3 h-3" />
    </button>
   </div>
  </div>
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
  <div className="fixed inset-0 z-40 animate-fade-in">
   <button
    aria-label="Close"
    onClick={onClose}
    className="absolute inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm"
   />
   <aside className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-[color:var(--paper)] border-l border-[color:var(--rule)] shadow-2xl flex flex-col animate-slide-right">
    <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 border-b border-[color:var(--rule)]">
     <div>
      <h2 className="text-[16px] font-semibold text-[color:var(--ink)] tracking-[-0.005em]">New file</h2>
      <p className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5">Group leads for campaigns and exports.</p>
     </div>
     <button
      onClick={onClose}
      className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors rounded-md hover:bg-[color:var(--paper-2)]"
      aria-label="Close drawer"
     >
      <CloseIcon className="w-3.5 h-3.5" />
     </button>
    </div>

    <form
     className="flex-1 overflow-y-auto px-5 md:px-6 py-5 flex flex-col gap-4"
     onSubmit={(e) => {
      e.preventDefault();
      if (!name.trim()) return;
      createMutation.mutate();
     }}
    >
     <div>
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
       Name
      </span>
      <input
       type="text"
       value={name}
       onChange={(e) => setName(e.target.value)}
       placeholder="e.g. Q2 · Series A fintechs"
       maxLength={200}
       autoFocus
       required
       className="w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md px-3 h-9 outline-none text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition-colors"
      />
     </div>

     <div>
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
       Description <span className="text-[color:var(--ink-3)]/70">(optional)</span>
      </span>
      <textarea
       rows={3}
       value={description}
       onChange={(e) => setDescription(e.target.value)}
       placeholder="Why this file exists, who it's for."
       maxLength={1000}
       className="w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md px-3 py-2 outline-none text-[13.5px] leading-[1.55] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] resize-none transition-colors"
      />
     </div>

     <p className="text-[12px] text-[color:var(--ink-3)] leading-[1.55]">
      Add leads from the Leads page or via &ldquo;Save to file&rdquo; on any search. You can target a file from a campaign.
     </p>

     <div className="mt-auto flex items-center justify-end gap-2 pt-4 border-t border-[color:var(--rule)]">
      <button
       type="button"
       onClick={onClose}
       className="text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] px-3 h-8 rounded-md transition-colors"
      >
       Cancel
      </button>
      <button
       type="submit"
       disabled={!name.trim() || createMutation.isPending}
       className="inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3.5 h-8 rounded-md text-[12.5px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
      >
       {createMutation.isPending ? 'Opening…' : 'Open file'}
      </button>
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
 const [selected, setSelected] = useState<Set<string>>(new Set());
 const [bulkBusy, setBulkBusy] = useState(false);
 const [confirmDelete, setConfirmDelete] = useState(false);
 const [page, setPage] = useState(1);

 // Reset to page 1 whenever the result set changes shape — otherwise
 // a user who was on page 4 of "All" suddenly clicks "Archived" and
 // sees an empty page because it only has 1 page worth of data.
 useEffect(() => { setPage(1); }, [tab, search]);

 const { data, isLoading } = useQuery({
  queryKey: ['files', workspaceId, tab === 'archived'],
  queryFn: () =>
   apiFetch<ApiResponse<{ data: LeadFileSummary[]; total: number }>>(
    `/api/v1/workspaces/${workspaceId}/files?limit=200${tab === 'archived' ? '&archived=true' : ''}`,
   ),
  enabled: !!workspaceId,
 });

 // Stable reference via useMemo so the downstream `filtered` + `counts`
 // memos don't recompute on every render just because `data` is a fresh
 // React Query object reference.
 const allFiles = useMemo(() => data?.data?.data ?? [], [data]);

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

 function toggleOne(id: string) {
  setSelected((prev) => {
   const next = new Set(prev);
   if (next.has(id)) next.delete(id);
   else next.add(id);
   return next;
  });
  setConfirmDelete(false);
 }

 function clearSelection() {
  setSelected(new Set());
  setConfirmDelete(false);
 }

 function selectAll() {
  setSelected(new Set(filtered.map((f) => f._id)));
 }

 const selCount = selected.size;
 const allSelectedOnPage = filtered.length > 0 && filtered.every((f) => selected.has(f._id));

 async function bulkPatch(body: Record<string, unknown>) {
  setBulkBusy(true);
  try {
   await Promise.all(
    Array.from(selected).map((id) =>
     apiFetch(`/api/v1/workspaces/${workspaceId}/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
     }),
    ),
   );
   void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
   clearSelection();
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Some updates failed.');
  } finally {
   setBulkBusy(false);
  }
 }

 async function bulkDelete() {
  setBulkBusy(true);
  const ids = Array.from(selected);
  try {
   await Promise.all(
    ids.map((id) =>
     apiFetch(`/api/v1/workspaces/${workspaceId}/files/${id}`, { method: 'DELETE' }),
    ),
   );
   toast.success(`${ids.length} file${ids.length === 1 ? '' : 's'} deleted.`);
   void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
   clearSelection();
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Some deletes failed.');
   void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
  } finally {
   setBulkBusy(false);
  }
 }

 return (
  <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 animate-fade-up">
   {/* Header — Files is a sub-view of Leads now, so the title block
       reads "Leads" with the Files tab active. Same shape as the
       Leads page so users feel they're inside one section, not on
       a separate top-level surface. */}
   <section className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
    <div className="flex items-baseline gap-3 flex-wrap">
     <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
      Leads
     </h1>
     <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
      {isLoading ? '...' : counts.all}
     </span>
     <SectionTabs
      tabs={[
       { key: 'leads', label: 'All', href: '/dashboard/leads' },
       { key: 'files', label: 'Files', href: '/dashboard/files' },
      ]}
      className="sm:ml-2"
     />
    </div>
    <div className="flex items-center gap-2 flex-wrap">
     <PageHelp
      title="Files"
      body="Named collections of leads. Organise contacts into files — e.g. 'Q3 prospects' or 'Nigeria fintech' — then use a file as the audience for a campaign."
      tips={[
       'Create a file from scratch or save selected leads from the Leads page.',
       'Select multiple files to archive or delete them in one go.',
       'Archived files are hidden from campaigns but not deleted.',
      ]}
     />
     <button
      onClick={() => setDrawerOpen(true)}
      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
     >
      New file
     </button>
    </div>
   </section>

   {/* Toolbar — segmented filter + search */}
   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap mb-4">
    <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 self-start overflow-x-auto max-w-full">
     {TABS.map((t) => {
      const on = tab === t.k;
      const n = counts[t.k];
      return (
       <button
        key={t.k}
        onClick={() => { setTab(t.k); clearSelection(); }}
        className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12.5px] transition-colors ${
         on
          ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
          : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
        }`}
       >
        <span>{t.label}</span>
        <span className={`font-mono text-[10.5px] tabular-nums ${on ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'}`}>
         {n}
        </span>
       </button>
      );
     })}
    </div>
    <div className="flex items-center gap-2 h-9 sm:h-8 px-3 border border-[color:var(--rule)] bg-[color:var(--paper)] hover:border-[color:var(--ink-3)] focus-within:border-[color:var(--ember)]/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md w-full sm:w-[260px] md:w-[280px] transition-colors">
     <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-[color:var(--ink-3)] shrink-0">
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
     </svg>
     <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search files…"
      className="bg-transparent outline-none flex-1 text-[12.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
     />
     {search && (
      <button onClick={() => setSearch('')} className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors" aria-label="Clear search">
       <CloseIcon className="w-3 h-3" />
      </button>
     )}
    </div>
   </div>

   {/* Select-all / deselect-all row — only when there's a list */}
   {filtered.length > 0 && !isLoading && (
    <div className="flex items-center justify-between gap-3 mb-3 min-h-[24px]">
     <button
      onClick={allSelectedOnPage ? clearSelection : selectAll}
      className="flex items-center gap-2 text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
     >
      <span className={`w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors ${
       allSelectedOnPage
        ? 'bg-[color:var(--ink)] border-[color:var(--ink)]'
        : 'border-[color:var(--rule)] bg-[color:var(--paper)]'
      }`}>
       {allSelectedOnPage && <CheckIcon className="w-2.5 h-2.5 text-[color:var(--paper)]" />}
      </span>
      <span>{allSelectedOnPage ? 'Deselect all' : 'Select all'}</span>
     </button>
     {selCount > 0 && (
      <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
       {selCount} / {filtered.length}
      </span>
     )}
    </div>
   )}

   {/* Grid */}
   {isLoading ? (
    <div className="py-16 text-center">
     <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading files…</span>
    </div>
   ) : filtered.length === 0 ? (
    <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-12 text-center">
     <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">
      {tab === 'archived' ? 'Nothing archived' : 'No files yet'}
     </h3>
     <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[480px] mx-auto leading-[1.55]">
      {tab === 'archived'
       ? "Archive a file from its detail page when it's run its course."
       : 'A file is a named group of leads — the audience for a campaign. Open All leads, select the rows you want, and use Save to file. Or start a blank file here.'}
     </p>
     {tab !== 'archived' && (
      <div className="mt-5 inline-flex items-center gap-2">
       <Link
        href="/dashboard/leads"
        className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
       >
        Browse leads
       </Link>
       <button
        onClick={() => setDrawerOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
       >
        New file
       </button>
      </div>
     )}
    </div>
   ) : (
    <>
     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((f) => (
       <FileCard
        key={f._id}
        file={f}
        selectable={selCount > 0}
        selected={selected.has(f._id)}
        onToggle={toggleOne}
       />
      ))}
     </div>
     <Pagination
      page={page}
      total={filtered.length}
      pageSize={PAGE_SIZE}
      onPageChange={setPage}
      itemLabel={filtered.length === 1 ? 'file' : 'files'}
     />
    </>
   )}

   {/* Floating bulk-action bar */}
   {selCount > 0 && (
    <BulkBar
     count={selCount}
     tab={tab}
     onArchive={() => { void bulkPatch({ archived: true }); toast.success(`${selCount} file${selCount === 1 ? '' : 's'} archived.`); }}
     onRestore={() => { void bulkPatch({ archived: false }); toast.success(`${selCount} file${selCount === 1 ? '' : 's'} restored.`); }}
     onDelete={() => void bulkDelete()}
     onClear={clearSelection}
     busy={bulkBusy}
     confirmDelete={confirmDelete}
     onConfirmDelete={() => setConfirmDelete(true)}
     onCancelDelete={() => setConfirmDelete(false)}
    />
   )}

   <NewFileDrawer
    open={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    onCreated={() => qc.invalidateQueries({ queryKey: ['files', workspaceId] })}
   />
  </div>
 );
}
