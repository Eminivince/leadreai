'use client';

import { useState, useRef, useEffect } from 'react';

interface PageHelpProps {
  title: string;
  body: string;
  tips?: string[];
}

export function PageHelp({ title, body, tips }: PageHelpProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Page help"
        className={`w-6 h-6 rounded-full border flex items-center justify-center font-mono text-[11px] font-bold transition-colors ${
          open
            ? 'border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--paper)]'
            : 'border-[color:var(--rule)] bg-[color:var(--paper-3)] text-[color:var(--ink-3)] hover:border-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
        }`}
      >
        ?
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[min(300px,calc(100vw-24px))] bg-[color:var(--paper)] border border-[color:var(--rule)] shadow-xl rounded-sm">
          <div className="px-4 pt-3 pb-1">
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              {title}
            </span>
          </div>
          <div className="px-4 pb-3">
            <p className="text-[13px] leading-[1.65] text-[color:var(--ink-2)]">{body}</p>
            {tips && tips.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-dashed border-[color:var(--rule)] flex flex-col gap-1.5">
                {tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-[12px] text-[color:var(--ink-3)] leading-[1.5]">
                    <span className="text-[color:var(--ember)] shrink-0 mt-0.5 font-bold">·</span>
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
