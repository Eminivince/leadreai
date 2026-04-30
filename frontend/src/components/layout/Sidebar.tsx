'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useCredits } from '@/hooks/useCredits';
import { clearTokens } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { planConfig } from '@leadreai/shared';

/* ─────────────────────────────────────────────────────────────────
 * Sidebar — main navigation
 * ─────────────────────────────────────────────────────────────────
 * Narrow, typography-first. No icons inside glass pills. Active state
 * is a 2px forest rule on the left + ink-black label. Everything
 * else in ink-2 gray. Sections ("Workspace" / "Settings & More") are
 * labeled with monospace kickers. Bottom row holds credits + account
 * with a hairline divider to the work area.
 *
 * Parents with `children` get a chevron — clicking the chevron (or
 * the label if the parent has no href) toggles the branch. Navigation
 * to the parent route still works via its own label when href is set.
 * Expansion state is persisted to localStorage per parent key so
 * open branches survive route changes and reloads.
 * ───────────────────────────────────────────────────────────────── */

interface NavItem {
  key: string;
  label: string;
  href: string;
  badge?: string | null;
  soon?: boolean;
  children?: NavItem[];
}

const PRIMARY: NavItem[] = [
  { key: 'home',      label: 'Dashboard',  href: '/dashboard' },
  { key: 'leads',     label: 'Leads',      href: '/dashboard/leads' },
  { key: 'tables',    label: 'Tables',     href: '/dashboard/tables' },
  { key: 'workflows', label: 'Workflows',  href: '/dashboard/workflows' },
  { key: 'files',     label: 'Files',      href: '/dashboard/files' },
  { key: 'library',   label: 'Library',    href: '/dashboard/library' },
  { key: 'camps',     label: 'Campaigns',  href: '/dashboard/campaigns' },
];

const SECONDARY: NavItem[] = [
  { key: 'integrations', label: 'Integrations',  href: '/dashboard/integrations' },
  { key: 'analytics',    label: 'Analytics',     href: '#', soon: true },
  { key: 'automations',  label: 'Automations',   href: '#', soon: true },
  {
    key: 'settings',
    label: 'Settings',
    href: '/dashboard/settings',
    children: [
      { key: 'settings-account',    label: 'Account',          href: '/dashboard/settings/account' },
      { key: 'settings-workspace',  label: 'Workspace',        href: '/dashboard/settings/workspace' },
      { key: 'settings-team',       label: 'Team',             href: '/dashboard/settings/team' },
      { key: 'settings-kb',         label: 'Knowledge base',   href: '/dashboard/settings/knowledge-base' },
      { key: 'settings-suppress',   label: 'Suppression list', href: '/dashboard/settings/suppression' },
      { key: 'settings-api',        label: 'API keys',         href: '/dashboard/settings/api-keys' },
      { key: 'settings-billing',    label: 'Billing & usage',  href: '/dashboard/settings/billing' },
    ],
  },
];

const EXPANDED_STORAGE_KEY = 'sidebar.expanded';
const COLLAPSED_STORAGE_KEY = 'sidebar.collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, v ? '1' : '0');
  } catch {
    /* storage disabled — ignore */
  }
}

function readExpanded(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeExpanded(v: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage full / disabled — ignore */
  }
}

function isChildActive(item: NavItem, pathname: string): boolean {
  if (!item.children || item.children.length === 0) return false;
  return item.children.some(
    (c) => c.href !== '#' && (pathname === c.href || pathname.startsWith(c.href + '/')),
  );
}

function Chevron({ open, className = 'w-3 h-3' }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn(className, 'transition-transform', open ? 'rotate-90' : 'rotate-0')}
      aria-hidden
    >
      <path
        d="m6 4 4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

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

