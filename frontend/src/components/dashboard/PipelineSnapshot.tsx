'use client';

import { GlassCard, Eyebrow, Pill } from './GlassCard';

interface PipelineSnapshotProps {
 totalLeadsFound?: number;
 totalExports?: number;
}

export function PipelineSnapshot({ totalLeadsFound, totalExports: _totalExports }: PipelineSnapshotProps) {
 const items = [
  {
   k: 'Qualified leads',
   v: totalLeadsFound ? totalLeadsFound.toLocaleString() : '—',
   delta: '+142',
   tone: 'green' as const,
   sub: 'past 7 days',
  },
  {
   k: 'Drafts pending',
   v: '96',
   delta: '12 overdue',
   tone: 'amber' as const,
   sub: 'needs approval',
  },
  {
   k: 'Active sequences',
   v: '7',
   delta: '2 paused',
   tone: 'neutral' as const,
   sub: 'across 4 campaigns',
  },
  {
   k: 'Replies waiting',
   v: '38',
   delta: '5 hot',
   tone: 'violet' as const,
   sub: 'triage queue',
  },
 ];

 return (
  <GlassCard className="p-5">
   <Eyebrow right={<a className="text-[11px] font-body text-white/70 hover:text-white" href="#">All pipeline →</a>}>
    Pipeline snapshot
   </Eyebrow>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {items.map((p, i) => (
     <div key={i} className="rounded-xl bg-[color:var(--paper)]/[0.04] border border-white/10 p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
       <div className="text-[11px] font-body text-white/55 truncate">{p.k}</div>
       <Pill tone={p.tone} className="shrink-0">{p.delta}</Pill>
      </div>
      <span className="text-[30px] font-heading italic text-white leading-none tabular-nums">{p.v}</span>
      <div className="text-[10.5px] font-body text-white/45">{p.sub}</div>
     </div>
    ))}
   </div>
  </GlassCard>
 );
}
