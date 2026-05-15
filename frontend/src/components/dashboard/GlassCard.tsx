'use client';

import { cn } from '@/lib/utils';

export function GlassCard({ children, className = '', strong = false }: {
 children: React.ReactNode;
 className?: string;
 strong?: boolean;
}) {
 return (
  <div className={cn(strong ? 'liquid-glass-strong' : 'liquid-glass', 'rounded-2xl', className)}>
   <div className="relative z-[1] h-full">{children}</div>
  </div>
 );
}

export function Eyebrow({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
 return (
  <div className="flex items-center justify-between mb-3">
   <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-white/50">{children}</span>
   {right}
  </div>
 );
}

export function Pill({ children, tone = 'neutral', className = '' }: {
 children: React.ReactNode;
 tone?: 'neutral' | 'red' | 'amber' | 'green' | 'blue' | 'violet';
 className?: string;
}) {
 const tones: Record<string, string> = {
  neutral: 'bg-[color:var(--paper)]/[0.08] text-white/75 border-white/10',
  red:   'bg-rose-400/10 text-rose-200 border-rose-300/20',
  amber:  'bg-amber-400/10 text-amber-100 border-[color:var(--ember)]/50/20',
  green:  'bg-emerald-400/10 text-emerald-200 border-emerald-300/20',
  blue:  'bg-sky-400/10 text-sky-200 border-sky-300/20',
  violet: 'bg-violet-400/10 text-violet-200 border-violet-300/20',
 };
 return (
  <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-body', tones[tone], className)}>
   {children}
  </span>
 );
}

export function Bar({ value, max = 100, tone = 'white' }: { value: number; max?: number; tone?: 'white' | 'amber' | 'red' | 'green' }) {
 const pct = Math.max(0, Math.min(100, (value / max) * 100));
 const fill = tone === 'amber' ? 'bg-amber-300' : tone === 'red' ? 'bg-rose-400' : tone === 'green' ? 'bg-emerald-300' : 'bg-[color:var(--paper)]';
 return (
  <div className="h-[3px] w-full rounded-full bg-[color:var(--paper)]/10 overflow-hidden">
   <div className={cn('h-full', fill)} style={{ width: pct + '%' }} />
  </div>
 );
}
