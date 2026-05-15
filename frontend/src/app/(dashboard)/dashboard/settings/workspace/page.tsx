'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { ApiResponse, Workspace } from '@leadreai/shared';
import { ForthcomingPanel } from '@/components/settings/primitives';

/**
 * Workspace — name, description, and desk preferences.
 * Backed by PATCH /workspaces/:id which accepts name, description, and
 * settings.{cheapMode, defaultExportFormat, notifyOnJobComplete}.
 * Slug is immutable today (no endpoint); we show it read-only.
 */

interface WorkspaceExt extends Workspace {
 description?: string;
}

function Toggle({
 checked,
 onChange,
 disabled,
}: {
 checked: boolean;
 onChange: (v: boolean) => void;
 disabled?: boolean;
}) {
 return (
  <button
   type="button"
   role="switch"
   aria-checked={checked}
   disabled={disabled}
   onClick={() => onChange(!checked)}
   className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
    checked
     ? 'bg-[color:var(--ember)] border-[color:var(--ember)]'
     : 'bg-[color:var(--paper-3)] border-[color:var(--rule)]'
   }`}
  >
   <span
    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[color:var(--paper)] transition-transform ${
     checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
    }`}
   />
  </button>
 );
}

function ToggleRow({
 checked,
 onChange,
 label,
 sub,
}: {
 checked: boolean;
 onChange: (v: boolean) => void;
 label: string;
 sub?: string;
}) {
 return (
  <div className="flex items-center justify-between gap-4 sm:gap-6 py-3.5 border-b border-[color:var(--rule)] last:border-0">
   <div className="min-w-0 flex-1">
    <div className="text-[13.5px] font-medium text-[color:var(--ink)]">{label}</div>
    {sub && (
     <div className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">{sub}</div>
    )}
   </div>
   <Toggle checked={checked} onChange={onChange} />
  </div>
 );
}

