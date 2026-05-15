'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageHelp } from '@/components/ui/PageHelp';
import {
 SETTINGS_GROUPS,
 findActiveSection,
 sectionsByGroup,
 planBadgeStyle,
} from '@/components/settings/sections';

/* ─────────────────────────────────────────────────────────────────
 * Settings shell.
 *
 * Header + grouped left sidebar + content slot. Every settings page
 * lives under one of five groups (You / Workspace / Outreach /
 * Billing / Security). Both this sidebar and the index overview
 * read from the same registry — no drift.
 *
 * On mobile the sidebar collapses into a horizontal scrollable nav.
 * Group headers are hidden on mobile to keep the strip short — the
 * order alone communicates the grouping.
 * ───────────────────────────────────────────────────────────────── */

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const isIndex = pathname === '/dashboard/settings';
 const active = findActiveSection(pathname);
 const byGroup = sectionsByGroup();

 return (
  <div className="max-w-[1280px] mx-auto px-6 md:px-8 lg:px-10 py-8 md:py-10 bg-[color:var(--paper)] animate-fade-up">
   {/* Inline header */}
   <section className="mb-6 flex items-start justify-between gap-4 flex-wrap">
    <div>
     <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
      {isIndex ? 'Settings' : 'Settings'}
      {active && (
       <>
        <span aria-hidden className="mx-2 opacity-60">/</span>
        <span className="text-[color:var(--ink-3)]">
         {SETTINGS_GROUPS.find((g) => g.key === active.group)?.label}
        </span>
       </>
      )}
     </div>
     <h1 className="mt-1 font-display text-[28px] text-[color:var(--ink)]">
      {isIndex ? 'Settings' : (active?.label ?? 'Settings')}
     </h1>
     <p className="mt-1 font-sans text-[13px] text-[color:var(--ink-3)]">
      {isIndex
       ? 'Your account, workspace, outreach setup, billing, and security — all in one place.'
       : (active?.lede ?? 'Manage your workspace.')}
     </p>
    </div>
    {active && (
     <PageHelp
      title={active.label}
      body={active.lede}
      tips={[
       `Lives under the “${SETTINGS_GROUPS.find((g) => g.key === active.group)?.label}” group.`,
       'Changes apply to this workspace only — switch workspaces from the topbar.',
      ]}
     />
    )}
    {isIndex && (
     <PageHelp
      title="Settings"
      body="Central settings hub. Grouped by what they affect: your account, the workspace, outreach configuration, billing, and security."
      tips={[
       'Workspace, outreach, and billing settings affect all members.',
       'Account settings only affect your user.',
      ]}
     />
    )}
   </section>

   {/* Body: sidebar + content */}
   <div className="flex gap-6 md:gap-8">
    {/* Desktop grouped sidebar */}
    <nav className="w-56 shrink-0 hidden lg:block bg-[color:var(--paper)]" aria-label="Settings">
     <div className="flex flex-col gap-5">
      {SETTINGS_GROUPS.map((g) => {
       const items = byGroup.get(g.key) ?? [];
       if (items.length === 0) return null;
       return (
        <div key={g.key}>
         <div className="px-3 mb-1.5 font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
          {g.label}
         </div>
         <ul className="flex flex-col gap-0.5">
          {items.map((s) => {
           const isActive = active?.href === s.href;
           const badge = planBadgeStyle(s.badge ?? null);
           return (
            <li key={s.href}>
             <Link
              href={s.href}
              className={cn(
               'group flex items-center justify-between gap-2 px-3 h-8 rounded-lg text-[12.5px] transition-colors',
               isActive
                ? 'bg-[color:var(--ember-bg)] text-[color:var(--ember)] font-medium'
                : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]',
              )}
             >
              <span className="truncate">{s.label}</span>
              {badge && (
               <span
                className={cn(
                 'shrink-0 inline-flex items-center px-1.5 h-[16px] rounded border text-[9.5px] tracking-[0.04em] font-medium uppercase',
                 isActive
                  ? 'border-[color:var(--ember)]/30 text-[color:var(--ember)]/80 bg-transparent'
                  : badge.cls,
                )}
               >
                {badge.label}
               </span>
              )}
             </Link>
            </li>
           );
          })}
         </ul>
        </div>
       );
      })}
     </div>
    </nav>

    {/* Main content */}
    <div className="flex-1 min-w-0">
     {/* Mobile horizontal nav — groups become inline dividers */}
     <nav className="lg:hidden -mx-2 mb-4 overflow-x-auto" aria-label="Settings (mobile)">
      <ul className="flex items-center gap-1 px-2 pb-1 min-w-max">
       {SETTINGS_GROUPS.flatMap((g, gi) => {
        const items = byGroup.get(g.key) ?? [];
        if (items.length === 0) return [];
        return [
         ...(gi > 0
          ? [
             <li key={`sep-${g.key}`} aria-hidden className="shrink-0 px-1">
              <span className="block w-px h-4 bg-[color:var(--rule)]" />
             </li>,
            ]
          : []),
         ...items.map((s) => {
          const isActive = active?.href === s.href;
          return (
           <li key={s.href} className="shrink-0">
            <Link
             href={s.href}
             className={cn(
              'inline-flex items-center h-7 px-3 rounded-lg text-[12px] transition-colors',
              isActive
               ? 'bg-[color:var(--ember-bg)] text-[color:var(--ember)] font-medium'
               : 'text-[color:var(--ink-3)] border border-[color:var(--rule)] bg-white hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)]',
             )}
            >
             {s.label}
            </Link>
           </li>
          );
         }),
        ];
       })}
      </ul>
     </nav>

     {children}
    </div>
   </div>
  </div>
 );
}
