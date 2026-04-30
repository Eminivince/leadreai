'use client';

import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/hooks/useTheme';
import { NotificationDropdown } from './NotificationDropdown';

/* ─────────────────────────────────────────────────────────────────
 * Topbar
 * ─────────────────────────────────────────────────────────────────
 * A single slim strip: route breadcrumb on the left, greeting and
 * date on the right. No primary CTAs here — the dashboard page's
 * hero input owns "new query". Search / notifications are small
 * glyphs that don't compete with the page title below.
 * ───────────────────────────────────────────────────────────────── */

function routeBreadcrumb(pathname: string): { page: string } {
  if (pathname === '/dashboard') return { page: 'Dashboard' };
  if (pathname.startsWith('/dashboard/leads')) return { page: 'Leads' };
  if (pathname.startsWith('/dashboard/campaigns')) return { page: 'Campaigns' };
  if (pathname.startsWith('/dashboard/tables')) return { page: 'Tables' };
  if (pathname.startsWith('/dashboard/workflows')) return { page: 'Workflows' };
  if (pathname.startsWith('/dashboard/files')) return { page: 'Files' };
  if (pathname.startsWith('/dashboard/library')) return { page: 'Library' };
  if (pathname.startsWith('/dashboard/integrations')) return { page: 'Integrations' };
  if (pathname.startsWith('/dashboard/settings')) return { page: 'Settings' };
  return { page: '' };
}

function formatDateline(d: Date = new Date()): string {
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const SearchGlyph = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
    <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const SunGlyph = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const MoonGlyph = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SystemGlyph = ({ className = 'w-3.5 h-3.5' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function Topbar() {
  const pathname = usePathname();
  const { user, openSearch } = useAppStore();
  const { preference, toggle } = useTheme();
  const { page } = routeBreadcrumb(pathname);
  const firstName = user?.firstName ?? '';

  const themeLabel =
    preference === 'light'
      ? 'Light · click for dark'
      : preference === 'dark'
        ? 'Dark · click for system'
        : 'System · click for light';

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-3 flex items-center gap-6">
      {/* Left: breadcrumb */}
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[14px] font-semibold text-[color:var(--ink)] truncate">
          {page}
        </span>
      </div>

      {/* Middle: dateline */}
      <div className="ml-auto hidden md:flex items-center gap-3">
        <span className="text-[13px] text-[color:var(--ink-3)]">
          {formatDateline()}
        </span>
      </div>

      {/* Right: glyph actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={openSearch}
          title="Search (⌘K)"
          aria-label="Search"
          className="h-8 w-8 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
        >
          <SearchGlyph />
        </button>
        <button
          onClick={toggle}
          title={themeLabel}
          aria-label={themeLabel}
          className="h-8 w-8 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
        >
          {preference === 'light' ? (
            <SunGlyph />
          ) : preference === 'dark' ? (
            <MoonGlyph />
          ) : (
            <SystemGlyph />
          )}
        </button>
        <NotificationDropdown />
        {firstName && (
          <span className="hidden lg:inline ml-3 text-[14px] text-[color:var(--ink-2)]">
            {greeting()}, {firstName}.
          </span>
        )}
      </div>
    </div>
  );
}
