'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ─────────────────────────────────────────────────────────────────
 * SectionTabs — small horizontal tab strip used to group two or
 * more related top-level routes under a single mental model.
 *
 * Used today by:
 *   - Leads (with a "Files" tab linking to /dashboard/files)
 *   - Tables (with a "Workflows" tab linking to /dashboard/workflows)
 *
 * Renders <Link>s rather than client-side switches so each tab keeps
 * its own URL — works with deep links and back/forward, and the
 * underlying routes remain independently addressable for things
 * like the campaign builder's audience picker that points at
 * /dashboard/files/<fileId>.
 *
 * The active tab is determined by `usePathname()` matching either
 * the exact href or any sub-route under it (so /dashboard/leads/123
 * still highlights the Leads tab).
 * ─────────────────────────────────────────────────────────────── */

interface Tab {
  key: string;
  label: string;
  href: string;
  count?: number | string;
}

export function SectionTabs({
  tabs,
  className = '',
}: {
  tabs: Tab[];
  className?: string;
}) {
  const pathname = usePathname() ?? '';

  return (
    <div className={`inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 ${className}`}>
      {tabs.map((t) => {
        // Exact-match to the listed href; we deliberately don't
        // do prefix matching because /dashboard/leads is a parent
        // of /dashboard/leads/foo but NOT logically the same tab.
        // Each tab points at the index route of its section.
        const on = pathname === t.href;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12.5px] transition-colors ${
              on
                ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
            }`}
          >
            <span>{t.label}</span>
            {typeof t.count !== 'undefined' && (
              <span
                className={`font-mono text-[10.5px] tabular-nums ${
                  on ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
