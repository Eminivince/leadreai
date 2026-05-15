'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useCredits } from '@/hooks/useCredits';
import { clearTokens } from '@/lib/auth';
import { apiFetch } from '@/lib/api';
import { planConfig } from '@leadreai/shared';
import { SETTINGS_SECTIONS } from '@/components/settings/sections';

interface NavItem {
 key: string;
 label: string;
 href: string;
 badge?: string | null;
 soon?: boolean;
 children?: NavItem[];
}

// PRIMARY = the find → email flow. Four items, in order of use:
// Dashboard (compose) → Leads (output) → Campaigns (outreach) →
// Tables (separate research workflow). Files lives under Leads as
// a tab; Workflows lives under Tables as a tab.
const PRIMARY: NavItem[] = [
 { key: 'home',   label: 'Dashboard', href: '/dashboard' },
 { key: 'leads',   label: 'Leads',   href: '/dashboard/leads' },
 { key: 'camps',   label: 'Campaigns', href: '/dashboard/campaigns' },
 { key: 'tables',  label: 'Tables',   href: '/dashboard/tables' },
];

// Settings children mirror the canonical registry — no drift.
const SETTINGS_NAV_CHILDREN: NavItem[] = SETTINGS_SECTIONS.map((s) => ({
 key: `settings-${s.href.split('/').pop() ?? s.label.toLowerCase()}`,
 label: s.label,
 href: s.href,
}));

// SECONDARY = supporting surfaces. Library (Context docs) and
// Integrations (HubSpot/Slack/webhooks) are first-class features
// — not settings — so they sit as their own entries here rather
// than nested under Settings.
const SECONDARY: NavItem[] = [
 { key: 'library',     label: 'Library',     href: '/dashboard/library' },
 { key: 'integrations', label: 'Integrations', href: '/dashboard/integrations' },
 { key: 'analytics',   label: 'Analytics',   href: '#', soon: true },
 {
  key: 'settings',
  label: 'Settings',
  href: '/dashboard/settings',
  children: SETTINGS_NAV_CHILDREN,
 },
];

const EXPANDED_STORAGE_KEY = 'sidebar.expanded';
const COLLAPSED_STORAGE_KEY = 'sidebar.collapsed';

