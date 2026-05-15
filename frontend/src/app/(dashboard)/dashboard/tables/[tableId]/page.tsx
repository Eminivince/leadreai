'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import { classifyCell, toneClasses } from '@/components/tables/cellTone';
import type {
  ApiResponse,
  DataTable,
  DataTableRow,
  ColumnDef,
  ColumnValueType,
  ProspectingJob,
  DataSourceSummary,
  DataSourceAction,
  ActionInputSpec,
  Workflow,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Table detail — the grid.
 *
 * Editorial shell, data-dense center. Columns run horizontally with
 * sticky first column (primary key). Cells are inline-editable; the
 * cell value writes immediately on blur with optimistic UI.
 *
 * This is the first page in the app where we lean on the grid as the
 * primary interaction model (vs. cards, lists, forms). The design
 * choice: keep the paper shell around the grid, but the grid itself
 * uses tight lines and mono numerics to feel like a worksheet.
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> { data: T[]; total: number; page: number; limit: number }

export default function TableDetailPage() {
  const params = useParams();
  const tableId = (params.tableId as string) ?? '';
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [addColOpen, setAddColOpen] = useState(false);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [seedOpen, setSeedOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [saveWorkflowOpen, setSaveWorkflowOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [showHiddenCols, setShowHiddenCols] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [enrichingColKey, setEnrichingColKey] = useState<string | null>(null);
  const enrichingStartRef = useRef<number | null>(null);

  const { data: tableResp, isLoading: loadingTable } = useQuery({
    queryKey: ['table', workspaceId, tableId],
    queryFn: () => apiFetch<ApiResponse<DataTable>>(
      `/api/v1/workspaces/${workspaceId}/tables/${tableId}`,
    ),
    enabled: Boolean(workspaceId && tableId),
  });

  const { data: rowsResp } = useQuery({
    queryKey: ['table-rows', workspaceId, tableId, showHidden],
    queryFn: () => apiFetch<ApiResponse<Paged<DataTableRow> & { hiddenCount?: number }>>(
      `/api/v1/workspaces/${workspaceId}/tables/${tableId}/rows?limit=200${showHidden ? '&includeHidden=true' : ''}`,
    ),
    enabled: Boolean(workspaceId && tableId),
    refetchInterval: enrichingColKey ? 3000 : false,
  });

  useEffect(() => {
    if (!enrichingColKey || !rowsResp) return;
    const elapsed = enrichingStartRef.current ? Date.now() - enrichingStartRef.current : 0;
    if (elapsed > 120_000) {
      setEnrichingColKey(null);
      enrichingStartRef.current = null;
      return;
    }
    const rows = rowsResp.data?.data ?? [];
    if (rows.length === 0) return;
    // Fast-path: if nothing is filled yet, skip the full scan.
    const anyFilled = rows.some((r) => {
      const cells = r.cells as Record<string, unknown> | undefined;
      if (!cells) return false;
      const cell = cells[enrichingColKey];
      if (cell === null || cell === undefined) return false;
      if (typeof cell === 'object' && 'value' in (cell as Record<string, unknown>)) {
        return (cell as { value: unknown }).value !== null && (cell as { value: unknown }).value !== undefined;
      }
      return true;
    });
    if (!anyFilled) return;
    const allFilled = rows.every((r) => {
      const cells = r.cells as Record<string, unknown> | undefined;
      if (!cells) return false;
      const cell = cells[enrichingColKey];
      if (cell === null || cell === undefined) return false;
      if (typeof cell === 'object' && 'value' in (cell as Record<string, unknown>)) {
        const v = (cell as { value: unknown }).value;
        return v !== null && v !== undefined;
      }
      return true;
    });
    if (allFilled) {
      setEnrichingColKey(null);
      enrichingStartRef.current = null;
    }
  }, [enrichingColKey, rowsResp]);

  const table = tableResp?.data;
  const rows = rowsResp?.data?.data ?? [];
  const hiddenCount = rowsResp?.data?.hiddenCount ?? 0;
  const hiddenColCount = table?.columns.filter((c) => c.hidden).length ?? 0;

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['table', workspaceId, tableId] }),
      qc.invalidateQueries({ queryKey: ['table-rows', workspaceId, tableId] }),
      qc.invalidateQueries({ queryKey: ['tables', workspaceId] }),
    ]);
  };

  if (loadingTable && !table) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center  italic text-[14px] text-[color:var(--ink-3)]">
        Loading table…
      </div>
    );
  }

  if (!table) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center">
        <p className=" text-[14px] text-[color:var(--ink-2)]">Table not found.</p>
        <Link href="/dashboard/tables" className="mt-4 inline-block font-mono text-[11px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">
          ← All tables
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-10 md:py-12">
      {/* Header */}
      <section className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 flex-wrap">
        <div className="max-w-[720px]">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Link
              href="/dashboard/tables"
              className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
            >
              Tables
            </Link>
            <span className="font-mono text-[10px] text-[color:var(--ink-3)]">/</span>
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
              {table.rowType}
            </span>
          </div>
          <h1 className=" text-[28px] sm:text-[38px] md:text-[52px] leading-[0.97] tracking-[-0.015em] text-[color:var(--ink)]">
            {table.name}
          </h1>
          {table.description && (
            <p className="mt-3  text-[14.5px] leading-[1.5] text-[color:var(--ink-2)]">
              {table.description}
            </p>
          )}
          <div className="mt-4 flex items-center gap-4 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
            <span>{table.columns.length} cols</span>
            <span>·</span>
            <span>{table.rowCount.toLocaleString()} rows</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSeedOpen(true)}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full  text-[13px] transition"
          >
            Seed from search
          </button>
          <button
            onClick={() => setAddRowOpen(true)}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full  text-[13px] transition"
          >
            Add row +
          </button>
          <button
            onClick={() => setAddColOpen(true)}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full  text-[13px] transition"
          >
            Add column +
          </button>
          <button
            onClick={() => setSaveWorkflowOpen(true)}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2 rounded-full  text-[13px] transition"
            title="Save this table's shape as a reusable workflow"
          >
            Save as workflow
          </button>
          <button
            onClick={() => setActionOpen(true)}
            disabled={table.rowCount === 0}
            title={table.rowCount === 0 ? 'Add rows before running an action' : undefined}
            className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-4 py-2 rounded-full  text-[13px] font-medium transition disabled:opacity-40"
          >
            Run action →
          </button>
        </div>
      </section>

      {/* Bulk action bar — appears when rows are selected. Not modal, but
          sticky at the top of the grid region so it stays reachable as
          the user scrolls through a long list. */}
      {selectedRowIds.size > 0 && (
        <BulkActionBar
          table={table}
          workspaceId={workspaceId ?? ''}
          selectedIds={selectedRowIds}
          onCleared={() => setSelectedRowIds(new Set())}
          onChanged={async () => {
            setSelectedRowIds(new Set());
            await invalidate();
          }}
        />
      )}

      {/* Show-hidden toggles — rows and columns are independent axes. Only
          surface each toggle when there's actually something hidden OR the
          toggle is already on. Keeps the chrome quiet in the happy path. */}
      {(hiddenCount > 0 || showHidden || hiddenColCount > 0 || showHiddenCols) && (
        <div className="mb-3 flex items-center gap-5 flex-wrap">
          {(hiddenCount > 0 || showHidden) && (
            <label className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => setShowHidden(e.target.checked)}
                className="accent-[color:var(--ember)]"
              />
              Show hidden rows
              {hiddenCount > 0 && !showHidden && (
                <span className="text-[color:var(--ink-3)] ml-1">({hiddenCount})</span>
              )}
            </label>
          )}
          {(hiddenColCount > 0 || showHiddenCols) && (
            <label className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={showHiddenCols}
                onChange={(e) => setShowHiddenCols(e.target.checked)}
                className="accent-[color:var(--ember)]"
              />
              Show hidden columns
              {hiddenColCount > 0 && !showHiddenCols && (
                <span className="text-[color:var(--ink-3)] ml-1">({hiddenColCount})</span>
              )}
            </label>
          )}
        </div>
      )}

      {/* Grid */}
      {rows.length === 0 ? (
        <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/50 rounded-sm p-10 text-center">
          <p className=" italic text-[20px] text-[color:var(--ink)]">
            Empty worksheet.
          </p>
          <p className="mt-2  text-[13.5px] text-[color:var(--ink-2)] max-w-[420px] mx-auto">
            Seed from a completed search, or add rows manually.
          </p>
        </div>
      ) : (
        <TableGrid
          table={table}
          rows={rows}
          workspaceId={workspaceId ?? ''}
          selectedIds={selectedRowIds}
          onSelectionChange={setSelectedRowIds}
          showHiddenCols={showHiddenCols}
          onRowChanged={invalidate}
          enrichingColKey={enrichingColKey}
          onEnrichingStart={(ck) => {
            enrichingStartRef.current = Date.now();
            setEnrichingColKey(ck);
          }}
        />
      )}

      {/* Dialogs */}
      {addColOpen && (
        <AddColumnDialog
          table={table}
          workspaceId={workspaceId ?? ''}
          onClose={() => setAddColOpen(false)}
          onAdded={() => {
            void invalidate();
            setAddColOpen(false);
          }}
        />
      )}
      {addRowOpen && (
        <AddRowDialog
          table={table}
          workspaceId={workspaceId ?? ''}
          onClose={() => setAddRowOpen(false)}
          onAdded={() => {
            void invalidate();
            setAddRowOpen(false);
          }}
        />
      )}
      {seedOpen && (
        <SeedFromJobDialog
          table={table}
          workspaceId={workspaceId ?? ''}
          onClose={() => setSeedOpen(false)}
          onSeeded={() => {
            void invalidate();
            setSeedOpen(false);
          }}
        />
      )}
      {actionOpen && (
        <ActionModal
          table={table}
          workspaceId={workspaceId ?? ''}
          onClose={() => setActionOpen(false)}
          onLaunched={async (ck) => {
            enrichingStartRef.current = Date.now();
            setEnrichingColKey(ck);
            setActionOpen(false);
            void invalidate();
          }}
        />
      )}
      {saveWorkflowOpen && (
        <SaveAsWorkflowDialog
          table={table}
          workspaceId={workspaceId ?? ''}
          onClose={() => setSaveWorkflowOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Grid ────────────────────────────────────────────────────────── */

const CHECKBOX_COL_W = 44;
const PK_COL_W = 240;
const COL_MIN_W = 80;
const COL_MAX_W = 800;
const COL_DEFAULT_W = 180;

function TableGrid({
  table,
  rows,
  workspaceId,
  selectedIds,
  onSelectionChange,
  showHiddenCols,
  onRowChanged,
  enrichingColKey,
  onEnrichingStart,
}: {
  table: DataTable;
  rows: DataTableRow[];
  workspaceId: string;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  showHiddenCols: boolean;
  onRowChanged: () => Promise<void>;
  enrichingColKey?: string | null;
  onEnrichingStart?: (ck: string) => void;
}) {
  const pkLabel = pkLabelForRowType(table.rowType);
  const [runColumnKey, setRunColumnKey] = useState<string | null>(null);
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  // During a resize drag, we overlay the server-persisted width with a live
  // value so the column tracks the pointer pixel-perfectly. On pointerup we
  // PATCH and clear this overlay; the next table refetch brings the
  // persisted width into the props and everything lines up.
  const [liveWidths, setLiveWidths] = useState<Record<string, number>>({});

  // Visible columns respect the user's show-hidden-cols toggle. Hidden
  // columns still exist in the table doc — we just filter them from render.
  const visibleColumns = useMemo(
    () => table.columns.filter((c) => showHiddenCols || !c.hidden),
    [table.columns, showHiddenCols],
  );

  // Select-all semantics: checked if every visible row is selected. Partial
  // selection becomes indeterminate via the DOM ref below — React doesn't
  // bind the `indeterminate` property declaratively.
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r._id));
  const someSelected = rows.some((r) => selectedIds.has(r._id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.delete(r._id));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      rows.forEach((r) => next.add(r._id));
      onSelectionChange(next);
    }
  }

  function toggleRow(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  }

  async function persistColumnPatch(columnKey: string, patch: Record<string, unknown>) {
    await apiFetch<ApiResponse<unknown>>(
      `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${columnKey}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    );
    await onRowChanged();
  }

  async function persistColumnDelete(columnKey: string) {
    await apiFetch<ApiResponse<unknown>>(
      `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${columnKey}`,
      { method: 'DELETE' },
    );
    await onRowChanged();
  }

  function effectiveWidth(col: ColumnDef): number {
    return liveWidths[col.key] ?? col.width ?? COL_DEFAULT_W;
  }

  return (
    <div className="border border-[color:var(--rule)] bg-[color:var(--paper)] rounded-sm overflow-hidden">
      <div className="overflow-x-auto">
        {/* `table-fixed` so <colgroup> widths are authoritative — without it
            the browser reflows columns based on content, which fights the
            user's drag-resize. Both <th> and <td> inherit width from <col>. */}
        <table className="border-collapse table-fixed">
          <colgroup>
            <col style={{ width: CHECKBOX_COL_W }} />
            <col style={{ width: PK_COL_W }} />
            {visibleColumns.map((col) => (
              <col key={col.key} style={{ width: effectiveWidth(col) }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--rule)]">
              <th className="sticky left-0 z-20 bg-[color:var(--paper-2)] border-r border-[color:var(--rule)] px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  className="accent-[color:var(--ember)] cursor-pointer"
                />
              </th>
              <th
                className="sticky z-20 bg-[color:var(--paper-2)] border-r border-[color:var(--rule)] px-4 py-3 text-left font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)]"
                style={{ left: CHECKBOX_COL_W }}
              >
                {pkLabel}
              </th>
              {visibleColumns.map((col) => (
                <ColumnHeader
                  key={col.key}
                  column={col}
                  width={effectiveWidth(col)}
                  menuOpen={openMenuKey === col.key}
                  isEnriching={enrichingColKey === col.key}
                  onMenuToggle={() =>
                    setOpenMenuKey((cur) => (cur === col.key ? null : col.key))
                  }
                  onMenuClose={() => setOpenMenuKey(null)}
                  onRunEnrichment={() => setRunColumnKey(col.key)}
                  onResizePreview={(w) =>
                    setLiveWidths((cur) => ({ ...cur, [col.key]: w }))
                  }
                  onResizeCommit={async (w) => {
                    setLiveWidths((cur) => {
                      const next = { ...cur };
                      delete next[col.key];
                      return next;
                    });
                    await persistColumnPatch(col.key, { width: w });
                  }}
                  onHide={async () => {
                    setOpenMenuKey(null);
                    await persistColumnPatch(col.key, { hidden: true });
                  }}
                  onUnhide={async () => {
                    setOpenMenuKey(null);
                    await persistColumnPatch(col.key, { hidden: false });
                  }}
                  onDelete={async () => {
                    setOpenMenuKey(null);
                    await persistColumnDelete(col.key);
                  }}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selectedIds.has(row._id);
              const isHidden = row.hidden === true;
              const rowClasses = [
                'border-b border-[color:var(--rule)]/60 group',
                isSelected ? 'bg-[color:var(--ember)]/5' : 'hover:bg-[color:var(--paper-3)]/40',
                isHidden ? 'opacity-55' : '',
              ].join(' ');
              const stickyBg = isSelected
                ? 'bg-[color:var(--ember)]/5'
                : 'bg-[color:var(--paper)] group-hover:bg-[color:var(--paper-3)]/40';
              return (
                <tr key={row._id} className={rowClasses}>
                  <td className={`sticky left-0 z-10 ${stickyBg} border-r border-[color:var(--rule)] px-3 py-2.5`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(row._id)}
                      aria-label={`Select row ${row.primaryKey}`}
                      className="accent-[color:var(--ember)] cursor-pointer"
                    />
                  </td>
                  <td
                    className={`sticky z-10 ${stickyBg} border-r border-[color:var(--rule)] px-4 py-2.5  text-[13px] text-[color:var(--ink)]`}
                    style={{ left: CHECKBOX_COL_W }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{row.primaryKey}</span>
                      {isHidden && (
                        <span className="shrink-0 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] border border-[color:var(--rule)] px-1.5 py-0.5 rounded-full">
                          Hidden
                        </span>
                      )}
                    </div>
                  </td>
                  {visibleColumns.map((col) => (
                    <EditableCell
                      key={col.key}
                      table={table}
                      row={row}
                      column={col}
                      workspaceId={workspaceId}
                      onSaved={onRowChanged}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {runColumnKey && (
        <RunEnrichmentDialog
          table={table}
          columnKey={runColumnKey}
          workspaceId={workspaceId}
          onClose={() => setRunColumnKey(null)}
          onLaunched={async (ck) => {
            onEnrichingStart?.(ck);
            setRunColumnKey(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Column header — resize handle + kebab menu ──────────────────── */

function ColumnHeader({
  column,
  width,
  menuOpen,
  isEnriching,
  onMenuToggle,
  onMenuClose,
  onRunEnrichment,
  onResizePreview,
  onResizeCommit,
  onHide,
  onUnhide,
  onDelete,
}: {
  column: ColumnDef;
  width: number;
  menuOpen: boolean;
  isEnriching?: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onRunEnrichment: () => void;
  onResizePreview: (w: number) => void;
  onResizeCommit: (w: number) => Promise<void>;
  onHide: () => Promise<void>;
  onUnhide: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const isEnriched = column.definition?.type === 'enriched';
  const isHidden = column.hidden === true;
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function onResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startW: width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const next = Math.min(COL_MAX_W, Math.max(COL_MIN_W, dragRef.current.startW + dx));
    onResizePreview(next);
  }
  function onResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const next = Math.min(COL_MAX_W, Math.max(COL_MIN_W, dragRef.current.startW + dx));
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (Math.abs(next - width) > 1) void onResizeCommit(next);
  }

  return (
    <th
      className={`relative px-3 py-3 text-left font-mono text-[10px] tracking-[0.18em] uppercase border-r border-[color:var(--rule)] last:border-r-0 align-top ${
        isHidden ? 'bg-[color:var(--paper-3)]/60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate ${isHidden ? 'text-[color:var(--ink-3)] line-through' : 'text-[color:var(--ink-2)]'}`}>
              {column.label}
            </span>
            {isEnriched && (
              <span className="font-mono text-[8.5px] text-[color:var(--ember)] whitespace-nowrap">
                AI
              </span>
            )}
            {isEnriching && (
              <span
                className="font-mono text-[8.5px] text-[color:var(--ember)] animate-pulse whitespace-nowrap"
                title="Enriching…"
              >
                ⟳
              </span>
            )}
            {isHidden && (
              <span className="font-mono text-[8.5px] text-[color:var(--ink-3)] whitespace-nowrap">
                hidden
              </span>
            )}
          </div>
          <div className="font-mono text-[9px] text-[color:var(--ink-3)] mt-0.5 normal-case tracking-normal">
            {column.type}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isEnriched && !isHidden && (
            <button
              onClick={onRunEnrichment}
              className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ember)] hover:text-[color:var(--ink)] transition"
              title="Re-run enrichment on this column"
            >
              Run →
            </button>
          )}
          <button
            onClick={onMenuToggle}
            aria-label="Column actions"
            className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)] px-1 font-mono text-[14px] leading-none"
          >
            ⋯
          </button>
        </div>
      </div>

      {menuOpen && (
        <ColumnMenuPopover
          column={column}
          confirmDelete={confirmDelete}
          onAskConfirmDelete={() => setConfirmDelete(true)}
          onCancelConfirmDelete={() => setConfirmDelete(false)}
          onClose={() => {
            setConfirmDelete(false);
            onMenuClose();
          }}
          onHide={onHide}
          onUnhide={onUnhide}
          onDelete={onDelete}
        />
      )}

      {/* Resize handle — a 6px strip hanging off the right edge. Uses
          pointer-capture so the drag survives even when the pointer leaves
          the strip (common when widening past the viewport). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.label}`}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        className="absolute top-0 right-0 h-full w-[6px] cursor-col-resize select-none touch-none group/handle"
      >
        <div className="absolute right-[2px] top-0 h-full w-[2px] bg-transparent group-hover/handle:bg-[color:var(--ember)]/50 transition-colors" />
      </div>
    </th>
  );
}

function ColumnMenuPopover({
  column,
  confirmDelete,
  onAskConfirmDelete,
  onCancelConfirmDelete,
  onClose,
  onHide,
  onUnhide,
  onDelete,
}: {
  column: ColumnDef;
  confirmDelete: boolean;
  onAskConfirmDelete: () => void;
  onCancelConfirmDelete: () => void;
  onClose: () => void;
  onHide: () => Promise<void>;
  onUnhide: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  // Close on outside click. We register once per open instance — menuOpen
  // gating is done by the parent, so this listener's lifetime is short.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    }
    // Use capture to run before any bubbling handler that might stopPropagation.
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onClose]);

  const isHidden = column.hidden === true;

  return (
    <div
      ref={rootRef}
      className="absolute top-full right-1 mt-1 z-40 w-[180px] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] py-1 normal-case tracking-normal"
    >
      {isHidden ? (
        <MenuItem onClick={() => void onUnhide()}>Unhide column</MenuItem>
      ) : (
        <MenuItem onClick={() => void onHide()}>Hide column</MenuItem>
      )}
      <div className="h-px bg-[color:var(--rule)] my-1" />
      {confirmDelete ? (
        <div className="px-3 py-2">
          <p className=" text-[12px] text-[color:var(--ink-2)] mb-2 leading-snug">
            Delete column and purge every cell? This is permanent.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancelConfirmDelete}
              className=" text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
            >
              Cancel
            </button>
            <button
              onClick={() => void onDelete()}
              className="ml-auto inline-flex items-center bg-[color:var(--warn)] text-[color:var(--paper)] hover:opacity-90 px-2.5 py-1 rounded-full  text-[12px] font-medium transition"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <MenuItem danger onClick={onAskConfirmDelete}>
          Delete column…
        </MenuItem>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5  text-[13px] transition ${
        danger
          ? 'text-[color:var(--warn)] hover:bg-[color:var(--warn)]/10'
          : 'text-[color:var(--ink)] hover:bg-[color:var(--paper-3)]'
      }`}
    >
      {children}
    </button>
  );
}

/* ── Bulk action bar ──────────────────────────────────────────────
 *
 * Sticky at the top of the viewport while rows are selected. Three
 * actions: hide (soft, reversible), unhide (inverse), delete (hard,
 * requires confirmation).
 *
 * We intentionally don't hide this inline; it sticks so the user can
 * select rows anywhere in a long list and the action is always
 * reachable without scrolling back up. */

function BulkActionBar({
  table,
  workspaceId,
  selectedIds,
  onCleared,
  onChanged,
}: {
  table: DataTable;
  workspaceId: string;
  selectedIds: Set<string>;
  onCleared: () => void;
  onChanged: () => Promise<void>;
}) {
  const [running, setRunning] = useState<null | 'hide' | 'unhide' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'hide' | 'unhide' | 'delete') {
    setRunning(action);
    setError(null);
    try {
      await apiFetch<ApiResponse<{ matched: number; modified: number }>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/rows/bulk-action`,
        {
          method: 'POST',
          body: JSON.stringify({
            rowIds: Array.from(selectedIds),
            action,
          }),
        },
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setRunning(null);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="sticky top-4 z-30 mb-4 border border-[color:var(--ink)] bg-[color:var(--paper)] rounded-sm shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 px-4 py-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className=" text-[20px] text-[color:var(--ink)]">
            {selectedIds.size}
          </span>
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)]">
            {selectedIds.size === 1 ? 'row selected' : 'rows selected'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void run('hide')}
            disabled={running !== null}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] hover:border-[color:var(--ink)] px-3 py-1.5 rounded-full  text-[12.5px] text-[color:var(--ink)] transition disabled:opacity-40"
          >
            {running === 'hide' ? 'Hiding…' : 'Hide'}
          </button>
          <button
            onClick={() => void run('unhide')}
            disabled={running !== null}
            className="inline-flex items-center gap-2 border border-[color:var(--rule)] hover:border-[color:var(--ink)] px-3 py-1.5 rounded-full  text-[12.5px] text-[color:var(--ink)] transition disabled:opacity-40"
          >
            {running === 'unhide' ? 'Restoring…' : 'Unhide'}
          </button>
          {confirmDelete ? (
            <>
              <span className=" italic text-[12px] text-[color:var(--ink-2)]">
                Permanent — are you sure?
              </span>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={running !== null}
                className=" text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={() => void run('delete')}
                disabled={running !== null}
                className="inline-flex items-center gap-2 bg-[color:var(--warn)] text-[color:var(--paper)] hover:opacity-90 px-3 py-1.5 rounded-full  text-[12.5px] font-medium transition disabled:opacity-40"
              >
                {running === 'delete' ? 'Deleting…' : 'Yes, delete'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={running !== null}
              className="inline-flex items-center gap-2 border border-[color:var(--warn)] text-[color:var(--warn)] hover:bg-[color:var(--warn)] hover:text-[color:var(--paper)] px-3 py-1.5 rounded-full  text-[12.5px] transition disabled:opacity-40"
            >
              Delete
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-[color:var(--rule)]" aria-hidden />
          <button
            onClick={onCleared}
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
          >
            Clear
          </button>
        </div>
      </div>
      {error && (
        <div className="border-t border-[color:var(--rule)] border-l-2 border-l-[color:var(--warn)] px-4 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}
    </div>
  );
}

function pkLabelForRowType(t: string): string {
  switch (t) {
    case 'company': return 'Domain / name';
    case 'person': return 'Email / LinkedIn';
    case 'url': return 'URL';
    default: return 'Key';
  }
}

/* ── Editable cell ────────────────────────────────────────────── */

function EditableCell({
  table,
  row,
  column,
  workspaceId,
  onSaved,
}: {
  table: DataTable;
  row: DataTableRow;
  column: ColumnDef;
  workspaceId: string;
  onSaved: () => Promise<void>;
}) {
  // Cells map comes back from Mongo. When a row has no cell for this column
  // the value is undefined; we render empty.
  const cellsRecord = asCellsRecord(row.cells);
  const cell = cellsRecord[column.key];
  const rawValue = cell && typeof cell === 'object' && 'value' in cell
    ? (cell as { value: unknown }).value
    : cell;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(valueToString(rawValue));
  const [saving, setSaving] = useState(false);

  const isEnrichedColumn = column.definition?.type === 'enriched';
  const [reEnriching, setReEnriching] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; right: number } | null>(null);
  const sourcePopoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSources) return;
    // Calculate fixed position from button's bounding rect
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    function handleOutsideClick(e: MouseEvent) {
      if (sourcePopoverRef.current && !sourcePopoverRef.current.contains(e.target as Node)) {
        setShowSources(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSources]);

  async function handleReEnrich(e: React.MouseEvent) {
    e.stopPropagation(); // prevent entering edit mode
    if (reEnriching) return;
    setReEnriching(true);
    try {
      await apiFetch<ApiResponse<unknown>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${column.key}/rows/${row._id}/enrich`,
        { method: 'POST' },
      );
      await onSaved();
    } catch {
      // keep existing cell value on error
    } finally {
      setReEnriching(false);
    }
  }

  const displayValue = useMemo(() => formatCell(rawValue, column.type), [rawValue, column.type]);
  const tone = useMemo(
    () => classifyCell({ columnKey: column.key, value: rawValue }),
    [column.key, rawValue],
  );
  const toneCls = toneClasses(tone);

  const hasSource: boolean = Boolean(
    cell &&
    typeof cell === 'object' &&
    'sources' in cell &&
    Array.isArray((cell as { sources?: unknown[] }).sources) &&
    ((cell as { sources: unknown[] }).sources.length > 0),
  );

  const cellSources = hasSource
    ? (cell as { sources: Array<{ dataSourceId?: string; invocationId?: string; sourceUrl?: string; confidence?: number; scrapedAt?: string }> }).sources
    : [];

  async function handleSave() {
    if (!editing) return;
    setEditing(false);
    if (draft === valueToString(rawValue)) return; // unchanged
    setSaving(true);
    try {
      const parsed = parseDraft(draft, column.type);
      await apiFetch<ApiResponse<unknown>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/rows/${row._id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ cells: { [column.key]: parsed } }),
        },
      );
      await onSaved();
    } catch {
      // Revert on error — the refetch will bring the actual stored value back.
      setDraft(valueToString(rawValue));
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <td className="border-r border-[color:var(--rule)] last:border-r-0 p-0 overflow-hidden">
        <input
          type="text"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void handleSave()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(valueToString(rawValue));
              setEditing(false);
            }
          }}
          className="w-full bg-[color:var(--ember)]/5 border border-[color:var(--ember)] px-3 py-2  text-[13px] text-[color:var(--ink)] outline-none"
        />
      </td>
    );
  }

  return (
    <td
      onClick={() => {
        setDraft(valueToString(rawValue));
        setEditing(true);
      }}
      className="border-r border-[color:var(--rule)] last:border-r-0 px-3 py-2.5 cursor-text group/cell relative overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        {tone === 'positive' || tone === 'negative' || tone === 'warning' ? (
          // Toned values render as a small pill so the color reads as
          // intentional categorization, not a styling accident.
          <span
            className={`inline-flex items-center px-2 py-0.5 border rounded-full font-mono text-[11px] tracking-[0.1em] uppercase whitespace-nowrap truncate min-w-0 ${toneCls.badge}`}
          >
            {saving
              ? <span className="italic">saving…</span>
              : displayValue || '—'}
          </span>
        ) : (
          <span
            className={` text-[13px] truncate min-w-0 ${
              rawValue === undefined || rawValue === null || rawValue === ''
                ? 'text-[color:var(--ink-3)]'
                : 'text-[color:var(--ink)]'
            }`}
          >
            {saving
              ? <span className="italic text-[color:var(--ink-3)]">saving…</span>
              : displayValue || '—'}
          </span>
        )}
        {hasSource && (
          <div ref={sourcePopoverRef} className="relative shrink-0">
            <button
              ref={buttonRef}
              onClick={(e) => {
                e.stopPropagation(); // don't enter edit mode
                setShowSources((v) => !v);
              }}
              title="View source"
              aria-label="View cell sources"
              className={`font-mono text-[8.5px] text-[color:var(--ember)] transition ${
                showSources ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'
              }`}
            >
              ◆
            </button>
            {showSources && (
              <div
                style={popoverPos ? { top: popoverPos.top, right: popoverPos.right } : undefined}
                className="fixed z-50 w-72 bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm shadow-lg p-3 flex flex-col gap-2"
              >
                <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
                  Sources
                </span>
                {cellSources.map((src, i) => (
                  <div key={i} className="flex flex-col gap-0.5 border-b border-[color:var(--rule)] last:border-b-0 pb-2 last:pb-0">
                    {src.sourceUrl ? (
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className=" text-[12px] text-[color:var(--ember)] hover:underline truncate"
                      >
                        {src.sourceUrl}
                      </a>
                    ) : (
                      <span className=" text-[12px] text-[color:var(--ink-3)] italic">
                        No URL
                      </span>
                    )}
                    <div className="flex gap-3 flex-wrap">
                      {src.dataSourceId && (
                        <span className="font-mono text-[9px] text-[color:var(--ink-3)]">
                          {src.dataSourceId}
                        </span>
                      )}
                      {typeof src.confidence === 'number' && (
                        <span className="font-mono text-[9px] text-[color:var(--ink-3)]">
                          {Math.round(src.confidence * 100)}% confidence
                        </span>
                      )}
                      {src.scrapedAt && (
                        <span className="font-mono text-[9px] text-[color:var(--ink-3)]">
                          {new Date(src.scrapedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {isEnrichedColumn && (
          <button
            onClick={handleReEnrich}
            title={reEnriching ? 'Enriching…' : 'Re-enrich this cell'}
            className={`shrink-0 font-mono text-[11px] text-[color:var(--ember)] transition ml-0.5 ${
              reEnriching
                ? 'animate-pulse opacity-100'
                : 'opacity-0 group-hover/cell:opacity-100'
            }`}
          >
            ↻
          </button>
        )}
      </div>
    </td>
  );
}

function asCellsRecord(cells: unknown): Record<string, unknown> {
  if (cells instanceof Map) return Object.fromEntries(cells.entries());
  if (cells && typeof cells === 'object') return cells as Record<string, unknown>;
  return {};
}

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function parseDraft(draft: string, type: ColumnValueType): unknown {
  const s = draft.trim();
  if (s === '') return null;
  switch (type) {
    case 'number':
    case 'currency':
    case 'percentage': {
      const n = Number(s);
      return isNaN(n) ? s : n;
    }
    case 'boolean': {
      if (s.toLowerCase() === 'true') return true;
      if (s.toLowerCase() === 'false') return false;
      return s;
    }
    case 'tags':
      return s.split(',').map((x) => x.trim()).filter(Boolean);
    default:
      return s;
  }
}

function formatCell(v: unknown, type: ColumnValueType): string {
  if (v === null || v === undefined || v === '') return '';
  switch (type) {
    case 'currency':
      return typeof v === 'number' ? `$${v.toLocaleString()}` : String(v);
    case 'percentage':
      return typeof v === 'number' ? `${v}%` : String(v);
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'boolean':
      return v === true ? '✓' : v === false ? '✗' : String(v);
    case 'date':
      if (typeof v === 'string') {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toLocaleDateString();
      }
      return String(v);
    default:
      return String(v);
  }
}

/* ── Add Column dialog ────────────────────────────────────────── */

const COLUMN_TYPES: Array<{ value: ColumnValueType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'tags', label: 'Tags' },
  { value: 'boolean', label: 'Boolean' },
];

function AddColumnDialog({
  table,
  workspaceId,
  onClose,
  onAdded,
}: {
  table: DataTable;
  workspaceId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<ColumnValueType>('text');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'static' | 'enriched'>('static');
  const [sourceId, setSourceId] = useState('');
  const [outputPath, setOutputPath] = useState('');
  // inputMappings: sourceField → column reference
  const [inputMappings, setInputMappings] = useState<
    Record<string, { kind: 'column'; key: string } | { kind: 'literal'; value: string } | { kind: 'row_type_id' }>
  >({});

  const key = useMemo(() => slugify(label), [label]);
  const keyConflict = table.columns.some((c) => c.key === key);

  const { data: sourcesResp } = useQuery({
    queryKey: ['data-sources', workspaceId],
    queryFn: () => apiFetch<ApiResponse<DataSourceSummary[]>>(
      `/api/v1/workspaces/${workspaceId}/data-sources`,
    ),
    enabled: mode === 'enriched' && Boolean(workspaceId),
    staleTime: 60_000,
  });
  const availableSources = sourcesResp?.data ?? [];
  const selectedSource = availableSources.find((s) => s.id === sourceId) ?? null;

  async function handleSave() {
    if (!label.trim() || !key) return;
    if (keyConflict) {
      setError('A column with this key already exists.');
      return;
    }
    if (mode === 'enriched' && !sourceId) {
      setError('Select a data source.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const definition =
        mode === 'enriched'
          ? { type: 'enriched' as const, sourceId, inputMappings, outputPath }
          : { type: 'static' as const };
      await apiFetch<ApiResponse<unknown>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns`,
        {
          method: 'POST',
          body: JSON.stringify({ key, label: label.trim(), type, definition }),
        },
      );
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Add column">
      <div className="flex flex-col gap-5">
        <LabeledInput
          label="Label"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Funding round"
          autoFocus
        />
        {key && (
          <div className="font-mono text-[10px] text-[color:var(--ink-3)]">
            Stored as <span className="text-[color:var(--ink)]">{key}</span>
          </div>
        )}
        <div>
          <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
            Value type
          </span>
          <div className="grid grid-cols-5 gap-2">
            {COLUMN_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`h-9 rounded-full  text-[12px] transition-colors ${
                  type === t.value
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'border border-[color:var(--rule)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-0 border border-[color:var(--rule)] rounded-full overflow-hidden w-fit">
          {(['static', 'enriched'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] uppercase transition-colors ${
                mode === m
                  ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                  : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
              }`}
            >
              {m === 'static' ? 'Manual' : 'Data source'}
            </button>
          ))}
        </div>

        {mode === 'enriched' && (
          <div className="flex flex-col gap-4 border border-[color:var(--rule)] rounded-sm px-4 py-4 bg-[color:var(--paper-3)]/60">
            {/* Source picker */}
            <div>
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                Data source
              </span>
              <select
                value={sourceId}
                onChange={(e) => {
                  setSourceId(e.target.value);
                  setInputMappings({});
                  setOutputPath('');
                }}
                className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5  text-[13px] text-[color:var(--ink)] outline-none"
              >
                <option value="">— Pick a source —</option>
                {availableSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Input mappings — one row per source input field */}
            {selectedSource && selectedSource.inputFields.length > 0 && (
              <div>
                <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                  Inputs
                </span>
                <div className="flex flex-col gap-2">
                  {selectedSource.inputFields.map((field) => {
                    const mapping = inputMappings[field.key];
                    return (
                      <div key={field.key} className="flex items-center gap-3">
                        <span className=" text-[12.5px] text-[color:var(--ink-2)] w-28 shrink-0">
                          {field.label}
                          {field.required && <span className="text-[color:var(--warn)]"> *</span>}
                        </span>
                        <select
                          value={mapping?.kind === 'column' ? mapping.key : ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            setInputMappings((cur) => {
                              const next = { ...cur };
                              if (!v) delete next[field.key];
                              else next[field.key] = { kind: 'column', key: v };
                              return next;
                            });
                          }}
                          className="flex-1 bg-transparent border-b border-[color:var(--rule)] py-1  text-[12.5px] text-[color:var(--ink)] outline-none"
                        >
                          <option value="">— Column —</option>
                          {table.columns.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Output field picker */}
            {selectedSource && selectedSource.outputFields.length > 0 && (
              <div>
                <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                  Extract field
                </span>
                <select
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  className="w-full bg-transparent border-b border-[color:var(--rule)] py-1.5  text-[13px] text-[color:var(--ink)] outline-none"
                >
                  <option value="">— Whole response —</option>
                  {selectedSource.outputFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label} ({f.key})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!label.trim() || saving || keyConflict || (mode === 'enriched' && !sourceId)}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
        >
          {saving ? 'Adding…' : 'Add column'}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Add Row dialog ───────────────────────────────────────────── */

function AddRowDialog({
  table,
  workspaceId,
  onClose,
  onAdded,
}: {
  table: DataTable;
  workspaceId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [primaryKey, setPrimaryKey] = useState('');
  const [cells, setCells] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!primaryKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Only send cells the user filled — empty strings become undefined,
      // which the backend treats as "don't set this column."
      const cellsPayload: Record<string, unknown> = {};
      for (const col of table.columns) {
        const raw = cells[col.key];
        if (raw !== undefined && raw !== '') {
          cellsPayload[col.key] = parseDraft(raw, col.type);
        }
      }
      await apiFetch<ApiResponse<unknown>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/rows`,
        {
          method: 'POST',
          body: JSON.stringify({
            primaryKey: primaryKey.trim(),
            cells: cellsPayload,
          }),
        },
      );
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Add row">
      <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
        <LabeledInput
          label={`${pkLabelForRowType(table.rowType)} (primary key)`}
          value={primaryKey}
          onChange={setPrimaryKey}
          placeholder={primaryKeyPlaceholder(table.rowType)}
          autoFocus
        />
        {table.columns.map((col) => (
          <LabeledInput
            key={col.key}
            label={`${col.label} (${col.type})`}
            value={cells[col.key] ?? ''}
            onChange={(v) => setCells({ ...cells, [col.key]: v })}
            placeholder={col.type === 'tags' ? 'tag1, tag2, tag3' : ''}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!primaryKey.trim() || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
        >
          {saving ? 'Adding…' : 'Add row'}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Seed from job dialog ─────────────────────────────────────── */

function SeedFromJobDialog({
  table,
  workspaceId,
  onClose,
  onSeeded,
}: {
  table: DataTable;
  workspaceId: string;
  onClose: () => void;
  onSeeded: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['jobs-complete', workspaceId],
    queryFn: () => apiFetch<ApiResponse<ProspectingJob[]> & { total: number }>(
      `/api/v1/workspaces/${workspaceId}/jobs?limit=20&status=complete`,
    ),
    enabled: Boolean(workspaceId),
  });

  const jobs = data?.data ?? [];
  const [selectedId, setSelectedId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const incompatible = table.rowType !== 'company';

  async function handleSeed() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<ApiResponse<{ inserted: number; skipped: number; duplicates: number }>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/seed-from-job`,
        {
          method: 'POST',
          body: JSON.stringify({ jobId: selectedId }),
        },
      );
      onSeeded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
      setSaving(false);
    }
  }

  if (incompatible) {
    return (
      <Dialog onClose={onClose} title="Seed from search">
        <p className=" text-[14px] text-[color:var(--ink-2)]">
          Seeding from searches works for <span className="text-[color:var(--ink)]">company</span>-type tables in v1.
          This table is <span className="text-[color:var(--ink)]">{table.rowType}</span>.
        </p>
        <DialogFooter>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium"
          >
            Close
          </button>
        </DialogFooter>
      </Dialog>
    );
  }

  return (
    <Dialog onClose={onClose} title="Seed from search">
      <p className=" text-[13.5px] leading-[1.55] text-[color:var(--ink-2)] mb-5">
        Pick a completed search and we&rsquo;ll append its leads as rows. Standard fields (company name, domain, email, phone, top contact) auto-map onto matching columns.
      </p>

      {jobs.length === 0 ? (
        <p className=" italic text-[13px] text-[color:var(--ink-3)]">
          No completed searches yet.
        </p>
      ) : (
        <div className="border-t border-[color:var(--rule)] max-h-[50vh] overflow-y-auto">
          {jobs.map((j) => {
            const selected = selectedId === j._id;
            const leads = j.result?.totalLeadsFound ?? 0;
            return (
              <button
                key={j._id}
                onClick={() => setSelectedId(j._id)}
                className={`w-full grid grid-cols-[1fr_auto] gap-4 items-baseline py-3 px-3 border-b border-[color:var(--rule)] text-left transition ${
                  selected
                    ? 'bg-[color:var(--ember)]/5 border-l-2 border-l-[color:var(--ember)]'
                    : 'hover:bg-[color:var(--paper-3)]/50'
                }`}
              >
                <div className="min-w-0">
                  <div className=" text-[13.5px] text-[color:var(--ink)] truncate">
                    &ldquo;{j.rawQuery}&rdquo;
                  </div>
                  <div className="font-mono text-[10px] text-[color:var(--ink-3)] mt-0.5">
                    {new Date(j.completedAt ?? j.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  {leads.toLocaleString()} leads
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSeed()}
          disabled={!selectedId || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
        >
          {saving ? 'Seeding…' : 'Seed rows'}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Save as workflow dialog (Phase 11 M1) ─────────────────────
 *
 * Snapshots the current table's shape (rowType + columns) into a stored
 * Workflow. If the table traces back to a dispatch, offers to capture
 * that dispatch's rawQuery as the workflow's seed template — the user
 * can edit the query and add {{placeholders}} on the workflow detail
 * page afterwards.
 */

function SaveAsWorkflowDialog({
  table,
  workspaceId,
  onClose,
}: {
  table: DataTable;
  workspaceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(table.name);
  const [description, setDescription] = useState(table.description ?? '');
  const [includeSeed, setIncludeSeed] = useState<boolean>(Boolean(table.sourceJobId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed toggle is only meaningful when the table has a dispatch lineage.
  // When absent, we keep the toggle disabled but show a hint so the user
  // understands why.
  const canIncludeSeed = Boolean(table.sourceJobId);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const resp = await apiFetch<ApiResponse<Workflow>>(
        `/api/v1/workspaces/${workspaceId}/workflows/from-table/${table._id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            includeSeed: canIncludeSeed && includeSeed,
          }),
        },
      );
      const workflowId = resp?.data?._id;
      if (workflowId) {
        router.push(`/dashboard/workflows/${workflowId}`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setSaving(false);
    }
  }

  return (
    <Dialog onClose={onClose} title="Save as workflow">
      <p className=" text-[13.5px] leading-[1.55] text-[color:var(--ink-2)] mb-5">
        Captures this table&rsquo;s columns and definitions as a reusable template. Running the workflow later creates a fresh table with the same shape — and, if you capture the seed query below, runs an agent search to populate it.
      </p>

      <div className="flex flex-col gap-5">
        <LabeledInput
          label="Workflow name"
          value={name}
          onChange={setName}
          placeholder="e.g. Series A Nigerian fintechs + funding"
          autoFocus
        />
        <LabeledInput
          label="Description (optional)"
          value={description}
          onChange={setDescription}
          placeholder="What does this workflow research?"
        />

        <label className={`flex items-start gap-2  text-[13px] ${canIncludeSeed ? 'text-[color:var(--ink)] cursor-pointer' : 'text-[color:var(--ink-3)] cursor-not-allowed'}`}>
          <input
            type="checkbox"
            checked={canIncludeSeed && includeSeed}
            disabled={!canIncludeSeed}
            onChange={(e) => setIncludeSeed(e.target.checked)}
            className="accent-[color:var(--ember)] mt-0.5"
          />
          <span>
            Capture this table&rsquo;s search query as the workflow seed
            <span className="block  italic text-[11.5px] text-[color:var(--ink-3)] mt-0.5">
              {canIncludeSeed
                ? 'You can add {{placeholders}} to the query after saving.'
                : 'This table was not seeded from a search — no seed query to capture.'}
            </span>
          </span>
        </label>
      </div>

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={!name.trim() || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-5 py-2.5 rounded-full  text-[13px] font-medium transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save workflow →'}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

/* ── Shared dialog chrome ─────────────────────────────────────── */

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[color:var(--ink)]/40" onClick={onClose} aria-hidden />
      <div className="relative w-[min(92vw,560px)] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm">
        <div className="p-8 md:p-10">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)] block mb-2">
            {title}
          </span>
          {children}
        </div>
      </div>
    </div>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 mt-6 pt-5 border-t border-[color:var(--rule)]">
      {children}
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
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-1.5">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 outline-none  text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
      />
    </label>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
}

function primaryKeyPlaceholder(rt: string): string {
  switch (rt) {
    case 'company': return 'paystack.com';
    case 'person': return 'alice@company.com';
    case 'url': return 'https://example.com/report';
    default: return '';
  }
}

/* ── Run enrichment dialog (Phase 15D) ────────────────────────── */

function RunEnrichmentDialog({
  table,
  columnKey,
  workspaceId,
  onClose,
  onLaunched,
}: {
  table: DataTable;
  columnKey: string;
  workspaceId: string;
  onClose: () => void;
  onLaunched: (columnKey: string) => Promise<void>;
}) {
  const column = table.columns.find((c) => c.key === columnKey);
  const [skipExisting, setSkipExisting] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: estimateResp, isLoading } = useQuery({
    queryKey: ['enrich-estimate', workspaceId, table._id, columnKey, skipExisting],
    queryFn: () => apiFetch<ApiResponse<{
      rowsSelected: number;
      rowsWithResolvableInputs: number;
      rowsAlreadyFilled: number;
      rowsMissingInputs: number;
      estimatedCostUSD: number;
    }>>(
      `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${columnKey}/estimate`,
      { method: 'POST', body: JSON.stringify({ skipExisting }) },
    ),
    enabled: Boolean(workspaceId && table._id && columnKey),
  });
  const est = estimateResp?.data;

  async function handleLaunch() {
    setLaunching(true);
    setError(null);
    try {
      await apiFetch<ApiResponse<{ enrichmentRunId: string; jobsEnqueued: number }>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${columnKey}/run`,
        { method: 'POST', body: JSON.stringify({ skipExisting }) },
      );
      await onLaunched(columnKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
      setLaunching(false);
    }
  }

  if (!column) return null;

  return (
    <Dialog onClose={onClose} title={`Run enrichment · ${column.label}`}>
      <div className="flex flex-col gap-5">
        <label className="flex items-center gap-3  text-[13.5px] text-[color:var(--ink)]">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
            className="accent-[color:var(--ember)]"
          />
          Skip rows that already have a value in this column
        </label>

        {isLoading && !est ? (
          <p className=" italic text-[13px] text-[color:var(--ink-3)]">
            Estimating…
          </p>
        ) : est ? (
          <div className="bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded-sm p-4 flex flex-col gap-2">
            <Row label="Rows selected" value={String(est.rowsSelected)} />
            <Row label="Will enrich" value={String(est.rowsWithResolvableInputs)} emphasize />
            {est.rowsAlreadyFilled > 0 && (
              <Row label="Already filled" value={String(est.rowsAlreadyFilled)} muted />
            )}
            {est.rowsMissingInputs > 0 && (
              <Row label="Missing required inputs" value={String(est.rowsMissingInputs)} muted />
            )}
            <Row
              label="Estimated cost"
              value={fmtUsdStatic(est.estimatedCostUSD)}
              emphasize
            />
          </div>
        ) : null}

        <p className=" italic text-[12px] text-[color:var(--ink-3)]">
          Each eligible row becomes one background job. Progress shows in the invocation log.
        </p>
      </div>

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleLaunch()}
          disabled={launching || !est || est.rowsWithResolvableInputs === 0}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
        >
          {launching ? 'Launching…' : `Enrich ${est?.rowsWithResolvableInputs ?? 0} rows`}
        </button>
      </DialogFooter>
    </Dialog>
  );
}

function Row({ label, value, emphasize, muted }: { label: string; value: string; emphasize?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={` text-[13px] ${muted ? 'text-[color:var(--ink-3)]' : 'text-[color:var(--ink-2)]'}`}>
        {label}
      </span>
      <span className={`font-mono tabular-nums ${emphasize ? 'text-[15px] text-[color:var(--ink)]' : 'text-[12.5px] text-[color:var(--ink-2)]'}`}>
        {value}
      </span>
    </div>
  );
}

function fmtUsdStatic(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

/* ── Action modal — primary enrichment UX (v1) ────────────────
 *
 * Pick action → (auto-detect inputs → allow override) → output
 * column config → run. Under the hood writes the same
 * column.definition = enriched the power-user Connect flow produced,
 * and dispatches the same enrichment worker.
 */

type InputMappingValue =
  | { kind: 'column'; key: string }
  | { kind: 'literal'; value: string }
  | { kind: 'row_type_id' };

interface ActionAvailabilityEntry {
  action: DataSourceAction;
  available: boolean;
  unavailableReason?: 'missing_credentials' | 'source_not_registered';
  requiresCredentialForSourceId?: string;
}

function ActionModal({
  table,
  workspaceId,
  onClose,
  onLaunched,
}: {
  table: DataTable;
  workspaceId: string;
  onClose: () => void;
  onLaunched: (columnKey: string) => Promise<void>;
}) {
  const { data: actionsResp, isLoading } = useQuery({
    queryKey: ['table-actions', workspaceId, table._id],
    queryFn: () => apiFetch<ApiResponse<ActionAvailabilityEntry[]>>(
      `/api/v1/workspaces/${workspaceId}/tables/${table._id}/actions`,
    ),
    enabled: Boolean(workspaceId && table._id),
  });

  const entries = actionsResp?.data ?? [];
  const [selectedId, setSelectedId] = useState<string>('');
  const selected = entries.find((e) => e.action.id === selectedId);

  return (
    <Dialog onClose={onClose} title="Run action">
      {isLoading && !entries.length ? (
        <p className=" italic text-[13px] text-[color:var(--ink-3)]">
          Loading actions…
        </p>
      ) : !selectedId ? (
        <ActionCatalogList
          entries={entries}
          onPick={(id) => setSelectedId(id)}
        />
      ) : selected ? (
        <ActionConfigureStep
          table={table}
          workspaceId={workspaceId}
          entry={selected}
          onBack={() => setSelectedId('')}
          onLaunched={onLaunched}
        />
      ) : null}

      {!selectedId && (
        <DialogFooter>
          <button
            onClick={onClose}
            className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
          >
            Cancel
          </button>
        </DialogFooter>
      )}
    </Dialog>
  );
}

/* ── Step 1: catalog list ────────────────────────────────── */

function ActionCatalogList({
  entries,
  onPick,
}: {
  entries: ActionAvailabilityEntry[];
  onPick: (actionId: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className=" italic text-[13px] text-[color:var(--ink-3)]">
        No actions available for this table type.
      </p>
    );
  }

  const grouped = {
    verify: entries.filter((e) => e.action.category === 'verify'),
    find:   entries.filter((e) => e.action.category === 'find'),
    enrich: entries.filter((e) => e.action.category === 'enrich'),
  };

  return (
    <div className="flex flex-col gap-6 max-h-[65vh] overflow-y-auto pr-1">
      {(['verify', 'find', 'enrich'] as const).map((cat) => {
        const rows = grouped[cat];
        if (rows.length === 0) return null;
        return (
          <div key={cat}>
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-3">
              {cat}
            </span>
            <div className="flex flex-col gap-2">
              {rows.map((e) => {
                const { action, available } = e;
                return (
                  <button
                    key={action.id}
                    onClick={() => available && onPick(action.id)}
                    disabled={!available}
                    className={`text-left border border-[color:var(--rule)] rounded-sm px-4 py-3 transition ${
                      available
                        ? 'bg-[color:var(--paper-3)] hover:border-[color:var(--ink)]'
                        : 'bg-[color:var(--paper-3)]/50 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className=" text-[17px] leading-tight text-[color:var(--ink)]">
                          {action.label}
                        </div>
                        <p className="mt-1  text-[12.5px] leading-[1.45] text-[color:var(--ink-2)]">
                          {action.description}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] whitespace-nowrap">
                        {action.sourceDisplayName}
                      </span>
                    </div>
                    {!available && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--warn)]">
                          Needs credentials
                        </span>
                        <Link
                          href="/dashboard/settings/data-sources"
                          onClick={(evt) => evt.stopPropagation()}
                          className=" italic text-[11.5px] text-[color:var(--ember)] underline underline-offset-[3px]"
                        >
                          Connect {action.sourceDisplayName} →
                        </Link>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 2: configure + confirm ─────────────────────────── */

function ActionConfigureStep({
  table,
  workspaceId,
  entry,
  onBack,
  onLaunched,
}: {
  table: DataTable;
  workspaceId: string;
  entry: ActionAvailabilityEntry;
  onBack: () => void;
  onLaunched: (columnKey: string) => Promise<void>;
}) {
  const action = entry.action;

  // Auto-detect inputs on mount — first column whose type matches, fall
  // back to first column whose key matches a pattern.
  const initialMappings = useMemo<Record<string, InputMappingValue>>(() => {
    const out: Record<string, InputMappingValue> = {};
    for (const inp of action.inputs) {
      const match = pickMatchingColumn(table.columns, inp);
      if (match) out[inp.sourceInputKey] = { kind: 'column', key: match.key };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id]);

  const [mappings, setMappings] = useState<Record<string, InputMappingValue>>(initialMappings);

  // Output column config — defaults from the action, user can rename or
  // point at an existing column. Suffix numeric if default key collides.
  const [outputKey, setOutputKey] = useState(
    () => uniqueColumnKey(table.columns, action.output.defaultKey),
  );
  const [outputLabel, setOutputLabel] = useState(action.output.defaultLabel);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const effectiveKey = overwriteExisting ? outputKey : uniqueColumnKey(table.columns, outputKey);
  const willOverwrite = table.columns.some((c) => c.key === effectiveKey);

  const requiredMissing = action.inputs
    .filter((i) => i.required)
    .filter((i) => !mappings[i.sourceInputKey]);

  async function handleLaunch() {
    if (requiredMissing.length > 0) return;
    setLaunching(true);
    setError(null);
    try {
      await apiFetch<ApiResponse<{ enrichmentRunId: string; jobsEnqueued: number }>>(
        `/api/v1/workspaces/${workspaceId}/tables/${table._id}/actions/${action.id}/run`,
        {
          method: 'POST',
          body: JSON.stringify({
            inputMappings: mappings,
            outputColumn: {
              key: effectiveKey,
              label: outputLabel,
            },
            skipExisting,
          }),
        },
      );
      await onLaunched(effectiveKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
      setLaunching(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 max-h-[65vh] overflow-y-auto pr-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block">
            {action.sourceDisplayName}
          </span>
          <h3 className=" text-[22px] leading-tight text-[color:var(--ink)] mt-0.5">
            {action.label}
          </h3>
          <p className="mt-1  text-[12.5px] text-[color:var(--ink-2)]">
            {action.description}
          </p>
        </div>
        <button
          onClick={onBack}
          className="shrink-0 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
        >
          ← Change action
        </button>
      </div>

      {/* Inputs */}
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Inputs
        </span>
        <div className="flex flex-col gap-3">
          {action.inputs.map((inp) => (
            <ActionInputRow
              key={inp.sourceInputKey}
              input={inp}
              columns={table.columns}
              value={mappings[inp.sourceInputKey]}
              onChange={(v) =>
                setMappings((cur) => {
                  const next = { ...cur };
                  if (v === null) delete next[inp.sourceInputKey];
                  else next[inp.sourceInputKey] = v;
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>

      {/* Output */}
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Output → new column
        </span>
        <div className="grid grid-cols-2 gap-3">
          <SmallLabel
            label="Column label"
            value={outputLabel}
            onChange={setOutputLabel}
          />
          <SmallLabel
            label="Column key"
            value={outputKey}
            onChange={(v) => setOutputKey(slugify(v))}
            mono
          />
        </div>
        {willOverwrite && (
          <label className="mt-3 flex items-center gap-2  text-[12.5px] text-[color:var(--ink)]">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              className="accent-[color:var(--warn)]"
            />
            A column with this key already exists — {overwriteExisting ? 'overwrite its definition' : 'a suffix will be added'}
          </label>
        )}
      </div>

      {/* Scope */}
      <label className="flex items-center gap-2  text-[13px] text-[color:var(--ink)]">
        <input
          type="checkbox"
          checked={skipExisting}
          onChange={(e) => setSkipExisting(e.target.checked)}
          className="accent-[color:var(--ember)]"
        />
        Skip rows that already have a value in this column
      </label>

      {error && (
        <div className="border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <DialogFooter>
        <button
          onClick={onBack}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Back
        </button>
        <button
          onClick={() => void handleLaunch()}
          disabled={requiredMissing.length > 0 || !outputLabel.trim() || !outputKey.trim() || launching}
          title={
            requiredMissing.length > 0
              ? `Missing required input: ${requiredMissing.map((i) => i.label).join(', ')}`
              : !outputLabel.trim() ? 'Column label required'
              : !outputKey.trim() ? 'Column key required'
              : undefined
          }
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-5 py-2.5 rounded-full  text-[13px] font-medium transition-colors disabled:opacity-40"
        >
          {launching ? 'Running…' : 'Run action'}
        </button>
      </DialogFooter>
    </div>
  );
}

function ActionInputRow({
  input,
  columns,
  value,
  onChange,
}: {
  input: ActionInputSpec;
  columns: ColumnDef[];
  value: InputMappingValue | undefined;
  onChange: (v: InputMappingValue | null) => void;
}) {
  const kind = value?.kind ?? '';

  return (
    <div className="border border-[color:var(--rule)] bg-[color:var(--paper-3)]/50 rounded-sm px-3 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className=" text-[13px] text-[color:var(--ink)]">
            {input.label}
            {input.required && <span className="text-[color:var(--warn)]"> *</span>}
          </div>
          {input.hint && (
            <p className=" italic text-[11.5px] text-[color:var(--ink-3)] mt-0.5">
              {input.hint}
            </p>
          )}
        </div>
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value;
            if (!k) onChange(null);
            else if (k === 'column') onChange({ kind: 'column', key: '' });
            else if (k === 'literal') onChange({ kind: 'literal', value: '' });
            else if (k === 'row_type_id') onChange({ kind: 'row_type_id' });
          }}
          className="bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1 font-mono text-[11px] tracking-[0.1em] uppercase text-[color:var(--ink-2)] outline-none"
        >
          <option value="">—</option>
          <option value="column">Column</option>
          <option value="literal">Literal</option>
          <option value="row_type_id">Row ID</option>
        </select>
      </div>

      {kind === 'column' && (
        <select
          value={(value as { key: string }).key}
          onChange={(e) => onChange({ kind: 'column', key: e.target.value })}
          className="mt-2 w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5  text-[13px] text-[color:var(--ink)] outline-none"
        >
          <option value="">— Pick a column —</option>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {kind === 'literal' && (
        <input
          type="text"
          value={(value as { value: string }).value}
          onChange={(e) => onChange({ kind: 'literal', value: e.target.value })}
          placeholder="Hardcoded value (same on every row)"
          className="mt-2 w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5  text-[13px] text-[color:var(--ink)] outline-none"
        />
      )}
      {kind === 'row_type_id' && (
        <p className="mt-2  italic text-[12px] text-[color:var(--ink-3)]">
          Uses each row’s primary key (the value in the left-most column).
        </p>
      )}
    </div>
  );
}

function SmallLabel({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-1.5">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5 outline-none text-[color:var(--ink)] ${
          mono
            ? 'font-mono text-[12.5px]'
            : ' text-[13.5px]'
        }`}
      />
    </label>
  );
}

/* ── Auto-input matching ───────────────────────────────── */

function pickMatchingColumn(
  columns: ColumnDef[],
  spec: ActionInputSpec,
): ColumnDef | undefined {
  // Type match first (stronger signal), then key-pattern match.
  if (spec.matchColumnTypes?.length) {
    const byType = columns.find((c) => spec.matchColumnTypes!.includes(c.type));
    if (byType) return byType;
  }
  if (spec.matchColumnKeyPatterns?.length) {
    for (const pattern of spec.matchColumnKeyPatterns) {
      try {
        const re = new RegExp(pattern, 'i');
        const byKey = columns.find((c) => re.test(c.key));
        if (byKey) return byKey;
      } catch {
        // Bad regex in catalog — ignore this pattern, try next.
      }
    }
  }
  return undefined;
}

function uniqueColumnKey(columns: ColumnDef[], desired: string): string {
  const taken = new Set(columns.map((c) => c.key));
  if (!taken.has(desired)) return desired;
  let n = 2;
  while (taken.has(`${desired}_${n}`)) n += 1;
  return `${desired}_${n}`;
}
