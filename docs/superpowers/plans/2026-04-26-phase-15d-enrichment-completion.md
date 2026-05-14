# Phase 15D — Column-Referenced Enrichment Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 15D by implementing the three remaining UX gaps: grid auto-refresh during enrichment runs, AddColumnDialog enrichment mode, and a single-cell re-enrich button.

**Architecture:** The backend is already 100% complete (service, worker, queue, executor, cost tracking, invocation log). The three remaining items are purely frontend. All changes live inside one file: `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` (~2240 lines). Each task is self-contained.

**Tech Stack:** Next.js App Router, React 18, TanStack Query v5, Tailwind CSS (editorial palette via CSS vars). All API calls go through `apiFetch` from `@/lib/api`. Shared types from `@leadreai/shared`.

---

## File Map

**Modified:**
- `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` — contains the full table page + all inline components

No new files are needed; all three tasks modify this one page file.

---

## Task 1 — Grid auto-refresh after enrichment dispatch

After clicking "Enrich N rows" or "Run action", the table's row data should automatically refresh every 3 s while enrichment is active. Currently, the dialog closes and nothing changes until the user manually navigates away and back.

**How it works:**
1. Add `enrichingColKey: string | null` state to `TableDetailPage`.
2. Modify `RunEnrichmentDialog.onLaunched` signature to `(columnKey: string) => Promise<void>`.
3. Modify `ActionModal`/`ActionConfigureStep.onLaunched` to pass the output column key back.
4. When `enrichingColKey` is set, pass `refetchInterval: 3000` to the rows `useQuery`.
5. Auto-stop after 120 s (via `useRef` tracking start time checked in the interval callback) or when all cells for that column are non-null.
6. Pass `enrichingColKey` down to `TableGrid` → `ColumnHeader` so the active column shows a "⟳" pulse indicator.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` (lines ~38–298, ~530–660, ~1638–1793, ~1794–2131)

---

- [ ] **Step 1.1 — Add `enrichingColKey` state to `TableDetailPage`**

In `TableDetailPage` (the `export default function TableDetailPage()` block, around line 44), add one state variable and a ref for the start time:

```tsx
const [enrichingColKey, setEnrichingColKey] = useState<string | null>(null);
const enrichingStartRef = useRef<number | null>(null);
```

Import `useRef` if not already imported (it is, at line 3).

- [ ] **Step 1.2 — Wire `refetchInterval` on the rows query**

The rows query is around line 61–67:

```tsx
const { data: rowsResp } = useQuery({
  queryKey: ['table-rows', workspaceId, tableId, showHidden],
  queryFn: () => apiFetch<ApiResponse<Paged<DataTableRow> & { hiddenCount?: number }>>(
    `/api/v1/workspaces/${workspaceId}/tables/${tableId}/rows?limit=200${showHidden ? '&includeHidden=true' : ''}`,
  ),
  enabled: Boolean(workspaceId && tableId),
});
```

Change to:

```tsx
const { data: rowsResp } = useQuery({
  queryKey: ['table-rows', workspaceId, tableId, showHidden],
  queryFn: () => apiFetch<ApiResponse<Paged<DataTableRow> & { hiddenCount?: number }>>(
    `/api/v1/workspaces/${workspaceId}/tables/${tableId}/rows?limit=200${showHidden ? '&includeHidden=true' : ''}`,
  ),
  enabled: Boolean(workspaceId && tableId),
  refetchInterval: enrichingColKey ? 3000 : false,
  // Each time the query runs while enriching, check whether we should stop.
  select: (data) => {
    if (enrichingColKey && data) {
      const rows = data.data?.data ?? [];
      // Stop if 120 s elapsed.
      const elapsed = enrichingStartRef.current ? Date.now() - enrichingStartRef.current : 0;
      if (elapsed > 120_000) {
        setEnrichingColKey(null);
        enrichingStartRef.current = null;
      } else if (rows.length > 0) {
        // Stop when every row has a non-null value for the column.
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
      }
    }
    return data;
  },
});
```

- [ ] **Step 1.3 — Modify `RunEnrichmentDialog.onLaunched` to pass the column key**

`RunEnrichmentDialog` receives `columnKey` as a prop and calls `onLaunched()` after a successful run. Change its `onLaunched` type from `() => Promise<void>` to `(columnKey: string) => Promise<void>` and call it with the key:

Current (around line 1649):
```tsx
onLaunched: () => Promise<void>;
```

New:
```tsx
onLaunched: (columnKey: string) => Promise<void>;
```

Current (around line 1680):
```tsx
await onLaunched();
```

New:
```tsx
await onLaunched(columnKey);
```

- [ ] **Step 1.4 — Update the `RunEnrichmentDialog` usage in `TableDetailPage`**

Around line 513–521, the dialog is rendered with `onLaunched`. Update it:

Current:
```tsx
{runColumnKey && (
  <RunEnrichmentDialog
    table={table}
    columnKey={runColumnKey}
    workspaceId={workspaceId ?? ''}
    onClose={() => setRunColumnKey(null)}
    onLaunched={async () => {
      setRunColumnKey(null);
    }}
  />
)}
```

New:
```tsx
{runColumnKey && (
  <RunEnrichmentDialog
    table={table}
    columnKey={runColumnKey}
    workspaceId={workspaceId ?? ''}
    onClose={() => setRunColumnKey(null)}
    onLaunched={async (ck) => {
      enrichingStartRef.current = Date.now();
      setEnrichingColKey(ck);
      setRunColumnKey(null);
    }}
  />
)}
```

- [ ] **Step 1.5 — Thread the column key through `ActionModal` and `ActionConfigureStep`**

`ActionModal.onLaunched` is currently `() => Promise<void>`. Change it to `(columnKey: string) => Promise<void>` throughout the call chain:

1. In `TableDetailPage` around line 278–288, change:

```tsx
{actionOpen && (
  <ActionModal
    table={table}
    workspaceId={workspaceId ?? ''}
    onClose={() => setActionOpen(false)}
    onLaunched={async () => {
      await invalidate();
      setActionOpen(false);
    }}
  />
)}
```

to:

```tsx
{actionOpen && (
  <ActionModal
    table={table}
    workspaceId={workspaceId ?? ''}
    onClose={() => setActionOpen(false)}
    onLaunched={async (ck) => {
      enrichingStartRef.current = Date.now();
      setEnrichingColKey(ck);
      await invalidate();
      setActionOpen(false);
    }}
  />
)}
```

2. In `ActionModal` (around line 1794–1850), change the prop type:

```tsx
onLaunched: () => Promise<void>;
```

to:

```tsx
onLaunched: (columnKey: string) => Promise<void>;
```

And pass it through to `ActionConfigureStep`:

```tsx
<ActionConfigureStep
  table={table}
  workspaceId={workspaceId}
  entry={selected}
  onBack={() => setSelectedId('')}
  onLaunched={onLaunched}
