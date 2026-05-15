'use client';

import Link from 'next/link';
import {
 SETTINGS_GROUPS,
 sectionsByGroup,
 planBadgeStyle,
} from '@/components/settings/sections';

/* ─────────────────────────────────────────────────────────────────
 * Settings index — grouped overview.
 *
 * Reads from the same canonical registry the sidebar uses. Renders
 * each group as a card with its sections as compact rows. No more
 * 14 flat siblings; no more drift between layout and index.
 * ───────────────────────────────────────────────────────────────── */

function Chevron() {
 return (
  <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-[color:var(--ink-3)]">
   <path
    d="M6 4l4 4-4 4"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
   />
  </svg>
 );
}

export default function SettingsIndexPage() {
 const byGroup = sectionsByGroup();

 return (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
   {SETTINGS_GROUPS.map((g) => {
    const items = byGroup.get(g.key) ?? [];
    if (items.length === 0) return null;
    return (
     <section
      key={g.key}
      className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden flex flex-col hover:border-[color:var(--ink-3)] transition-colors"
     >
      {/* Group header */}
      <header className="px-6 pt-5 pb-4 border-b border-[color:var(--rule)]">
       <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
        {g.label}
       </div>
       <p className="mt-1.5 font-sans text-[13px] text-[color:var(--ink-3)] leading-snug">
        {g.lede}
       </p>
      </header>

      {/* Sections list */}
      <ul className="divide-y divide-[color:var(--rule)]">
       {items.map((s) => {
        const badge = planBadgeStyle(s.badge ?? null);
        const Icon = s.icon;
        return (
         <li key={s.href}>
          <Link
           href={s.href}
           className="group flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-[color:var(--paper-2)]"
          >
           <span className="mt-0.5 w-7 h-7 rounded-md bg-[color:var(--paper-2)] border border-[color:var(--rule)] flex items-center justify-center shrink-0 text-[color:var(--ink-3)] group-hover:text-[color:var(--ember)] transition-colors">
            <Icon className="w-[15px] h-[15px]" />
           </span>
           <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
             <span className="font-sans font-semibold text-[14px] text-[color:var(--ink)]">
              {s.label}
             </span>
             {badge && (
              <span
               className={`shrink-0 inline-flex items-center px-1.5 h-[16px] rounded border text-[9.5px] tracking-[0.04em] font-medium uppercase ${badge.cls}`}
              >
               {badge.label}
              </span>
             )}
            </div>
            <div className="font-sans text-[13px] text-[color:var(--ink-3)] mt-0.5 leading-snug">
             {s.lede}
            </div>
           </div>
           <span className="mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <Chevron />
           </span>
          </Link>
         </li>
        );
       })}
      </ul>
     </section>
    );
   })}
  </div>
 );
}