function readCollapsed(): boolean {
 if (typeof window === 'undefined') return false;
 try { return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean): void {
 if (typeof window === 'undefined') return;
 try { window.localStorage.setItem(COLLAPSED_STORAGE_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}
function readExpanded(): Record<string, boolean> {
 if (typeof window === 'undefined') return {};
 try {
  const raw = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
  if (!raw) return {};
  const v = JSON.parse(raw);
  return v && typeof v === 'object' ? v : {};
 } catch { return {}; }
}
function writeExpanded(v: Record<string, boolean>): void {
 if (typeof window === 'undefined') return;
 try { window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

function isChildActive(item: NavItem, pathname: string): boolean {
 if (!item.children?.length) return false;
 return item.children.some(c => c.href !== '#' && (pathname === c.href || pathname.startsWith(c.href + '/')));
}

function getInitials(firstName?: string, lastName?: string) {
 return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

/* ── Nav Icons ───────────────────────────────────────────────── */
function NavIcon({ k, size = 16 }: { k: string; size?: number }) {
 const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
 switch (k) {
  case 'home': return <svg {...props}><path d="M21 3 10.5 14M21 3l-7 18-4-8-8-4 19-6Z" /></svg>;
  case 'leads': return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  case 'tables': return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
  case 'workflows': return <svg {...props}><path d="M3 12a9 9 0 0 1 15-6.7M21 4v5h-5M21 12a9 9 0 0 1-15 6.7M3 20v-5h5" /></svg>;
  case 'files': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6" /></svg>;
  case 'library': return <svg {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></svg>;
  case 'camps': return <svg {...props}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14" /></svg>;
  case 'integrations': return <svg {...props}><path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4" /></svg>;
  case 'analytics': return <svg {...props}><path d="M3 21h18M7 17V9M12 17V5M17 17v-6" /></svg>;
  case 'settings': return <svg {...props}><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>;
  default: return <svg {...props}><circle cx="12" cy="12" r="3" /></svg>;
 }
}

/* ── Single nav row ───────────────────────────────────────────── */
function NavRow({
 item, pathname, expanded, onToggle, showLabels,
}: {
 item: NavItem; pathname: string; expanded: boolean; onToggle: (key: string) => void; showLabels: boolean;
}) {
 const hasChildren = !!item.children?.length;
 const isDisabled = item.href === '#';

 const isSelfActive = item.key === 'home'
  ? pathname === '/dashboard'
  : item.href !== '#' && (pathname === item.href || pathname.startsWith(item.href + '/'));
 const childActive = isChildActive(item, pathname);
 const isActive = isSelfActive || (!isSelfActive && hasChildren && childActive);

 const rowBase = 'group relative flex items-center gap-2.5 h-9 px-3 mx-2 rounded-lg text-[13px] transition-all duration-150';
 const rowState = isActive
  ? 'bg-[color:var(--ember)]/8 text-[color:var(--ember)] font-semibold pl-[11px] border-l-2 border-[color:var(--ember)]'
  : isDisabled
   ? 'text-[color:var(--ink-3)]/60 cursor-default'
   : 'text-[color:var(--ink-3)] hover:bg-[color:var(--paper-3)] hover:text-[color:var(--ink)]';

 const inner = (
  <>
   <span className="shrink-0 flex items-center justify-center w-[18px]">
    <NavIcon k={item.key} size={16} />
   </span>

   <AnimatePresence initial={false}>
    {showLabels && (
     <motion.span
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      exit={{ opacity: 0, width: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className="flex-1 truncate overflow-hidden whitespace-nowrap"
     >
      {item.label}
     </motion.span>
    )}
   </AnimatePresence>

   {showLabels && (
    <>
     {item.soon && (
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest text-[color:var(--ink-3)]/60 bg-[color:var(--paper-3)] rounded px-1.5 py-0.5">
       Soon
      </span>
     )}
     {item.badge && (
      <span className="shrink-0 text-[10px] font-semibold tabular-nums bg-[color:var(--rule)] text-[color:var(--ink-2)] rounded-full px-1.5 py-0.5">
       {item.badge}
      </span>
     )}
     {hasChildren && (
      <button
       type="button"
       onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle(item.key); }}
       className="shrink-0 p-0.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
       aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
      >
       <motion.svg
        animate={{ rotate: expanded ? 90 : 0 }}
        transition={{ duration: 0.15 }}
        width={12} height={12} viewBox="0 0 16 16" fill="none"
       >
        <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
       </motion.svg>
      </button>
     )}
    </>
   )}
  </>
 );

 return (
  <div>
   {isDisabled ? (
    <span className={cn(rowBase, rowState)} title={item.label}>{inner}</span>
   ) : (
    <Link href={item.href} className={cn(rowBase, rowState)} title={showLabels ? undefined : item.label}>
     {inner}
    </Link>
   )}

   {hasChildren && showLabels && (
    <AnimatePresence initial={false}>
     {expanded && (
      <motion.ul
       initial={{ height: 0, opacity: 0 }}
       animate={{ height: 'auto', opacity: 1 }}
       exit={{ height: 0, opacity: 0 }}
       transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
       className="overflow-hidden mx-4 mt-0.5 mb-1 border-l-2 border-[color:var(--rule)] pl-3 flex flex-col gap-0.5"
      >
       {item.children!.map(child => {
        const childActive = child.href !== '#' && (pathname === child.href || pathname.startsWith(child.href + '/'));
        const childDisabled = child.href === '#';
        const childClass = cn(
         'flex h-8 items-center px-2.5 rounded-md text-[12.5px] transition-all duration-150',
         childActive
          ? 'text-[color:var(--ember)] font-semibold bg-[color:var(--ember)]/8'
          : childDisabled
           ? 'text-[color:var(--ink-3)]/50 cursor-default'
           : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)]',
        );
        return (
         <li key={child.key}>
          {childDisabled
           ? <span className={childClass}>{child.label}</span>
           : <Link href={child.href} className={childClass}>{child.label}</Link>
          }
         </li>
        );
       })}
      </motion.ul>
     )}
    </AnimatePresence>
   )}
  </div>
 );
}

/* ── Sidebar ─────────────────────────────────────────────────── */
interface SidebarProps {
 /** Mobile drawer open state. Transient — not persisted. */
 mobileOpen?: boolean;
 /** Called when the drawer should close (backdrop click, Escape, route change). */
 onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps = {}) {
 const pathname = usePathname();
 const router = useRouter();
 const { user, workspace, reset, openTopUp } = useAppStore();
 const { data: credits } = useCredits();
 const [expanded, setExpanded] = useState<Record<string, boolean>>({});
 const [collapsed, setCollapsed] = useState(false);

 useEffect(() => {
  setExpanded(readExpanded());
  setCollapsed(readCollapsed());
 }, []);

 const toggleCollapsed = useCallback(() => {
  setCollapsed(prev => {
   const next = !prev;
   writeCollapsed(next);
   return next;
  });
 }, []);

 useEffect(() => {
  const onKeyDown = (e: KeyboardEvent) => {
   if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleCollapsed(); }
   if (e.key === 'Escape' && mobileOpen) { onMobileClose?.(); }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
 }, [toggleCollapsed, mobileOpen, onMobileClose]);

 // Auto-close the mobile drawer on route change.
 useEffect(() => {
  if (mobileOpen) onMobileClose?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [pathname]);

 // Lock body scroll while the mobile drawer is open.
 useEffect(() => {
  if (typeof document === 'undefined') return;
  if (mobileOpen) {
   const prev = document.body.style.overflow;
   document.body.style.overflow = 'hidden';
   return () => { document.body.style.overflow = prev; };
  }
 }, [mobileOpen]);

 // Track viewport so we can ignore `collapsed` on mobile (drawer is
 // always full-width when open). SSR-safe default = desktop.
 const [isMobile, setIsMobile] = useState(false);
 useEffect(() => {
  if (typeof window === 'undefined') return;
  const mq = window.matchMedia('(max-width: 767px)');
  const update = () => setIsMobile(mq.matches);
  update();
  mq.addEventListener('change', update);
  return () => mq.removeEventListener('change', update);
 }, []);

 // On mobile the drawer is full-width with labels; collapse only
 // applies to the desktop inline sidebar.
 const effectiveCollapsed = isMobile ? false : collapsed;

 const toggleExpanded = (key: string) => {
  setExpanded(prev => {
   const next = { ...prev, [key]: !prev[key] };
   writeExpanded(next);
   return next;
  });
 };

 async function handleLogout() {
  try { await apiFetch('/api/v1/auth/logout', { method: 'POST' }); } catch { /* best-effort */ }
  clearTokens();
  reset();
  router.push('/');
 }

 const monthlyBalance = credits?.monthlyCreditsBalance ?? 0;
 const topupBalance = credits?.creditsBalance ?? 0;
 const totalBalance = credits?.totalCreditsBalance ?? monthlyBalance + topupBalance;
 const plan = credits?.plan ?? 'free';
 const allowance = planConfig(plan).monthlyCredits;
 const monthlyUsed = Math.max(0, allowance - monthlyBalance);
 const monthlyPct = allowance > 0 ? Math.min(100, Math.round((monthlyUsed / allowance) * 100)) : 0;

 const initials = getInitials(user?.firstName, user?.lastName);

 const getForceExpanded = (item: NavItem) => isChildActive(item, pathname);

 return (
  <>
   {/* Mobile backdrop */}
   {mobileOpen && (
    <div
     className="fixed inset-0 bg-[color:var(--ink)]/40 backdrop-blur-sm z-40 md:hidden"
     onClick={() => onMobileClose?.()}
     aria-hidden="true"
    />
   )}

   <motion.aside
    animate={{ width: effectiveCollapsed ? 60 : isMobile ? 288 : 240 }}
    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    className={cn(
     'flex flex-col bg-[color:var(--paper-2)] border-r border-[color:var(--rule)] overflow-hidden',
     // Mobile: fixed overlay drawer
     'fixed inset-y-0 left-0 z-50 h-screen transform transition-transform duration-200 ease-out',
     mobileOpen ? 'translate-x-0' : '-translate-x-full',
     // Desktop: inline sticky column
     'md:sticky md:top-0 md:z-30 md:translate-x-0 md:shrink-0 md:transition-none',
    )}
    style={{ willChange: 'width' }}
    aria-hidden={!mobileOpen && isMobile}
   >
   {/* Logo + workspace */}
   <div className="flex items-center gap-3 px-4 h-[60px] border-b border-[color:var(--rule)] shrink-0">
    <Link
     href="/"
     className="shrink-0 w-8 h-8 rounded-lg bg-[color:var(--ember)] flex items-center justify-center"
     title="Home"
    >
     <span className="font-extrabold text-[13px] text-white leading-none">L</span>
    </Link>

    <AnimatePresence initial={false}>
     {!effectiveCollapsed && (
      <motion.div
       initial={{ opacity: 0, x: -6 }}
       animate={{ opacity: 1, x: 0 }}
       exit={{ opacity: 0, x: -6 }}
       transition={{ duration: 0.18 }}
       className="flex-1 min-w-0 overflow-hidden"
      >
       <div className="flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="font-extrabold text-[15px] tracking-tight text-[color:var(--ink)]">Leadre</span>
        <span className="font-extrabold text-[15px] text-[color:var(--ember)]">.</span>
        <span className="font-extrabold text-[15px] tracking-tight text-[color:var(--ink)]">AI</span>
       </div>
       <div className="text-[10.5px] text-[color:var(--ink-3)] truncate -mt-0.5">
        {workspace?.name ?? 'Workspace'}
       </div>
      </motion.div>
     )}
    </AnimatePresence>

    <AnimatePresence initial={false}>
     {!effectiveCollapsed && (
      <motion.button
       initial={{ opacity: 0 }}
       animate={{ opacity: 1 }}
       exit={{ opacity: 0 }}
       onClick={() => (isMobile ? onMobileClose?.() : toggleCollapsed())}
       title={isMobile ? 'Close menu' : 'Collapse sidebar (⌘\\)'}
       aria-label={isMobile ? 'Close menu' : 'Collapse sidebar'}
       className="shrink-0 w-8 h-8 md:w-6 md:h-6 flex items-center justify-center rounded-md text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition-all"
      >
       {isMobile ? (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none">
         <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
       ) : (
        <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
         <path d="m10 4-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
       )}
      </motion.button>
     )}
    </AnimatePresence>

    {effectiveCollapsed && (
     <button
      onClick={toggleCollapsed}
      title="Expand sidebar (⌘\\)"
      aria-label="Expand sidebar"
      className="absolute inset-0 w-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
     />
    )}
   </div>

   {/* Expand button when collapsed (desktop only) */}
   {effectiveCollapsed && (
    <button
     onClick={toggleCollapsed}
     title="Expand sidebar (⌘\\)"
     aria-label="Expand sidebar"
     className="h-8 mx-2 mt-2 flex items-center justify-center rounded-lg text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition-all shrink-0"
    >
     <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
     </svg>
    </button>
   )}

   {/* Nav */}
   <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-5">
    {/* Primary nav */}
    <div className="flex flex-col gap-0.5">
     <AnimatePresence initial={false}>
      {!effectiveCollapsed && (
       <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="px-5 mb-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)] whitespace-nowrap"
       >
        Workspace
       </motion.span>
      )}
     </AnimatePresence>
     {PRIMARY.map(item => {
      const forceOpen = getForceExpanded(item);
      const isExpanded = forceOpen || !!expanded[item.key];
      return (
       <NavRow
        key={item.key}
        item={item}
        pathname={pathname}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        showLabels={!effectiveCollapsed}
       />
      );
     })}
    </div>

    {/* Secondary nav */}
    <div className="flex flex-col gap-0.5">
     <AnimatePresence initial={false}>
      {!effectiveCollapsed && (
       <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="px-5 mb-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)] whitespace-nowrap"
       >
        More
       </motion.span>
      )}
     </AnimatePresence>
     {SECONDARY.map(item => {
      const forceOpen = getForceExpanded(item);
      const isExpanded = forceOpen || !!expanded[item.key];
      return (
       <NavRow
        key={item.key}
        item={item}
        pathname={pathname}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        showLabels={!effectiveCollapsed}
       />
      );
     })}
    </div>
   </nav>

   {/* Footer: credits + user */}
   <div className="border-t border-[color:var(--rule)] px-3 py-3 flex flex-col gap-3 shrink-0">
    {/* Credits */}
    <AnimatePresence initial={false}>
     {!effectiveCollapsed && (
      <motion.div
       initial={{ opacity: 0, height: 0 }}
       animate={{ opacity: 1, height: 'auto' }}
       exit={{ opacity: 0, height: 0 }}
       transition={{ duration: 0.18 }}
       className="overflow-hidden"
      >
       <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-semibold text-[color:var(--ink-3)]">Credits</span>
        <button
         onClick={openTopUp}
         className="text-[10.5px] font-semibold text-[color:var(--ember)] hover:text-[color:var(--ember-2)] transition-colors"
        >
         {totalBalance.toLocaleString()}
        </button>
       </div>
       <div className="h-1.5 bg-[color:var(--paper-3)] rounded-full overflow-hidden">
        <motion.div
         initial={{ width: 0 }}
         animate={{ width: `${monthlyPct}%` }}
         transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
         className={cn('h-full rounded-full', monthlyPct > 80 ? 'bg-red-400' : 'bg-[color:var(--ember)]')}
        />
       </div>
       <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-[color:var(--ink-3)]">
         {monthlyBalance.toLocaleString()} / {allowance.toLocaleString()} mo
        </span>
        {topupBalance > 0 && (
         <span className="text-[10px] text-[color:var(--ember)] font-semibold">
          +{topupBalance.toLocaleString()}
         </span>
        )}
       </div>
      </motion.div>
     )}
    </AnimatePresence>

    {/* User row */}
    <div className="flex items-center gap-2.5">
     <div
      className="w-7 h-7 rounded-full bg-[color:var(--ember)] flex items-center justify-center shrink-0"
      title={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email}
     >
      <span className="text-[10px] font-bold text-white">{initials}</span>
     </div>

     <AnimatePresence initial={false}>
      {!effectiveCollapsed && (
       <motion.div
        initial={{ opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 'auto' }}
        exit={{ opacity: 0, width: 0 }}
        transition={{ duration: 0.15 }}
        className="flex-1 min-w-0 overflow-hidden"
       >
        <div className="text-[12px] font-semibold text-[color:var(--ink)] truncate whitespace-nowrap">
         {user?.firstName} {user?.lastName}
        </div>
        <div className="text-[10px] text-[color:var(--ink-3)] truncate whitespace-nowrap">
         {user?.email}
        </div>
       </motion.div>
      )}
     </AnimatePresence>

     <AnimatePresence initial={false}>
      {!effectiveCollapsed && (
       <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleLogout}
        title="Sign out"
        aria-label="Sign out"
        className="shrink-0 w-9 h-9 md:w-7 md:h-7 flex items-center justify-center rounded-md text-[color:var(--ink-3)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition-all"
       >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
         <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
       </motion.button>
      )}
     </AnimatePresence>

     {effectiveCollapsed && (
      <button
       onClick={handleLogout}
       title="Sign out"
       aria-label="Sign out"
       className="w-7 h-7 flex items-center justify-center rounded-md text-[color:var(--ink-3)] hover:text-red-500 transition-colors"
      >
       <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
       </svg>
      </button>
     )}
    </div>
   </div>
   </motion.aside>
  </>
 );
}
