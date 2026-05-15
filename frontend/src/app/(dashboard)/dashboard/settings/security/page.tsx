'use client';

import Link from 'next/link';
import {
 SETTINGS_SECTIONS,
 planBadgeStyle,
} from '@/components/settings/sections';

/* ─────────────────────────────────────────────────────────────────
 * Security overview.
 *
 * `/dashboard/settings/security` itself had no page — anyone arriving
 * via a shared link or typing the URL got a 404. This index lists
 * everything tagged to the `security` group from the canonical
 * registry. The route stays a simple shortcut into the three real
 * pages (API keys, SSO, Audit).
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

export default function SecurityIndexPage() {
 const items = SETTINGS_SECTIONS.filter((s) => s.group === 'security');

 return (
  <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
   <ul className="divide-y divide-[color:var(--rule)]">
    {items.map((s) => {
     const Icon = s.icon;
     const badge = planBadgeStyle(s.badge ?? null);
     return (
      <li key={s.href}>
       <Link
        href={s.href}
        className="group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-[color:var(--paper-2)]"
       >
        <span className="mt-0.5 w-8 h-8 rounded-md bg-[color:var(--paper-2)] border border-[color:var(--rule)] flex items-center justify-center shrink-0 text-[color:var(--ink-2)] group-hover:text-[color:var(--ink)] transition-colors">
         <Icon className="w-[16px] h-[16px]" />
        </span>
        <div className="flex-1 min-w-0">
         <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold text-[color:var(--ink)]">
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
         <div className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5 leading-snug">
          {s.lede}
         </div>
        </div>
        <span className="mt-2 opacity-60 group-hover:opacity-100 transition-opacity">
         <Chevron />
        </span>
       </Link>
      </li>
     );
    })}
   </ul>
  </div>
 );
}
