'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { ProspectingJob } from '@leadreai/shared';

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

export function JobCard({ job }: JobCardProps) {
  const statusStyle = STATUS_STYLES[job.status] ?? { variant: 'secondary' as BadgeVariant, label: job.status };
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
              <p className="mt-1 text-xs text-emerald-400">{job.result.totalLeadsFound} leads found</p>
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
