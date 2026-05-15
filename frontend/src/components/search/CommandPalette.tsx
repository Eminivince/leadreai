'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useWorkspace } from '@/hooks/useWorkspace';

/* ─────────────────────────────────────────────────────────────────
 * Command palette — ⌘K / Ctrl+K global finder.
 *
 * Two sections:
 *  · Jump to  — static nav shortcuts, filtered by query
 *  · Results  — grouped hits from /workspaces/:id/search
 *
 * Keyboard model:
 *  · ⌘K / Ctrl+K to open from anywhere (bound in this component)
 *  · ↑ ↓ to move selection across the flat virtual row list
 *  · Enter to activate, Esc to close
 *
 * The selection index is global over all visible rows regardless of
 * section — users don't think in sections when they're sprinting.
 * ───────────────────────────────────────────────────────────────── */

interface SearchResponse {
 success: true;
 data: {
  q: string;
  leads: Array<{
   _id: string;
   companyName: string;
   companyDomain?: string;
   industry?: string;
   contactName?: string;
  }>;
  jobs: Array<{
   _id: string;
   rawQuery: string;
   status: string;
   leadsFoundSoFar: number;
  }>;
  files: Array<{
   _id: string;
   name: string;
   description?: string;
   source: 'job' | 'manual';
   leadCount: number;
  }>;
  campaigns: Array<{
   _id: string;
   name: string;
   description?: string;
   status: string;
  }>;
 };
}

type Row = {
 key: string;
 kicker: string;
 title: string;
 sub?: string;
 href: string;
 section: 'jump' | 'leads' | 'jobs' | 'files' | 'campaigns';
};

import { SETTINGS_SECTIONS } from '@/components/settings/sections';

const SETTINGS_JUMPS: Array<{ label: string; href: string; keywords: string[] }> =
 SETTINGS_SECTIONS.map((s) => ({
  label: `Settings — ${s.label}`,
  href: s.href,
  keywords: [
   ...s.label.toLowerCase().split(/\s+/),
   s.group,
   'settings',
  ],
 }));

const JUMP_ITEMS: Array<{ label: string; href: string; keywords: string[] }> = [
 { label: 'The desk (dispatches)',   href: '/dashboard',               keywords: ['home', 'dispatches', 'desk', 'dashboard'] },
 { label: 'Leads archive',       href: '/dashboard/leads',            keywords: ['leads', 'archive'] },
 { label: 'Files',           href: '/dashboard/files',            keywords: ['files', 'curated', 'dossier'] },
 { label: 'Library',          href: '/dashboard/library',           keywords: ['library', 'documents', 'pdf', 'upload', 'rag'] },
 { label: 'Campaigns',         href: '/dashboard/campaigns',          keywords: ['campaigns', 'outreach', 'sequences'] },
 { label: 'Integrations (The Wire)',  href: '/dashboard/integrations',         keywords: ['integrations', 'wire', 'hubspot', 'slack', 'crm'] },
 ...SETTINGS_JUMPS,
 { label: 'Pricing page',        href: '/pricing',                keywords: ['pricing', 'plans'] },
];

function useDebouncedValue<T>(value: T, ms: number): T {
 const [debounced, setDebounced] = useState(value);
 useEffect(() => {
  const t = setTimeout(() => setDebounced(value), ms);
  return () => clearTimeout(t);
 }, [value, ms]);
 return debounced;
}

function SearchIcon({ className = 'w-4 h-4' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
   <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
 );
}

