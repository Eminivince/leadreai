'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type {
  ApiResponse,
  Workflow,
  WorkflowSeedParam,
  RunWorkflowResponse,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Workflow detail + run form.
 *
 * Left column: metadata (name, description, columns summary, stats),
 * editable in-place.
 * Right column: the Run form — table name, seed parameters (if any),
 * dispatch toggle. Submitting creates a fresh table and redirects to
 * the table detail page.
 *
 * Delete sits behind a kebab-style confirm to prevent accidents.
 * ───────────────────────────────────────────────────────────────── */

export default function WorkflowDetailPage() {
  const params = useParams();
  const workflowId = (params.workflowId as string) ?? '';
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['workflow', workspaceId, workflowId],
    queryFn: () => apiFetch<ApiResponse<Workflow>>(
      `/api/v1/workspaces/${workspaceId}/workflows/${workflowId}`,
    ),
    enabled: Boolean(workspaceId && workflowId),
  });

  const workflow = data?.data;

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['workflow', workspaceId, workflowId] }),
      qc.invalidateQueries({ queryKey: ['workflows', workspaceId] }),
    ]);
  }

  async function handleDelete() {
    if (!confirm('Delete this workflow permanently?')) return;
    await apiFetch(`/api/v1/workspaces/${workspaceId}/workflows/${workflowId}`, {
      method: 'DELETE',
    });
    await invalidate();
    router.push('/dashboard/workflows');
  }

  if (isLoading && !workflow) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center  italic text-[14px] text-[color:var(--ink-3)]">
        Loading workflow…
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center">
        <p className=" text-[14px] text-[color:var(--ink-2)]">Workflow not found.</p>
        <Link href="/dashboard/workflows" className="mt-4 inline-block font-mono text-[11px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)]">
          ← All workflows
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-10 md:py-14">
      {/* Header */}
      <section className="mb-6 sm:mb-10">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Link
            href="/dashboard/workflows"
            className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
          >
            Workflows
          </Link>
          <span className="font-mono text-[10px] text-[color:var(--ink-3)]">/</span>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            {workflow.tableTemplate.rowType}
          </span>
        </div>
        <h1 className=" text-[30px] sm:text-[38px] md:text-[52px] leading-[0.97] tracking-[-0.015em] text-[color:var(--ink)]">
          {workflow.name}
        </h1>
        {workflow.description && (
          <p className="mt-3  text-[14px] sm:text-[15px] leading-[1.55] text-[color:var(--ink-2)] max-w-[780px]">
            {workflow.description}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 lg:gap-10">
        {/* Left — details */}
        <div>
          <WorkflowMeta workflow={workflow} onChanged={invalidate} workspaceId={workspaceId ?? ''} />
          <ColumnsSummary workflow={workflow} />
          {workflow.seed && <SeedSummary workflow={workflow} />}
          <PublishPanel workflow={workflow} workspaceId={workspaceId ?? ''} onChanged={invalidate} />
          <div className="mt-10 border-t border-[color:var(--rule)] pt-6">
            <button
              onClick={() => void handleDelete()}
              className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--warn)] hover:text-[color:var(--ink)] transition"
            >
              Delete workflow
            </button>
          </div>
        </div>

        {/* Right — run form (sticks on lg+) */}
        <div>
          <div className="lg:sticky lg:top-6">
            <RunForm workflow={workflow} workspaceId={workspaceId ?? ''} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Metadata (editable) ──────────────────────────────────────── */

