'use client';

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
 title: string;
 description?: string;
 action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
 return (
  <div className="flex flex-col items-center justify-center py-16 text-center">
   <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary animate-float">
    <Inbox size={24} className="text-muted-foreground" />
   </div>
   <h3 className="text-base font-semibold text-foreground">{title}</h3>
   {description && (
    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
   )}
   {action && <div className="mt-5">{action}</div>}
  </div>
 );
}
