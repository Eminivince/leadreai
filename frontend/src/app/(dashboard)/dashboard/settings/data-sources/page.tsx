'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type {
 ApiResponse,
 DataSourceSummary,
 DataSourceCredential,
 DataSourceCategory,
} from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Data Sources settings index.
 *
 * Lists every registered DataSource, grouped by category, with a badge
 * showing how many credentials this workspace has configured for it.
 * Clicking a source opens a right-side drawer with add/test/delete
 * credential controls.
 *
 * Editorial shell — no shadcn card clutter. Each source is a row with
 * a serif name + mono category kicker + credential count pill.
 * ───────────────────────────────────────────────────────────────── */

/* ── Category grouping ───────────────────────────────────────────── */

const CATEGORY_GROUPS: Array<{
 label: string;
 description: string;
 categories: DataSourceCategory[];
}> = [
 {
  label: 'Built-in research',
  description: 'Ships with LeadreAI — no credential needed.',
  categories: ['search', 'fetch', 'scrape', 'audio', 'library', 'enrichment_builtin', 'scoring', 'writer'],
 },
 {
  label: 'Person & company enrichment',
  description: 'Bring your own API keys for paid enrichment providers.',
  categories: ['person_enrichment', 'company_enrichment', 'person_search', 'company_search'],
 },
 {
  label: 'Email & phone',
  description: 'Finders and verifiers — catch-all detection, role filtering.',
  categories: ['email_finder', 'email_verify', 'phone_verify', 'phone_finder'],
 },
 {
  label: 'Signals & intent',
  description: 'Hiring, funding, tech stack, news, and intent data.',
  categories: ['tech_stack', 'intent_signal', 'news', 'funding', 'hiring'],
 },
 {
  label: 'Other',
  description: 'Custom HTTP, AI providers, miscellaneous.',
  categories: ['custom_http', 'ai'],
 },
];

/* ── Page ────────────────────────────────────────────────────────── */

