'use client';

import { GlassCard, Eyebrow, Pill } from './GlassCard';
import { cn } from '@/lib/utils';
import type { ProspectingJob } from '@leadreai/shared';

const Svg = ({ className = 'w-3 h-3', children }: { className?: string; children: React.ReactNode }) => (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
  {children}
 </svg>
);
const RefreshIcon = (p: { className?: string }) => <Svg {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></Svg>;
const PauseIcon  = (p: { className?: string }) => <Svg {...p}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></Svg>;
const ArrowRIcon = (p: { className?: string }) => <Svg {...p}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></Svg>;

const STAGE_LABELS: Record<string, string> = {
 queued: 'Queued',
 parsing: 'Parsing',
 collecting: 'Collecting',
 enriching: 'Enriching',
 deduplicating: 'Deduplicating',
 complete: 'Complete',
 failed: 'Failed',
 cancelled: 'Cancelled',
};

interface RunningJobsProps {
 jobs: ProspectingJob[];
 onRetry?: (jobId: string) => void;
}

export function RunningJobs({ jobs, onRetry }: RunningJobsProps) {
 const visible = jobs.slice(0, 3);

 // Show placeholder cards if no jobs
 const PLACEHOLDERS = [
  { id: '#—', title: '"Series B fintechs · NYC · Salesforce"', stage: 'Enriching', pct: 64, eta: '~3m', status: 'running', count: '812 leads' },
  { id: '#—', title: '"EU mid-market HR tech founders"', stage: 'Scrape failed', pct: 42, eta: 'stalled', status: 'failed', count: '112 leads' },
  { id: '#—', title: '"Climate hardware · Series A · SF Bay"', stage: 'Complete', pct: 100, eta: 'done', status: 'done', count: '284 leads' },
 ];

 const display = visible.length > 0
  ? visible.map(j => ({
    id: `#${j._id.slice(-4)}`,
    title: `"${j.rawQuery}"`,
    stage: STAGE_LABELS[j.status] ?? j.status,
    pct: j.progress.percentage,
    eta: j.status === 'complete' ? 'done' : j.status === 'failed' ? 'stalled' : '~3m',
    status: j.status,
    count: `${j.progress.leadsFoundSoFar} leads`,
    jobId: j._id,
   }))
  : PLACEHOLDERS;

 return (
  <GlassCard className="p-5">
   <Eyebrow right={<a href="/dashboard/leads" className="text-[11px] font-body text-white/70 hover:text-white">All jobs →</a>}>
    Prospecting · running
   </Eyebrow>
   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    {display.map((j, i) => {
     const tone = j.status === 'failed' ? 'red' : j.status === 'complete' || j.status === 'done' ? 'green' : 'blue';
     const ringColor = j.status === 'failed' ? 'bg-rose-400' : j.status === 'complete' || j.status === 'done' ? 'bg-emerald-400' : 'bg-[color:var(--paper)]';
     const isRunning = j.status !== 'complete' && j.status !== 'done' && j.status !== 'failed' && j.status !== 'cancelled';
     return (
      <div key={i} className="rounded-xl bg-[color:var(--paper)]/[0.03] border border-white/10 p-4 flex flex-col gap-3">
       <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
         <div className="text-[10px] font-mono text-white/40">JOB {j.id}</div>
         <div className="text-[12.5px] font-body text-white truncate">{j.title}</div>
        </div>
        <Pill tone={tone as 'red' | 'green' | 'blue'}>{j.stage}</Pill>
       </div>
       <div className="flex items-center justify-between text-[10.5px] font-mono text-white/50">
        <span>{j.count}</span>
        <span>{j.eta}</span>
       </div>
       <div className="h-[3px] rounded-full bg-[color:var(--paper)]/10 overflow-hidden">
        {isRunning ? (
         <div className="h-full shimmer-bar" style={{ width: j.pct + '%' }} />
        ) : (
         <div className={cn('h-full', ringColor)} style={{ width: j.pct + '%' }} />
        )}
       </div>
       <div className="flex items-center gap-2 pt-1">
        {j.status === 'failed' && onRetry && 'jobId' in j && (
         <button onClick={() => onRetry(String((j as Record<string, unknown>)['jobId']))}
          className="text-[11px] font-body font-medium text-white bg-[color:var(--paper)]/10 hover:bg-[color:var(--paper)]/15 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
          <RefreshIcon className="w-3 h-3" /> Retry
         </button>
        )}
        {isRunning && (
         <button className="text-[11px] font-body text-white/75 hover:text-white inline-flex items-center gap-1">
          <PauseIcon className="w-3 h-3" /> Pause
         </button>
        )}
        <button className="text-[11px] font-body text-white/60 hover:text-white ml-auto inline-flex items-center gap-1">
         Inspect <ArrowRIcon className="w-3 h-3" />
        </button>
       </div>
      </div>
     );
    })}
   </div>
  </GlassCard>
 );
}