/>
```

3. In `ActionConfigureStep` (around line 1939–2131), change `onLaunched` prop type:

```tsx
onLaunched: () => Promise<void>;
```

to:

```tsx
onLaunched: (columnKey: string) => Promise<void>;
```

And in `handleLaunch` (around line 2005), replace `await onLaunched()` with `await onLaunched(effectiveKey)`.

- [ ] **Step 1.6 — Show ⟳ pulse indicator on the enriching column header**

Pass `enrichingColKey` from `TableDetailPage` down to `TableGrid`, and from there to `ColumnHeader`.

1. `TableGrid` is defined around line 308. Its current props don't include `enrichingColKey`. Add it:

In `TableGrid` props interface (around line 308–325), add:
```tsx
enrichingColKey?: string | null;
```

In `TableDetailPage`'s grid render (around line 233–242), pass it:
```tsx
<TableGrid
  table={table}
  rows={rows}
  workspaceId={workspaceId ?? ''}
  selectedIds={selectedRowIds}
  onSelectionChange={setSelectedRowIds}
  showHiddenCols={showHiddenCols}
  onRowChanged={invalidate}
  enrichingColKey={enrichingColKey}
/>
```

2. In `TableGrid`, pass `enrichingColKey` to each `ColumnHeader`. Find the `ColumnHeader` render call (around line 422–435):

```tsx
<ColumnHeader
  column={col}
  width={colWidths[col.key] ?? col.width ?? 160}
  menuOpen={openMenuKey === col.key}
  onMenuToggle={() => setOpenMenuKey(openMenuKey === col.key ? null : col.key)}
  onMenuClose={() => setOpenMenuKey(null)}
  onRunEnrichment={() => setRunColumnKey(col.key)}
  onResizePreview={(w) => setColWidths((cw) => ({ ...cw, [col.key]: w }))}
  onResizeCommit={async (w) => { ... }}
  onHide={async () => { ... }}
  onUnhide={async () => { ... }}
  onDelete={async () => { ... }}
