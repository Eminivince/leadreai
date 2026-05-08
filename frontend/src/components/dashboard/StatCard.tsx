'use client';

import { type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
 title: string;
 value: number | string | undefined;
 description: string;
 icon: LucideIcon;
 iconClassName?: string;
 isLoading?: boolean;
 format?: 'number' | 'compact';
}

function formatValue(value: number | string | undefined, format: 'number' | 'compact'): string {
 if (value === undefined) return '—';
 if (typeof value === 'string') return value;
 if (format === 'compact') {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
 }
 return value.toLocaleString();
}

export function StatCard({
 title,
 value,
 description,
 icon: Icon,
 iconClassName,
 isLoading,
 format = 'compact',
}: StatCardProps) {
 return (
  <Card>
   <CardContent className="p-5">
    <div className="flex items-start justify-between">
     <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      {isLoading ? (
       <Skeleton className="h-8 w-20 mt-1" />
      ) : (
       <p className="text-3xl font-bold tabular-nums text-foreground">
        {formatValue(value, format)}
       </p>
      )}
      <p className="text-xs text-muted-foreground">{description}</p>
     </div>
     <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-secondary', iconClassName)}>
      <Icon size={16} className="text-muted-foreground" />
     </div>
    </div>
   </CardContent>
  </Card>
 );
}
