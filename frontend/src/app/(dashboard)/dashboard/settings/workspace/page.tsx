'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { ApiResponse, Workspace } from '@leadreai/shared';
import {
  Label,
  HairlineInput,
  HairlineTextarea,
  HairlineSelect,
  SectionHead,
  PrimaryButton,
  ForthcomingPanel,
} from '@/components/settings/primitives';

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
          ? 'bg-[color:var(--forest)] border-[color:var(--forest)]'
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
    <div className="flex items-start justify-between gap-6 py-4 border-b border-[color:var(--rule)]/70">
      <div className="min-w-0 flex-1">
        <div className=" text-[14px] text-[color:var(--ink)]">{label}</div>
        {sub && (
          <div className="mt-1  italic text-[12.5px] text-[color:var(--ink-2)]">
            {sub}
          </div>
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
      toast.success('Desk settings saved.');
      qc.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
  });

  if (isLoading || !ws) {
    return (
      <div className="py-8  italic text-[14px] text-[color:var(--ink-2)]">
        Loading workspace…
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
      className="flex flex-col gap-14"
    >
      {/* Identity */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="01" title="Identity" />
        <div className="md:pl-[54px] grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>Desk name</Label>
            <HairlineInput
              value={name}
              onChange={(e) => { setDirty(true); setName(e.target.value); }}
              maxLength={200}
              required
            />
          </div>
          <div>
            <Label>Slug</Label>
            <div className="border-b border-[color:var(--rule)] py-2">
              <span className="font-mono text-[13px] text-[color:var(--ink)]">
                {ws.slug}
              </span>
            </div>
            <p className="mt-2  italic text-[12px] text-[color:var(--ink-2)]">
              Slugs are immutable today. Rename the workspace above; the slug stays for URL stability.
            </p>
          </div>
          <div className="md:col-span-2">
            <Label>Description (optional)</Label>
            <HairlineTextarea
              rows={3}
              placeholder="What this desk is for. Shown on workspace switcher and exports."
              value={description}
              onChange={(e) => { setDirty(true); setDescription(e.target.value); }}
              maxLength={500}
            />
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="02" title="Preferences" />
        <div className="md:pl-[54px]">
          <ToggleRow
            checked={notifyOnJobComplete}
            onChange={(v) => { setDirty(true); setNotifyOnJobComplete(v); }}
            label="Notify when a search completes"
            sub="We&rsquo;ll fire the outbound webhook and surface the results in your inbox."
          />
          <ToggleRow
            checked={cheapMode}
            onChange={(v) => { setDirty(true); setCheapMode(v); }}
            label="Thrift mode"
            sub="Skips SerpAPI searches during prospecting. Faster and free — but the engine has less web research to pull from."
          />

          <div className="flex items-start justify-between gap-6 py-4 border-b border-[color:var(--rule)]/70">
            <div className="min-w-0 flex-1">
              <div className=" text-[14px] text-[color:var(--ink)]">
                Default export format
              </div>
              <div className="mt-1  italic text-[12.5px] text-[color:var(--ink-2)]">
                Controls the default format of the Export CSV button across leads and results.
              </div>
            </div>
            <div className="w-[160px]">
              <HairlineSelect
                value={defaultExportFormat}
                onChange={(v) => { setDirty(true); setDefaultExportFormat(v as 'csv' | 'xlsx'); }}
              >
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (XLSX)</option>
              </HairlineSelect>
            </div>
          </div>
        </div>

        <div className="md:pl-[54px] mt-6 flex items-center justify-end">
          <PrimaryButton type="submit" disabled={saveMutation.isPending || !dirty}>
            {saveMutation.isPending ? 'Saving…' : 'Save desk settings'}
          </PrimaryButton>
        </div>
      </section>

      {/* Danger zone */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="03" title="Danger zone" />
        <div className="md:pl-[54px]">
          <ForthcomingPanel title="Archive or delete this desk.">
            Archiving hides the workspace and stops all running searches. Deletion is permanent.
            Both operations are forthcoming — contact us today if you need either.
          </ForthcomingPanel>
        </div>
      </section>
    </form>
  );
}