/>
```

Add prop:
```tsx
isEnriching={enrichingColKey === col.key}
```

3. In `ColumnHeader` (around line 530–660), add `isEnriching` to the props interface and render a pulse spinner next to the "AI" badge:

Add to interface:
```tsx
isEnriching?: boolean;
```

In the column label row (around line 589–602), add after the `{isEnriched && ...}` badge:

```tsx
{isEnriching && (
  <span
    className="font-[family-name:var(--font-jetbrains-mono)] text-[8.5px] text-[color:var(--forest)] animate-pulse whitespace-nowrap"
    title="Enriching…"
  >
    ⟳
  </span>
)}
```

- [ ] **Step 1.7 — Verify types compile**

```bash
pnpm --filter frontend exec tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 1.8 — Manual smoke test**

1. Start dev servers: `pnpm dev` from the repo root.
2. Navigate to a table with enriched columns and some empty cells.
3. Click the "Run →" button in an enriched column's header.
4. In the `RunEnrichmentDialog`, click "Enrich N rows".
5. Observe: dialog closes, the column header shows "⟳ ⟳" pulsing, rows start populating every ~3 s.
6. Observe: ⟳ disappears when all cells are filled or after 2 min.

- [ ] **Step 1.9 — Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/tables/\[tableId\]/page.tsx
git commit -m "feat(tables): auto-refresh grid during enrichment run (Phase 15D polling)"
```

---

## Task 2 — AddColumnDialog enrichment mode

The `AddColumnDialog` currently only creates static columns, with a note "Enriched columns land with 15D". This task adds a "Source" toggle that lets power users bind a new column directly to any registered data source, bypassing the curated Actions catalog.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` (AddColumnDialog, lines ~1096–1206)

---

- [ ] **Step 2.1 — Fetch sources inside `AddColumnDialog`**

