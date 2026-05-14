'use client';

import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';

/* ── Icons ───────────────────────────────────────────────── */
const Svg = ({ className = 'w-4 h-4', children }: { className?: string; children: React.ReactNode }) => (
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className}>
  {children}
 </svg>
);
const TelescopeIcon = (p: { className?: string }) => <Svg {...p}><path d="M10.065 12.493 6.95 20l-1-1 3.118-7.515"/><path d="m14.49 3.13 6.37 3.67-9.12 15.8-6.37-3.67 9.12-15.8Z"/><path d="M19.2 5.8 17 9.5"/><path d="M9 15l-4 2"/></Svg>;
const CheckIcon   = (p: { className?: string }) => <Svg {...p}><polyline points="20 6 9 17 4 12"/></Svg>;
const ArrowRIcon  = (p: { className?: string }) => <Svg {...p}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></Svg>;
const SendIcon   = (p: { className?: string }) => <Svg {...p}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></Svg>;

/* ── Static data ─────────────────────────────────────────── */
const EXAMPLES = [
 { tag: 'FINTECH · NYC',   text: 'Series B fintechs in NYC using Salesforce, hiring SDRs in the last 60 days.',         stats: { leads: '~1.2K', credits: 860 } },
 { tag: 'DEVTOOLS · EUROPE', text: 'Series A devtools companies in Europe with open engineering management roles.',        stats: { leads: '~640', credits: 420 } },
 { tag: 'HEALTH · USA',   text: 'US healthtech companies (50–300 headcount) that migrated to AWS in the past year.',      stats: { leads: '~880', credits: 620 } },
 { tag: 'SMB · RETAIL',   text: 'DTC retail brands on Shopify Plus doing $5–20M GMV, VP Marketing hired in 2025.',      stats: { leads: '~2.1K', credits: 1280 } },
];

const TONES = [
 { k: 'direct', label: 'Direct',  sub: 'Short, specific, to the point' },
 { k: 'warm',  label: 'Warm',   sub: 'Peer to peer, friendly' },
 { k: 'exec',  label: 'Executive', sub: 'Measured, outcome-led' },
 { k: 'founder', label: 'Founder',  sub: 'Personal, a little scrappy' },
];

const GOALS = [
 { k: 'demo', label: 'Book a demo' },
 { k: 'intro', label: '15-min intro call' },
 { k: 'reply', label: 'Reply / interest check' },
 { k: 'event', label: 'Event invite' },
];

const SCHEDULES = [
 { k: 'once',  label: 'Run once' },
 { k: 'daily', label: 'Daily (new only)' },
 { k: 'weekly', label: 'Weekly · Mondays' },
];

const STAGES = [
 { k: 'parse', label: 'Parse intent',   sub: 'Extract filters from natural language',   dur: 900, counter: (t: number) => ({ label: 'filters found',   val: Math.min(6,  Math.floor(t * 6)) }) },
 { k: 'dork',  label: 'Build search plans', sub: 'Generate dorks across SERP + data sources', dur: 1200, counter: (t: number) => ({ label: 'plans queued',   val: Math.min(42,  Math.floor(t * 42)) }) },
 { k: 'scrape', label: 'Scrape open web',  sub: 'Fetch, render, extract signals',       dur: 3200, counter: (t: number) => ({ label: 'pages processed', val: Math.min(247, Math.floor(t * 247)) }) },
 { k: 'enrich', label: 'Enrich + verify',  sub: 'Emails, direct dials, tech stack, funding', dur: 2400, counter: (t: number) => ({ label: 'contacts verified', val: Math.min(1412, Math.floor(t * 1412)) }) },
 { k: 'dedupe', label: 'Dedupe + score',  sub: 'Collapse duplicates, evidence-first ranking',dur: 1400, counter: (t: number) => ({ label: 'unique leads',  val: Math.min(1284, Math.floor(t * 1284)) }) },
];