export default function WorkspaceSettingsPage() {
 const { workspaceId } = useWorkspace();
 const qc = useQueryClient();

 const { data, isLoading } = useQuery({
  queryKey: ['workspace', workspaceId],
  queryFn: () => apiFetch<ApiResponse<WorkspaceExt>>(`/api/v1/workspaces/${workspaceId}`),
  enabled: !!workspaceId,
 });
 const ws = data?.data;

 const [name, setName] = useState('');
 const [description, setDescription] = useState('');
 const [cheapMode, setCheapMode] = useState(false);
 const [notifyOnJobComplete, setNotifyOnJobComplete] = useState(true);
 const [defaultExportFormat, setDefaultExportFormat] = useState<'csv' | 'xlsx'>('csv');
 const [dirty, setDirty] = useState(false);

 useEffect(() => {
  if (ws && !dirty) {
   setName(ws.name ?? '');
   setDescription(ws.description ?? '');
   setCheapMode(ws.settings?.cheapMode ?? false);
   setNotifyOnJobComplete(ws.settings?.notifyOnJobComplete ?? true);
   setDefaultExportFormat((ws.settings?.defaultExportFormat ?? 'csv') as 'csv' | 'xlsx');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [ws]);

 const saveMutation = useMutation({
  mutationFn: () =>
   apiFetch(`/api/v1/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
     name: name.trim(),
     description: description.trim() || undefined,
     settings: { cheapMode, notifyOnJobComplete, defaultExportFormat },
    }),
   }),
  onSuccess: () => {
   setDirty(false);
   toast.success('Workspace settings saved.');
   qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
  },
  onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
 });

 if (isLoading || !ws) {
  return (
   <div className="py-8 text-[14px] text-[color:var(--ink-3)]">Loading workspace…</div>
  );
 }

 return (
  <form
   onSubmit={(e) => {
    e.preventDefault();
    saveMutation.mutate();
   }}
   className="flex flex-col gap-5"
  >
   {/* Identity */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
    <div className="px-4 sm:px-6 py-5 border-b border-[color:var(--rule)]">
     <h2 className="text-[16px] font-bold text-[color:var(--ink)]">Identity</h2>
     <p className="text-[13px] text-[color:var(--ink-3)] mt-0.5">Workspace name and description.</p>
    </div>
    <div className="p-4 sm:p-6 flex flex-col gap-5">
     <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="flex flex-col gap-1.5">
       <label className="text-[13px] font-semibold text-[color:var(--ink)]">Workspace name</label>
       <input
        className="bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] outline-none focus:border-[color:var(--ember)] focus:ring-2 focus:ring-[color:var(--ember)]/10 transition-all"
        value={name}
        onChange={(e) => { setDirty(true); setName(e.target.value); }}
        maxLength={200}
        required
       />
      </div>
      <div className="flex flex-col gap-1.5">
       <label className="text-[13px] font-semibold text-[color:var(--ink)]">Slug</label>
       <p className="text-[12.5px] text-[color:var(--ink-3)]">Immutable — used in URLs for stability.</p>
       <div className="bg-[color:var(--paper-3)] border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 font-mono text-[13px] text-[color:var(--ink)]">
        {ws.slug}
       </div>
      </div>
     </div>

     <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-[color:var(--ink)]">Description <span className="font-normal text-[color:var(--ink-3)]">(optional)</span></label>
      <p className="text-[12.5px] text-[color:var(--ink-3)]">Shown on workspace switcher and exports.</p>
      <textarea
       rows={3}
       placeholder="What this workspace is for."
       className="bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] outline-none focus:border-[color:var(--ember)] focus:ring-2 focus:ring-[color:var(--ember)]/10 transition-all resize-none"
       value={description}
       onChange={(e) => { setDirty(true); setDescription(e.target.value); }}
       maxLength={500}
      />
     </div>
    </div>
    <div className="px-4 sm:px-6 py-4 bg-[color:var(--paper-2)] border-t border-[color:var(--rule)] flex justify-end">
     <button
      type="submit"
      disabled={saveMutation.isPending || !dirty}
      className="bg-[color:var(--ember)] text-white px-4 py-2 rounded-lg text-[13.5px] font-semibold disabled:opacity-50 hover:bg-[color:var(--ember-2)] transition-colors"
     >
      {saveMutation.isPending ? 'Saving…' : 'Save changes'}
     </button>
    </div>
   </div>

   {/* Preferences */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
    <div className="px-4 sm:px-6 py-5 border-b border-[color:var(--rule)]">
     <h2 className="text-[16px] font-bold text-[color:var(--ink)]">Preferences</h2>
     <p className="text-[13px] text-[color:var(--ink-3)] mt-0.5">Defaults for searches and exports.</p>
    </div>
    <div className="px-4 sm:px-6 py-2">
     <ToggleRow
      checked={notifyOnJobComplete}
      onChange={(v) => { setDirty(true); setNotifyOnJobComplete(v); }}
      label="Notify when a search completes"
      sub="Fires the outbound webhook and surfaces results in your inbox."
     />
     <ToggleRow
      checked={cheapMode}
      onChange={(v) => { setDirty(true); setCheapMode(v); }}
      label="Thrift mode"
      sub="Skips SerpAPI searches during prospecting. Faster and free — but with less web research."
     />
     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 py-3.5">
      <div className="min-w-0 flex-1">
       <div className="text-[13.5px] font-medium text-[color:var(--ink)]">Default export format</div>
       <div className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">
        Controls the default format of the Export button across leads and results.
       </div>
      </div>
      <select
       value={defaultExportFormat}
       onChange={(e) => { setDirty(true); setDefaultExportFormat(e.target.value as 'csv' | 'xlsx'); }}
       className="w-full sm:w-auto bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-lg px-3 py-2 text-[13px] text-[color:var(--ink)] outline-none focus:border-[color:var(--ember)] focus:ring-2 focus:ring-[color:var(--ember)]/10 transition-all"
      >
       <option value="csv">CSV</option>
       <option value="xlsx">Excel (XLSX)</option>
      </select>
     </div>
    </div>
    <div className="px-4 sm:px-6 py-4 bg-[color:var(--paper-2)] border-t border-[color:var(--rule)] flex justify-end">
     <button
      type="submit"
      disabled={saveMutation.isPending || !dirty}
      className="bg-[color:var(--ember)] text-white px-4 py-2 rounded-lg text-[13.5px] font-semibold disabled:opacity-50 hover:bg-[color:var(--ember-2)] transition-colors"
     >
      {saveMutation.isPending ? 'Saving…' : 'Save changes'}
     </button>
    </div>
   </div>

   {/* Danger zone */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
    <div className="px-4 sm:px-6 py-5 border-b border-[color:var(--rule)]">
     <h2 className="text-[16px] font-bold text-[color:var(--ink)]">Danger zone</h2>
     <p className="text-[13px] text-[color:var(--ink-3)] mt-0.5">Irreversible workspace actions.</p>
    </div>
    <div className="p-4 sm:p-6">
     <ForthcomingPanel title="Archive or delete this workspace.">
      Archiving hides the workspace and stops all running searches. Deletion is permanent.
      Both operations are forthcoming — contact us today if you need either.
     </ForthcomingPanel>
    </div>
   </div>
  </form>
 );
}