`AddColumnDialog` (around line 1096) currently has these state variables:
```tsx
const [label, setLabel] = useState('');
const [type, setType] = useState<ColumnValueType>('text');
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Add:
```tsx
const [mode, setMode] = useState<'static' | 'enriched'>('static');
const [sourceId, setSourceId] = useState('');
const [outputPath, setOutputPath] = useState('');
const [inputMappings, setInputMappings] = useState<Record<string, { kind: 'column'; key: string } | { kind: 'literal'; value: string } | { kind: 'row_type_id' }>>({});

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
```

- [ ] **Step 2.2 — Update `handleSave` to support enriched definition**

Replace the current `handleSave` (around line 1115–1140):

```tsx
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
```

- [ ] **Step 2.3 — Render the mode toggle and enrichment form in `AddColumnDialog`**

Replace the `return` body of `AddColumnDialog` (lines ~1143–1205) with:

```tsx
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
        <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[color:var(--ink-3)]">
          Stored as <span className="text-[color:var(--ink)]">{key}</span>
        </div>
      )}
      <div>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Value type
        </span>
        <div className="grid grid-cols-5 gap-2">
          {COLUMN_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`h-9 rounded-full font-[family-name:var(--font-barlow)] text-[12px] transition-colors ${
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
            className={`px-4 py-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase transition-colors ${
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
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
              Data source
            </span>
            <select
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setInputMappings({});
                setOutputPath('');
              }}
              className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)] outline-none"
            >
              <option value="">— Pick a source —</option>
              {availableSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Input mappings */}
          {selectedSource && selectedSource.inputFields.length > 0 && (
            <div>
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                Inputs
              </span>
              <div className="flex flex-col gap-2">
                {selectedSource.inputFields.map((field) => {
                  const mapping = inputMappings[field.key];
                  return (
                    <div key={field.key} className="flex items-center gap-3">
                      <span className="font-[family-name:var(--font-barlow)] text-[12.5px] text-[color:var(--ink-2)] w-28 shrink-0">
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
                        className="flex-1 bg-transparent border-b border-[color:var(--rule)] py-1 font-[family-name:var(--font-barlow)] text-[12.5px] text-[color:var(--ink)] outline-none"
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

          {/* Output path */}
          {selectedSource && selectedSource.outputFields.length > 0 && (
            <div>
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                Extract field
              </span>
              <select
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                className="w-full bg-transparent border-b border-[color:var(--rule)] py-1.5 font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)] outline-none"
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
      <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2 font-[family-name:var(--font-barlow)] text-[12.5px] text-[color:var(--ink)]">
        {error}
      </div>
    )}

    <DialogFooter>
      <button
        onClick={onClose}
        className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
      >
        Cancel
      </button>
      <button
        onClick={() => void handleSave()}
        disabled={!label.trim() || saving || keyConflict || (mode === 'enriched' && !sourceId)}
        className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-40"
      >
        {saving ? 'Adding…' : 'Add column'}
      </button>
    </DialogFooter>
  </Dialog>
);
```

- [ ] **Step 2.4 — Verify types compile**

```bash
pnpm --filter frontend exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 2.5 — Manual smoke test**

1. Open a table, click "Add column +".
2. Click "Data source" toggle. Confirm the source picker appears.
3. Select "apollo.organization_enrich". Confirm input fields appear (domain).
4. Map domain to an existing URL column. Select output field "organization.industry".
5. Click "Add column" — confirm the column appears in the table header with "AI" badge.
6. Click "Run →" in the new column's header to enrich it.

- [ ] **Step 2.6 — Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/tables/\[tableId\]/page.tsx
git commit -m "feat(tables): AddColumnDialog enrichment mode — direct source binding (Phase 15D)"
```

---

## Task 3 — Single-cell re-enrich button

When a cell was filled by a data source (`filledBy: 'data_source'`) and its column is enriched, hovering the cell should show a "↻" button that re-runs enrichment for just that row. This calls the existing `enrichSingleRow` backend endpoint.

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/tables/[tableId]/page.tsx` (`EditableCell`, lines ~893–1021)

---

- [ ] **Step 3.1 — Add `isEnriching` state and re-enrich handler to `EditableCell`**

In `EditableCell` (around line 893), add after the existing state declarations:

```tsx
const isEnrichedColumn = column.definition?.type === 'enriched';
const [reEnriching, setReEnriching] = useState(false);

async function handleReEnrich(e: React.MouseEvent) {
  e.stopPropagation(); // don't enter edit mode
  setReEnriching(true);
  try {
    await apiFetch<ApiResponse<unknown>>(
      `/api/v1/workspaces/${workspaceId}/tables/${table._id}/columns/${column.key}/rows/${row._id}/enrich`,
      { method: 'POST' },
    );
    await onSaved();
  } catch {
    // Silently fail — the cell keeps its existing value.
  } finally {
    setReEnriching(false);
  }
}
```

- [ ] **Step 3.2 — Add the re-enrich button to the non-editing cell render**

In the non-editing `<td>` return (around line 979–1021), inside the `<div className="flex items-center justify-between ...">`, add the button after the existing `{hasSource && ...}` element:

```tsx
{isEnrichedColumn && !reEnriching && (
  <button
    onClick={handleReEnrich}
    title="Re-enrich this cell"
    className="shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[color:var(--forest)] opacity-0 group-hover/cell:opacity-100 transition ml-1"
  >
    ↻
  </button>
)}
{reEnriching && (
  <span className="shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[9px] text-[color:var(--forest)] animate-pulse">
    ↻
  </span>
)}
```

- [ ] **Step 3.3 — Verify types compile**

```bash
pnpm --filter frontend exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3.4 — Manual smoke test**

1. Open a table that has already had an enrichment run (cells with `filledBy: 'data_source'`).
2. Hover over one of the enriched cells. Confirm a small "↻" appears on the right.
3. Click "↻". Confirm the cell shows the pulsing spinner, then updates with the fresh value.
4. Hover a static column cell. Confirm no "↻" appears.

- [ ] **Step 3.5 — Commit**

```bash
git add frontend/src/app/\(dashboard\)/dashboard/tables/\[tableId\]/page.tsx
git commit -m "feat(tables): single-cell re-enrich button for data_source columns (Phase 15D)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Grid auto-refresh (Task 1) — cells fill in live without user action
- ✅ AddColumnDialog enrichment mode (Task 2) — explicit TODO stub removed
- ✅ Single-cell re-enrich (Task 3) — per-cell control loop complete
- ✅ Backend was already 100% complete before this plan — no backend tasks needed

**Placeholder scan:** No TBD, TODO, or "similar to" references. All code blocks are complete.

**Type consistency:** `onLaunched: (columnKey: string) => Promise<void>` is used consistently across all three call sites (RunEnrichmentDialog, ActionModal, ActionConfigureStep). `enrichingColKey` prop threaded consistently through TableGrid → ColumnHeader.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-26-phase-15d-enrichment-completion.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — execute tasks in this session using executing-plans

**Which approach?**
