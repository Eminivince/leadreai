'use client';

import { useState } from 'react';
import { GlassCard } from './GlassCard';

const FEED = [
 { t: 'just now', who: 'Mira Okafor',       detail: 'replied to Q2 · Series B fintech — wants demo Thu', tone: 'violet' },
 { t: '2m',    who: 'Prospecting #8241',     detail: 'failed at scrape — 3 dorks timed out (retrying)',  tone: 'red'   },
 { t: '6m',    who: 'HubSpot',          detail: 'pushed 212 verified leads · 24 queued',       tone: 'blue'  },
 { t: '14m',   who: 'Jordan Li',         detail: "exported 'Q2 · Series B fintech' to XLSX",     tone: 'neutral' },
 { t: '22m',   who: 'AI Drafter',        detail: "generated 140 outreach drafts for Diego's sequence", tone: 'neutral' },
 { t: '38m',   who: "Sequence 'Fintech Warm Intro'", detail: 'step 2 sent to 96 leads · 4 bounces',      tone: 'neutral' },
 { t: '1h',    who: 'Priya Rao',         detail: 'qualified 38 leads · 6 dust',            tone: 'green'  },
 { t: '2h',    who: 'Prospecting #8238',     detail: 'complete — 247 pages scraped, 1,284 leads',     tone: 'green'  },
];

const TABS = ['All', 'Jobs', 'Drafts', 'Sync', 'Replies'];

const DOT_COLORS: Record<string, string> = {
 red:   'bg-rose-400',
 green:  'bg-emerald-400',
 violet: 'bg-violet-300',
 blue:  'bg-sky-300',
 neutral: 'bg-[color:var(--paper)]/50',
};

export function ActivityFeed() {
 const [filter, setFilter] = useState('All');

 return (
  <GlassCard className="p-5 h-full flex flex-col">
   <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
     <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-white/50">Activity</span>
     <span className="w-1 h-1 rounded-full bg-emerald-400 live-dot" />
     <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-300">live</span>
    </div>
    <div className="flex items-center gap-1 liquid-glass rounded-full p-0.5">
     {TABS.map(t => (
      <button key={t} onClick={() => setFilter(t)}
       className={`relative z-[1] px-2 py-0.5 text-[10.5px] font-body rounded-full transition ${filter === t ? 'bg-[color:var(--paper)] text-black' : 'text-white/70 hover:text-white'}`}>
       {t}
      </button>
     ))}
    </div>
   </div>
   <div className="flex-1 flex flex-col gap-1 overflow-hidden">
    {FEED.map((f, i) => (
     <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-b-0">
      <div className="relative mt-1 shrink-0">
       <span className={`block w-1.5 h-1.5 rounded-full ${DOT_COLORS[f.tone] ?? 'bg-[color:var(--paper)]/50'}`} />
      </div>
      <div className="min-w-0 flex-1">
       <div className="text-[12px] font-body text-white leading-tight">
        <span className="font-medium">{f.who}</span>{' '}
        <span className="text-white/65">{f.detail}</span>
       </div>
      </div>
      <span className="text-[10px] font-mono text-white/40 shrink-0 tabular-nums">{f.t}</span>
     </div>
    ))}
   </div>
  </GlassCard>
 );
}