function WorkflowMeta({
  workflow,
  workspaceId,
  onChanged,
}: {
  workflow: Workflow;
  workspaceId: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description ?? '');
  // Power-user surface (Task #17). Editing the seed brief covers the
  // most common "I want to tweak this workflow without re-creating"
  // path; columns + parameters are advanced enough we expose JSON
  // mode rather than build a full visual builder — keeps the diff
  // small and lets agencies who know the schema iterate.
  const [seedBrief, setSeedBrief] = useState(workflow.seed?.rawQueryTemplate ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedJson, setAdvancedJson] = useState(() =>
    JSON.stringify(
      {
        seedParameters: workflow.seed?.parameters ?? [],
        columns: workflow.tableTemplate.columns,
      },
      null,
      2,
    ),
  );
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setAdvancedError(null);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || undefined,
      };

      // Seed brief — only send when it's been touched away from the
      // current value, AND the workflow had a seed (we don't synthesize
      // one from this surface; that path is /from-table).
      if (workflow.seed && seedBrief.trim() !== (workflow.seed.rawQueryTemplate ?? '')) {
        payload['seed'] = {
          rawQueryTemplate: seedBrief.trim(),
          parameters: workflow.seed.parameters ?? [],
        };
      }

      if (advancedOpen) {
        let parsedAdvanced: { seedParameters?: unknown; columns?: unknown };
        try {
          parsedAdvanced = JSON.parse(advancedJson) as typeof parsedAdvanced;
        } catch {
          setAdvancedError('Advanced JSON is not valid');
          setSaving(false);
          return;
        }
        if (Array.isArray(parsedAdvanced.columns)) {
          payload['tableTemplate'] = {
            ...workflow.tableTemplate,
            columns: parsedAdvanced.columns,
          };
        }
        if (Array.isArray(parsedAdvanced.seedParameters) && workflow.seed) {
          payload['seed'] = {
            rawQueryTemplate: seedBrief.trim() || workflow.seed.rawQueryTemplate,
            parameters: parsedAdvanced.seedParameters,
          };
        }
      }

      await apiFetch(`/api/v1/workspaces/${workspaceId}/workflows/${workflow._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await onChanged();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="mb-8 flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
        <span>
          Run {workflow.stats.timesRun}× · Created {new Date(workflow.createdAt).toLocaleDateString()}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="hover:text-[color:var(--ink)] transition"
        >
          Edit details
        </button>
      </div>
    );
  }

  return (
    <div className="mb-8 border border-[color:var(--rule)] bg-[color:var(--paper-3)]/40 rounded-sm p-5 flex flex-col gap-4">
      <LabeledInput label="Name" value={name} onChange={setName} />
      <LabeledInput label="Description" value={description} onChange={setDescription} />

      {workflow.seed ? (
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
            Agent brief
          </span>
          <textarea
            value={seedBrief}
            onChange={(e) => setSeedBrief(e.target.value)}
            rows={4}
            className="w-full bg-transparent border border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 px-2 outline-none text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] rounded-sm"
            placeholder="What should the agent look for? Supports {{parameters}} from below."
          />
        </label>
      ) : null}

      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
        className="border border-[color:var(--rule)] rounded-sm p-3"
      >
        <summary className="cursor-pointer font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          Advanced — columns &amp; parameters (JSON)
        </summary>
        <p className="mt-3 text-[12px] text-[color:var(--ink-3)]">
          Edits here apply to <em>new</em> runs only. In-flight runs keep
          the snapshot they started with.
        </p>
        <textarea
          value={advancedJson}
          onChange={(e) => setAdvancedJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className="mt-2 w-full bg-[color:var(--paper-1)] border border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 px-2 outline-none font-mono text-[12px] text-[color:var(--ink)] rounded-sm"
        />
        {advancedError ? (
          <p className="mt-2 text-[12px] text-red-600">{advancedError}</p>
        ) : null}
      </details>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => setEditing(false)}
          className=" text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
        >
          Cancel
        </button>
        <button
          onClick={() => void save()}
          disabled={!name.trim() || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2 rounded-full  text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/* ── Columns summary ──────────────────────────────────────────── */

function ColumnsSummary({ workflow }: { workflow: Workflow }) {
  const cols = workflow.tableTemplate.columns;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="block w-6 h-px bg-[color:var(--ink-2)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          Columns ({cols.length})
        </span>
      </div>
      <div className="border-t border-[color:var(--rule)]">
        {cols.length === 0 && (
          <p className="py-4  italic text-[13px] text-[color:var(--ink-3)]">
            No columns in this template.
          </p>
        )}
        {cols.map((c) => {
          const isEnriched = c.definition?.type === 'enriched';
          const sourceId = isEnriched && c.definition?.type === 'enriched' ? c.definition.sourceId : null;
          return (
            <div
              key={c.key}
              className="grid grid-cols-[1fr_auto_auto] gap-4 items-baseline py-2.5 border-b border-[color:var(--rule)]/60"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className=" text-[13.5px] text-[color:var(--ink)] truncate">
                    {c.label}
                  </span>
                  {isEnriched && (
                    <span className="font-mono text-[8.5px] text-[color:var(--ember)] shrink-0">
                      AI
                    </span>
                  )}
                </div>
                <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                  {c.key}
                </span>
              </div>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                {c.type}
              </span>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] min-w-[110px] text-right truncate">
                {sourceId ?? 'static'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Seed summary ─────────────────────────────────────────────── */

function SeedSummary({ workflow }: { workflow: Workflow }) {
  const seed = workflow.seed!;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <span className="block w-6 h-px bg-[color:var(--ember)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)]">
          Seed query
        </span>
      </div>
      <div className="border border-[color:var(--rule)] bg-[color:var(--paper-3)]/40 rounded-sm p-4">
        <p className=" text-[14px] leading-[1.55] text-[color:var(--ink)]">
          {seed.rawQueryTemplate}
        </p>
        {seed.parameters.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[color:var(--rule)]/60">
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
              Parameters
            </span>
            <ul className="flex flex-col gap-1">
              {seed.parameters.map((p) => (
                <li key={p.key} className="flex items-baseline justify-between gap-3  text-[12.5px] text-[color:var(--ink-2)]">
                  <span>
                    <span className="font-mono text-[11px] text-[color:var(--ink)]">{`{{${p.key}}}`}</span>
                    <span className="ml-2">{p.label}</span>
                    {p.required && <span className="text-[color:var(--warn)] ml-1">*</span>}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
                    {p.type}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Run form ─────────────────────────────────────────────────── */

function RunForm({
  workflow,
  workspaceId,
}: {
  workflow: Workflow;
  workspaceId: string;
}) {
  const router = useRouter();
  const hasSeed = Boolean(workflow.seed);

  const [tableName, setTableName] = useState(workflow.tableTemplate.defaultTableNameTemplate ?? workflow.name);
  const [tableDescription, setTableDescription] = useState('');
  const [seedParams, setSeedParams] = useState<Record<string, string>>({});
  const [dispatchSeedJob, setDispatchSeedJob] = useState(hasSeed);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingRequired = useMemo(() => {
    if (!workflow.seed || !dispatchSeedJob) return [];
    return workflow.seed.parameters
      .filter((p) => p.required)
      .filter((p) => {
        const v = seedParams[p.key];
        if (v !== undefined && v !== '') return false;
        if (p.defaultValue !== undefined) return false;
        return true;
      });
  }, [workflow.seed, dispatchSeedJob, seedParams]);

  async function handleRun() {
    if (!tableName.trim()) return;
    if (missingRequired.length > 0) return;
    setRunning(true);
    setError(null);
    try {
      // Only send params that are actually filled — the backend will
      // fall back to each param's `defaultValue` otherwise.
      const cleanedParams: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(seedParams)) {
        if (v === '' || v === undefined) continue;
        const def = workflow.seed?.parameters.find((p) => p.key === k);
        if (def?.type === 'number') {
          const n = Number(v);
          if (!isNaN(n)) cleanedParams[k] = n;
        } else {
          cleanedParams[k] = v;
        }
      }

      const resp = await apiFetch<ApiResponse<RunWorkflowResponse>>(
        `/api/v1/workspaces/${workspaceId}/workflows/${workflow._id}/run`,
        {
          method: 'POST',
          body: JSON.stringify({
            tableName: tableName.trim(),
            tableDescription: tableDescription.trim() || undefined,
            seedParams: hasSeed ? cleanedParams : undefined,
            dispatchSeedJob: hasSeed && dispatchSeedJob,
          }),
        },
      );
      const tableId = resp?.data?.tableId;
      if (tableId) {
        router.push(`/dashboard/tables/${tableId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Run failed');
      setRunning(false);
    }
  }

  return (
    <div className="border border-[color:var(--ink)] bg-[color:var(--paper)] rounded-sm p-6">
      <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)] block mb-1">
        Run
      </span>
      <h2 className=" text-[26px] leading-tight text-[color:var(--ink)] mb-5">
        Dispatch a fresh sheet.
      </h2>

      <div className="flex flex-col gap-4">
        <LabeledInput
          label="New table name"
          value={tableName}
          onChange={setTableName}
          autoFocus
        />
        <LabeledInput
          label="Description (optional)"
          value={tableDescription}
          onChange={setTableDescription}
        />

        {hasSeed && (
          <>
            <label className="flex items-center gap-2  text-[13px] text-[color:var(--ink)]">
              <input
                type="checkbox"
                checked={dispatchSeedJob}
                onChange={(e) => setDispatchSeedJob(e.target.checked)}
                className="accent-[color:var(--ember)]"
              />
              Dispatch the seed query now
            </label>

            {dispatchSeedJob && workflow.seed!.parameters.length > 0 && (
              <div className="border border-[color:var(--rule)] rounded-sm p-4 flex flex-col gap-3">
                <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                  Parameters
                </span>
                {workflow.seed!.parameters.map((p) => (
                  <ParamInput
                    key={p.key}
                    param={p}
                    value={seedParams[p.key] ?? ''}
                    onChange={(v) => setSeedParams((cur) => ({ ...cur, [p.key]: v }))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
          {error}
        </div>
      )}

      <button
        onClick={() => void handleRun()}
        disabled={!tableName.trim() || missingRequired.length > 0 || running}
        title={
          missingRequired.length > 0
            ? `Missing: ${missingRequired.map((p) => p.label).join(', ')}`
            : undefined
        }
        className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-4 py-3 rounded-full  text-[13.5px] font-medium transition-colors disabled:opacity-40"
      >
        {running ? 'Running…' : hasSeed && dispatchSeedJob ? 'Create table + dispatch →' : 'Create table →'}
      </button>
    </div>
  );
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: WorkflowSeedParam;
  value: string;
  onChange: (v: string) => void;
}) {
  const defaultStr = param.defaultValue !== undefined ? String(param.defaultValue) : '';
  const placeholder = defaultStr
    ? `Default: ${defaultStr}`
    : `Value for {{${param.key}}}`;

  if (param.type === 'select' && param.options) {
    return (
      <label className="block">
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-1.5">
          {param.label}
          {param.required && <span className="text-[color:var(--warn)] ml-1">*</span>}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5 outline-none  text-[13.5px] text-[color:var(--ink)]"
        >
          <option value="">{defaultStr ? `Default: ${defaultStr}` : '— pick —'}</option>
          {param.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-1.5">
        {param.label}
        {param.required && <span className="text-[color:var(--warn)] ml-1">*</span>}
      </span>
      <input
        type={param.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-1.5 outline-none  text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
      />
    </label>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
        autoFocus={autoFocus}
        className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 outline-none  text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
      />
    </label>
  );
}

/* ── Publish panel (Phase 11 M2) ──────────────────────────────────── */

function PublishPanel({
  workflow,
  workspaceId,
  onChanged,
}: {
  workflow: Workflow;
  workspaceId: string;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const isPublished = Boolean(workflow.shareToken && workflow.publishedAt);

  const installUrl =
    typeof window !== 'undefined' && workflow.shareToken
      ? `${window.location.origin}/install/${workflow.shareToken}`
      : '';

  async function handlePublish() {
    setPending(true);
    try {
      await apiFetch(
        `/api/v1/workspaces/${workspaceId}/workflows/${workflow._id}/publish`,
        { method: 'POST' },
      );
      await onChanged();
    } finally {
      setPending(false);
    }
  }

  async function handleUnpublish() {
    if (!confirm('Unpublish this workflow? Existing install links will stop working.')) return;
    setPending(true);
    try {
      await apiFetch(
        `/api/v1/workspaces/${workspaceId}/workflows/${workflow._id}/publish`,
        { method: 'DELETE' },
      );
      await onChanged();
    } finally {
      setPending(false);
    }
  }

  async function handleCopy() {
    if (!installUrl) return;
    try {
      await navigator.clipboard.writeText(installUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // older browsers — surface nothing; selecting + copy works manually
    }
  }

  return (
    <section className="mt-10 border-t border-[color:var(--rule)] pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            Publish
          </h3>
          <p className="mt-2 text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[520px]">
            {isPublished
              ? 'Share this install link with another workspace — they can copy the workflow into their own space without seeing yours.'
              : 'Generate a share link so another workspace can install a copy of this workflow.'}
          </p>
        </div>
        {!isPublished ? (
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={pending}
            className="shrink-0 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {pending ? 'Generating…' : 'Publish'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleUnpublish()}
            disabled={pending}
            className="shrink-0 rounded-md border border-[color:var(--rule)] px-4 py-2 text-sm text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] disabled:opacity-50"
          >
            {pending ? 'Working…' : 'Unpublish'}
          </button>
        )}
      </div>

      {isPublished && installUrl ? (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2">
          <input
            readOnly
            value={installUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 bg-transparent font-mono text-[12px] text-[color:var(--ink)] outline-none"
            aria-label="Install URL"
          />
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded border border-[color:var(--rule)] px-3 py-1 text-xs text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
            aria-label="Copy install URL"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}

      {isPublished && workflow.publishStats ? (
        <p className="mt-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          {workflow.publishStats.installs} install{workflow.publishStats.installs === 1 ? '' : 's'}
          {workflow.publishStats.lastInstalledAt
            ? ` · last on ${new Date(workflow.publishStats.lastInstalledAt).toLocaleDateString()}`
            : ''}
        </p>
      ) : null}
    </section>
  );
}
