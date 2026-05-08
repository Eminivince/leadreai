'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, Sparkles } from 'lucide-react';

interface QueryInputProps {
 onSubmit: (rawQuery: string) => void;
 isSubmitting?: boolean;
 error?: string | null;
}

export function QueryInput({ onSubmit, isSubmitting = false, error: externalError }: QueryInputProps) {
 const [query, setQuery] = useState('');
 const error = query.length > 0 && query.length < 10 ? 'Query must be at least 10 characters' : null;
 const canSubmit = query.length >= 10 && query.length <= 500 && !isSubmitting;

 const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!canSubmit) return;
  onSubmit(query);
  setQuery('');
 };

 return (
  <form onSubmit={handleSubmit} className="space-y-3">
   <div className="relative">
    <textarea
     value={query}
     onChange={(e) => setQuery(e.target.value)}
     placeholder="e.g. Get me 50 fintech companies in Kenya with emails and phone numbers"
     rows={3}
     maxLength={500}
     className={cn(
      'w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground',
      'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-foreground/30',
      'transition-colors',
      error ? 'border-red-500/50' : 'border-border'
     )}
    />
    <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
     {query.length}/500
    </div>
   </div>
   {error && <p className="text-xs text-red-400">{error}</p>}
   {externalError && <p className="text-xs text-red-400">{externalError}</p>}
   <Button
    type="submit"
    disabled={!canSubmit}
    className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
   >
    {isSubmitting ? (
     <><Loader2 size={14} className="animate-spin" /> {query.length === 0 ? 'Loading…' : 'Analysing query…'}</>
    ) : (
     <><Sparkles size={14} /> Find Leads</>
    )}
   </Button>
  </form>
 );
}