function estimateCost(prompt: string) {
 const base = 200;
 const words = prompt.trim().split(/\s+/).filter(Boolean).length;
 const spec = (prompt.match(/(series|funding|series [a-d]|headcount|using|hiring|geo|region|industry)/gi) ?? []).length;
 return Math.round(Math.min(2400, base + words * 28 + spec * 90) / 20) * 20;
}

/* ── Segmented control ───────────────────────────────────── */
function Segmented({ label, value, onChange, options }: {
 label: string; value: string; onChange: (v: string) => void;
 options: { k: string; label: string; sub?: string }[];
}) {
 return (
  <div>
   <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 mb-2 whitespace-nowrap">{label}</div>
   <div className="grid grid-cols-2 gap-1.5">
    {options.map(o => (
     <button key={o.k} onClick={() => onChange(o.k)}
      className={['text-left rounded-xl px-3 py-2.5 border transition',
       value === o.k ? 'border-white/45 bg-[color:var(--paper)]/10 text-white' : 'border-white/10 bg-[color:var(--paper)]/[0.02] text-white/70 hover:bg-[color:var(--paper)]/[0.05] hover:text-white'].join(' ')}>
      <div className="text-[12.5px] font-body font-medium">{o.label}</div>
      {o.sub && <div className="text-[10.5px] font-body text-white/45 leading-snug">{o.sub}</div>}
     </button>
    ))}
   </div>
  </div>
 );
}

/* ── Stage row ───────────────────────────────────────────── */
function StageRow({ idx, stage, pct, state, counterLabel, counterVal }: {
 idx: number; stage: typeof STAGES[number]; pct: number; state: string; counterLabel: string; counterVal: number;
}) {
 const isRunning = state === 'running';
 const isDone  = state === 'done';
 const isQueued = state === 'queued';
 return (
  <div className={['relative rounded-2xl border px-4 py-3 flex items-center gap-4 transition',
   isRunning ? 'border-white/25 bg-[color:var(--paper)]/[0.06]' : isDone ? 'border-emerald-400/20 bg-emerald-400/[0.04]' : 'border-white/[0.08] bg-[color:var(--paper)]/[0.015]'].join(' ')}>
   <div className={['relative w-8 h-8 rounded-full flex items-center justify-center shrink-0',
    isDone ? 'bg-emerald-300/20 text-emerald-200' : isRunning ? 'bg-[color:var(--paper)]/10 text-white' : 'bg-[color:var(--paper)]/5 text-white/40'].join(' ')}>
    {isDone ? <CheckIcon className="w-3.5 h-3.5"/> :
     isRunning ? (
      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
       <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2"/>
       <path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
     ) : <span className="text-[11px] font-mono tabular-nums">0{idx + 1}</span>}
   </div>
   <div className="min-w-0 flex-1">
    <div className="flex items-baseline gap-2">
     <span className={['text-[13px] font-body font-medium truncate', isQueued ? 'text-white/55' : 'text-white'].join(' ')}>{stage.label}</span>
     <span className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-white/35 whitespace-nowrap shrink-0">0{idx + 1}/05</span>
    </div>
    <div className="text-[10.5px] font-body text-white/45 leading-tight truncate">{stage.sub}</div>
    <div className="mt-2 h-[2px] rounded-full bg-[color:var(--paper)]/[0.08] overflow-hidden relative">
     <div className={['absolute left-0 top-0 bottom-0 rounded-full', isDone ? 'bg-emerald-300' : 'bg-[color:var(--paper)]'].join(' ')}
      style={{ width: `${pct * 100}%`, transition: 'width .2s linear' }}/>
     {isRunning && (
      <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/70 to-transparent"
       style={{ animation: 'nqBarShimmer 1.2s ease-in-out infinite' }}/>
     )}
    </div>
   </div>
   <div className="text-right shrink-0 w-[120px]">
    <div className={['text-[18px] font-body font-medium tabular-nums leading-none',
     isQueued ? 'text-white/30' : isDone ? 'text-emerald-200' : 'text-white'].join(' ')}>
     {counterVal.toLocaleString()}
    </div>
    <div className="text-[9.5px] font-mono uppercase tracking-[0.16em] text-white/40 mt-1">{counterLabel}</div>
   </div>
  </div>
 );
}

