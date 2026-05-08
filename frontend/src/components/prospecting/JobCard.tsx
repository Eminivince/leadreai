'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ProspectingJob, JobActivityLogEntry } from '@leadreai/shared';
import { useJob } from '@/hooks/useJob';
import { useWorkspace } from '@/hooks/useWorkspace';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'indigo';

const STATUS_STYLES: Record<string, { variant: BadgeVariant; label: string }> = {
 queued: { variant: 'secondary', label: 'Queued' },
 parsing: { variant: 'indigo', label: 'Parsing' },
 collecting: { variant: 'indigo', label: 'Collecting' },
 enriching: { variant: 'indigo', label: 'Enriching' },
 deduplicating: { variant: 'indigo', label: 'Deduplicating' },
 complete: { variant: 'default', label: 'Complete' },
 failed: { variant: 'outline', label: 'Failed' },
 cancelled: { variant: 'secondary', label: 'Cancelled' },
};

interface JobCardProps {
 job: ProspectingJob;
 onRefresh?: () => void;
}

function formatRelativeTime(dateStr: string): string {
 const date = new Date(dateStr);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffMins = Math.floor(diffMs / 60000);
 const diffHours = Math.floor(diffMins / 60);
 const diffDays = Math.floor(diffHours / 24);

 if (diffMins < 1) return 'just now';
 if (diffMins < 60) return `${diffMins}m ago`;
 if (diffHours < 24) return `${diffHours}h ago`;
 if (diffDays < 30) return `${diffDays}d ago`;
 return date.toLocaleDateString();
}

export function JobCard({ job, onRefresh }: JobCardProps) {
 const { workspaceId } = useWorkspace();
 const isActive = ['queued', 'parsing', 'collecting', 'enriching', 'deduplicating'].includes(job.status);
 const { status: liveStatus, percentage, activityLog: liveActivityLog } = useJob(
  isActive ? workspaceId : null,
  isActive ? job._id : null,
  onRefresh,
 );

 const activityLog: JobActivityLogEntry[] =
  isActive && liveActivityLog.length > 0
   ? liveActivityLog
   : (job.activityLog ?? []);

 const displayStatus = liveStatus ?? job.status;
 const statusStyle = STATUS_STYLES[displayStatus] ?? { variant: 'secondary' as BadgeVariant, label: displayStatus };
 const geo = job.parsedIntent?.geography;
 const location = [geo?.city, geo?.state, geo?.country].filter(Boolean).join(', ');

 return (
  <Card className="transition-colors hover:border-border/80">
   <CardContent className="p-4">
    <div className="flex items-start justify-between gap-3">
     <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-foreground">
       {job.rawQuery.length > 80 ? job.rawQuery.slice(0, 80) + '…' : job.rawQuery}
      </p>
      {job.parsedIntent?.industry && (
       <p className="mt-1 text-xs text-muted-foreground">
        {job.parsedIntent.industry}
        {location ? ` · ${location}` : ''}
        {job.parsedIntent.targetCount ? ` · ${job.parsedIntent.targetCount} leads` : ''}
       </p>
      )}
      {job.status === 'failed' && job.error?.message && (
       <p className="mt-1 text-xs text-red-400">{job.error.message}</p>
      )}
      {job.status === 'complete' && job.result?.totalLeadsFound != null && (
       <p className="mt-1 text-xs text-muted-foreground">{job.result.totalLeadsFound} leads found</p>
      )}
      {isActive && percentage != null && (
       <div className="mt-2 h-1 w-full rounded-full bg-secondary">
        <div
         className="h-1 rounded-full bg-foreground transition-all duration-500"
         style={{ width: `${percentage}%` }}
        />
       </div>
      )}
      {activityLog.length > 0 && (
       <details className="mt-3 group rounded-md border border-border/80 bg-muted/30 text-left">
        <summary className="cursor-pointer select-none list-none px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden flex items-center gap-1.5">
         <span className="inline-block transition-transform group-open:rotate-90 text-[10px]">▸</span>
         Run log ({activityLog.length} steps)
        </summary>
        <div className="max-h-56 overflow-y-auto border-t border-border/60 px-2 py-2 space-y-2 font-mono text-[10px] leading-relaxed">
         {activityLog.map((line, idx) => (
          <div key={`${line.at}-${idx}`} className="border-b border-border/40 pb-2 last:border-0 last:pb-0">
           <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="shrink-0 text-muted-foreground tabular-nums">
             {new Date(line.at).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-secondary-foreground">
             {line.step}
            </span>
           </div>
           <p className="mt-0.5 text-foreground/90 whitespace-pre-wrap break-words">{line.message}</p>
           {line.meta && Object.keys(line.meta).length > 0 && (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-background/80 p-1.5 text-[9px] text-muted-foreground">
             {JSON.stringify(line.meta, null, 2)}
            </pre>
           )}
          </div>
         ))}
        </div>
       </details>
      )}
     </div>
     <div className="flex flex-col items-end gap-2 shrink-0">
      <Badge variant={statusStyle.variant}>{statusStyle.label}</Badge>
      <span className="text-xs text-muted-foreground">
       {formatRelativeTime(job.createdAt)}
      </span>
     </div>
    </div>
   </CardContent>
  </Card>
 );
}