export default function DataSourcesPage() {
 const { workspaceId } = useWorkspace();
 const [activeId, setActiveId] = useState<string | null>(null);

 const { data, isLoading } = useQuery({
  queryKey: ['data-sources', workspaceId],
  queryFn: () => apiFetch<ApiResponse<DataSourceSummary[]>>(
   `/api/v1/workspaces/${workspaceId}/data-sources`,
  ),
  enabled: Boolean(workspaceId),
 });

 const sources = useMemo(() => data?.data ?? [], [data]);

 // Count credentials per source — single batched fetch would be nicer;
 // for v1 we fetch lazily when the drawer opens. Here we just show
 // the count from a lightweight aggregate.
 const { data: credCounts } = useQuery({
  queryKey: ['data-source-credential-counts', workspaceId],
  queryFn: async () => {
   if (!workspaceId) return {};
   // Fire one fetch per source in parallel. N is small (≈15). Good
   // enough until we have 50+ sources, at which point a dedicated
   // /credentials/counts endpoint lands.
   const entries = await Promise.all(
    sources.map(async (s) => {
     const res = await apiFetch<ApiResponse<DataSourceCredential[]>>(
      `/api/v1/workspaces/${workspaceId}/data-sources/${s.id}/credentials`,
     ).catch(() => ({ data: [] as DataSourceCredential[] }));
     return [s.id, res.data?.length ?? 0] as const;
    }),
   );
   return Object.fromEntries(entries) as Record<string, number>;
  },
  enabled: Boolean(workspaceId) && sources.length > 0,
  staleTime: 30_000,
 });

 const grouped = useMemo(() => {
  const bySource = new Map<string, DataSourceSummary>();
  for (const s of sources) bySource.set(s.id, s);

  const byCat = new Map<DataSourceCategory, DataSourceSummary[]>();
  for (const s of sources) {
   const list = byCat.get(s.category) ?? [];
   list.push(s);
   byCat.set(s.category, list);
  }

  return CATEGORY_GROUPS
   .map((group) => {
    const members: DataSourceSummary[] = [];
    for (const cat of group.categories) {
     const inCat = byCat.get(cat);
     if (inCat) members.push(...inCat);
    }
    return { ...group, members };
   })
   .filter((g) => g.members.length > 0);
 }, [sources]);

 const active = activeId ? sources.find((s) => s.id === activeId) ?? null : null;

 return (
  <div className="flex flex-col gap-5">
   {/* Header card with invocation log link */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div>
     <span className="text-[13.5px] font-semibold text-[color:var(--ink)]">Connected providers</span>
     <p className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5">Bring your own API keys for paid enrichment providers.</p>
    </div>
    <Link
     href="/dashboard/settings/data-sources/invocations"
     className="text-[13px] font-semibold text-[color:var(--ember)] hover:text-[color:var(--ember-2)] underline underline-offset-2 transition whitespace-nowrap"
    >
     View invocation log
    </Link>
   </div>

   {isLoading && (
    <p className="text-[14px] text-[color:var(--ink-3)] px-1">Loading providers…</p>
   )}

   {grouped.map((g) => (
    <div key={g.label} className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
     <div className="px-4 sm:px-6 py-4 border-b border-[color:var(--rule)]">
      <h2 className="text-[14px] font-bold text-[color:var(--ink)]">{g.label}</h2>
      <p className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5">{g.description}</p>
     </div>

     <div className="divide-y divide-[color:var(--rule)]">
      {g.members.map((s) => {
       const credCount = credCounts?.[s.id] ?? 0;
       const needsAuth = s.auth.type !== 'none' && s.auth.type !== 'platform';
       const connected = !needsAuth || credCount > 0;
       return (
        <button
         key={s.id}
         onClick={() => setActiveId(s.id)}
         className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3.5 text-left hover:bg-[color:var(--paper-3)] transition"
        >
         <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
           connected ? 'bg-[color:var(--success)]' : 'bg-[color:var(--rule)]'
          }`}
          aria-hidden
         />
         <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">{s.name}</div>
          <p className="text-[12.5px] text-[color:var(--ink-3)] line-clamp-1">{s.description}</p>
         </div>
         <span className="hidden md:inline text-[11px] font-medium text-[color:var(--ink-3)] whitespace-nowrap">
          {authBadge(s)}
         </span>
         <span className={`text-[11px] font-semibold whitespace-nowrap ${connected ? 'text-[color:var(--success)]' : 'text-[color:var(--ink-3)]'}`}>
          {needsAuth
           ? credCount > 0
            ? `${credCount} cred${credCount === 1 ? '' : 's'}`
            : 'Not connected'
           : 'Built-in'}
         </span>
        </button>
       );
      })}
     </div>
    </div>
   ))}

   {active && (
    <SourceDrawer
     source={active}
     workspaceId={workspaceId ?? ''}
     onClose={() => setActiveId(null)}
     onChanged={() => {
      // Refetch both source list (rateLimit counts) + credential counts
      const qc = null as unknown; void qc;
     }}
    />
   )}
  </div>
 );
}

/* ── Source drawer ───────────────────────────────────────────────── */

function SourceDrawer({
 source,
 workspaceId,
 onClose,
}: {
 source: DataSourceSummary;
 workspaceId: string;
 onClose: () => void;
 onChanged?: () => void;
}) {
 const qc = useQueryClient();
 const needsAuth = source.auth.type !== 'none' && source.auth.type !== 'platform';

 const { data: credsResp } = useQuery({
  queryKey: ['data-source-credentials', workspaceId, source.id],
  queryFn: () => apiFetch<ApiResponse<DataSourceCredential[]>>(
   `/api/v1/workspaces/${workspaceId}/data-sources/${source.id}/credentials`,
  ),
  enabled: Boolean(workspaceId) && needsAuth,
 });

 const creds = credsResp?.data ?? [];

 const [form, setForm] = useState<Record<string, string>>({});
 const [label, setLabel] = useState('');
 const [testing, setTesting] = useState(false);
 const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
 const [saving, setSaving] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function handleTest() {
  setTesting(true);
  setTestResult(null);
  setError(null);
  try {
   const res = await apiFetch<ApiResponse<{ ok: boolean; message?: string }>>(
    `/api/v1/workspaces/${workspaceId}/data-sources/${source.id}/test`,
    { method: 'POST', body: JSON.stringify({ fields: form }) },
   );
   setTestResult(res.data ?? { ok: false });
  } catch (err) {
   setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
  } finally {
   setTesting(false);
  }
 }

 async function handleSave() {
  setSaving(true);
  setError(null);
  try {
   await apiFetch<ApiResponse<unknown>>(
    `/api/v1/workspaces/${workspaceId}/data-sources/${source.id}/credentials`,
    { method: 'POST', body: JSON.stringify({ fields: form, label: label || undefined }) },
   );
   setForm({});
   setLabel('');
   setTestResult(null);
   await qc.invalidateQueries({ queryKey: ['data-source-credentials', workspaceId, source.id] });
   await qc.invalidateQueries({ queryKey: ['data-source-credential-counts', workspaceId] });
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Save failed');
  } finally {
   setSaving(false);
  }
 }

 async function handleDelete(credId: string) {
  try {
   await apiFetch<ApiResponse<unknown>>(
    `/api/v1/workspaces/${workspaceId}/data-sources/${source.id}/credentials/${credId}`,
    { method: 'DELETE' },
   );
   await qc.invalidateQueries({ queryKey: ['data-source-credentials', workspaceId, source.id] });
   await qc.invalidateQueries({ queryKey: ['data-source-credential-counts', workspaceId] });
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Delete failed');
  }
 }

 const requiredFieldsFilled = (source.auth.fields ?? [])
  .every((f) => typeof form[f.key] === 'string' && form[f.key]!.trim().length > 0);

 return (
  <div className="fixed inset-0 z-[60] flex">
   {/* scrim */}
   <div className="hidden sm:block flex-1 bg-[color:var(--ink)]/30" onClick={onClose} aria-hidden />
   {/* panel */}
   <div className="w-full sm:max-w-[540px] bg-[color:var(--paper)] border-l border-[color:var(--rule)] overflow-y-auto">
    <div className="px-5 sm:px-6 md:px-8 py-6 md:py-8 flex flex-col gap-6">
     {/* Header */}
     <div className="flex items-start justify-between gap-4">
      <div>
       <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1">
        {authBadge(source)} · {source.category}
       </span>
       <h2 className=" text-[28px] leading-[1.05] text-[color:var(--ink)]">
        {source.name}
       </h2>
      </div>
      <button
       onClick={onClose}
       className=" text-[22px] leading-none text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
       aria-label="Close"
      >
       ×
      </button>
     </div>

     <p className=" text-[14px] leading-[1.55] text-[color:var(--ink-2)]">
      {source.description}
     </p>

     {source.pricing.notes && (
      <p className=" text-[12.5px] leading-[1.55] text-[color:var(--ink-3)] border-l-2 border-[color:var(--rule)] pl-3">
       {source.pricing.notes}
      </p>
     )}

     {!needsAuth ? (
      <div className="border border-[color:var(--rule)] bg-[color:var(--paper-3)] rounded-md p-4 text-[13px] text-[color:var(--ink-2)]">
       This is a built-in source — no credential needed.
      </div>
     ) : (
      <>
       {/* Existing credentials */}
       {creds.length > 0 && (
        <div>
         <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
          Connected credentials
         </span>
         <div className="border-t border-[color:var(--rule)]">
          {creds.map((c) => (
           <div
            key={c._id}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-[color:var(--rule)]"
           >
            <div className="min-w-0">
             <div className="flex items-center gap-2">
              <span className=" text-[13.5px] text-[color:var(--ink)]">
               {c.label || '—'}
              </span>
              {c.isDefault && (
               <span className="font-mono text-[9px] tracking-[0.06em] text-[color:var(--success)]">
                Default
               </span>
              )}
             </div>
             <div className="font-mono text-[10px] text-[color:var(--ink-3)] mt-0.5">
              {c.verifiedAt
               ? `Verified ${relative(c.verifiedAt)}`
               : 'Not verified'}
              {c.lastErrorAt && ` · last error ${relative(c.lastErrorAt)}`}
             </div>
            </div>
            <button
             onClick={() => void handleDelete(c._id)}
             className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition"
            >
             Delete
            </button>
           </div>
          ))}
         </div>
        </div>
       )}

       {/* Add credential form */}
       <div>
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-3">
         {creds.length === 0 ? 'Add first credential' : 'Add another credential'}
        </span>
        <div className="flex flex-col gap-4">
         <LabeledInput
          label="Label (optional)"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Apollo — prod account"
         />
         {(source.auth.fields ?? []).map((f) => (
          <LabeledInput
           key={f.key}
           label={f.label}
           hint={f.hint}
           value={form[f.key] ?? ''}
           onChange={(v) => setForm({ ...form, [f.key]: v })}
           placeholder={f.secret ? '••••••••' : ''}
           type={f.secret ? 'password' : 'text'}
          />
         ))}
        </div>

        {testResult && (
         <div
          className={`mt-3 border-l-2 px-3 py-2 text-[12.5px] ${
           testResult.ok
            ? 'border-[color:var(--ember)] text-[color:var(--ink)]'
            : 'border-[color:var(--warn)] text-[color:var(--ink)]'
          }`}
         >
          <span className="font-mono text-[9.5px] tracking-[0.06em] block mb-1 text-[color:var(--ink-3)]">
           {testResult.ok ? 'Test passed' : 'Test failed'}
          </span>
          {testResult.message}
         </div>
        )}

        {error && (
         <div className="mt-3 border-l-2 border-[color:var(--warn)] px-3 py-2 text-[12.5px] text-[color:var(--ink)]">
          {error}
         </div>
        )}

        <div className="mt-5 flex items-center gap-3">
         <button
          onClick={() => void handleTest()}
          disabled={!requiredFieldsFilled || testing}
          className="inline-flex items-center gap-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink)] hover:border-[color:var(--ink)] px-4 py-2 rounded-md text-[13px] disabled:opacity-40"
         >
          {testing ? 'Testing…' : 'Test'}
         </button>
         <button
          onClick={() => void handleSave()}
          disabled={!requiredFieldsFilled || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:opacity-85 px-4 py-2 rounded-md text-[13px] font-medium disabled:opacity-40 transition-opacity"
         >
          {saving ? 'Saving…' : 'Save credential'}
         </button>
        </div>
       </div>
      </>
     )}

     {/* Input/output describe — helpful for users composing a table column */}
     {source.inputFields.length > 0 && (
      <div className="border-t border-[color:var(--rule)] pt-5">
       <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
        Inputs
       </span>
       <ul className=" text-[12.5px] text-[color:var(--ink-2)] space-y-1">
        {source.inputFields.map((f) => (
         <li key={f.key}>
          <span className="text-[color:var(--ink)]">{f.label}</span>
          {f.required && <span className="text-[color:var(--warn)]"> *</span>}
          {f.hint && <span className="italic text-[color:var(--ink-3)]"> — {f.hint}</span>}
         </li>
        ))}
       </ul>
      </div>
     )}
     {source.outputFields.length > 0 && (
      <div>
       <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
        Outputs
       </span>
       <ul className=" text-[12.5px] text-[color:var(--ink-2)] space-y-1">
        {source.outputFields.map((f) => (
         <li key={f.key}>
          <span className="text-[color:var(--ink)]">{f.label}</span>
          <span className="font-mono text-[10px] text-[color:var(--ink-3)] ml-1">
           {f.type}
          </span>
         </li>
        ))}
       </ul>
      </div>
     )}
    </div>
   </div>
  </div>
 );
}

/* ── Small helpers ──────────────────────────────────────────────── */

function LabeledInput({
 label,
 value,
 onChange,
 placeholder,
 hint,
 type = 'text',
}: {
 label: string;
 value: string;
 onChange: (v: string) => void;
 placeholder?: string;
 hint?: string;
 type?: 'text' | 'password';
}) {
 return (
  <label className="block">
   <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
    {label}
   </span>
   <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 outline-none text-[14px] text-[color:var(--ink)]"
   />
   {hint && (
    <span className="mt-1 block text-[11.5px] text-[color:var(--ink-3)]">
     {hint}
    </span>
   )}
  </label>
 );
}

function authBadge(source: DataSourceSummary): string {
 switch (source.auth.type) {
  case 'none': return 'No auth';
  case 'platform': return 'Platform-managed';
  case 'api_key': return 'API key';
  case 'oauth2': return 'OAuth';
  case 'basic': return 'Basic auth';
  default: return source.auth.type;
 }
}

function relative(iso: string): string {
 const ts = new Date(iso).getTime();
 const diff = Date.now() - ts;
 const min = Math.floor(diff / 60_000);
 if (min < 1) return 'just now';
 if (min < 60) return `${min}m ago`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${hr}h ago`;
 const d = Math.floor(hr / 24);
 return `${d}d ago`;
}