/* ── Running phase ───────────────────────────────────────── */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Map worker stage names → 0-4 display index
const STAGE_MAP: Record<string, number> = {
 parsing:     0,
 queryBuilder:  1,
 serpSearch:   1,
 pageScraping:  2,
 fileExtraction: 2,
 osintEnrichment: 3,
 deduplication:  4,
 ranking:     4,
 leadWrite:    4,
 qualification:  4,
};

function formatElapsed(ms: number): { time: string; tenths: number } {
 const totalSecs = Math.floor(ms / 1000);
 const hrs = Math.floor(totalSecs / 3600);
 const mins = Math.floor((totalSecs % 3600) / 60);
 const secs = totalSecs % 60;
 const tenths = Math.floor((ms % 1000) / 100);
 const time = hrs > 0
  ? `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
  : `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
 return { time, tenths };
}

function Running({
 prompt,
 workspaceId,
 jobId,
 onDone,
}: {
 prompt: string;
 workspaceId: string;
 jobId: string | null;
 onDone: (result: { leadsFound: number; creditsUsed: number }) => void;
}) {
 const [elapsed, setElapsed]     = useState(0);
 const [overallPct, setOverallPct]  = useState(0);
 const [activeStageIdx, setActiveStageIdx] = useState(0);
 const [stagePcts, setStagePcts]   = useState<number[]>([0, 0, 0, 0, 0]);
 const [leadsFound, setLeadsFound]  = useState(0);
 const activeIdxRef = useRef(0);
 const esRef    = useRef<EventSource | null>(null);
 const doneRef   = useRef(false);

 useEffect(() => {
  const start = performance.now();
  const id = setInterval(() => setElapsed(performance.now() - start), 100);
  return () => clearInterval(id);
 }, []);

 useEffect(() => {
  if (!jobId || !workspaceId || doneRef.current) return;

  const token = getAccessToken();
  const url = `${API_BASE}/api/v1/workspaces/${workspaceId}/jobs/${jobId}/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  const es = new EventSource(url);
  esRef.current = es;

  const finish = (result: { leadsFound: number; creditsUsed: number }) => {
   doneRef.current = true;
   setStagePcts([1, 1, 1, 1, 1]);
   setOverallPct(1);
   setActiveStageIdx(5);
   es.close();
   esRef.current = null;
   setTimeout(() => onDone(result), 700);
  };

  es.onmessage = (ev: MessageEvent) => {
   try {
    const data = JSON.parse(ev.data as string) as Record<string, unknown>;
    const type = data.type as string;

    if (type === 'status') {
     const jobStatus = (data.status as string | undefined) ?? '';
     // Bootstrap: job already finished before we connected
     if (jobStatus === 'complete' || jobStatus === 'qualified') {
      finish({ leadsFound: 0, creditsUsed: 0 });
      return;
     }
     const stageKey = (data.stage as string | undefined) ?? '';
     const idx = STAGE_MAP[stageKey] ?? activeIdxRef.current;
     const pct = Math.min(1, Number(data.percentage ?? 0) / 100);
     activeIdxRef.current = idx;
     setActiveStageIdx(idx);
     setOverallPct(pct);
     setStagePcts(prev => {
      const next = [...prev];
      for (let i = 0; i < idx; i++) next[i] = 1;
      next[idx] = 0; // shimmer handles visual; don't set artificial pct
      return next;
     });

    } else if (type === 'progress') {
     setLeadsFound(Number(data.leadsFoundSoFar ?? 0));

    } else if (type === 'complete') {
     finish({
      leadsFound: Number(data.totalAfterDedup ?? data.totalLeadsFound ?? 0),
      creditsUsed: 0,
     });

    } else if (type === 'qualification_complete') {
     finish({ leadsFound: Number(data.qualified ?? 0), creditsUsed: 0 });

    } else if (type === 'error') {
     doneRef.current = true;
     es.close();
     esRef.current = null;
     onDone({ leadsFound: 0, creditsUsed: 0 });
    }
   } catch { /* ignore parse errors */ }
  };

  es.onerror = () => { es.close(); esRef.current = null; };
  return () => { es.close(); esRef.current = null; };
 }, [jobId, workspaceId, onDone]);

 const { time, tenths } = formatElapsed(elapsed);

 return (
  <div className="px-5 md:px-7 py-5 flex flex-col gap-5">
   <div className="rounded-2xl border border-white/10 bg-[color:var(--paper)]/[0.02] p-4">
    <div className="flex items-start gap-3">
     <div className="w-7 h-7 rounded-md liquid-glass flex items-center justify-center shrink-0">
      <span className="relative z-[1] text-white/75 text-[11px] font-mono">&gt;</span>
     </div>
     <div className="min-w-0 flex-1">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/45 mb-1">Query</div>
      <div className="text-[13.5px] font-body text-white/90 leading-snug">{prompt}</div>
     </div>
     <div className="text-right shrink-0">
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/45">Elapsed</div>
      <div className="text-[15px] font-body font-medium text-white tabular-nums">
       {time}<span className="text-white/40">.{tenths}</span>
      </div>
     </div>
    </div>
    <div className="mt-3 h-[3px] rounded-full bg-[color:var(--paper)]/[0.08] overflow-hidden relative">
     <div className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-white/80 via-white to-white rounded-full"
      style={{ width: `${overallPct * 100}%`, transition: 'width .6s ease' }}/>
     <div className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/50 to-transparent"
      style={{ animation: 'nqBarShimmer 1.4s ease-in-out infinite' }}/>
    </div>
    <div className="mt-2 flex items-center justify-between text-[10.5px] font-mono text-white/45 whitespace-nowrap">
     <span>Overall {Math.floor(overallPct * 100)}%</span>
     {!jobId && <span className="text-amber-300/70">Queuing job…</span>}
    </div>
   </div>
   <div className="flex flex-col gap-2.5">
    {STAGES.map((s, i) => {
     const pct  = stagePcts[i] ?? 0;
     const state = i < activeStageIdx ? 'done' : i === activeStageIdx ? 'running' : 'queued';
     const { label: cLabel } = s.counter(pct);
     // Show live lead count on the enrichment stage
     const cVal = i === 3 ? leadsFound : (state === 'done' ? s.counter(1).val : 0);
     return <StageRow key={s.k} idx={i} stage={s} pct={pct} state={state} counterLabel={cLabel} counterVal={cVal}/>;
    })}
   </div>
   <div className="text-[11px] font-body text-white/45 italic text-center">You can close this — the job keeps running in the background.</div>
  </div>
 );
}

/* ── Summary phase ───────────────────────────────────────── */
function Summary({ onClose, result }: { onClose: () => void; result: { leadsFound: number; creditsUsed: number } | null }) {
 const router = useRouter();
 return (
  <div className="px-5 md:px-7 py-5 flex flex-col gap-5">
   <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-5 flex items-start gap-4">
    <div className="w-10 h-10 rounded-full bg-emerald-300/20 text-emerald-200 flex items-center justify-center shrink-0">
     <CheckIcon className="w-5 h-5"/>
    </div>
    <div className="flex-1 min-w-0">
     <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-200/80">Job complete</div>
     <h3 className="text-[24px] md:text-[28px] font-heading italic text-white leading-tight mt-0.5">Leads ready for review.</h3>
     <p className="text-[12.5px] font-body text-white/60 mt-1 max-w-[62ch]">
      Prospecting job finished. View your leads to review, qualify, and start a campaign.
     </p>
    </div>
   </div>
   <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {[
     { k: 'Status',  v: 'Complete',                     sub: 'all stages done' },
     { k: 'Verified', v: result ? result.leadsFound.toLocaleString() : '—', sub: 'leads found' },
     { k: 'Hot',   v: '—',                         sub: 'score ≥ 0.9', tone: 'emerald' },
     { k: 'Credits', v: result ? result.creditsUsed.toLocaleString() : '—', sub: 'used this run' },
    ].map((s, i) => (
     <div key={i} className="rounded-xl border border-white/10 bg-[color:var(--paper)]/[0.02] p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">{s.k}</div>
      <div className={['text-[22px] font-body font-medium tabular-nums leading-none mt-1', s.tone === 'emerald' ? 'text-emerald-200' : 'text-white'].join(' ')}>{s.v}</div>
      <div className="text-[10.5px] font-body text-white/45 mt-1.5">{s.sub}</div>
     </div>
    ))}
   </div>
   <div className="border-t border-white/10 px-0 py-3.5 flex items-center gap-3 flex-wrap">
    <button onClick={onClose} className="h-10 rounded-xl px-4 text-[12.5px] font-body text-white/65 hover:text-white hover:bg-[color:var(--paper)]/5 transition whitespace-nowrap">Back to Home</button>
    <div className="ml-auto flex items-center gap-2">
     <button onClick={() => { onClose(); router.push('/dashboard/campaigns'); }}
      className="h-10 rounded-xl px-3.5 border border-white/15 bg-[color:var(--paper)]/[0.04] hover:bg-[color:var(--paper)]/[0.08] text-[12.5px] font-body text-white inline-flex items-center gap-2 whitespace-nowrap">
      <SendIcon className="w-3.5 h-3.5"/> Start campaign
     </button>
     <button onClick={() => { onClose(); router.push('/dashboard/leads'); }}
      className="h-10 rounded-xl px-4 bg-[color:var(--paper)] text-black text-[12.5px] font-body font-semibold inline-flex items-center gap-2 hover:bg-[color:var(--paper)]/90 transition whitespace-nowrap">
      Review leads <ArrowRIcon className="w-3.5 h-3.5"/>
     </button>
    </div>
   </div>
  </div>
 );
}

/* ── Modal ───────────────────────────────────────────────── */
interface NewQueryModalProps {
 workspaceId: string;
 onSubmit: (query: string) => Promise<string | null>;
 isSubmitting?: boolean;
 error?: string | null;
}

export function NewQueryModal({ workspaceId, onSubmit }: NewQueryModalProps) {
 const { newQueryOpen, closeNewQuery, activeJobId, activeJobPrompt, setActiveJob, clearActiveJob } = useAppStore();
 const [phase, setPhase] = useState<'composer' | 'running' | 'summary'>('composer');
 const [prompt, setPrompt] = useState('');
 const [tone, setTone] = useState('direct');
 const [goal, setGoal] = useState('demo');
 const [schedule, setSchedule] = useState('once');
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 const [_blocklist] = useState('existing-crm');
 const taRef = useRef<HTMLTextAreaElement>(null);
 const [jobId, setJobId] = useState<string | null>(null);
 const [jobResult, setJobResult] = useState<{ leadsFound: number; creditsUsed: number } | null>(null);

 useEffect(() => {
  if (!newQueryOpen) return;
  // If there's an active job in the store, reconnect to it instead of showing the composer
  if (activeJobId) {
   setPhase('running');
   setPrompt(activeJobPrompt ?? '');
   setJobId(activeJobId);
   setJobResult(null);
  } else {
   setPhase('composer');
   setPrompt('');
   setJobId(null);
   setJobResult(null);
   setTimeout(() => taRef.current?.focus(), 120);
  }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [newQueryOpen]);

 useEffect(() => {
  if (!newQueryOpen) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') closeNewQuery();
   if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase === 'composer' && prompt.trim()) {
    void handleRun();
   }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [newQueryOpen, phase, prompt]);

 async function handleRun() {
  if (!prompt.trim()) return;
  setJobResult(null);
  setJobId(null);
  setPhase('running');
  try {
   const id = await onSubmit(prompt);
   if (id) {
    setJobId(id);
    setActiveJob(id, prompt);
   }
  } catch { /* SSE phase handles its own error display */ }
 }

 function handleJobDone(result: { leadsFound: number; creditsUsed: number }) {
  clearActiveJob();
  setJobResult(result);
  setPhase('summary');
 }

 if (!newQueryOpen) return null;

 const cost = estimateCost(prompt || 'Series B fintechs in NYC using Salesforce, hiring SDRs');

 return (
  <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center p-0 md:p-6" role="dialog" aria-modal="true">
   <style>{`
    @keyframes nqFadeIn  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes nqPop   { from { opacity: 0; transform: translateY(12px) scale(.985) } to { opacity: 1; transform: none } }
    @keyframes nqBarShimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }
   `}</style>

   {/* Backdrop */}
   <div className="absolute inset-0 bg-black/55 backdrop-blur-md" style={{ animation: 'nqFadeIn .25s ease-out both' }}
    onClick={closeNewQuery}/>

   {/* Panel */}
   <div className="relative w-full md:max-w-[1000px] max-h-[92vh] md:max-h-[86vh] overflow-hidden rounded-t-3xl md:rounded-3xl liquid-glass-strong flex flex-col"
    style={{ animation: 'nqPop .32s cubic-bezier(.2,.9,.25,1) both' }}>
    <div className="relative z-[1] flex flex-col min-h-0 flex-1">
     {/* Header */}
     <div className="flex items-center justify-between px-5 md:px-7 pt-5 pb-3 border-b border-white/10">
      <div className="flex items-center gap-3">
       <div className="w-8 h-8 rounded-full liquid-glass flex items-center justify-center">
        <TelescopeIcon className="relative z-[1] w-4 h-4 text-white"/>
       </div>
       <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/50 leading-none whitespace-nowrap">
         {phase === 'composer' ? 'New prospecting query' : phase === 'running' ? 'Streaming · live' : 'Job complete'}
        </div>
        <div className="text-[16px] md:text-[18px] font-heading italic text-white leading-tight mt-0.5 whitespace-nowrap">
         {phase === 'composer' ? 'Describe your buyer.' : phase === 'running' ? 'Working through the pipeline.' : 'Pipeline ready for review.'}
        </div>
       </div>
      </div>
      <button onClick={closeNewQuery}
       className="w-8 h-8 rounded-full liquid-glass flex items-center justify-center text-white/75 hover:text-white">
       <span className="relative z-[1] text-[18px] leading-none">×</span>
      </button>
     </div>

     {/* Body */}
     <div className="flex-1 min-h-0 overflow-y-auto">
      {phase === 'composer' && (
       <div className="px-5 md:px-7 py-5 flex flex-col gap-5">
        {/* Prompt */}
        <div>
         <label className="flex items-baseline justify-between mb-2 gap-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 whitespace-nowrap">Prompt</span>
          <span className="text-[11px] font-body text-white/45">{prompt.trim().split(/\s+/).filter(Boolean).length} words</span>
         </label>
         <div className="relative rounded-2xl border border-white/[0.12] bg-[color:var(--paper)]/[0.03] focus-within:border-white/40 focus-within:bg-[color:var(--paper)]/[0.06] transition">
          <textarea ref={taRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
           placeholder="e.g. Series B fintechs in NYC using Salesforce that hired SDRs in the last 60 days." rows={3}
           className="w-full bg-transparent text-white placeholder-white/30 px-4 pt-4 pb-10 text-[15px] md:text-[16px] font-body leading-relaxed resize-none outline-none"/>
          <div className="absolute left-3 right-3 bottom-2.5 flex items-center justify-between text-[10.5px] font-mono text-white/40">
           <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>AI parses intent on submit</span>
           <div className="flex items-center gap-2">
            <span className="border border-white/10 rounded-md px-1.5 py-0.5">⌘</span>
            <span className="border border-white/10 rounded-md px-1.5 py-0.5">↵</span>
            <span className="text-white/45">to run</span>
           </div>
          </div>
         </div>
        </div>

        {/* Examples */}
        <div>
         <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 whitespace-nowrap">Try an example</span>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {EXAMPLES.map((ex, i) => (
           <button key={i} onClick={() => setPrompt(ex.text)}
            className="group text-left rounded-xl border border-white/10 bg-[color:var(--paper)]/[0.025] hover:bg-[color:var(--paper)]/[0.06] hover:border-white/25 transition px-3.5 py-3">
            <div className="flex items-center gap-2 mb-1.5">
             <span className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-white/50">{ex.tag}</span>
             <span className="ml-auto text-[10px] font-mono text-white/40 tabular-nums">{ex.stats.leads} · {ex.stats.credits} cr</span>
            </div>
            <div className="text-[12.5px] font-body text-white/85 leading-snug">{ex.text}</div>
           </button>
          ))}
         </div>
        </div>

        {/* Tone / goal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
         <Segmented label="Outreach tone" value={tone} onChange={setTone} options={TONES}/>
         <Segmented label="Primary goal"  value={goal} onChange={setGoal} options={GOALS}/>
        </div>

        {/* Schedule */}
        <div>
         <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 mb-2 whitespace-nowrap">Schedule</div>
         <div className="flex items-center gap-1.5 flex-wrap">
          {SCHEDULES.map(s => (
           <button key={s.k} onClick={() => setSchedule(s.k)}
            className={['h-8 px-3 rounded-full text-[12px] font-body transition whitespace-nowrap border',
             schedule === s.k ? 'border-white/45 bg-[color:var(--paper)]/10 text-white' : 'border-white/10 bg-[color:var(--paper)]/[0.02] text-white/70 hover:text-white'].join(' ')}>
            {s.label}
           </button>
          ))}
         </div>
        </div>
       </div>
      )}
      {phase === 'running' && (
       <Running
        prompt={prompt}
        workspaceId={workspaceId}
        jobId={jobId}
        onDone={handleJobDone}
       />
      )}
      {phase === 'summary' && <Summary onClose={closeNewQuery} result={jobResult}/>}
     </div>

     {/* Footer — composer only */}
     {phase === 'composer' && (
      <div className="border-t border-white/10 px-5 md:px-7 py-3.5 flex items-center gap-4 flex-wrap bg-black/20">
       <div className="flex items-center gap-5 text-[11.5px] font-body text-white/65 flex-wrap">
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
         <span className="text-[10px] font-mono uppercase tracking-wider text-white/45">Credit cost</span>
         <span className="text-[15px] font-body font-medium tabular-nums leading-none text-white">{cost.toLocaleString()}</span>
        </div>
       </div>
       <div className="ml-auto flex items-center gap-2">
        <button onClick={closeNewQuery} className="h-10 rounded-xl px-4 text-[12.5px] font-body text-white/65 hover:text-white hover:bg-[color:var(--paper)]/5 transition">Cancel</button>
        <button onClick={handleRun} disabled={!prompt.trim()}
         className="h-10 rounded-xl px-4 bg-[color:var(--paper)] text-black text-[12.5px] font-body font-semibold inline-flex items-center gap-2 hover:bg-[color:var(--paper)]/90 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
         Run prospecting job <ArrowRIcon className="w-3.5 h-3.5"/>
        </button>
       </div>
      </div>
     )}
    </div>
   </div>
  </div>
 );
}
