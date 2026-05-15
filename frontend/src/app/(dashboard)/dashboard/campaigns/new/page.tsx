'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, LeadFileSummary } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';

// Shape of the preflight response — kept in-file because the backend
// type isn't exported through @leadreai/shared.
interface PreflightResponse {
  totalInFile: number;
  eligibleLeadsCount: number;
  skipped: { noEmail: number; suppressed: number; filtered: number; alreadyEnrolled: number };
  hasEmailConfig: boolean;
  firstSendAt: string | null;
}

interface ActivateResponse {
  enrolled: number;
  skipped: number;
  firstSendAt: string | null;
}

/* ─────────────────────────────────────────────────────────────────
 * Campaigns — new campaign wizard, editorial broadsheet.
 *
 * Four chapters: Audience → Sequence → Schedule → Review. The former
 * separate "Message" chapter collapsed into Sequence — each step
 * expands inline to edit its copy. Saving creates a draft Campaign
 * and a draft Sequence (see buildSequenceFromPayload on the backend).
 * Activation happens later via the campaign detail page.
 * ───────────────────────────────────────────────────────────────── */

/* ── Glyphs ─────────────────────────────────────────────────── */
const Svg = ({ className = 'w-3.5 h-3.5', sw = 1.5, children }: { className?: string; sw?: number; children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <g stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);
const CheckIcon = (p: { className?: string }) => <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>;
const MailIcon  = (p: { className?: string }) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
const UsersIcon = (p: { className?: string }) => <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>;
const PlusIcon  = (p: { className?: string }) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;

function ArrowEast({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowWest({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M14 8H2M6 4 2 8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Data ────────────────────────────────────────────────────── */
// Four chapters, not five. "Message" merged into "Sequence" — each step is
// now expandable inline with its own subject/body/tone/goal/AI toggle, so
// users don't author a cadence in one screen and the copy in another.
const STEPS = [
  { k: 'audience', label: 'Audience', n: '01' },
  { k: 'sequence', label: 'Sequence', n: '02' },
  { k: 'schedule', label: 'Schedule', n: '03' },
  { k: 'review',   label: 'Review',   n: '04' },
] as const;

type StepKey = typeof STEPS[number]['k'];

// Only channels the backend can actually send. Dropped "Manual/task" —
// it wasn't in the data model and the UI was authoring fiction.
const CHANNELS = [
  { k: 'email',    label: 'Email',    icon: MailIcon },
  { k: 'linkedin', label: 'LinkedIn', icon: UsersIcon },
] as const;

type ChannelKey = typeof CHANNELS[number]['k'];

const TONES = ['direct', 'warm', 'executive', 'founder'] as const;
type ToneKey = typeof TONES[number];

// Business-hour presets map to numeric {startHour, endHour} on save.
const HOURS_PRESETS = [
  { label: '9–5',  startHour: 9,  endHour: 17 },
  { label: '8–6',  startHour: 8,  endHour: 18 },
  { label: '10–4', startHour: 10, endHour: 16 },
] as const;

// Day presets; `allowedDays` on the payload is 0=Sun…6=Sat.
const DAYS_PRESETS = [
  { label: 'Mon–Fri',  days: [1, 2, 3, 4, 5] },
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
] as const;

interface SeqStep {
  channel: ChannelKey;
  delayDays: number;   // was a string like "Day 3"
  tone: ToneKey;
  subject: string;
  body: string;
  goal: string;
  useAI: boolean;
}

interface Schedule {
  timezone: string;
  startHour: number;
  endHour: number;
  allowedDays: number[];
  dailySendCap: number;
}

interface ReplyRules {
  pauseOnReply: boolean;
  classify: boolean;
  notifyChannel: 'slack' | 'email' | 'none';
}

/** Three ways a user picks who a campaign reaches. All resolve to a
 *  single `fileId` for the backend — modes are just the entry paths. */
type SourceMode = 'table' | 'file' | 'leads';

/** Narration for the "source chip" that appears after selection. Keeps
 *  the campaign builder honest about what audience the user actually
 *  just pointed at, instead of hiding it behind a numeric fileId. */
type SourceMeta =
  | { mode: 'table'; tableName: string; fileName: string; leadCount: number }
  | { mode: 'file'; fileName: string; leadCount: number }
  | { mode: 'leads'; searchTerm: string; fileName: string; leadCount: number };

function hoursLabel(s: Schedule): string {
  const preset = HOURS_PRESETS.find((p) => p.startHour === s.startHour && p.endHour === s.endHour);
  return preset?.label ?? `${s.startHour}–${s.endHour}`;
}
function daysLabel(s: Schedule): string {
  const preset = DAYS_PRESETS.find((p) =>
    p.days.length === s.allowedDays.length && p.days.every((d, i) => s.allowedDays[i] === d),
  );
  return preset?.label ?? `${s.allowedDays.length} days`;
}
function tzCity(tz: string): string {
  return tz.split('/')[1]?.replace('_', ' ') ?? tz;
}

/* ── Section ──────────────────────────────────────────────────
 * Titled block — replaces the editorial 40px italic chapter +
 * decorative rule + italic 20px title. Now a clean header row
 * with mono step numeral + 14.5px medium title; vertical spacing
 * carries the rhythm. */
function Section({
  chapter,
  title,
  sub,
  children,
}: {
  chapter: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="pb-2">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-mono text-[10.5px] tabular-nums tracking-[0.04em] text-[color:var(--ink-3)]">
          {chapter}
        </span>
        <h2 className="text-[14.5px] font-semibold text-[color:var(--ink)] tracking-[-0.005em]">
          {title}
        </h2>
      </div>
      {sub && (
        <p className="text-[12.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[560px] mb-4">
          {sub}
        </p>
      )}
      <div>{children}</div>
    </section>
  );
}

/* ── Field — bordered rounded-md input with soft amber focus ring */
function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md px-3 h-9 outline-none text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition-colors ${
          mono ? 'font-mono text-[12.5px]' : 'text-[13.5px]'
        }`}
      />
    </div>
  );
}

/* ── Select — same shape as Field, with chevron */
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md pl-3 pr-9 h-9 outline-none text-[13.5px] text-[color:var(--ink)] appearance-none cursor-pointer transition-colors"
        >
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          fill="none"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[color:var(--ink-3)]"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

/* ── CheckRow — clickable row with rounded checkbox */
function CheckRow({
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
    <label className="flex items-start gap-3 py-2.5 border-b border-[color:var(--rule)] last:border-b-0 cursor-pointer hover:bg-[color:var(--paper-2)]/40 px-2 -mx-2 rounded-md transition-colors">
      <span className="relative mt-[2px] shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={`block w-4 h-4 rounded-[3px] border transition-colors ${
            checked
              ? 'bg-[color:var(--ink)] border-[color:var(--ink)]'
              : 'bg-[color:var(--paper)] border-[color:var(--rule)]'
          }`}
        />
        {checked && (
          <svg className="absolute top-0 left-0 w-4 h-4 p-[2px]" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="m3 8 3.5 3.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-[color:var(--ink)] leading-tight">{label}</div>
        {sub && (
          <div className="text-[12px] text-[color:var(--ink-3)] leading-[1.45] mt-1">
            {sub}
          </div>
        )}
      </div>
    </label>
  );
}

/* ── ChannelPicker — segmented rounded-md control */
function ChannelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center border border-[color:var(--rule)] rounded-md p-0.5 bg-[color:var(--paper)]">
      {CHANNELS.map((c) => {
        const Ico = c.icon;
        const on = value === c.k;
        return (
          <button
            key={c.k}
            title={c.label}
            onClick={(e) => { e.stopPropagation(); onChange(c.k); }}
            className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${
              on
                ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
            }`}
          >
            <Ico className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/* ── Step: Audience ───────────────────────────────────────────
 *
 * Redesigned 2026-04-22 around source *modes*, not a single file picker.
 * A campaign's audience can come from three places:
 *
 *   • Table  — a DataTable the user has already researched (M1 primary).
 *   • File   — a previously-curated lead file (legacy + manual).
 *   • Leads  — ad-hoc selection from the workspace's Leads collection.
 *
 * All three resolve to a single `fileId` for the backend (the campaign
 * model requires a file); the modes differ only in how the file is
 * obtained. Once a source is picked, a chip summarizes what was chosen
 * with an × to discard and repick.
 */
function AudienceStep({
  name,
  setName,
  refine,
  setRefine,
  fileId,
  sourceMode,
  setSourceMode,
  sourceMeta,
  files,
  filesLoading,
  workspaceId,
  onSourcePicked,
  onClearSource,
}: {
  name: string;
  setName: (v: string) => void;
  refine: { hotOnly: boolean; verifiedOnly: boolean };
  setRefine: (v: { hotOnly: boolean; verifiedOnly: boolean }) => void;
  fileId: string;
  sourceMode: SourceMode;
  setSourceMode: (m: SourceMode) => void;
  sourceMeta: SourceMeta | null;
  files: LeadFileSummary[];
  filesLoading: boolean;
  workspaceId: string;
  onSourcePicked: (fileId: string, meta: SourceMeta) => void;
  onClearSource: () => void;
}) {
  return (
    <Section
      chapter="01"
      title="Audience"
      sub="Name the campaign and pick who it reaches. Tighter audiences reply better."
    >
      <div className="flex flex-col gap-6">
        <Field
          label="Campaign name"
          value={name}
          onChange={setName}
          placeholder="Name this campaign"
        />

        <div>
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            Audience source
          </span>

          {fileId && sourceMeta ? (
            <SourceChip meta={sourceMeta} onClear={onClearSource} />
          ) : (
            <SourcePicker
              mode={sourceMode}
              setMode={setSourceMode}
              files={files}
              filesLoading={filesLoading}
              workspaceId={workspaceId}
              onPicked={onSourcePicked}
            />
          )}
        </div>

        <div>
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            Refinements <span className="text-[color:var(--ink-3)]/70">(optional)</span>
          </span>
          <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] divide-y divide-[color:var(--rule)] overflow-hidden">
            <div className="px-4 py-1">
              <CheckRow
                checked={!!refine.hotOnly}
                onChange={(v) => setRefine({ ...refine, hotOnly: v })}
                label="Hot leads only (score ≥ 90)"
                sub="Focuses on highest-fit contacts."
              />
            </div>
            <div className="px-4 py-1">
              <CheckRow
                checked={!!refine.verifiedOnly}
                onChange={(v) => setRefine({ ...refine, verifiedOnly: v })}
                label="Only verified emails"
                sub="Skips pattern-inferred addresses that haven't been SMTP-probed."
              />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── Source chip — appears after a source is chosen ─────────────
 *
 * Narrates the choice in plain language so the user can verify it at a
 * glance. Mode-specific copy ("23 rows from table X", "47 leads matching
 * 'fintech'") makes the provenance legible; a single × drops the choice
 * and reopens the picker with the same mode pre-selected. */
function SourceChip({ meta, onClear }: { meta: SourceMeta; onClear: () => void }) {
  let primary = '';
  let secondary = '';
  const kicker = meta.mode === 'table' ? 'From table' : meta.mode === 'file' ? 'From file' : 'From leads';

  if (meta.mode === 'table') {
    primary = meta.tableName;
    secondary = `${meta.leadCount} lead${meta.leadCount === 1 ? '' : 's'} · filed as "${meta.fileName}"`;
  } else if (meta.mode === 'file') {
    primary = meta.fileName;
    secondary = `${meta.leadCount} lead${meta.leadCount === 1 ? '' : 's'}`;
  } else {
    primary = meta.searchTerm ? `"${meta.searchTerm}"` : 'Hand-picked';
    secondary = `${meta.leadCount} lead${meta.leadCount === 1 ? '' : 's'} · filed as "${meta.fileName}"`;
  }

  return (
    <div className="rounded-md border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/[0.06] px-4 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-start gap-3">
        <span className="mt-1 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] shrink-0" aria-hidden />
        <div className="min-w-0">
          <span className="font-mono text-[10px] tracking-[0.04em] text-[color:var(--ember-2)] block">
            {kicker.toLowerCase()}
          </span>
          <div className="mt-0.5 text-[14px] font-semibold text-[color:var(--ink)] truncate">
            {primary}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)] truncate">
            {secondary}
          </div>
        </div>
      </div>
      <button
        onClick={onClear}
        title="Discard this source and pick another"
        className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper)] transition-colors"
      >
        Change
      </button>
    </div>
  );
}

/* ── Source picker — the mode tabs + per-mode picker ─────────── */

function SourcePicker({
  mode,
  setMode,
  files,
  filesLoading,
  workspaceId,
  onPicked,
}: {
  mode: SourceMode;
  setMode: (m: SourceMode) => void;
  files: LeadFileSummary[];
  filesLoading: boolean;
  workspaceId: string;
  onPicked: (fileId: string, meta: SourceMeta) => void;
}) {
  return (
    <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
      <ModeTabs mode={mode} setMode={setMode} />
      <div className="p-4">
        {mode === 'table' && (
          <TableSourcePicker workspaceId={workspaceId} onPicked={onPicked} />
        )}
        {mode === 'file' && (
          <FileSourcePicker
            files={files}
            filesLoading={filesLoading}
            onPicked={onPicked}
          />
        )}
        {mode === 'leads' && (
          <LeadsSourcePicker workspaceId={workspaceId} onPicked={onPicked} />
        )}
      </div>
    </div>
  );
}

function ModeTabs({ mode, setMode }: { mode: SourceMode; setMode: (m: SourceMode) => void }) {
  const tabs: Array<{ k: SourceMode; label: string; hint: string }> = [
    { k: 'table', label: 'Table', hint: 'From a researched spreadsheet' },
    { k: 'file',  label: 'File',  hint: 'From a curated lead file' },
    { k: 'leads', label: 'Leads', hint: 'Hand-pick from the library' },
  ];
  return (
    <div className="grid grid-cols-3 border-b border-[color:var(--rule)] bg-[color:var(--paper-2)]/40">
      {tabs.map((t, i) => {
        const on = t.k === mode;
        return (
          <button
            key={t.k}
            onClick={() => setMode(t.k)}
            className={`relative px-4 py-2.5 text-left transition-colors ${i > 0 ? 'border-l border-[color:var(--rule)]' : ''} ${
              on
                ? 'bg-[color:var(--paper)]'
                : 'hover:bg-[color:var(--paper)]/60'
            }`}
          >
            {on && (
              <span className="absolute left-0 bottom-0 right-0 h-[2px] bg-[color:var(--ember)]" aria-hidden />
            )}
            <div className={`text-[12.5px] font-medium ${on ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink-2)]'}`}>
              {t.label}
            </div>
            <div className={`mt-0.5 text-[11.5px] ${on ? 'text-[color:var(--ink-2)]' : 'text-[color:var(--ink-3)]'}`}>
              {t.hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Mode: Table ──────────────────────────────────────────── */

interface TableListItem {
  _id: string;
  name: string;
  rowType: string;
  rowCount: number;
}

function TableSourcePicker({
  workspaceId,
  onPicked,
}: {
  workspaceId: string;
  onPicked: (fileId: string, meta: SourceMeta) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['tables-for-campaign', workspaceId],
    queryFn: () => apiFetch<ApiResponse<{ data: TableListItem[]; total: number }>>(
      `/api/v1/workspaces/${workspaceId}/tables?limit=100`,
    ),
    enabled: !!workspaceId,
  });
  const tables = data?.data?.data ?? [];

  const [selectedId, setSelectedId] = useState('');
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = tables.find((t) => t._id === selectedId);
  useEffect(() => {
    if (selected && !fileName) setFileName(selected.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleUse() {
    if (!selected || !fileName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<ApiResponse<{ fileId: string; name: string; leadCount: number }>>(
        `/api/v1/workspaces/${workspaceId}/tables/${selected._id}/to-file`,
        { method: 'POST', body: JSON.stringify({ name: fileName.trim() }) },
      );
      if (res.data?.fileId) {
        onPicked(res.data.fileId, {
          mode: 'table',
          tableName: selected.name,
          fileName: res.data.name ?? fileName.trim(),
          leadCount: res.data.leadCount,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return <p className=" italic text-[13.5px] text-[color:var(--ink-3)]">Loading tables…</p>;
  }

  if (tables.length === 0) {
    return (
      <EmptyModeHint
        copy="No tables yet."
        linkHref="/dashboard/tables"
        linkLabel="Go to Tables →"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Pick a table
        </span>
        <div className="border border-[color:var(--rule)] rounded-sm max-h-[260px] overflow-y-auto">
          {tables.map((t) => {
            const on = selectedId === t._id;
            return (
              <button
                key={t._id}
                onClick={() => setSelectedId(t._id)}
                className={`w-full grid grid-cols-[1fr_auto_auto] gap-4 items-baseline py-2.5 px-3 border-b border-[color:var(--rule)]/60 last:border-b-0 text-left transition ${
                  on ? 'bg-[color:var(--ember)]/5 border-l-2 border-l-[color:var(--ember)]' : 'hover:bg-[color:var(--paper-3)]/50'
                }`}
              >
                <span className=" text-[13.5px] text-[color:var(--ink)] truncate">
                  {t.name}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                  {t.rowType}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] min-w-[70px] text-right">
                  {t.rowCount.toLocaleString()} row{t.rowCount === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2  italic text-[12px] text-[color:var(--ink-3)]">
          Rows linked to leads (from a dispatch) will seed the file. Hand-entered rows without a lead link are skipped.
        </p>
      </div>

      {selected && (
        <InlineField
          label="File name"
          value={fileName}
          onChange={setFileName}
          placeholder={selected.name}
        />
      )}

      {error && <ErrorBar>{error}</ErrorBar>}

      <div className="flex items-center justify-end">
        <button
          onClick={() => void handleUse()}
          disabled={!selected || !fileName.trim() || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-5 py-2.5 rounded-full  text-[13px] font-medium transition-colors disabled:opacity-40"
        >
          {saving ? 'Preparing…' : 'Use this table →'}
        </button>
      </div>
    </div>
  );
}

/* ── Mode: File ───────────────────────────────────────────── */

function FileSourcePicker({
  files,
  filesLoading,
  onPicked,
}: {
  files: LeadFileSummary[];
  filesLoading: boolean;
  onPicked: (fileId: string, meta: SourceMeta) => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const selected = files.find((f) => f._id === selectedId);

  if (filesLoading) {
    return <p className=" italic text-[13.5px] text-[color:var(--ink-3)]">Loading files…</p>;
  }

  if (files.length === 0) {
    return (
      <EmptyModeHint
        copy="No files yet. Files get created automatically from completed dispatches, or curated by hand."
        linkHref="/dashboard/files"
        linkLabel="Go to Files →"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Pick a file
        </span>
        <div className="border border-[color:var(--rule)] rounded-sm max-h-[260px] overflow-y-auto">
          {files.map((f) => {
            const on = selectedId === f._id;
            return (
              <button
                key={f._id}
                onClick={() => setSelectedId(f._id)}
                className={`w-full grid grid-cols-[1fr_auto] gap-4 items-baseline py-2.5 px-3 border-b border-[color:var(--rule)]/60 last:border-b-0 text-left transition ${
                  on ? 'bg-[color:var(--ember)]/5 border-l-2 border-l-[color:var(--ember)]' : 'hover:bg-[color:var(--paper-3)]/50'
                }`}
              >
                <span className=" text-[13.5px] text-[color:var(--ink)] truncate">
                  {f.name}
                </span>
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] min-w-[80px] text-right">
                  {f.leadCount.toLocaleString()} lead{f.leadCount === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={() => {
            if (!selected) return;
            onPicked(selected._id, {
              mode: 'file',
              fileName: selected.name,
              leadCount: selected.leadCount,
            });
          }}
          disabled={!selected}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-5 py-2.5 rounded-full  text-[13px] font-medium transition-colors disabled:opacity-40"
        >
          Use this file →
        </button>
      </div>
    </div>
  );
}

/* ── Mode: Leads (hand-pick) ──────────────────────────────── */

interface LeadListItem {
  _id: string;
  companyName?: string;
  companyDomain?: string;
  industry?: string;
  rankScore?: number;
  emails?: Array<{ value?: string }>;
}

// The leads listing endpoint returns a flat envelope — data is the array
// and total/page/limit sit at the top level next to `success`.
type LeadsListEnvelope = {
  success: true;
  data: LeadListItem[];
  total: number;
  page: number;
  limit: number;
};

function LeadsSourcePicker({
  workspaceId,
  onPicked,
}: {
  workspaceId: string;
  onPicked: (fileId: string, meta: SourceMeta) => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<Record<string, LeadListItem>>({});
  const [fileName, setFileName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce so every keystroke doesn't hit the Leads index. 250 ms is
  // the "I'm done typing" sweet spot in practice.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Leads uses `q` (Mongo $text search), not `search`. Empty q returns
  // the most-recent 50 by rankScore.
  const { data, isLoading } = useQuery({
    queryKey: ['leads-for-campaign', workspaceId, debouncedSearch],
    queryFn: () => apiFetch<LeadsListEnvelope>(
      `/api/v1/workspaces/${workspaceId}/leads?limit=50${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`,
    ),
    enabled: !!workspaceId,
  });
  const leads = data?.data ?? [];
  const total = data?.total ?? leads.length;

  const selectedCount = Object.keys(selected).length;

  function toggle(l: LeadListItem) {
    setSelected((cur) => {
      const next = { ...cur };
      if (next[l._id]) delete next[l._id];
      else next[l._id] = l;
      return next;
    });
  }

  async function handleUse() {
    if (selectedCount === 0 || !fileName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<ApiResponse<{ _id: string; name: string; leadIds: string[] }>>(
        `/api/v1/workspaces/${workspaceId}/files`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: fileName.trim(),
            leadIds: Object.keys(selected),
          }),
        },
      );
      if (res.data?._id) {
        onPicked(res.data._id, {
          mode: 'leads',
          searchTerm: debouncedSearch,
          fileName: res.data.name ?? fileName.trim(),
          leadCount: selectedCount,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <InlineField
        label="Search leads"
        value={search}
        onChange={setSearch}
        placeholder="Company name, domain, industry…"
      />

      <div>
        <div className="flex items-center justify-between mb-2 font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          <span>Results</span>
          <span>
            {selectedCount > 0 && <span className="text-[color:var(--ember)]">{selectedCount} selected · </span>}
            {total} matching
          </span>
        </div>
        {isLoading && leads.length === 0 ? (
          <p className="py-3  italic text-[13px] text-[color:var(--ink-3)]">Searching…</p>
        ) : leads.length === 0 ? (
          <EmptyModeHint
            copy="No leads match that search. Try a broader term, or run a dispatch to add more."
            linkHref="/dashboard"
            linkLabel="Run a dispatch →"
          />
        ) : (
          <div className="border border-[color:var(--rule)] rounded-sm max-h-[280px] overflow-y-auto">
            {leads.map((l) => {
              const checked = !!selected[l._id];
              return (
                <label
                  key={l._id}
                  className={`flex items-center gap-3 py-2 px-3 border-b border-[color:var(--rule)]/60 last:border-b-0 cursor-pointer transition ${
                    checked ? 'bg-[color:var(--ember)]/5' : 'hover:bg-[color:var(--paper-3)]/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(l)}
                    className="accent-[color:var(--ember)] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className=" text-[13.5px] text-[color:var(--ink)] truncate">
                      {l.companyName ?? l.companyDomain ?? 'Unnamed'}
                    </div>
                    <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
                      {[l.companyDomain, l.industry].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {typeof l.rankScore === 'number' && (
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-[color:var(--ink-2)]">
                      {l.rankScore}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {selectedCount > 0 && (
        <InlineField
          label="File name"
          value={fileName}
          onChange={setFileName}
          placeholder={debouncedSearch ? `${debouncedSearch} · ${selectedCount}` : `${selectedCount} leads`}
        />
      )}

      {error && <ErrorBar>{error}</ErrorBar>}

      <div className="flex items-center justify-between gap-3">
        <span className=" italic text-[12px] text-[color:var(--ink-3)]">
          {selectedCount === 0 ? 'Select at least one lead.' : `File will contain ${selectedCount} lead${selectedCount === 1 ? '' : 's'}.`}
        </span>
        <button
          onClick={() => void handleUse()}
          disabled={selectedCount === 0 || !fileName.trim() || saving}
          className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] px-5 py-2.5 rounded-full  text-[13px] font-medium transition-colors disabled:opacity-40"
        >
          {saving ? 'Preparing…' : `Use ${selectedCount} lead${selectedCount === 1 ? '' : 's'} →`}
        </button>
      </div>
    </div>
  );
}

/* ── Shared bits used by the picker modes ─────────────────── */

function EmptyModeHint({
  copy,
  linkHref,
  linkLabel,
}: {
  copy: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/40 rounded-sm p-5 text-center">
      <p className=" italic text-[13.5px] text-[color:var(--ink-2)] mb-3">
        {copy}
      </p>
      <Link
        href={linkHref}
        className="inline-flex items-center  text-[13px] text-[color:var(--ink)] underline decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

function InlineField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
        className="w-full bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] py-2 outline-none  text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
      />
    </label>
  );
}

function ErrorBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[color:var(--warn)] px-3 py-2  text-[12.5px] text-[color:var(--ink)]">
      {children}
    </div>
  );
}

/* ── Step: Sequence (merged with former Message chapter) ─────
 *
 * Each row is a compact summary. Click to expand inline: subject + body +
 * tone + goal + "AI auto-personalize" toggle + live preview. Prior version
 * split cadence (sequence chapter) and copy (message chapter) across two
 * screens; merging them means authors don't tab back and forth to see
 * what they're scheduling.
 */
function SequenceStep({
  seq,
  setSeq,
  activeStep,
  setActiveStep,
}: {
  seq: SeqStep[];
  setSeq: (v: SeqStep[]) => void;
  activeStep: number;
  setActiveStep: (v: number) => void;
}) {
  const addStep = () => {
    const nextDelay = seq.length ? (seq[seq.length - 1]?.delayDays ?? 0) + 2 : 0;
    setSeq([
      ...seq,
      {
        channel: 'email',
        delayDays: nextDelay,
        tone: 'direct',
        subject: '',
        body: '',
        goal: '',
        useAI: false,
      },
    ]);
    setActiveStep(seq.length);
  };
  const removeStep = (i: number) => {
    const n = seq.filter((_, j) => j !== i);
    setSeq(n);
    if (activeStep >= n.length) setActiveStep(Math.max(0, n.length - 1));
  };

  return (
    <Section chapter="02" title="Sequence" sub="The cadence and the copy, together. Click any step to edit.">
      <div className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
        {seq.map((s, i) => {
          const isActive = activeStep === i;
          return (
            <div key={i} className={i > 0 ? 'border-t border-[color:var(--rule)]' : ''}>
              {/* Row summary — click anywhere to expand */}
              <div
                onClick={() => setActiveStep(isActive ? -1 : i)}
                className={`group grid grid-cols-[28px_auto_1fr_auto_auto_28px] gap-3 md:gap-4 items-center px-4 md:px-5 py-3 cursor-pointer transition-colors ${
                  isActive ? 'bg-[color:var(--paper-2)]' : 'hover:bg-[color:var(--paper-2)]/60'
                }`}
              >
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full font-mono text-[11px] tabular-nums text-[color:var(--ink-3)] border border-[color:var(--rule)] bg-[color:var(--paper-2)]">
                  {i + 1}
                </span>
                <ChannelPicker
                  value={s.channel}
                  onChange={(v) => {
                    const n = [...seq];
                    n[i] = { ...s, channel: v as ChannelKey };
                    setSeq(n);
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[13.5px] text-[color:var(--ink)] font-medium truncate">
                    {s.subject || <span className="text-[color:var(--ink-3)] font-normal">No subject</span>}
                  </div>
                  <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] truncate">
                    Day {s.delayDays} · {s.tone}{s.goal ? ` · ${s.goal}` : ''}{s.useAI ? ' · ai' : ''}
                  </div>
                </div>
                {/* Day-N inline number — bordered rounded-md so it reads
                    as an editable control even at rest */}
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[10.5px] text-[color:var(--ink-3)]">day</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={s.delayDays}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const n = [...seq];
                      n[i] = { ...s, delayDays: Math.max(0, Number(e.target.value) || 0) };
                      setSeq(n);
                    }}
                    className="w-[60px] bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md outline-none text-center font-mono text-[12px] tabular-nums text-[color:var(--ink)] py-1 transition-colors"
                  />
                </div>
                {/* Expand chevron — replaces the "edit/close" mono label */}
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`w-3 h-3 text-[color:var(--ink-3)] transition-transform ${isActive ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeStep(i);
                  }}
                  className="w-7 h-7 rounded-md text-[color:var(--ink-3)] hover:text-[color:var(--warn)] hover:bg-[color:var(--paper-3)] transition-colors flex items-center justify-center"
                  title="Remove step"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
                    <path d="m3 3 10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Expanded editor (only for active step) */}
              {isActive && (
                <StepEditor
                  step={s}
                  onChange={(patch) => {
                    const n = [...seq];
                    n[i] = { ...s, ...patch };
                    setSeq(n);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addStep}
        className="mt-3 h-10 w-full border border-dashed border-[color:var(--rule)] rounded-md text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink-3)] hover:bg-[color:var(--paper-2)]/40 inline-flex items-center justify-center gap-1.5 transition-colors"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        Add a step
      </button>

      <p className="mt-5 text-[12px] text-[color:var(--ink-3)]">
        A reply pauses the sequence for that lead by default. Tune reply rules in step 03.
      </p>
    </Section>
  );
}

/* ── Expanded step editor ──────────────────────────────────── */
function StepEditor({
  step,
  onChange,
}: {
  step: SeqStep;
  onChange: (patch: Partial<SeqStep>) => void;
}) {
  return (
    <div className="border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/40">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 p-4 md:p-5">
        {/* Edit column */}
        <div className="flex flex-col gap-4">
          <Field
            label="Subject"
            value={step.subject}
            onChange={(v) => onChange({ subject: v })}
            placeholder="Quick thought on {{company}}"
          />

          <Field
            label="Goal"
            value={step.goal}
            onChange={(v) => onChange({ goal: v })}
            placeholder="Book a demo · Reply check · Break-up"
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
                Body
              </span>
              <span className="font-mono text-[10px] tracking-[0.04em] text-[color:var(--ink-3)]/80">
                {step.useAI ? 'AI personalizes per lead' : 'merge tokens resolve at send'}
              </span>
            </div>
            <textarea
              rows={9}
              value={step.body}
              onChange={(e) => onChange({ body: e.target.value })}
              placeholder={`Hi {{first_name}},\n\nNoticed {{company}} …`}
              className="block w-full bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md px-3 py-2 outline-none text-[13.5px] leading-[1.6] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] resize-none transition-colors"
            />
          </div>

          <div>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
              Tone
            </span>
            <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 w-full">
              {TONES.map((t) => {
                const on = step.tone === t;
                return (
                  <button
                    key={t}
                    onClick={() => onChange({ tone: t })}
                    className={`flex-1 h-7 rounded text-[12px] capitalize transition-colors ${
                      on
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                        : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI personalize — visually marked as the differentiator
              with a soft amber tint when enabled. Cleaner than the
              checkbox + italic sub. */}
          <label
            className={`flex items-start gap-3 cursor-pointer rounded-md border p-3 transition-colors ${
              step.useAI
                ? 'border-[color:var(--ember)]/40 bg-[color:var(--ember)]/[0.04]'
                : 'border-[color:var(--rule)] bg-[color:var(--paper)] hover:border-[color:var(--ink-3)]'
            }`}
          >
            <span className="relative mt-[2px] shrink-0">
              <input
                type="checkbox"
                checked={step.useAI}
                onChange={(e) => onChange({ useAI: e.target.checked })}
                className="peer sr-only"
              />
              <span
                className={`block w-4 h-4 rounded-[3px] border transition-colors ${
                  step.useAI
                    ? 'bg-[color:var(--ember)] border-[color:var(--ember)]'
                    : 'bg-[color:var(--paper)] border-[color:var(--rule)]'
                }`}
              />
              {step.useAI && (
                <svg className="absolute top-0 left-0 w-4 h-4 p-[2px]" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="m3 8 3.5 3.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium text-[color:var(--ink)] leading-tight">
                  AI auto-personalize per lead
                </span>
                {step.useAI && (
                  <span className="font-mono text-[9.5px] tracking-[0.04em] text-[color:var(--ember-2)] uppercase">
                    on
                  </span>
                )}
              </div>
              <div className="text-[12px] text-[color:var(--ink-2)] leading-[1.5] mt-1">
                Uses the body above as guidance; generates a fresh draft per recipient from their company,
                industry, and recent signals. Costs more credits — and materially higher reply rates.
              </div>
            </div>
          </label>
        </div>

        {/* Preview column */}
        <StepPreview step={step} />
      </div>
    </div>
  );
}

function StepPreview({ step }: { step: SeqStep }) {
  const sampleCompany = 'Paystack';
  const sampleFirst = 'Shola';
  const renderTokens = (s: string) =>
    s.replace(/\{\{company\}\}/gi, sampleCompany).replace(/\{\{first_name\}\}/gi, sampleFirst);

  const previewSubject = step.subject ? renderTokens(step.subject) : <span className="text-[color:var(--ink-3)]">No subject</span>;
  const previewBody = step.body ? renderTokens(step.body) : '(empty)';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
          Preview
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-[color:var(--ink-3)]/80">
          sample recipient{step.useAI ? ' · base draft' : ''}
        </span>
      </div>
      <div className="bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-md p-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-[color:var(--rule)]">
          <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)]">
            shola@paystack.com
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-2)] px-2 h-5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)]" aria-hidden />
            <span className="font-mono text-[10px] text-[color:var(--ink-3)]">draft</span>
          </span>
        </div>
        <h4 className="mt-3 text-[15px] font-semibold leading-[1.35] text-[color:var(--ink)]">
          {previewSubject}
        </h4>
        <p className="mt-2.5 text-[13px] leading-[1.6] text-[color:var(--ink-2)] whitespace-pre-line">
          {previewBody}
        </p>
      </div>
      <p className="text-[11.5px] text-[color:var(--ink-3)] leading-[1.55]">
        Merge tokens resolve per-lead from provenance-backed fields. Missing data becomes an em-dash, never a guess.
      </p>
    </div>
  );
}

/* ── Step: Schedule ─────────────────────────────────────────── */
function ScheduleStep({
  schedule,
  setSchedule,
  replyRules,
  setReplyRules,
}: {
  schedule: Schedule;
  setSchedule: (v: Schedule) => void;
  replyRules: ReplyRules;
  setReplyRules: (v: ReplyRules) => void;
}) {
  const setHours = (preset: typeof HOURS_PRESETS[number]) =>
    setSchedule({ ...schedule, startHour: preset.startHour, endHour: preset.endHour });
  const setDays = (preset: typeof DAYS_PRESETS[number]) =>
    setSchedule({ ...schedule, allowedDays: [...preset.days] });

  return (
    <Section chapter="03" title="Schedule" sub="Set the sending window and what happens when a reply lands.">
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField
            label="Timezone"
            value={schedule.timezone}
            onChange={(v) => setSchedule({ ...schedule, timezone: v })}
            options={Array.from(new Set([
              schedule.timezone,
              'America/New_York',
              'America/Chicago',
              'America/Denver',
              'America/Los_Angeles',
              'Europe/London',
              'Europe/Berlin',
              'Africa/Lagos',
              'Africa/Nairobi',
              'Asia/Dubai',
              'Asia/Singapore',
              'Asia/Tokyo',
              'Australia/Sydney',
              'UTC',
            ]))}
          />
          <div>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
              Business hours
            </span>
            <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 w-full">
              {HOURS_PRESETS.map((p) => {
                const on = schedule.startHour === p.startHour && schedule.endHour === p.endHour;
                return (
                  <button
                    key={p.label}
                    onClick={() => setHours(p)}
                    className={`flex-1 h-8 rounded text-[12.5px] tabular-nums transition-colors ${
                      on
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                        : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
              Send days
            </span>
            <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 w-full">
              {DAYS_PRESETS.map((p) => {
                const on = schedule.allowedDays.length === p.days.length &&
                  p.days.every((d, i) => schedule.allowedDays[i] === d);
                return (
                  <button
                    key={p.label}
                    onClick={() => setDays(p)}
                    className={`flex-1 h-8 rounded text-[12.5px] transition-colors ${
                      on
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                        : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
                Daily cap
              </span>
              <span className="font-mono text-[16px] leading-none tabular-nums text-[color:var(--ink)]">
                {schedule.dailySendCap}
                <span className="font-mono text-[10.5px] text-[color:var(--ink-3)] ml-1">/ day</span>
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={500}
              step={20}
              value={schedule.dailySendCap}
              onChange={(e) => setSchedule({ ...schedule, dailySendCap: Number(e.target.value) })}
              className="w-full accent-[color:var(--ember)] cursor-pointer"
            />
            <div className="flex justify-between font-mono text-[10px] tabular-nums text-[color:var(--ink-3)]/70 mt-1">
              <span>20</span>
              <span>500</span>
            </div>
          </div>
        </div>

        <div>
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            Reply handling
          </span>
          <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] divide-y divide-[color:var(--rule)] overflow-hidden">
            <div className="px-4 py-1">
              <CheckRow
                checked={replyRules.pauseOnReply}
                onChange={(v) => setReplyRules({ ...replyRules, pauseOnReply: v })}
                label="Pause sequence on reply"
                sub="Stops subsequent steps for that lead so humans can take over."
              />
            </div>
            <div className="px-4 py-1">
              <CheckRow
                checked={replyRules.classify}
                onChange={(v) => setReplyRules({ ...replyRules, classify: v })}
                label="Auto-classify incoming replies"
                sub="Interested / not now / out of office / bounce — routed accordingly. Wired once inbound webhooks land."
              />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] text-[color:var(--ink)] leading-tight">
                  Notify on interested reply
                </div>
                <div className="text-[12px] text-[color:var(--ink-3)] leading-[1.45] mt-1">
                  The first positive reply triggers this alert — everything else accumulates in the inbox.
                </div>
              </div>
              <div className="relative shrink-0">
                <select
                  value={replyRules.notifyChannel}
                  onChange={(e) => setReplyRules({ ...replyRules, notifyChannel: e.target.value as ReplyRules['notifyChannel'] })}
                  className="bg-[color:var(--paper)] border border-[color:var(--rule)] hover:border-[color:var(--ink-3)] focus:border-[color:var(--ember)]/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md pl-3 pr-8 h-8 outline-none text-[12.5px] text-[color:var(--ink)] appearance-none cursor-pointer transition-colors"
                >
                  <option value="slack">Slack · #sales</option>
                  <option value="email">Email digest</option>
                  <option value="none">Don&rsquo;t notify</option>
                </select>
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  fill="none"
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[color:var(--ink-3)]"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── Step: Review ───────────────────────────────────────────── */
function ReviewStep({
  name,
  seq,
  schedule,
}: {
  name: string;
  seq: SeqStep[];
  schedule: Schedule;
}) {
  const aiSteps = seq.filter((s) => s.useAI).length;
  return (
    <Section chapter="04" title="Review" sub="Last check before saving the draft.">
      <div className="flex flex-col gap-5">
        {/* Summary card — clean rounded-xl, status pill, mono meta row */}
        <div className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[color:var(--rule)]">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06] px-2 h-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" aria-hidden />
              <span className="font-mono text-[10.5px] text-[color:var(--ember-2)]">draft ready</span>
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
              Saves as draft · activate later
            </span>
          </div>
          <div className="px-5 py-4">
            <h3 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
              {name || <span className="text-[color:var(--ink-3)] font-normal">Untitled campaign</span>}
            </h3>
            <p className="mt-2 font-mono text-[11.5px] tabular-nums text-[color:var(--ink-2)]">
              <span className="text-[color:var(--ink)]">{seq.length}</span> steps
              <span className="text-[color:var(--ink-3)]/60 mx-1.5">·</span>
              {daysLabel(schedule)}
              <span className="text-[color:var(--ink-3)]/60 mx-1.5">·</span>
              {hoursLabel(schedule)} {tzCity(schedule.timezone)}
              <span className="text-[color:var(--ink-3)]/60 mx-1.5">·</span>
              <span className="text-[color:var(--ink)]">{schedule.dailySendCap}</span>
              <span className="text-[color:var(--ink-3)]/60">/day</span>
              {aiSteps > 0 && (
                <>
                  <span className="text-[color:var(--ink-3)]/60 mx-1.5">·</span>
                  <span className="text-[color:var(--ember-2)]">{aiSteps} ai-personalized</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* What happens next — single rounded card with hairline rows */}
        <div>
          <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            What happens next
          </span>
          <ol className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
            {[
              'The campaign saves as a draft. Nothing sends until you activate it.',
              `Activation enrolls every lead in the file, honoring your audience filters${aiSteps ? ', and generates per-lead drafts for AI-personalized steps on first send' : ''}.`,
              'Replies pause the sequence for that lead once inbound webhooks are wired (next milestone).',
              'You can edit subject/body/tone per step before activation; step structure locks on activation.',
            ].map((t, i) => (
              <li
                key={i}
                className="flex items-start gap-3 px-4 md:px-5 py-3 border-b border-[color:var(--rule)] last:border-b-0 text-[13px] leading-[1.55] text-[color:var(--ink-2)]"
              >
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] shrink-0 mt-[1px]">
                  {i + 1}
                </span>
                <span className="text-[color:var(--ink)]">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Section>
  );
}

/* ── Right rail summary ─────────────────────────────────────── */
function Summary({
  name,
  seq,
  schedule,
}: {
  name: string;
  seq: SeqStep[];
  schedule: Schedule;
}) {
  return (
    <aside className="sticky top-24 rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
      {/* Title block */}
      <div className="px-5 py-4 border-b border-[color:var(--rule)]">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block">
          Campaign
        </span>
        <h3 className="mt-1 text-[15px] font-semibold text-[color:var(--ink)] truncate">
          {name || <span className="text-[color:var(--ink-3)] font-normal">Untitled</span>}
        </h3>
      </div>

      {/* Tabular metrics — same instrument-panel pattern as the dashboard's MetricsStrip */}
      <div className="grid grid-cols-2 border-b border-[color:var(--rule)]">
        <div className="px-5 py-3.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
            Steps
          </span>
          <div className="mt-1 font-mono text-[22px] leading-none tabular-nums text-[color:var(--ink)]">
            {seq.length}
          </div>
        </div>
        <div className="px-5 py-3.5 border-l border-[color:var(--rule)]">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
            Cap / day
          </span>
          <div className="mt-1 font-mono text-[22px] leading-none tabular-nums text-[color:var(--ink)]">
            {schedule.dailySendCap}
          </div>
        </div>
      </div>

      {/* Cadence list */}
      <div className="px-5 py-4">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
          Cadence
        </span>
        {seq.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-3)]">No steps yet.</p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {seq.map((s, i) => {
              const ch = CHANNELS.find((c) => c.k === s.channel);
              const Ico = ch?.icon ?? MailIcon;
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 text-[12px] text-[color:var(--ink-2)]"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full font-mono text-[10px] tabular-nums text-[color:var(--ink-3)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] shrink-0">
                    {i + 1}
                  </span>
                  <Ico className="w-3 h-3 text-[color:var(--ink-3)] shrink-0" />
                  <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] shrink-0 w-12">
                    day {s.delayDays}
                  </span>
                  <span className="text-[12px] text-[color:var(--ink-2)] truncate">
                    {s.goal || s.subject || '—'}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="px-5 py-3 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/40">
        <p className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] leading-[1.55]">
          Runs {daysLabel(schedule)} · {hoursLabel(schedule)} {tzCity(schedule.timezone)}
        </p>
      </div>
    </aside>
  );
}

/* ── Launched modal — preflight + activate flow ──────────────
 *
 * Flow: campaign is saved as a draft (M1 persistence), the modal opens
 * and immediately fetches preflight. The user sees how many leads will
 * be enrolled and can either "Activate now" (M2 endpoint) or keep as
 * draft and close. On successful activation, the modal transitions to
 * a success state and the sidebar cap/schedule stays as metadata.
 */
function LaunchedModal({
  open,
  onClose,
  onBack,
  onViewDetail,
  workspaceId,
  campaignId,
  seq: _seq,
  schedule,
}: {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onViewDetail: () => void;
  workspaceId: string;
  campaignId: string | null;
  seq: SeqStep[];
  schedule: Schedule;
}) {
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [activated, setActivated] = useState<ActivateResponse | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);

  // Fetch preflight once the modal opens with a known campaignId.
  useEffect(() => {
    if (!open || !campaignId) return;
    let cancelled = false;
    setPreflight(null);
    setPreflightError(null);
    apiFetch<ApiResponse<PreflightResponse>>(
      `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/preflight`,
    )
      .then((res) => { if (!cancelled) setPreflight(res.data ?? null); })
      .catch((err) => { if (!cancelled) setPreflightError(err instanceof Error ? err.message : 'Preflight failed'); });
    return () => { cancelled = true; };
  }, [open, campaignId, workspaceId]);

  async function handleActivate() {
    if (!campaignId || activating) return;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await apiFetch<ApiResponse<ActivateResponse>>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/activate`,
        { method: 'POST' },
      );
      setActivated(res.data ?? null);
    } catch (err) {
      setActivateError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setActivating(false);
    }
  }

  if (!open) return null;

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const firstDay = DAY_NAMES[schedule.allowedDays[0] ?? 1] ?? 'Monday';
  const tzLabel = tzCity(schedule.timezone);

  const isActivated = activated !== null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 animate-fade-in">
      <div className="absolute inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[min(92vw,520px)] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl overflow-hidden shadow-2xl animate-scale-in">
        {/* Header — status pill + concise title */}
        <div className="px-6 md:px-7 pt-6 pb-5 border-b border-[color:var(--rule)]">
          <div className="flex items-center gap-2 mb-3">
            {isActivated ? (
              <span className="relative inline-flex">
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" />
                <span className="absolute inset-0 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-60 animate-ping" />
              </span>
            ) : (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)]" />
            )}
            <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
              {isActivated ? 'Active' : 'Draft saved'}
            </span>
          </div>
          <h2 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
            {isActivated ? "You're live" : 'Saved as a draft'}
          </h2>
          <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] leading-[1.55]">
            {isActivated ? (
              <>
                <span className="font-medium text-[color:var(--ink)] tabular-nums">{activated!.enrolled}</span>
                {' '}leads enrolled. First send on {firstDay}{tzLabel ? ` · ${tzLabel}` : ''}. Pause or edit from the campaign detail.
              </>
            ) : (
              <>Saved. Review the preflight and activate when ready — nothing sends until you do.</>
            )}
          </p>
        </div>

        {/* Preflight (only for the draft state) */}
        {!isActivated && (
          <div className="px-6 md:px-7 py-5">
            {preflightError ? (
              <div className="flex items-start gap-3 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-3 py-2 text-[12.5px] text-[color:var(--ink-2)]">
                <span className="mt-[5px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
                <span>Couldn&rsquo;t load preflight: {preflightError}</span>
              </div>
            ) : !preflight ? (
              <div className="font-mono text-[12px] text-[color:var(--ink-3)]">
                Checking your leads…
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[36px] leading-none tabular-nums text-[color:var(--ink)]">
                    {preflight.eligibleLeadsCount}
                  </span>
                  <span className="text-[13px] text-[color:var(--ink-2)]">
                    of <span className="tabular-nums">{preflight.totalInFile}</span> leads will be enrolled
                  </span>
                </div>
                <SkipBreakdown skipped={preflight.skipped} />
                {!preflight.hasEmailConfig && (
                  <div role="alert" className="flex items-start gap-3 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-3 py-2 text-[12.5px] text-[color:var(--ink-2)]">
                    <span className="mt-[5px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
                    <span>Workspace email isn&rsquo;t configured. Visit Settings → Email before activating.</span>
                  </div>
                )}
              </div>
            )}

            {activateError && (
              <div role="alert" className="mt-3 flex items-start gap-3 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-3 py-2 text-[12.5px] text-[color:var(--ink-2)]">
                <span className="mt-[5px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
                <span>{activateError}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 px-6 md:px-7 py-3">
          {isActivated ? (
            <>
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
                {activated!.enrolled} enrolled · {activated!.skipped} skipped
              </span>
              <button
                onClick={onViewDetail}
                className="inline-flex items-center gap-1.5 bg-[color:var(--ink)] text-[color:var(--paper)] px-3.5 h-8 rounded-md text-[12.5px] font-medium hover:bg-[color:var(--ember)] transition-colors"
              >
                View campaign
                <ArrowEast className="w-3 h-3" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onBack}
                className="text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] inline-flex items-center gap-1.5 px-3 h-8 rounded-md transition-colors"
              >
                Keep as draft
              </button>
              <button
                onClick={() => void handleActivate()}
                disabled={activating || !preflight || !preflight.hasEmailConfig || preflight.eligibleLeadsCount === 0}
                title={
                  !preflight ? 'Waiting for preflight…' :
                  !preflight.hasEmailConfig ? 'Configure workspace email first' :
                  preflight.eligibleLeadsCount === 0 ? 'No eligible leads to enroll' :
                  undefined
                }
                className="inline-flex items-center gap-1.5 bg-[color:var(--ember)] text-white px-3.5 h-8 rounded-md text-[12.5px] font-medium hover:bg-[color:var(--ember-2)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {activating ? 'Activating…' : 'Activate now'}
                <ArrowEast className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SkipBreakdown({ skipped }: { skipped: PreflightResponse['skipped'] }) {
  const items = [
    skipped.noEmail > 0 ? { label: 'no email', n: skipped.noEmail } : null,
    skipped.suppressed > 0 ? { label: 'suppressed', n: skipped.suppressed } : null,
    skipped.filtered > 0 ? { label: 'failed audience filter', n: skipped.filtered } : null,
    skipped.alreadyEnrolled > 0 ? { label: 'already enrolled', n: skipped.alreadyEnrolled } : null,
  ].filter((x): x is { label: string; n: number } => x !== null);
  if (items.length === 0) return null;
  return (
    <div className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
      Skipped: {items.map((it, i) => (
        <span key={it.label}>
          {i > 0 && ' · '}
          <span className="text-[color:var(--ink-2)]">{it.n}</span> {it.label}
        </span>
      ))}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function CampaignBuilderPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [step, setStep] = useState<StepKey>('audience');
  const [launched, setLaunched] = useState(false);
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fileId, setFileId] = useState('');
  // Context describing *how* the user picked the source, so the "chip"
  // that appears after selection can narrate it back ("23 rows from
  // table Acme Prospects", "47 leads from 'fintech'"). This is purely
  // UI state — the backend only needs fileId.
  const [sourceMeta, setSourceMeta] = useState<SourceMeta | null>(null);
  // Last-used mode — we remember it after the user clears a selection so
  // the picker reopens on the tab they had, not the default.
  const [sourceMode, setSourceMode] = useState<SourceMode>('table');
  const [refine, setRefine] = useState<{ hotOnly: boolean; verifiedOnly: boolean }>({
    hotOnly: false,
    verifiedOnly: false,
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['files', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<{ data: LeadFileSummary[]; total: number }>>(
        `/api/v1/workspaces/${workspaceId}/files?limit=100`,
      ),
    enabled: !!workspaceId,
  });
  const files = filesData?.data?.data ?? [];
  // Start with one empty step — the user adds more. Boilerplate copy
  // ("Quick thought on {{company}}", "Following up") was removed because
  // it reads as intentional content in the UI, not as a placeholder, and
  // users would accidentally launch with it.
  const [seq, setSeq] = useState<SeqStep[]>([
    { channel: 'email', delayDays: 0, tone: 'direct', subject: '', body: '', goal: '', useAI: false },
  ]);
  const [activeStep, setActiveStep] = useState(0);
  // Detect the user's timezone client-side instead of hardcoding one. The
  // fallback lands on UTC in the (rare) case Intl doesn't resolve — better
  // than pretending every customer is in Lagos.
  const detectedTz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);
  const [schedule, setSchedule] = useState<Schedule>({
    timezone: detectedTz,
    startHour: 9,
    endHour: 17,
    allowedDays: [1, 2, 3, 4, 5],
    dailySendCap: 120,
  });
  const [replyRules, setReplyRules] = useState<ReplyRules>({
    pauseOnReply: true,
    classify: false,
    notifyChannel: 'none',
  });
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const stepIdx = STEPS.findIndex((s) => s.k === step);
  const canNext = stepIdx < STEPS.length - 1;
  const canPrev = stepIdx > 0;

  // Per-step gate for the Continue/Launch button. Each chapter has a
  // different "ready to move on" definition; failing users at the last
  // step with a vague error was the old UX — surface the reason early
  // and tie it to the Next button's tooltip instead.
  const advanceBlock: string | null = (() => {
    if (step === 'audience') {
      if (!name.trim()) return 'Give the campaign a name before continuing.';
      if (!fileId) return 'Pick an audience source before continuing.';
      return null;
    }
    if (step === 'sequence') {
      if (seq.length === 0) return 'Add at least one step.';
      // Blank subjects/bodies are valid drafts — don't block on them.
      return null;
    }
    // schedule + review have no hard gates beyond launch itself.
    if (!canNext) {
      if (!fileId) return 'Pick an audience source before launching.';
      if (!name.trim()) return 'Give the campaign a name before launching.';
    }
    return null;
  })();

  async function handleLaunch() {
    if (!workspaceId || !fileId || isLaunching) return;
    setIsLaunching(true);
    setLaunchError(null);
    try {
      const res = await apiFetch<ApiResponse<{ campaign: { _id: string }; sequence: { _id: string } }>>(
        `/api/v1/workspaces/${workspaceId}/campaigns`,
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            description: `Campaign with ${seq.length} steps`,
            fileId,
            steps: seq,
            schedule,
            audienceFilters: refine,
            replyRules,
            language: 'English',
          }),
        },
      );
      setSavedCampaignId(res.data?.campaign?._id ?? null);
      setLaunched(true);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Failed to save campaign');
    } finally {
      setIsLaunching(false);
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
      {/* Header — compact breadcrumb + title row */}
      <section className="mb-5 sm:mb-6">
        <div className="flex items-center gap-1.5 mb-3 font-mono text-[10.5px] text-[color:var(--ink-3)]">
          <Link
            href="/dashboard/campaigns"
            className="hover:text-[color:var(--ink)] transition-colors"
          >
            Campaigns
          </Link>
          <span className="text-[color:var(--ink-3)]/60">/</span>
          <span className="text-[color:var(--ink-2)]">New</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
              New campaign
            </h1>
            <p className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">
              Four steps. Saves as a draft — activate when you&rsquo;re ready.
            </p>
          </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageHelp
            title="Campaigns"
            body="Email outreach sequences. Pick a lead file as the audience, write your email steps, set a schedule, and activate. Track opens and replies on the campaign detail page."
            tips={[
              'Work through the four chapters: Audience → Sequence → Schedule → Review.',
              'AI-assisted copy is available per step — toggle it on in the sequence chapter.',
              'Campaigns save as drafts. Activate them when you are ready to send.',
            ]}
          />
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleLaunch}
            disabled={isLaunching || !fileId}
            title={!fileId ? 'Pick an audience first.' : undefined}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors disabled:opacity-50 disabled:hover:bg-[color:var(--ink)]"
          >
            {isLaunching ? 'Saving\u2026' : 'Save draft'}
          </button>
        </div>
        </div>
      </section>

      {/* Stepper — numbered chips inside a card with a hairline
          progress bar at the bottom. Replaces the editorial italic
          numerals with mono tabular-nums in circular badges; done
          steps fill amber, current fills ink, future stays outlined. */}
      <div className="mb-6 rounded-xl border border-[color:var(--rule)] bg-[color:var(--paper)] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 md:px-5 py-3 overflow-x-auto">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const current = i === stepIdx;
            const tone = current
              ? 'text-[color:var(--ink)]'
              : done
                ? 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)]';
            return (
              <div key={s.k} className="flex items-center gap-2 md:gap-3 min-w-0 shrink-0">
                <button
                  onClick={() => setStep(s.k)}
                  className={`inline-flex items-center gap-2 transition-colors ${tone}`}
                >
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full font-mono text-[10.5px] tabular-nums shrink-0 ${
                      current
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                        : done
                          ? 'bg-[color:var(--ember)] text-white'
                          : 'border border-[color:var(--rule)] text-[color:var(--ink-3)]'
                    }`}
                  >
                    {done ? <CheckIcon className="w-2.5 h-2.5" /> : s.n.replace(/^0/, '')}
                  </span>
                  <span className="text-[12.5px] font-medium whitespace-nowrap hidden sm:inline">
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className="hidden md:block w-6 lg:w-12 h-px bg-[color:var(--rule)]" />
                )}
              </div>
            );
          })}
        </div>
        <div className="h-[2px] bg-[color:var(--paper-3)] overflow-hidden">
          <div
            className="h-full bg-[color:var(--ember)] transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-14">
        <div className="min-w-0">
          {step === 'audience' && (
            <AudienceStep
              name={name}
              setName={setName}
              refine={refine}
              setRefine={setRefine}
              fileId={fileId}
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              sourceMeta={sourceMeta}
              files={files}
              filesLoading={filesLoading}
              workspaceId={workspaceId ?? ''}
              onSourcePicked={(newFileId, meta) => {
                setFileId(newFileId);
                setSourceMeta(meta);
                void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
              }}
              onClearSource={() => {
                setFileId('');
                setSourceMeta(null);
              }}
            />
          )}
          {step === 'sequence' && <SequenceStep seq={seq} setSeq={setSeq} activeStep={activeStep} setActiveStep={setActiveStep} />}
          {step === 'schedule' && <ScheduleStep schedule={schedule} setSchedule={setSchedule} replyRules={replyRules} setReplyRules={setReplyRules} />}
          {step === 'review'   && <ReviewStep   name={name} seq={seq} schedule={schedule} />}
          {launchError && (
            <div role="alert" className="mt-6 flex items-start gap-3 rounded-lg border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-4 py-3 text-[13px] text-[color:var(--ink)]">
              <span className="mt-[6px] inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" aria-hidden />
              <div>
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--warn)] block mb-0.5">
                  Save failed
                </span>
                <span className="text-[color:var(--ink-2)]">{launchError}</span>
              </div>
            </div>
          )}
        </div>
        <Summary name={name} seq={seq} schedule={schedule} />
      </div>

      {/* Footer nav — sticky, primary CTA labeled per-step. The
          advanceBlock string surfaces both as a tooltip and as a
          subtle helper line so users see WHY the button is dim
          before they click. */}
      <div className="mt-8 sm:mt-10 sticky bottom-0 bg-[color:var(--paper)]/95 backdrop-blur-sm border-t border-[color:var(--rule)] -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-10 px-4 sm:px-6 md:px-8 lg:px-10 py-3.5 flex items-center justify-between gap-3">
        <button
          onClick={() => {
            if (canPrev) {
              const prev = STEPS[stepIdx - 1];
              if (prev) setStep(prev.k);
            }
          }}
          disabled={!canPrev}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowWest className="w-3 h-3" />
          Back
        </button>

        <div className="flex items-center gap-3 min-w-0">
          {advanceBlock ? (
            <span className="hidden md:inline text-[12px] text-[color:var(--ink-3)] truncate max-w-[360px]">
              {advanceBlock}
            </span>
          ) : (
            <span className="hidden md:inline font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
              Step {stepIdx + 1} / {STEPS.length} · {STEPS[stepIdx]?.label}
            </span>
          )}
          <button
            onClick={() => {
              if (advanceBlock) return;
              if (canNext) {
                const nxt = STEPS[stepIdx + 1];
                if (nxt) setStep(nxt.k);
              } else {
                void handleLaunch();
              }
            }}
            disabled={Boolean(advanceBlock)}
            title={advanceBlock ?? undefined}
            className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              canNext
                ? 'bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)]'
                : 'bg-[color:var(--ember)] text-white hover:bg-[color:var(--ember-2)]'
            }`}
          >
            {canNext ? 'Continue' : 'Save campaign'}
            <ArrowEast className="w-3 h-3" />
          </button>
        </div>
      </div>

      <LaunchedModal
        open={launched}
        onClose={() => setLaunched(false)}
        onBack={() => router.push('/dashboard')}
        onViewDetail={() => {
          if (savedCampaignId) router.push(`/dashboard/campaigns/${savedCampaignId}`);
          else router.push('/dashboard');
        }}
        workspaceId={workspaceId ?? ''}
        campaignId={savedCampaignId}
        seq={seq}
        schedule={schedule}
      />
    </div>
  );
}
