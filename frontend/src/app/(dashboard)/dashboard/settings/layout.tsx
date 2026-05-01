'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/* ─────────────────────────────────────────────────────────────────
 * Settings shell — left-rail navigation with hero + content slot.
 *
 * Each sub-route renders its own content; the layout provides:
 *   - the hero (serif H1 + lede, same for every settings page)
 *   - a sticky left rail with all seven sections
 *   - the content frame
 *
 * Route = the source of truth for active state. Mobile collapses the
 * rail into a horizontal scrollable chip list.
 * ───────────────────────────────────────────────────────────────── */

const SECTIONS: Array<{ href: string; label: string; lede: string; live: boolean }> = [
  { href: '/dashboard/settings/account',         label: 'Account',          lede: 'Your profile, password, and session.',                          live: true  },
  { href: '/dashboard/settings/workspace',       label: 'Workspace',        lede: 'The desk name, defaults, and preferences.',                    live: true  },
  { href: '/dashboard/settings/team',            label: 'Team',             lede: 'Members, roles, and invitations.',                             live: true  },
  { href: '/dashboard/settings/knowledge-base',  label: 'Knowledge base',   lede: 'House style — what the agent should know about your company.', live: true  },
  { href: '/dashboard/settings/data-sources',    label: 'Data sources',     lede: 'Connected providers and their credentials.',                   live: true  },
  { href: '/dashboard/settings/suppression',     label: 'Suppression list', lede: 'Emails and domains the engine must never contact.',            live: true  },
  { href: '/dashboard/settings/api-keys',        label: 'API keys',         lede: 'Press credentials for programmatic access.',                   live: true  },
  { href: '/dashboard/settings/billing',         label: 'Billing & usage',  lede: 'Plan, credits, and the ledger.',                               live: true  },
  { href: '/dashboard/settings/email',           label: 'Email & replies',  lede: 'Inbound reply routing — connect your sending domain so replies land in-app.', live: true },
];

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2 8h12M10 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isIndex = pathname === '/dashboard/settings';

  // Identify active section (for rail highlight + the lede line on the content head)
  const active = SECTIONS.find((s) => pathname === s.href || pathname.startsWith(s.href + '/'));

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-14">
      {/* Hero */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/dashboard"
            className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
          >
            Dispatches
          </Link>
          <span className="font-mono text-[10px] text-[color:var(--ink-3)]">/</span>
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            Settings
          </span>
          {active && (
            <>
              <span className="font-mono text-[10px] text-[color:var(--ink-3)]">/</span>
              <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
                {active.label}
              </span>
            </>
          )}
        </div>

        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-[720px]">
            <h1 className=" text-[48px] md:text-[64px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
              {isIndex ? (
                <>
                  <em className="italic text-[color:var(--forest)]">Settings</em>, the table of contents.
                </>
              ) : (
                active?.label ?? 'Settings'
              )}
            </h1>
            <p className="mt-4  text-[15px] md:text-[17px] leading-[1.5] text-[color:var(--ink-2)]">
              {isIndex
                ? 'Nine sections. Bookmark any of them — settings are routed, not tabbed.'
                : active?.lede ?? 'Manage your workspace.'}
            </p>
          </div>
        </div>
      </section>

      {/* Body: rail + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-8 lg:gap-14">
        {/* Rail */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {/* Mobile: horizontal scroll */}
          <div className="lg:hidden -mx-6 px-6 overflow-x-auto">
            <div className="flex items-center gap-2 pb-3 border-b border-[color:var(--rule)] min-w-max">
              {SECTIONS.map((s) => {
                const isActive = active?.href === s.href;
                return (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={cn(
                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border  text-[12.5px] transition-colors whitespace-nowrap',
                      isActive
                        ? 'bg-[color:var(--ink)] text-[color:var(--paper)] border-[color:var(--ink)]'
                        : 'border-[color:var(--rule)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]',
                    )}
                  >
                    {s.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Desktop: vertical rail */}
          <nav className="hidden lg:block">
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-4 px-3">
              Sections
            </span>
            <ul>
              {SECTIONS.map((s) => {
                const isActive = active?.href === s.href;
                return (
                  <li key={s.href}>
                    <Link
                      href={s.href}
                      className={cn(
                        'group relative flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--rule)]/70 transition-colors',
                        isActive
                          ? 'text-[color:var(--ink)]'
                          : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-[9px] bottom-[9px] w-[2px] bg-[color:var(--forest)]" />
                      )}
                      <span className="flex-1  text-[13.5px]">{s.label}</span>
                      <ArrowEast
                        className={cn(
                          'w-3 h-3 shrink-0 transition-all',
                          isActive
                            ? 'text-[color:var(--ink)] translate-x-0 opacity-100'
                            : 'text-[color:var(--ink-3)] -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100',
                        )}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
