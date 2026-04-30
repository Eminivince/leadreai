'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, DataTable, RowType } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Tables index — Clay-parity "workspaces of spreadsheets."
 *
 * Top: "New table" dialog. List: each table as a row with name, row
 * type, column count, row count, tags. Click to open the grid.
 *
 * No archive filter in v1 — archived tables just stop appearing. User
 * can un-archive from the grid's header menu when that lands.
 * ───────────────────────────────────────────────────────────────── */

interface Paged<T> { data: T[]; total: number; page: number; limit: number }

const ROW_TYPE_LABELS: Record<RowType, string> = {
  company: 'Company',
  person: 'Person',
  url: 'URL',
  custom: 'Custom',
};

export default function TablesIndexPage() {
  const { workspaceId } = useWorkspace();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tables', workspaceId],
    queryFn: () => apiFetch<ApiResponse<Paged<DataTable>>>(
      `/api/v1/workspaces/${workspaceId}/tables?limit=100`,
    ),
    enabled: Boolean(workspaceId),
  });

  const tables = data?.data?.data ?? [];

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-14">
      {/* Hero */}
      <section className="mb-10 flex items-end justify-between gap-6 flex-wrap">
        <div className="max-w-[720px]">
          <div className="flex items-center gap-3 mb-4">
            <span className="block w-8 h-px bg-[color:var(--ink)]" />
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
              Tables
            </span>
          </div>
          <h1 className=" text-[44px] md:text-[60px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
            Workspaces of <em className="italic text-[color:var(--forest)]">facts</em>.
          </h1>
          <p className="mt-4  text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
            Flexible grids you can fill with research. Each column can pull from a different data source — your built-ins, your Apollo key, your own uploads.
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
        >
          New table +
        </button>
      </section>

      {/* List */}
      {isLoading && (
        <p className=" italic text-[14px] text-[color:var(--ink-3)]">
          Loading tables…
        </p>
      )}

      {!isLoading && tables.length === 0 && (
        <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/50 rounded-sm p-10 text-center">
          <p className=" italic text-[20px] text-[color:var(--ink)]">
            No tables yet.
          </p>
          <p className="mt-2  text-[13.5px] text-[color:var(--ink-2)] max-w-[420px] mx-auto">
            Start one from a completed dispatch or create an empty table for manual data entry.
          </p>
          <button
            onClick={() => setDialogOpen(true)}
            className="mt-5 inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
          >
            New table +
          </button>
        </div>
      )}

      {tables.length > 0 && (
        <div className="border-t border-[color:var(--rule)]">
          {tables.map((t) => (
            <Link
              key={t._id}
              href={`/dashboard/tables/${t._id}`}
              className="block grid grid-cols-[1fr_auto_auto_auto] gap-6 items-baseline py-4 border-b border-[color:var(--rule)] hover:bg-[color:var(--paper-3)]/50 transition"
            >
              <div className="min-w-0">
                <h3 className=" text-[20px] leading-tight text-[color:var(--ink)]">
                  {t.name}
                </h3>
                {t.description && (
                  <p className="mt-0.5  text-[13px] text-[color:var(--ink-2)] line-clamp-1">
                    {t.description}
                  </p>
                )}
              </div>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                {ROW_TYPE_LABELS[t.rowType]}
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] min-w-[100px] text-right">
                {t.columns.length} col{t.columns.length === 1 ? '' : 's'}
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] min-w-[80px] text-right">
                {t.rowCount.toLocaleString()} row{t.rowCount === 1 ? '' : 's'}
              </span>
            </Link>
          ))}
        </div>
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

/* ── New Table dialog ────────────────────────────────────────────── */

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
            // Empty columns[] → backend seeds defaults for the rowType.
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[color:var(--ink)]/40" onClick={onClose} aria-hidden />
      <div className="relative w-[min(92vw,560px)] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm">
        <div className="p-8 md:p-10">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--forest)] block mb-2">
            New table
          </span>
          <h2 className=" text-[36px] leading-[1.05] text-[color:var(--ink)] mb-6">
            Start a <em className="italic text-[color:var(--forest)]">fresh sheet</em>.
          </h2>

          <div className="flex flex-col gap-5">
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
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
                Row type
              </span>
              <div className="grid grid-cols-4 gap-2">
                {(Object.entries(ROW_TYPE_LABELS) as Array<[RowType, string]>).map(([k, label]) => {
                  const on = rowType === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setRowType(k)}
                      className={`h-10 rounded-full  text-[12.5px] transition-colors ${
                        on
                          ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                          : 'border border-[color:var(--rule)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2  italic text-[12px] text-[color:var(--ink-3)]">
                {rowType === 'company' && 'Primary key = company domain. Default columns cover name, industry, contact.'}
                {rowType === 'person' && 'Primary key = email or LinkedIn URL. Default columns cover name, title, company.'}
                {rowType === 'url' && 'Primary key = the URL. Default columns cover title + notes.'}
                {rowType === 'custom' && 'No default columns — define your own.'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--rule)] bg-[color:var(--paper-3)] px-8 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || saving}
            className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors disabled:opacity-40"
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
