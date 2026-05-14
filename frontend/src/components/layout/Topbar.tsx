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

export function Topbar() {
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
  <div className="h-[52px] flex items-center gap-4 px-6 md:px-8">
   {/* Page title */}
   {title && (
    <span className="text-[15px] font-semibold text-[color:var(--ink)] truncate">
     {title}
    </span>
   )}

   {/* Workspace switcher (Task #25) — sits next to the title so the
       active workspace identity is always visible without a click. */}
   <WorkspaceSwitcher />

   {/* Date — subtle */}
   <span className="hidden md:block ml-auto text-[12.5px] text-[color:var(--ink-3)]">
    {dateStr}
   </span>

   {/* Actions */}
   <div className="flex items-center gap-0.5 ml-auto md:ml-0">
    <button
     onClick={() => openSearch?.()}
     title="Search (⌘K)"
     className="h-8 w-8 flex items-center justify-center rounded-lg text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition-all"
    >
     <SearchIcon />
    </button>

    <CreditsChip className="ml-1" />

    <NotificationDropdown />

    <ThemeToggle className="h-8 w-8" />

    {firstName && (
     <span className="hidden lg:inline ml-2 text-[13px] text-[color:var(--ink-2)]">
      {greet}, <span className="font-semibold text-[color:var(--ink)]">{firstName}</span>.
     </span>
    )}
   </div>
  </div>
 );
}