function LogOutGlyph({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Nav icons (editorial stroke style, matches the rest of the app) ─
 * Kept as lightweight inline SVGs to avoid pulling in a full icon lib.
 * Each glyph uses stroke 1.5 to match ArrowEast / LogOutGlyph above. */

function NavIcon({ keyName, className = 'w-4 h-4' }: { keyName: string; className?: string }) {
  const common = { fill: 'none', viewBox: '0 0 24 24', className };
  const strokeProps = {
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (keyName) {
    case 'home': // dashboard — paper plane
      return (
        <svg {...common}>
          <path d="M21 3 10.5 14M21 3l-7 18-4-8-8-4 19-6Z" {...strokeProps} />
        </svg>
      );
    case 'leads': // people
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" {...strokeProps} />
        </svg>
      );
    case 'tables': // grid
      return (
        <svg {...common}>
          <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" {...strokeProps} />
        </svg>
      );
    case 'workflows': // replay / loop
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 15-6.7M21 4v5h-5M21 12a9 9 0 0 1-15 6.7M3 20v-5h5" {...strokeProps} />
        </svg>
      );
    case 'files': // document
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6" {...strokeProps} />
        </svg>
      );
    case 'library': // book
      return (
        <svg {...common}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" {...strokeProps} />
        </svg>
      );
    case 'camps': // megaphone
      return (
        <svg {...common}>
          <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" {...strokeProps} />
        </svg>
      );
    case 'integrations': // plug
      return (
        <svg {...common}>
          <path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4" {...strokeProps} />
        </svg>
      );
    case 'analytics': // bars
      return (
        <svg {...common}>
          <path d="M3 21h18M7 17V9M12 17V5M17 17v-6" {...strokeProps} />
        </svg>
      );
    case 'automations': // bolt
      return (
        <svg {...common}>
          <path d="M13 2 4 14h8l-1 8 9-12h-8l1-8Z" {...strokeProps} />
        </svg>
      );
    case 'settings': // gear
      return (
        <svg {...common}>
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1v0Z" {...strokeProps} />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" {...strokeProps} />
        </svg>
      );
  }
}

/* ── Collapsed rail row — icon-only link with active indicator ───── */

function RailLink({
  item,
  active,
  disabled,
}: {
  item: NavItem;
  active: boolean;
  disabled: boolean;
}) {
  const body = (
    <>
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[color:var(--forest)]" aria-hidden />
      )}
      <NavIcon keyName={item.key} className="w-[18px] h-[18px]" />
    </>
  );
  const classes = cn(
    'group relative w-full h-10 flex items-center justify-center transition-colors',
    active
      ? 'text-[color:var(--ink)]'
      : disabled
        ? 'text-[color:var(--ink-3)]/50 cursor-default'
        : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]',
  );

  if (disabled) {
    return (
      <span className={classes} title={`${item.label} — soon`}>
        {body}
      </span>
    );
  }
  return (
    <Link href={item.href} className={classes} title={item.label} aria-label={item.label}>
      {body}
    </Link>
  );
}