export function CommandPalette() {
 const router = useRouter();
 const { workspaceId } = useWorkspace();
 const { searchOpen, openSearch, closeSearch } = useAppStore();
 const [query, setQuery] = useState('');
 const [selectedIdx, setSelectedIdx] = useState(0);
 const inputRef = useRef<HTMLInputElement | null>(null);
 const listRef = useRef<HTMLDivElement | null>(null);

 const debouncedQ = useDebouncedValue(query.trim(), 180);

 // Global ⌘K / Ctrl+K binding — attached once and always active,
 // regardless of whether the palette is open. Also intercepts "/"
 // when no input is focused, as a nod to the usual hotkey.
 useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
   const isPaletteHotkey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
   if (isPaletteHotkey) {
    e.preventDefault();
    if (searchOpen) closeSearch();
    else openSearch();
   }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 }, [searchOpen, openSearch, closeSearch]);

 // Reset state on open / close
 useEffect(() => {
  if (searchOpen) {
   setQuery('');
   setSelectedIdx(0);
   // Focus the input on the next tick so the portal is mounted.
   setTimeout(() => inputRef.current?.focus(), 0);
  }
 }, [searchOpen]);

 // Results query — skipped when no workspace or query is empty
 const { data, isFetching } = useQuery({
  queryKey: ['global-search', workspaceId, debouncedQ],
  queryFn: () =>
   apiFetch<SearchResponse>(
    `/api/v1/workspaces/${workspaceId}/search?q=${encodeURIComponent(debouncedQ)}`,
   ),
  enabled: !!workspaceId && !!debouncedQ && searchOpen,
  staleTime: 10_000,
 });

 const rows: Row[] = useMemo(() => {
  const out: Row[] = [];
  const q = query.trim().toLowerCase();

  // Jump-to section always first, filtered client-side
  const jumpPool = JUMP_ITEMS.filter((j) => {
   if (!q) return true;
   return (
    j.label.toLowerCase().includes(q) ||
    j.keywords.some((k) => k.includes(q))
   );
  });
  for (const j of jumpPool.slice(0, 6)) {
   out.push({
    key: `jump:${j.href}`,
    kicker: 'Jump to',
    title: j.label,
    sub: j.href,
    href: j.href,
    section: 'jump',
   });
  }

  if (data?.data) {
   for (const l of data.data.leads) {
    const parts = [l.contactName, l.industry, l.companyDomain].filter(Boolean);
    out.push({
     key: `lead:${l._id}`,
     kicker: 'Lead',
     title: l.companyName,
     sub: parts.join(' · '),
     href: `/dashboard/leads/${l._id}`,
     section: 'leads',
    });
   }
   for (const j of data.data.jobs) {
    out.push({
     key: `job:${j._id}`,
     kicker: 'Dispatch',
     title: j.rawQuery,
     sub: `${j.status} · ${j.leadsFoundSoFar} leads`,
     href: `/dashboard/leads?jobId=${j._id}`,
     section: 'jobs',
    });
   }
   for (const f of data.data.files) {
    out.push({
     key: `file:${f._id}`,
     kicker: f.source === 'job' ? 'File (dispatch)' : 'File',
     title: f.name,
     sub: f.description ?? `${f.leadCount} leads`,
     href: `/dashboard/files/${f._id}`,
     section: 'files',
    });
   }
   for (const c of data.data.campaigns) {
    out.push({
     key: `campaign:${c._id}`,
     kicker: 'Campaign',
     title: c.name,
     sub: c.description ?? c.status,
     href: `/dashboard/campaigns/${c._id}`,
     section: 'campaigns',
    });
   }
  }

  return out;
 }, [query, data]);

 // Clamp selection when the row list shrinks
 useEffect(() => {
  if (selectedIdx >= rows.length) setSelectedIdx(Math.max(0, rows.length - 1));
 }, [rows.length, selectedIdx]);

 // Scroll selected into view
 useEffect(() => {
  if (!listRef.current) return;
  const el = listRef.current.querySelector<HTMLElement>(`[data-row-idx="${selectedIdx}"]`);
  el?.scrollIntoView({ block: 'nearest' });
 }, [selectedIdx]);

 const activate = (href: string) => {
  router.push(href);
  closeSearch();
 };

 const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Escape') {
   e.preventDefault();
   closeSearch();
  } else if (e.key === 'ArrowDown') {
   e.preventDefault();
   setSelectedIdx((i) => Math.min(rows.length - 1, i + 1));
  } else if (e.key === 'ArrowUp') {
   e.preventDefault();
   setSelectedIdx((i) => Math.max(0, i - 1));
  } else if (e.key === 'Enter') {
   e.preventDefault();
   const row = rows[selectedIdx];
   if (row) activate(row.href);
  }
 };

 if (!searchOpen) return null;

 // Group rows for section headers while preserving global indices
 const sections: Array<{ label: string; key: Row['section']; rows: Array<{ row: Row; idx: number }> }> = [];
 const sectionOrder: Array<{ label: string; key: Row['section'] }> = [
  { label: 'Jump to',  key: 'jump' },
  { label: 'Leads',   key: 'leads' },
  { label: 'Dispatches', key: 'jobs' },
  { label: 'Files',   key: 'files' },
  { label: 'Campaigns', key: 'campaigns' },
 ];
 rows.forEach((row, idx) => {
  let group = sections.find((s) => s.key === row.section);
  if (!group) {
   const tpl = sectionOrder.find((s) => s.key === row.section);
   if (!tpl) return;
   group = { label: tpl.label, key: tpl.key, rows: [] };
   sections.push(group);
  }
  group.rows.push({ row, idx });
 });
 // Preserve the declared section order even though we discover groups in row order
 sections.sort(
  (a, b) =>
   sectionOrder.findIndex((s) => s.key === a.key) -
   sectionOrder.findIndex((s) => s.key === b.key),
 );

 return (
  <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 pt-[8vh] sm:pt-[10vh]">
   <button
    aria-label="Close"
    onClick={closeSearch}
    className="absolute inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm"
   />
   <div
    role="dialog"
    aria-modal="true"
    aria-label="Search"
    className="relative w-full max-w-[640px] bg-white border border-[color:var(--rule)] rounded-xl shadow-xl flex flex-col max-h-[80vh] sm:max-h-[70vh] overflow-hidden"
   >
    {/* Input */}
    <div className="flex items-center gap-3 px-5 py-4 border-b border-[color:var(--rule)]">
     <SearchIcon className="w-4 h-4 text-[color:var(--ink-3)] shrink-0" />
     <input
      ref={inputRef}
      value={query}
      onChange={(e) => {
       setQuery(e.target.value);
       setSelectedIdx(0);
      }}
      onKeyDown={onInputKey}
      placeholder="Search leads, dispatches, files, campaigns…"
      className="flex-1 bg-transparent font-sans outline-none text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] w-full"
     />
     <kbd className="font-mono text-[9px] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)]">
      ESC
     </kbd>
    </div>

    {/* Body */}
    <div ref={listRef} className="flex-1 overflow-y-auto">
     {rows.length === 0 ? (
      <div className="px-5 py-12 text-center">
       <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
        {isFetching ? 'Searching' : 'No matches'}
       </span>
       <p className="mt-2 font-sans text-[13.5px] text-[color:var(--ink-2)]">
        {isFetching
         ? 'Looking across the desk\u2026'
         : query
          ? `Nothing for "${query}" in this workspace.`
          : 'Start typing to search the desk.'}
       </p>
      </div>
     ) : (
      <ul>
       {sections.map((sec) => (
        <li key={sec.key}>
         <div className="px-5 pt-3 pb-1 font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
          {sec.label}
         </div>
         {sec.rows.map(({ row, idx }) => {
          const active = idx === selectedIdx;
          return (
           <button
            key={row.key}
            data-row-idx={idx}
            onMouseEnter={() => setSelectedIdx(idx)}
            onClick={() => activate(row.href)}
            className={`relative w-full text-left grid grid-cols-[auto_1fr_auto] gap-3 items-baseline px-5 py-2.5 transition-colors ${
             active
              ? 'bg-[color:var(--ember-bg)] text-[color:var(--ember)]'
              : 'font-sans text-[13.5px] text-[color:var(--ink-2)] hover:bg-[color:var(--paper-2)]'
            }`}
           >
            <span
             className={`font-mono text-[9.5px] tracking-[0.16em] uppercase shrink-0 ${
              active ? 'text-[color:var(--ember)]' : 'text-[color:var(--ink-3)]'
             }`}
            >
             {row.kicker}
            </span>
            <span className="min-w-0">
             <span
              className={`block font-sans text-[13.5px] truncate ${
               active ? 'text-[color:var(--ember)] font-medium' : 'text-[color:var(--ink)]'
              }`}
             >
              {row.title}
             </span>
             {row.sub && (
              <span
               className={`block font-sans text-[12px] truncate ${
                active ? 'text-[color:var(--ember-2)]' : 'text-[color:var(--ink-3)]'
               }`}
              >
               {row.sub}
              </span>
             )}
            </span>
            {active && (
             <kbd className="font-mono text-[9px] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)] shrink-0">
              \u21b5
             </kbd>
            )}
           </button>
          );
         })}
        </li>
       ))}
      </ul>
     )}
    </div>

    {/* Footer hint */}
    <div className="px-4 sm:px-5 py-2.5 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)] flex items-center justify-between gap-3">
     <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
      The wire
     </span>
     <div className="flex items-center gap-2 sm:gap-3 font-sans text-[11px] text-[color:var(--ink-3)]">
      <span className="hidden sm:inline-flex items-center gap-1">
       <kbd className="font-mono text-[9px] bg-white border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)]">↑</kbd>
       <kbd className="font-mono text-[9px] bg-white border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)]">↓</kbd>
       move
      </span>
      <span className="inline-flex items-center gap-1">
       <kbd className="font-mono text-[9px] bg-white border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)]">↵</kbd>
       select
      </span>
      <span className="inline-flex items-center gap-1">
       <kbd className="font-mono text-[9px] bg-white border border-[color:var(--rule)] rounded px-1 text-[color:var(--ink-3)]">ESC</kbd>
       close
      </span>
     </div>
    </div>
   </div>
  </div>
 );
}
