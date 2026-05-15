'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, DataTable, RowType } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';
import { Pagination } from '@/components/shared/Pagination';
import { SectionTabs } from '@/components/shared/SectionTabs';

const PAGE_SIZE = 20;

/* ─────────────────────────────────────────────────────────────────
 * Tables index — list with rename, archive/restore, delete, docs,
 * multi-select + floating bulk-action bar.
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> { data: T[]; total: number; page: number; limit: number }

const ROW_TYPE_LABELS: Record<RowType, string> = {
  company: 'Company',
  person: 'Person',
  url: 'URL',
  custom: 'Custom',
};

/* ── Glyphs ─────────────────────────────────────────────────── */
const Svg = ({ className = 'w-4 h-4', sw = 1.5, children }: { className?: string; sw?: number; children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <g stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);
const PencilIcon = (p: { className?: string }) => <Svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" /></Svg>;
const ArchiveIcon = (p: { className?: string }) => <Svg {...p}><polyline points="21 8 21 21 3 21 3 8" /><rect x="1" y="3" width="22" height="5" /><line x1="10" y1="12" x2="14" y2="12" /></Svg>;
const TrashIcon = (p: { className?: string }) => <Svg {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></Svg>;
const DocIcon = (p: { className?: string }) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></Svg>;
const RestoreIcon = (p: { className?: string }) => <Svg {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.5" /></Svg>;
const CheckIcon = (p: { className?: string }) => <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>;
const CloseIcon = (p: { className?: string }) => <Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>;
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 16 16" fill="none" className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ── Table row with actions ──────────────────────────────────── */
function TableRow({
  table,
  workspaceId,
  onDeleted,
  selectable,
  selected,
  onToggle,
}: {
  table: DataTable;
  workspaceId: string;
  onDeleted: () => void;
  selectable: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const isArchived = !!table.archivedAt;

  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(table.name);
  const [docOpen, setDocOpen] = useState(false);
  const [docVal, setDocVal] = useState(table.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (renaming) renameRef.current?.focus(); }, [renaming]);
  useEffect(() => { if (docOpen) docRef.current?.focus(); }, [docOpen]);

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ApiResponse<DataTable>>(`/api/v1/workspaces/${workspaceId}/tables/${table._id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tables', workspaceId] }),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/tables/${table._id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(`"${table.name}" deleted.`);
      onDeleted();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed'),
  });

  function submitRename() {
    const name = renameVal.trim();
    if (name && name !== table.name) {
      patchMutation.mutate({ name });
    }
    setRenaming(false);
  }

  function submitDoc() {
    const description = docVal.trim() || undefined;
    patchMutation.mutate({ description: description ?? '' });
    setDocOpen(false);
  }

  function toggleArchive() {
    const archived = !isArchived;
    patchMutation.mutate({ archived });
    toast.success(archived ? `"${table.name}" hidden.` : `"${table.name}" restored.`);
  }

  return (
    <div className={`border-b border-[color:var(--rule)] last:border-b-0 transition-colors ${isArchived ? 'opacity-60' : ''}`}>
      <div className="group flex items-center gap-3 md:gap-4 py-3 px-4 md:px-5 hover:bg-[color:var(--paper-2)]/60 transition-colors">
        {/* Checkbox — visible on hover or when any row is selected */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(table._id); }}
          aria-label={selected ? 'Deselect table' : 'Select table'}
          className={`shrink-0 w-4 h-4 rounded-[3px] border flex items-center justify-center transition-all ${
            selected
              ? 'bg-[color:var(--ink)] border-[color:var(--ink)] opacity-100'
              : `border-[color:var(--rule)] bg-[color:var(--paper)] ${selectable ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
          }`}
        >
          {selected && <CheckIcon className="w-2.5 h-2.5 text-[color:var(--paper)]" />}
        </button>

        {/* Name / rename — 14px medium replaces the 20px italic */}
        <div className="flex-1 min-w-0">
          {renaming ? (
            <form
              onSubmit={(e) => { e.preventDefault(); submitRename(); }}
              className="flex items-center gap-2"
            >
              <input
                ref={renameRef}
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setRenameVal(table.name); setRenaming(false); } }}
                onBlur={submitRename}
                maxLength={200}
                className="flex-1 bg-[color:var(--paper)] border border-[color:var(--ember)]/60 rounded-md outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] text-[14px] font-medium text-[color:var(--ink)] px-2 py-1 transition-colors"
              />
              <button type="submit" className="p-1 text-[color:var(--ember-2)] hover:text-[color:var(--ember)]">
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => { setRenameVal(table.name); setRenaming(false); }} className="p-1 text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
                <CloseIcon className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/dashboard/tables/${table._id}`)}
                className="text-[14px] font-medium leading-tight text-[color:var(--ink)] hover:text-[color:var(--ember)] transition-colors text-left truncate"
              >
                {table.name}
              </button>
              {isArchived && (
                <span className="font-mono text-[10px] text-[color:var(--ink-3)] border border-[color:var(--rule)] rounded-[3px] px-1.5 py-0.5">
                  hidden
                </span>
              )}
            </div>
          )}
          {table.description && !docOpen && !renaming && (
            <p className="mt-0.5 text-[12px] text-[color:var(--ink-3)] line-clamp-1">
              {table.description}
            </p>
          )}
        </div>

        {/* Metadata — tabular-nums, mono, no uppercase tracking */}
        <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] shrink-0">
          {ROW_TYPE_LABELS[table.rowType]}
        </span>
        <span className="hidden md:inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] min-w-[60px] justify-end shrink-0">
          {table.columns.length}<span className="text-[color:var(--ink-3)]/60">col</span>
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] min-w-[60px] justify-end shrink-0">
          {table.rowCount.toLocaleString()}<span className="text-[color:var(--ink-3)]/60">row</span>
        </span>

        {/* Actions — visible on hover */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionBtn title="Rename" onClick={() => setRenaming(true)}>
            <PencilIcon className="w-3.5 h-3.5" />
          </ActionBtn>
          <ActionBtn title={docOpen ? 'Close notes' : 'Notes / description'} onClick={() => setDocOpen((v) => !v)} active={docOpen}>
            <DocIcon className="w-3.5 h-3.5" />
          </ActionBtn>
          <ActionBtn title={isArchived ? 'Restore' : 'Hide'} onClick={toggleArchive}>
            {isArchived ? <RestoreIcon className="w-3.5 h-3.5" /> : <ArchiveIcon className="w-3.5 h-3.5" />}
          </ActionBtn>
          {!confirmDelete ? (
            <ActionBtn title="Delete" onClick={() => setConfirmDelete(true)} danger>
              <TrashIcon className="w-3.5 h-3.5" />
            </ActionBtn>
          ) : (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[11px] text-[color:var(--warn)]">Delete?</span>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-[11px] font-medium text-[color:var(--warn)] hover:underline disabled:opacity-60"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[11px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline doc / description editor */}
      {docOpen && (
        <div className="px-4 md:px-5 pb-4">
          <div className="bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-md p-3 focus-within:border-[color:var(--ember)]/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] transition-all">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)] block mb-1.5">
              Notes
            </span>
            <textarea
              ref={docRef}
              value={docVal}
              onChange={(e) => setDocVal(e.target.value)}
              rows={3}
              placeholder="Add notes, context, or documentation for this table…"
              className="w-full bg-transparent outline-none resize-none text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-[color:var(--rule)]">
              <button
                onClick={() => { setDocVal(table.description ?? ''); setDocOpen(false); }}
                className="text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] px-2.5 h-7 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitDoc}
                disabled={patchMutation.isPending}
                className="text-[12px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-3 h-7 rounded-md disabled:opacity-50 transition-colors"
              >
                {patchMutation.isPending ? '…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  children,
  title,
  onClick,
  active,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${
        danger
          ? 'text-[color:var(--ink-3)] hover:text-[color:var(--warn)]'
          : active
          ? 'text-[color:var(--ember)] bg-[color:var(--paper-3)]'
          : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)]'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Bulk action bar ─────────────────────────────────────────── */
function BulkBar({
  count,
  hasArchived,
  hasActive,
  onHide,
  onRestore,
  onDelete,
  onClear,
  busy,
  confirmDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  count: number;
  hasArchived: boolean;
  hasActive: boolean;
  onHide: () => void;
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

        {hasActive && (
          <button
            onClick={onHide}
            disabled={busy}
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition disabled:opacity-40"
          >
            <ArchiveIcon className="w-3.5 h-3.5" />
            Hide
          </button>
        )}

        {hasArchived && (
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
            <span className="text-[12px] text-[color:var(--paper)]/85">Delete {count} table{count === 1 ? '' : 's'}?</span>
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

/* ── Page ────────────────────────────────────────────────────── */
export default function TablesIndexPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(1);

  // Reset to page 1 when the visible set changes shape (e.g. user
  // toggles "show hidden") so we don't strand them on a page that
  // suddenly has no entries.
  useEffect(() => { setPage(1); }, [showArchived]);

  const { data, isLoading } = useQuery({
    queryKey: ['tables', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<Paged<DataTable>>>(
        `/api/v1/workspaces/${workspaceId}/tables?limit=100&includeArchived=true`,
      ),
    enabled: Boolean(workspaceId),
  });

  const allTables = data?.data?.data ?? [];
  const activeTables = allTables.filter((t) => !t.archivedAt);
  const archivedTables = allTables.filter((t) => !!t.archivedAt);
  const visibleTables = showArchived ? allTables : activeTables;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['tables', workspaceId] });
  }

  /* ── Selection helpers ── */
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
    setSelected(new Set(visibleTables.map((t) => t._id)));
  }

  const selCount = selected.size;
  const allSelectedOnPage =
    visibleTables.length > 0 && visibleTables.every((t) => selected.has(t._id));

  // Determine if the selection contains any active or archived tables
  const selectedTables = allTables.filter((t) => selected.has(t._id));
  const selectionHasActive = selectedTables.some((t) => !t.archivedAt);
  const selectionHasArchived = selectedTables.some((t) => !!t.archivedAt);

  /* ── Bulk operations ── */
  async function bulkPatch(body: Record<string, unknown>) {
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          apiFetch(`/api/v1/workspaces/${workspaceId}/tables/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          }),
        ),
      );
      void qc.invalidateQueries({ queryKey: ['tables', workspaceId] });
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
          apiFetch(`/api/v1/workspaces/${workspaceId}/tables/${id}`, { method: 'DELETE' }),
        ),
      );
      toast.success(`${ids.length} table${ids.length === 1 ? '' : 's'} deleted.`);
      void qc.invalidateQueries({ queryKey: ['tables', workspaceId] });
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Some deletes failed.');
      void qc.invalidateQueries({ queryKey: ['tables', workspaceId] });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
      {/* Header — matches dashboard/leads. Tables/Workflows live
          under the same Tables section now; tabs surface both. */}
      <section className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
            Tables
          </h1>
          <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
            {isLoading ? '...' : activeTables.length}
          </span>
          <SectionTabs
            tabs={[
              { key: 'tables',    label: 'Tables',    href: '/dashboard/tables' },
              { key: 'workflows', label: 'Workflows', href: '/dashboard/workflows' },
            ]}
            className="sm:ml-2"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageHelp
            title="Tables"
            body="Structured research grids. Each table is a spreadsheet where rows are companies or people and columns can be populated by different data sources."
            tips={[
              'Click a table to open it and start enriching rows with data.',
              'Select tables to rename, archive, or delete them in bulk.',
              'Tables saved as workflows can be re-run on a fresh sheet with one click.',
            ]}
          />
          <button
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
          >
            New table
          </button>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <div className="py-16 text-center">
          <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading tables…</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && activeTables.length === 0 && archivedTables.length === 0 && (
        <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-12 text-center">
          <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">No tables yet</h3>
          <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[420px] mx-auto">
            Start one from a completed search or create an empty table for manual data entry.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-5 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
          >
            New table
          </button>
        </div>
      )}

      {/* Table list — single rounded card, hairline rows */}
      {!isLoading && (activeTables.length > 0 || archivedTables.length > 0) && (
        <>
          {visibleTables.length > 0 && (
            <div className="flex items-center justify-between gap-3 mb-3 min-h-[24px]">
              <button
                onClick={allSelectedOnPage ? clearSelection : selectAll}
                className="flex items-center gap-2 text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
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
                  {selCount} / {visibleTables.length}
                </span>
              )}
            </div>
          )}

          <div className="rounded-xl border border-[color:var(--rule)] overflow-hidden bg-[color:var(--paper)]">
            {visibleTables.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((t) => (
              <TableRow
                key={t._id}
                table={t}
                workspaceId={workspaceId ?? ''}
                onDeleted={invalidate}
                selectable={selCount > 0}
                selected={selected.has(t._id)}
                onToggle={toggleOne}
              />
            ))}
          </div>

          <Pagination
            page={page}
            total={visibleTables.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={visibleTables.length === 1 ? 'table' : 'tables'}
          />

          {archivedTables.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="mt-4 inline-flex items-center gap-2 font-mono text-[10.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
            >
              <ChevronIcon open={showArchived} />
              {showArchived
                ? `Hide ${archivedTables.length} hidden`
                : `Show ${archivedTables.length} hidden`}
            </button>
          )}
        </>
      )}

      {/* Floating bulk-action bar */}
      {selCount > 0 && (
        <BulkBar
          count={selCount}
          hasActive={selectionHasActive}
          hasArchived={selectionHasArchived}
          onHide={() => {
            void bulkPatch({ archived: true });
            toast.success(`${selCount} table${selCount === 1 ? '' : 's'} hidden.`);
          }}
          onRestore={() => {
            void bulkPatch({ archived: false });
            toast.success(`${selCount} table${selCount === 1 ? '' : 's'} restored.`);
          }}
          onDelete={() => void bulkDelete()}
          onClear={clearSelection}
          busy={bulkBusy}
          confirmDelete={confirmDelete}
          onConfirmDelete={() => setConfirmDelete(true)}
          onCancelDelete={() => setConfirmDelete(false)}
        />
      )}

      {dialogOpen && (
        <NewTableDialog
          workspaceId={workspaceId ?? ''}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}

/* ── New Table dialog ────────────────────────────────────────── */
function NewTableDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rowType, setRowType] = useState<RowType>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim() || !workspaceId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<ApiResponse<DataTable>>(
        `/api/v1/workspaces/${workspaceId}/tables`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            rowType,
            columns: [],
          }),
        },
      );
      await qc.invalidateQueries({ queryKey: ['tables', workspaceId] });
      if (res.data?._id) router.push(`/dashboard/tables/${res.data._id}`);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-[min(92vw,520px)] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl overflow-hidden shadow-2xl animate-scale-in">
        <div className="px-6 md:px-7 pt-6 pb-5 border-b border-[color:var(--rule)]">
          <h2 className="text-[18px] font-semibold text-[color:var(--ink)] tracking-[-0.005em]">
            New table
          </h2>
          <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
            A spreadsheet with rows you can enrich from any data source.
          </p>
        </div>

        <div className="px-6 md:px-7 py-5 flex flex-col gap-4">
          <LabeledInput
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Nigerian fintechs · Series B"
            autoFocus
          />
          <LabeledInput
            label="Description (optional)"
            value={description}
            onChange={setDescription}
            placeholder="Short note — what this table is for."
          />
          <div>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
              Row type
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.entries(ROW_TYPE_LABELS) as Array<[RowType, string]>).map(([k, label]) => {
                const on = rowType === k;
                return (
                  <button
                    key={k}
                    onClick={() => setRowType(k)}
                    className={`h-9 rounded-md text-[12.5px] transition-colors ${
                      on
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                        : 'border border-[color:var(--rule)] text-[color:var(--ink-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--ink-3)] leading-[1.5]">
              {rowType === 'company' && 'Primary key = company domain. Default columns cover name, industry, contact.'}
              {rowType === 'person' && 'Primary key = email or LinkedIn URL. Default columns cover name, title, company.'}
              {rowType === 'url' && 'Primary key = the URL. Default columns cover title + notes.'}
              {rowType === 'custom' && 'No default columns — define your own.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mx-6 md:mx-7 mb-4 flex items-start gap-3 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-3 py-2 text-[12.5px] text-[color:var(--ink-2)]">
            <span className="mt-[5px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 px-6 md:px-7 py-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40 px-3 h-8 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3.5 h-8 rounded-md text-[12.5px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
          >
            {saving ? 'Creating…' : 'Create table'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md px-3 h-9 outline-none text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition-colors"
      />
    </label>
  );
}