function NavRow({
  item,
  pathname,
  expanded,
  onToggle,
}: {
  item: NavItem;
  pathname: string;
  expanded: boolean;
  onToggle: (key: string) => void;
}) {
  const hasChildren = !!item.children && item.children.length > 0;
  const isDisabled = item.href === '#';

  const isSelfActive =
    item.key === 'home'
      ? pathname === '/dashboard'
      : item.href !== '#' && (pathname === item.href || pathname.startsWith(item.href + '/'));

  // Parents highlight softly when a child route is active but the
  // parent itself isn't the current page. Keeps the breadcrumb honest.
  const childActive = isChildActive(item, pathname);
  const parentShouldHighlight = hasChildren && !isSelfActive && childActive;

  const rowClasses = cn(
    'group relative h-9 flex items-center gap-2.5 px-3 text-[13.5px] transition-colors',
    isSelfActive
      ? 'text-[color:var(--ink)]'
      : isDisabled
        ? 'text-[color:var(--ink-3)] cursor-default'
        : parentShouldHighlight
          ? 'text-[color:var(--ink)]'
          : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]',
  );

  const activeRule = isSelfActive && (
    <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[color:var(--forest)]" />
  );

  const label = (
    <span className="flex-1 truncate">{item.label}</span>
  );

  const trailing = (
    <>
      {item.soon && (
        <span className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
          soon
        </span>
      )}
      {item.badge && (
        <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-2)] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-full px-1.5 py-0.5">
          {item.badge}
        </span>
      )}
      {hasChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle(item.key);
          }}
          aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
          aria-expanded={expanded}
          className="shrink-0 p-1 -mr-1 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
        >
          <Chevron open={expanded} />
        </button>
      )}
    </>
  );

  const rowBody = (
    <>
      {activeRule}
      {label}
      {trailing}
    </>
  );

  return (
    <div className="flex flex-col">
      {isDisabled ? (
        <span className={rowClasses}>{rowBody}</span>
      ) : (
        <Link href={item.href} className={rowClasses}>
          {rowBody}
        </Link>
      )}

      {hasChildren && expanded && (
        <ul className="ml-3 mb-1 border-l border-[color:var(--rule)]/70">
          {item.children!.map((child) => {
            const childIsActive =
              child.href !== '#' && (pathname === child.href || pathname.startsWith(child.href + '/'));
            const childDisabled = child.href === '#';
            const childClasses = cn(
              'group relative h-8 flex items-center gap-2 pl-4 pr-3 text-[12.5px] transition-colors',
              childIsActive
                ? 'text-[color:var(--ink)]'
                : childDisabled
                  ? 'text-[color:var(--ink-3)] cursor-default'
                  : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]',
            );
            return (
              <li key={child.key}>
                {childDisabled ? (
                  <span className={childClasses}>
                    <span className="flex-1 truncate">{child.label}</span>
                  </span>
                ) : (
                  <Link href={child.href} className={childClasses}>
                    {childIsActive && (
                      <span className="absolute left-[-1px] top-[7px] bottom-[7px] w-[2px] bg-[color:var(--forest)]" />
                    )}
                    <span className="flex-1 truncate">{child.label}</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NavGroup({
  kicker,
  items,
  pathname,
  expandedMap,
  onToggle,
}: {
  kicker: string;
  items: NavItem[];
  pathname: string;
  expandedMap: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] px-3 mb-1">
        {kicker}
      </span>
      {items.map((item) => {
        // A branch is expanded if the user explicitly opened it OR a child
        // route is currently active (auto-expand so the rail reflects state).
        const forcedOpen = isChildActive(item, pathname);
        const expanded = forcedOpen || !!expandedMap[item.key];
        return (
          <NavRow
            key={item.key}
            item={item}
            pathname={pathname}
            expanded={expanded}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, workspace, reset, openTopUp } = useAppStore();
  const { data: credits } = useCredits();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate expansion + collapse state after mount to avoid an SSR
  // mismatch — the server renders the default (nothing expanded, not
  // collapsed), client then restores what the user had before.
  useEffect(() => {
    setExpanded(readExpanded());
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  };

  // Keyboard shortcut — Cmd/Ctrl + \ toggles the sidebar. Avoids
  // conflicts with textarea typing ([ and ] are fair game otherwise)
  // and matches Notion / Linear.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeExpanded(next);
      return next;
    });
  };

  async function handleLogout() {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort */
    }
    clearTokens();
    reset();
    router.push('/');
  }

  const monthlyBalance = credits?.monthlyCreditsBalance ?? 0;
  const topupBalance = credits?.creditsBalance ?? 0;
  const totalBalance = credits?.totalCreditsBalance ?? monthlyBalance + topupBalance;
  const plan = credits?.plan ?? 'free';
  const allowance = planConfig(plan).monthlyCredits;
  // Progress = how much of this month's allowance has been used so far.
  // Top-ups extend the rail visually but don't shrink the used %.
  const monthlyUsed = Math.max(0, allowance - monthlyBalance);
  const monthlyPct = allowance > 0 ? Math.min(100, Math.round((monthlyUsed / allowance) * 100)) : 0;

  // Collapsed rail — icon-only navigation. Width is 52px, which fits an
  // 18px glyph with comfortable tap targets and still leaves the main
  // content area essentially full-width. Every route in PRIMARY and
  // SECONDARY renders as a clickable icon link; disabled (soon) items
  // render as static glyphs at reduced opacity. Parents with children
  // (Settings) link to the parent route — children aren't exposed on the
  // rail to keep it shallow. Expand to see nested routes.
  if (collapsed) {
    const activeFor = (item: NavItem): boolean => {
      if (item.key === 'home') return pathname === '/dashboard';
      if (item.href === '#') return false;
      if (pathname === item.href || pathname.startsWith(item.href + '/')) return true;
      return isChildActive(item, pathname);
    };
    const initials = getInitials(user?.firstName, user?.lastName);

    return (
      <aside className="shrink-0 w-[52px] h-screen sticky top-0 flex flex-col bg-[color:var(--paper)] border-r border-[color:var(--rule)]">
        {/* Expand button */}
        <button
          onClick={toggleCollapsed}
          title="Expand sidebar (Cmd+\\)"
          className="w-full h-10 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] border-b border-[color:var(--rule)] transition-colors"
          aria-label="Expand sidebar"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
            <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Logo */}
        <Link
          href="/"
          className="h-12 flex items-center justify-center border-b border-[color:var(--rule)]/60"
          title="Home"
        >
          <span className="font-extrabold text-[18px] leading-none text-[color:var(--forest)]">L</span>
        </Link>

        {/* Nav icons — PRIMARY, then a hairline, then SECONDARY */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col">
          {PRIMARY.map((item) => (
            <RailLink
              key={item.key}
              item={item}
              active={activeFor(item)}
              disabled={item.href === '#'}
            />
          ))}
          <div className="mx-3 my-2 h-px bg-[color:var(--rule)]" aria-hidden />
          {SECONDARY.map((item) => (
            <RailLink
              key={item.key}
              item={item}
              active={activeFor(item)}
              disabled={item.href === '#'}
            />
          ))}
        </nav>

        {/* Footer — top-up + user avatar + logout. Keeps the same
            affordances as the expanded footer at icon scale. */}
        <div className="border-t border-[color:var(--rule)] py-2 flex flex-col items-center gap-1">
          <button
            onClick={openTopUp}
            title={`Credits: ${totalBalance.toLocaleString()} — Top up`}
            aria-label="Top up credits"
            className="w-10 h-10 flex items-center justify-center text-[color:var(--ink-2)] hover:text-[color:var(--forest)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-[18px] h-[18px]">
              <path
                d="M12 5v14M5 12h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <div
            className="w-7 h-7 rounded-full bg-[color:var(--ink)] flex items-center justify-center"
            title={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Account'}
          >
            <span className="text-[9.5px] font-medium text-[color:var(--paper)]">
              {initials}
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="w-10 h-8 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
          >
            <LogOutGlyph className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="group/sidebar shrink-0 w-[232px] h-screen sticky top-0 flex flex-col bg-[color:var(--paper)]">
      {/* Masthead */}
      <div className="pt-5 pb-4 px-5 border-b border-[color:var(--rule)] relative">
        <button
          onClick={toggleCollapsed}
          title="Collapse sidebar (Cmd+\\)"
          aria-label="Collapse sidebar"
          className="absolute top-3 right-2 w-6 h-6 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] opacity-40 hover:opacity-100 group-hover/sidebar:opacity-100 transition-opacity"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden>
            <path d="m10 4-4 4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <Link href="/" className="flex items-baseline gap-px">
          <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--ink)]">Leadre</span>
          <span className="font-extrabold text-[16px] text-[color:var(--forest)]">.</span>
          <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--ink)]">AI</span>
        </Link>
        <div className="mt-3 flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-sm bg-[color:var(--forest)] flex items-center justify-center shrink-0">
            <span className="font-extrabold text-[11px] text-[color:var(--paper)]">
              {workspace?.name?.[0]?.toUpperCase() ?? 'W'}
            </span>
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[12px] text-[color:var(--ink)] truncate">
              {workspace?.name ?? 'Workspace'}
            </div>
            <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              Correspondent
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-5 flex flex-col gap-6">
        <NavGroup
          kicker="Workspace"
          items={PRIMARY}
          pathname={pathname}
          expandedMap={expanded}
          onToggle={toggleExpanded}
        />
        <NavGroup
          kicker="Settings & More"
          items={SECONDARY}
          pathname={pathname}
          expandedMap={expanded}
          onToggle={toggleExpanded}
        />
      </nav>

      {/* Credits + account */}
      <div className="border-t border-[color:var(--rule)] px-4 pt-4 pb-4 flex flex-col gap-4">
        {/* Credits */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Credits
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[color:var(--ink)]">
              {totalBalance.toLocaleString()}
            </span>
          </div>
          <div
            className="h-[2px] bg-[color:var(--rule)]/40 overflow-hidden"
            title={`${monthlyUsed} of ${allowance} plan credits used this cycle`}
          >
            <div
              className={cn(
                'h-full',
                monthlyPct > 80 ? 'bg-[color:var(--rust)]' : 'bg-[color:var(--forest)]',
              )}
              style={{ width: `${monthlyPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span
              className="text-[10.5px] text-[color:var(--ink-3)] truncate"
              title="Monthly plan allowance + top-up balance"
            >
              {monthlyBalance.toLocaleString()}
              <span className="text-[color:var(--ink-3)]/80"> / {allowance.toLocaleString()} mo</span>
              {topupBalance > 0 && (
                <>
                  {' · '}
                  <span className="text-[color:var(--forest)]">+{topupBalance.toLocaleString()}</span>
                </>
              )}
            </span>
            <button
              onClick={openTopUp}
              className="text-[11px] text-[color:var(--ink)] hover:text-[color:var(--forest)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--forest)] transition shrink-0"
            >
              Top up
            </button>
          </div>
        </div>

        {/* User row */}
        <div className="flex items-center gap-2.5 pt-3 border-t border-[color:var(--rule)]">
          <div className="w-7 h-7 rounded-full bg-[color:var(--ink)] flex items-center justify-center shrink-0">
            <span className="text-[10px] font-medium text-[color:var(--paper)]">
              {getInitials(user?.firstName, user?.lastName)}
            </span>
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[12px] font-medium text-[color:var(--ink)] truncate">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="font-mono text-[9px] tracking-[0.16em] text-[color:var(--ink-3)] truncate">
              {user?.email}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition shrink-0"
          >
            <LogOutGlyph className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Footer kicker */}
        <div className="flex items-center justify-end pt-2 border-t border-[color:var(--rule)]/50">
          <Link
            href="/"
            className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)] inline-flex items-center gap-1"
          >
            Home
            <ArrowEast className="w-2.5 h-2.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
