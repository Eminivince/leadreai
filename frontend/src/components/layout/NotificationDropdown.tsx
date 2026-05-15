'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Notification } from '@leadreai/shared';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * Bell + dropdown, lives in the Topbar. Owns its own useNotifications
 * instance; the hook manages one EventSource and all local state.
 */

function BellGlyph({ className = 'w-3.5 h-3.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path
    d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9ZM10 21h4"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
   />
  </svg>
 );
}

function dotTone(type: Notification['type']): string {
 switch (type) {
  case 'job.complete':
   return 'bg-[color:var(--ember)]';
  case 'job.failed':
  case 'crm.sync_failed':
   return 'bg-[color:var(--warn)]';
  case 'campaign.drafts_complete':
  case 'crm.sync_complete':
   return 'bg-[color:var(--ember)]';
  default:
   return 'bg-[color:var(--ink-3)]';
 }
}

function relativeTime(iso: string): string {
 const diff = Math.max(0, Date.now() - new Date(iso).getTime());
 const sec = Math.floor(diff / 1000);
 if (sec < 60) return 'just now';
 const min = Math.floor(sec / 60);
 if (min < 60) return `${min}m ago`;
 const hr = Math.floor(min / 60);
 if (hr < 24) return `${hr}h ago`;
 const d = Math.floor(hr / 24);
 if (d < 7) return `${d}d ago`;
 return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationDropdown() {
 const router = useRouter();
 const { items, unread, markRead, markAllRead } = useNotifications();
 const [open, setOpen] = useState(false);
 const containerRef = useRef<HTMLDivElement | null>(null);

 // Close on outside click
 useEffect(() => {
  if (!open) return;
  const onClick = (e: MouseEvent) => {
   if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
    setOpen(false);
   }
  };
  document.addEventListener('mousedown', onClick);
  return () => document.removeEventListener('mousedown', onClick);
 }, [open]);

 // Close on Esc
 useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') setOpen(false);
  };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
 }, [open]);

 const handleClick = (n: Notification) => {
  if (!n.readAt) void markRead(n._id);
  if (n.href) router.push(n.href);
  setOpen(false);
 };

 return (
  <div ref={containerRef} className="relative">
   <button
    onClick={() => setOpen((v) => !v)}
    title={unread > 0 ? `${unread} unread` : 'Notifications'}
    className="relative h-8 w-8 flex items-center justify-center text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
    aria-label="Notifications"
   >
    <BellGlyph />
    {unread > 0 && (
     <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[color:var(--ember-2)] text-[color:var(--paper)] font-mono text-[9px] font-semibold flex items-center justify-center leading-none tabular-nums">
      {unread > 99 ? '99+' : unread}
     </span>
    )}
   </button>

   {open && (
    <div className="absolute top-full right-0 mt-2 z-30 w-[380px] max-w-[calc(100vw-2rem)] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm shadow-xl">
     <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[color:var(--rule)]">
      <div>
       <div className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
        Activity
       </div>
       <div className=" italic text-[18px] leading-tight text-[color:var(--ink)]">
        Updates.
       </div>
      </div>
      {unread > 0 && (
       <button
        onClick={() => markAllRead()}
        className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
       >
        Mark all read
       </button>
      )}
     </div>

     <div className="max-h-[420px] overflow-y-auto">
      {items.length === 0 ? (
       <div className="px-4 py-10 text-center">
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
         Quiet
        </span>
        <p className="mt-2 italic text-[13px] text-[color:var(--ink-2)]">
         Nothing yet.
        </p>
       </div>
      ) : (
       <ul>
        {items.map((n) => {
         const isUnread = !n.readAt;
         const Body = (
          <div className="flex items-start gap-3 px-4 py-3 border-b border-[color:var(--rule)]/70 hover:bg-[color:var(--paper-3)]/60 transition cursor-pointer">
           <span
            className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${
             isUnread ? dotTone(n.type) : 'bg-transparent border border-[color:var(--rule)]'
            }`}
           />
           <div className="min-w-0 flex-1">
            <div
             className={` text-[13.5px] leading-snug ${
              isUnread
               ? 'text-[color:var(--ink)] font-medium'
               : 'text-[color:var(--ink-2)]'
             }`}
            >
             {n.title}
            </div>
            {n.message && (
             <div className="mt-0.5 italic text-[12px] text-[color:var(--ink-2)] line-clamp-2">
              {n.message}
             </div>
            )}
            <div className="mt-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
             {relativeTime(n.createdAt)}
            </div>
           </div>
          </div>
         );

         return (
          <li key={n._id}>
           {n.href ? (
            <button
             onClick={() => handleClick(n)}
             className="block w-full text-left"
            >
             {Body}
            </button>
           ) : (
            <button
             onClick={() => {
              if (isUnread) void markRead(n._id);
             }}
             className="block w-full text-left"
            >
             {Body}
            </button>
           )}
          </li>
         );
        })}
       </ul>
      )}
     </div>

     <div className="px-4 py-2.5 border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 text-right">
      <Link
       href="/dashboard"
       onClick={() => setOpen(false)}
       className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
      >
       Back to dashboard →
      </Link>
     </div>
    </div>
   )}
  </div>
 );
}
