'use client';

import {
 AreaChart,
 Area,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip as RechartsTooltip,
 ResponsiveContainer,
} from 'recharts';
import type { ProspectingJob } from '@leadreai/shared';
import { Skeleton } from '@/components/ui/skeleton';

interface LeadsAreaChartProps {
 jobs: ProspectingJob[];
 isLoading?: boolean;
}

interface DayBucket {
 date: string;
 leads: number;
}

function buildChartData(jobs: ProspectingJob[]): DayBucket[] {
 const buckets: Record<string, number> = {};
 const now = new Date();
 for (let i = 13; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  buckets[key] = 0;
 }

 for (const job of jobs) {
  if (job.status !== 'complete' || !job.completedAt || !job.result || !job.result.totalLeadsFound) continue;
  const d = new Date(job.completedAt);
  const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (key in buckets) {
   buckets[key] = (buckets[key] ?? 0) + job.result.totalLeadsFound;
  }
 }

 return Object.entries(buckets).map(([date, leads]) => ({ date, leads }));
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
 if (!active || !payload?.length) return null;
 return (
  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
   <p className="font-medium text-foreground">{label}</p>
   <p className="text-muted-foreground mt-0.5">
    <span className="text-foreground font-semibold">{payload?.[0]?.value}</span> leads
   </p>
  </div>
 );
};

export function LeadsAreaChart({ jobs, isLoading }: LeadsAreaChartProps) {
 if (isLoading) {
  return <Skeleton className="h-[180px] w-full" />;
 }

 const data = buildChartData(jobs);
 const hasData = data.some(d => d.leads > 0);

 if (!hasData) {
  return (
   <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">
    Leads found will appear here after your first completed job.
   </div>
  );
 }

 return (
  <ResponsiveContainer width="100%" height={180}>
   <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
    <defs>
     <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.15} />
      <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
     </linearGradient>
    </defs>
    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
    <XAxis
     dataKey="date"
     tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
     tickLine={false}
     axisLine={false}
     interval={3}
    />
    <YAxis
     tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
     tickLine={false}
     axisLine={false}
     allowDecimals={false}
    />
    <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }} />
    <Area
     type="monotone"
     dataKey="leads"
     stroke="hsl(var(--foreground))"
     strokeWidth={1.5}
     fill="url(#leadsGradient)"
     dot={false}
     activeDot={{ r: 3, fill: 'hsl(var(--foreground))', strokeWidth: 0 }}
    />
   </AreaChart>
  </ResponsiveContainer>
 );
}
