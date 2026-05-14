'use client';

import Link from 'next/link';
import { GlassCard, Eyebrow } from './GlassCard';
import { useAppStore } from '@/store/useAppStore';

const Svg = ({ className = 'w-4 h-4', children }: { className?: string; children: React.ReactNode }) => (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
  {children}
 </svg>
);
const TelescopeIcon = (p: { className?: string }) => <Svg {...p}><path d="M10.065 12.493 6.95 20l-1-1 3.118-7.515"/><path d="m14.49 3.13 6.37 3.67-9.12 15.8-6.37-3.67 9.12-15.8Z"/><path d="M19.2 5.8 17 9.5"/><path d="M9 15l-4 2"/></Svg>;
const MailIcon   = (p: { className?: string }) => <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></Svg>;
const InboxIcon   = (p: { className?: string }) => <Svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7Z"/></Svg>;
const ArrowRIcon  = (p: { className?: string }) => <Svg {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></Svg>;

export function Shortcuts() {
 const openNewQuery = useAppStore(s => s.openNewQuery);

 const items = [
  {
   title: 'New prospecting query',
   sub: 'Describe your ICP in plain English',
   Icon: TelescopeIcon,
   accent: 'from-violet-400/30 to-transparent',
   onClick: openNewQuery,
   href: undefined,
  },
  {
   title: 'Review drafts',
   sub: '96 awaiting approval · 12 overdue',
   Icon: MailIcon,
   accent: 'from-amber-400/25 to-transparent',
   onClick: undefined,
   href: '/dashboard/campaigns',
  },
  {
   title: 'Open reply queue',
   sub: '38 replies to triage · 5 marked hot',
   Icon: InboxIcon,
   accent: 'from-sky-400/25 to-transparent',
   onClick: undefined,
   href: '#',
  },
 ];

 return (
  <GlassCard className="p-5">
   <Eyebrow>Shortcuts</Eyebrow>
   <div className="flex flex-col gap-2">
    {items.map((s, i) => {
     const inner = (
      <>
       <div className={`absolute inset-0 bg-gradient-to-r ${s.accent} opacity-0 group-hover:opacity-100 transition pointer-events-none`} />
       <div className="relative z-[1] w-9 h-9 rounded-xl liquid-glass flex items-center justify-center shrink-0">
        <span className="relative z-[1] text-white"><s.Icon className="w-4 h-4" /></span>
       </div>
       <div className="relative z-[1] min-w-0 flex-1">
        <div className="text-[13px] font-body font-medium text-white truncate">{s.title}</div>
        <div className="text-[10.5px] font-body text-white/55 truncate">{s.sub}</div>
       </div>
       <ArrowRIcon className="relative z-[1] w-4 h-4 text-white/40 group-hover:text-white transition" />
      </>
     );
     const cls = 'group relative text-left rounded-xl border border-white/10 bg-[color:var(--paper)]/[0.03] hover:bg-[color:var(--paper)]/[0.06] transition px-4 py-3 flex items-center gap-3 overflow-hidden';
     return s.onClick ? (
      <button key={i} className={cls} onClick={s.onClick}>{inner}</button>
     ) : (
      <Link key={i} href={s.href ?? '#'} className={cls}>{inner}</Link>
     );
    })}
   </div>
  </GlassCard>
 );
}
