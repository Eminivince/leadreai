'use client';

/* ─────────────────────────────────────────────────────────────────
 * Pagination — compact B2B SaaS-style page-nav.
 *
 * Renders nothing when there's only one page worth of data, so it's
 * safe to mount unconditionally on any index page. The component
 * doesn't manage state — the parent owns `page`, this just emits
 * `onPageChange` when the user clicks. That keeps the parent free
 * to also reset page=1 on filter / search changes.
 *
 * UI:
 *   "1–20 of 47"          ◀  1 [2] 3  ▶
 *   tabular-nums | mono     hairline buttons | numbered chips
 *
 * The numbered chip strip is windowed so we never render more than
 * ~7 page numbers regardless of total — middle-ellipsis pattern
 * (1 … 4 5 6 … 12) so users can jump but the bar stays compact.
 * ─────────────────────────────────────────────────────────────── */

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Optional unit label for the count summary, e.g. "files", "tables". Defaults to "items". */
  itemLabel?: string;
}

export function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
  itemLabel = 'items',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // No-op when we can fit everything on one page. Hides itself rather
  // than rendering a non-functional "1 of 1" chrome that just adds noise.
  if (total <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build the windowed page list. Always show first + last; show
  // current and one neighbour each side. Insert "…" gaps where there
  // are skipped numbers so the bar reads cleanly.
  const pages: Array<number | 'gap'> = [];
  const window = 1; // pages on each side of current
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'gap') {
      pages.push('gap');
    }
  }

  return (
    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
      <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
        <span className="text-[color:var(--ink-2)]">{start.toLocaleString()}</span>
        <span className="text-[color:var(--ink-3)]/60 mx-0.5">–</span>
        <span className="text-[color:var(--ink-2)]">{end.toLocaleString()}</span>
        <span className="ml-1.5 text-[color:var(--ink-3)]/60">of</span>{' '}
        <span className="text-[color:var(--ink)]">{total.toLocaleString()}</span>
        <span className="ml-1 text-[color:var(--ink-3)]/60">{itemLabel}</span>
      </span>

      <div className="inline-flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Previous page"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] text-[color:var(--ink-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] disabled:opacity-40 disabled:hover:border-[color:var(--rule)] disabled:hover:text-[color:var(--ink-2)] transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
            <path d="M10 4 6 8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {pages.map((p, i) =>
          p === 'gap' ? (
            <span
              key={`gap-${i}`}
              className="inline-flex items-center justify-center w-7 h-7 font-mono text-[11px] text-[color:var(--ink-3)]/60"
              aria-hidden
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`inline-flex items-center justify-center w-7 h-7 rounded-md font-mono text-[11px] tabular-nums transition-colors ${
                p === page
                  ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                  : 'border border-[color:var(--rule)] bg-[color:var(--paper)] text-[color:var(--ink-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          aria-label="Next page"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] text-[color:var(--ink-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] disabled:opacity-40 disabled:hover:border-[color:var(--rule)] disabled:hover:text-[color:var(--ink-2)] transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
