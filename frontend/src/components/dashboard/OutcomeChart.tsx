'use client';

import { useState } from 'react';
import { GlassCard, Pill } from './GlassCard';

const DAYS = 14;
const REPLIES = [18, 22, 31, 28, 24, 36, 41, 39, 44, 51, 47, 58, 62, 71];
const MEETINGS = [2, 3, 4, 3, 5, 6, 6, 5, 8, 9, 8, 11, 12, 14];
const DATE_LABELS = ['Apr 5','','','Apr 8','','','Apr 11','','','Apr 14','','','Apr 17','Today'];
const MAX_Y = 80;
const W = 680, H = 220, PAD_L = 36, PAD_R = 12, PAD_T = 12, PAD_B = 28;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const xFor = (i: number) => PAD_L + (i / (DAYS - 1)) * PLOT_W;
const yFor = (v: number) => PAD_T + PLOT_H - (v / MAX_Y) * PLOT_H;
const linePath = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ');
const areaPath = (arr: number[]) => `${linePath(arr)} L ${xFor(DAYS - 1)} ${PAD_T + PLOT_H} L ${xFor(0)} ${PAD_T + PLOT_H} Z`;

const totalReplies = REPLIES.reduce((s, v) => s + v, 0);
const totalMeetings = MEETINGS.reduce((s, v) => s + v, 0);
const replyRate   = (totalReplies / 1280 * 100).toFixed(1);

export function OutcomeChart() {
 const [range, setRange] = useState('14d');

 return (
  <GlassCard className="p-5">
   <div className="flex items-start justify-between mb-1 gap-3 flex-wrap">
    <div className="min-w-0">
     <div className="text-[10px] font-mono tracking-[0.18em] uppercase text-white/50 mb-1">Outcomes</div>
     <h3 className="text-[22px] font-heading italic text-white leading-none whitespace-nowrap">Replies &amp; meetings.</h3>
    </div>
    <div className="flex items-center gap-1 liquid-glass rounded-full p-1 shrink-0">
     {['7d', '14d', '30d', 'QTD'].map((r) => (
      <button key={r} onClick={() => setRange(r)}
       className={`relative z-[1] px-2.5 py-1 text-[11px] font-body rounded-full transition ${range === r ? 'bg-[color:var(--paper)] text-black' : 'text-white/70 hover:text-white'}`}>
       {r}
      </button>
     ))}
    </div>
   </div>

   <div className="flex items-center gap-4 md:gap-6 mt-2 mb-2 flex-wrap">
    <div className="flex items-baseline gap-1.5">
     <span className="w-2 h-2 rounded-full bg-[color:var(--paper)] translate-y-[-2px]" />
     <span className="text-[11px] text-white/60 font-body">Replies</span>
     <span className="text-[20px] font-medium text-white ml-1 tabular-nums font-body">{totalReplies}</span>
    </div>
    <div className="flex items-baseline gap-1.5">
     <span className="w-2 h-2 rounded-full bg-violet-300 translate-y-[-2px]" />
     <span className="text-[11px] text-white/60 font-body">Meetings</span>
     <span className="text-[20px] font-medium text-white ml-1 tabular-nums font-body">{totalMeetings}</span>
    </div>
    <div className="flex items-baseline gap-1.5">
     <span className="text-[11px] text-white/60 font-body">Reply rate</span>
     <span className="text-[20px] font-medium text-white ml-1 tabular-nums font-body">{replyRate}%</span>
     <Pill tone="green">+1.4 pp</Pill>
    </div>
   </div>

   <div className="w-full overflow-hidden">
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]">
     <defs>
      <linearGradient id="replyAreaDash" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stopColor="rgba(255,255,255,0.35)"/>
       <stop offset="1" stopColor="rgba(255,255,255,0)"/>
      </linearGradient>
      <linearGradient id="meetAreaDash" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0" stopColor="rgba(167,139,250,0.5)"/>
       <stop offset="1" stopColor="rgba(167,139,250,0)"/>
      </linearGradient>
     </defs>
     {[0, 20, 40, 60, 80].map((v, i) => (
      <g key={i}>
       <line x1={PAD_L} x2={W - PAD_R} y1={yFor(v)} y2={yFor(v)}
        stroke="rgba(255,255,255,0.07)" strokeDasharray={i === 0 ? '0' : '2 4'} />
       <text x={PAD_L - 8} y={yFor(v) + 3} textAnchor="end"
        className="fill-white/35" style={{ fontSize: 9, fontFamily: 'var(--font-jetbrains-mono)' }}>{v}</text>
      </g>
     ))}
     {DATE_LABELS.map((d, i) => d && (
      <text key={i} x={xFor(i)} y={H - 8} textAnchor="middle"
       className="fill-white/35" style={{ fontSize: 9, fontFamily: 'var(--font-jetbrains-mono)' }}>{d}</text>
     ))}
     <path d={areaPath(REPLIES)} fill="url(#replyAreaDash)" />
     <path d={areaPath(MEETINGS)} fill="url(#meetAreaDash)" />
     <path d={linePath(REPLIES)} fill="none" stroke="#ffffff" strokeWidth="1.6" />
     <path d={linePath(MEETINGS)} fill="none" stroke="#c4b5fd" strokeWidth="1.6" />
     <circle cx={xFor(DAYS - 1)} cy={yFor(REPLIES[DAYS - 1]!)} r="4" fill="#fff" />
     <circle cx={xFor(DAYS - 1)} cy={yFor(REPLIES[DAYS - 1]!)} r="8" fill="#fff" opacity="0.15" />
     <circle cx={xFor(DAYS - 1)} cy={yFor(MEETINGS[DAYS - 1]!)} r="3.5" fill="#c4b5fd" />
    </svg>
   </div>

   <div className="mt-2 grid grid-cols-3 gap-4 pt-3 border-t border-white/10">
    <div>
     <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">Top campaign</div>
     <div className="text-[13px] font-medium text-white font-body">Q2 · Series B fintech</div>
     <div className="text-[10.5px] text-white/50 tabular-nums font-body">32% reply rate · 14 meetings</div>
    </div>
    <div>
     <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">Best persona</div>
     <div className="text-[13px] font-medium text-white font-body">VP RevOps</div>
     <div className="text-[10.5px] text-white/50 tabular-nums font-body">+4.2 pp vs avg</div>
    </div>
    <div>
     <div className="text-[10px] font-mono uppercase tracking-wider text-white/45">Attributed pipeline</div>
     <div className="text-[13px] font-medium text-white tabular-nums font-body">$1.42M</div>
     <div className="text-[10.5px] text-white/50 font-body">last 30 days</div>
    </div>
   </div>
  </GlassCard>
 );
}
