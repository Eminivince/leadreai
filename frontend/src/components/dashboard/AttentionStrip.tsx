'use client';

import { GlassCard, Pill } from './GlassCard';
import type { ProspectingJob } from '@leadreai/shared';

const Svg = ({ className = 'w-4 h-4', children }: { className?: string; children: React.ReactNode }) => (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
  {children}
 </svg>
);
const AlertIcon = (p: { className?: string }) => <Svg {...p}><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></Svg>;
const PlugIcon  = (p: { className?: string }) => <Svg {...p}><path d="M12 22v-5"/><path d="M9 7V2"/><path d="M15 7V2"/><path d="M6 13V7h12v6a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4Z"/></Svg>;
const CreditIcon = (p: { className?: string }) => <Svg {...p}><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/><path d="M6 15h4"/></Svg>;
const CheckIcon = (p: { className?: string }) => <Svg {...p}><path d="m5 12 5 5L20 7"/></Svg>;

interface AttentionStripProps {
 failedJobs?: ProspectingJob[];
 creditsBalance?: number;
}

export function AttentionStrip({ failedJobs = [], creditsBalance }: AttentionStripProps) {
 const STATIC = [
  { tone: 'amber' as const, Icon: PlugIcon,  title: 'HubSpot sync lagging', detail: 'Last push 18m ago · check integration', action: 'Resync', meta: '18m ago' },
  { tone: 'blue' as const, Icon: CheckIcon, title: 'Domain verified', detail: 'SPF · DKIM · DMARC all green', action: 'View', meta: 'just now' },
 ];

 const items = [
  ...(failedJobs.slice(0, 1).map(j => ({
   tone: 'red' as const,
   Icon: AlertIcon,
   title: `Job failed`,
   detail: j.error?.message ?? 'Stage failed — check logs',
   action: 'Retry',
   meta: '2m ago',
  }))),
  ...(creditsBalance !== undefined && creditsBalance < 2000 ? [{
   tone: 'amber' as const,
   Icon: CreditIcon,
   title: `Credits low: ${creditsBalance.toLocaleString()} remaining`,
   detail: 'Cycle resets soon',
   action: 'Top up',
   meta: 'now',
  }] : []),
  ...STATIC,
 ];

 return (
  <GlassCard className="px-4 py-3">
   <div className="flex items-center gap-3 overflow-x-auto">
    <div className="shrink-0 flex items-center gap-2 pr-3 mr-1 border-r border-white/10">
     <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
     <span className="text-[11px] font-mono tracking-wider uppercase text-white/60">Attention</span>
     <Pill tone="neutral">{items.length}</Pill>
    </div>
    <div className="flex items-center gap-2 min-w-0 flex-1">
     {items.map((a, i) => (
      <div key={i} className="shrink-0 max-w-[320px] flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[color:var(--paper)]/5 border border-white/10">
       <a.Icon className={`w-4 h-4 shrink-0 ${{ red: 'text-rose-300', amber: 'text-amber-200', blue: 'text-sky-200', neutral: 'text-white/70' }[a.tone]}`} />
       <div className="min-w-0">
        <div className="text-[12px] font-body font-medium text-white truncate">{a.title}</div>
        <div className="text-[10.5px] font-body text-white/55 truncate">{a.detail}</div>
       </div>
       <button className="shrink-0 text-[10.5px] font-body font-medium text-white/90 underline-offset-4 hover:underline ml-1">{a.action}</button>
      </div>
     ))}
    </div>
   </div>
  </GlassCard>
 );
}
