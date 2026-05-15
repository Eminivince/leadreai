'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { NotificationDropdown } from './NotificationDropdown';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { CreditsChip } from '@/components/shared/CreditsChip';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const ROUTE_MAP: Record<string, string> = {
 '/dashboard':       'Dashboard',
 '/dashboard/leads':    'Leads',
 '/dashboard/campaigns':  'Campaigns',
 '/dashboard/tables':    'Tables',
 '/dashboard/workflows':  'Workflows',
 '/dashboard/files':    'Files',
 '/dashboard/library':   'Library',
 '/dashboard/integrations': 'Integrations',
 '/dashboard/settings':   'Settings',
};

function resolveTitle(pathname: string): string {
 if (ROUTE_MAP[pathname]) return ROUTE_MAP[pathname];
 for (const [prefix, label] of Object.entries(ROUTE_MAP)) {
  if (pathname.startsWith(prefix + '/')) return label;
 }
 return '';
}

function greeting(): string {
 const h = new Date().getHours();
 if (h < 12) return 'Good morning';
 if (h < 17) return 'Good afternoon';
 return 'Good evening';
}

function formatDate(d: Date = new Date()): string {
 return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const SearchIcon = () => (
 <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
  <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
 </svg>
);

interface TopbarProps {
 onOpenMobileSidebar?: () => void;
}

export function Topbar({ onOpenMobileSidebar }: TopbarProps = {}) {
 const pathname = usePathname();
 const { user, openSearch } = useAppStore();
 const title = resolveTitle(pathname);
 const firstName = user?.firstName ?? '';

 const [dateStr, setDateStr] = React.useState(() => formatDate());
 const [greet, setGreet] = React.useState(() => greeting());

 React.useEffect(() => {
  const id = setInterval(() => { setDateStr(formatDate()); setGreet(greeting()); }, 60_000);
  return () => clearInterval(id);
 }, []);

 return (
  <div className="h-14 flex items-center gap-3 md:gap-4 px-4 md:px-8 min-w-0">
   {/* Hamburger (mobile only) */}
   <button
    onClick={() => onOpenMobileSidebar?.()}
    className="md:hidden shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-[color:var(--ink-2)] hover:bg-[color:var(--paper-3)] transition-colors"
    aria-label="Open menu"
    type="button"
   >
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
     <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
   </button>

   {/* Page title */}
   {title && (
    <span className="text-[15px] font-semibold text-[color:var(--ink)] truncate min-w-0">
     {title}
    </span>
   )}

   {/* Workspace switcher (Task #25) — sits next to the title so the
       active workspace identity is always visible without a click.
       Hidden on mobile to preserve title + action room. */}
   <div className="hidden md:flex">
    <WorkspaceSwitcher />
   </div>

   {/* Date — subtle */}
   <span className="hidden md:block ml-auto text-[12.5px] text-[color:var(--ink-3)]">
    {dateStr}
   </span>

   {/* Actions */}
   <div className="flex items-center gap-0.5 ml-auto md:ml-0 shrink-0">
    <button
     onClick={() => openSearch?.()}
     title="Search (⌘K)"
     aria-label="Search"
     className="h-9 w-9 flex items-center justify-center rounded-lg text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition-all"
    >
     <SearchIcon />
    </button>

    <CreditsChip className="ml-1" />

    <NotificationDropdown />

    <ThemeToggle className="h-9 w-9" />

    {firstName && (
     <span className="hidden lg:inline ml-2 text-[13px] text-[color:var(--ink-2)]">
      {greet}, <span className="font-semibold text-[color:var(--ink)]">{firstName}</span>.
     </span>
    )}
   </div>
  </div>
 );
}
