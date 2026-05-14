'use client';

import { GlassCard, Eyebrow, Bar } from './GlassCard';

const Svg = ({ className = 'w-3 h-3', children }: { className?: string; children: React.ReactNode }) => (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
  {children}
 </svg>
);
const ArrowURIcon = (p: { className?: string }) => <Svg {...p}><path d="M7 17 17 7"/><path d="M8 7h9v9"/></Svg>;

interface UsageMetersProps {
 creditsBalance?: number;
 totalJobsRun?: number;
}

export function UsageMeters({ creditsBalance, totalJobsRun }: UsageMetersProps) {
 const creditsUsed = creditsBalance !== undefined ? Math.max(0, 10000 - creditsBalance) : 8170;

 const meters = [
  {
   label: 'Lead credits',
   used: creditsUsed,
   total: 10000,
   unit: 'credits',
   tone: 'amber' as const,
   sub: creditsBalance !== undefined ? `${creditsBalance.toLocaleString()} remaining` : 'Resets soon',
  },
  {
   label: 'Outbound sends',
   used: 4240,
   total: 15000,
   unit: 'this week',
   tone: 'white' as const,
   sub: 'Peak day Tue · 1,420 sent',
  },
  {
   label: 'Prospecting jobs',
   used: totalJobsRun ?? 38,
   total: 60,
   unit: 'this month',
   tone: 'white' as const,
   sub: 'Parallelism cap 4',
  },
  {
   label: 'Seats',
   used: 1,
   total: 5,
   unit: 'members',
   tone: 'green' as const,
   sub: '4 seats available',
  },
 ];

 return (
  <GlassCard className="p-5">
   <Eyebrow right={
    <a className="text-[11px] font-body text-white/70 hover:text-white inline-flex items-center gap-1" href="#">
     Usage & billing <ArrowURIcon className="w-3 h-3" />
    </a>
   }>
    Usage · this cycle
   </Eyebrow>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
    {meters.map((u, i) => {
     const pct = Math.round((u.used / u.total) * 100);
     return (
      <div key={i} className="flex flex-col gap-2">
       <div className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-body text-white/60">{u.label}</span>
        <span className="ml-auto text-[10.5px] font-mono text-white/45">{pct}%</span>
       </div>
       <div className="flex items-baseline gap-1.5">
        <span className="text-[26px] font-body font-medium text-white leading-none tracking-tight">
         {u.used.toLocaleString()}
        </span>
        <span className="text-[11px] font-body text-white/45">/ {u.total.toLocaleString()}</span>
       </div>
       <Bar value={u.used} max={u.total} tone={u.tone} />
       <div className="text-[10.5px] font-body text-white/45">{u.sub}</div>
      </div>
     );
    })}
   </div>
  </GlassCard>
 );
}
