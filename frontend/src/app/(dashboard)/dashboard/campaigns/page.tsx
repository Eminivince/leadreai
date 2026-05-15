'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Campaign } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';
import { Pagination } from '@/components/shared/Pagination';

const PAGE_SIZE = 20;

/* ─────────────────────────────────────────────────────────────────
 * Campaigns index — landing page when the user clicks "Campaigns"
 * in the sidebar. Lists their existing campaigns first; the new-
 * campaign builder lives at /dashboard/campaigns/new and is reached
 * via the primary action here.
 *
 * The previous version of this route was the wizard itself, which
 * meant a user with 8 active campaigns clicking "Campaigns" landed
 * in a builder instead of seeing their work — confusing, and it
 * made activated campaigns feel hidden. Now: list first, build
 * second.
 * ───────────────────────────────────────────────────────────────── */

// Picks only the fields the list view renders; sidesteps the strict
// stats subtype in the shared Campaign typing while still typechecking
// against the canonical shape for the rest of the document.
type CampaignListItem = Pick<Campaign, '_id' | 'name' | 'description' | 'status' | 'createdAt' | 'updatedAt'> & {
  stats?: { sent?: number; replied?: number; bounced?: number };
};

interface CampaignsListResponse {
  data: CampaignListItem[];
  total: number;
  page: number;
  limit: number;
}

const FILTERS = [
  { k: 'all',       label: 'All' },
  { k: 'active',    label: 'Active' },
  { k: 'paused',    label: 'Paused' },
  { k: 'draft',     label: 'Drafts' },
  { k: 'completed', label: 'Completed' },
] as const;

type FilterKey = typeof FILTERS[number]['k'];

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/**
 * Status pill — same dot + mono pattern used across the dashboard
 * for live state. `active` pulses; everything else is still.
 */
function StatusPill({ status }: { status: CampaignListItem['status'] }) {
  const map = {
    active:    { label: 'active',    dot: 'bg-[color:var(--ember)]',  text: 'text-[color:var(--ember-2)]', border: 'border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06]', pulse: true },
    paused:    { label: 'paused',    dot: 'bg-[color:var(--warn)]',    text: 'text-[color:var(--warn)]',     border: 'border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04]',    pulse: false },
    draft:     { label: 'draft',     dot: 'bg-[color:var(--ink-3)]',   text: 'text-[color:var(--ink-2)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
    completed: { label: 'completed', dot: 'bg-[color:var(--ink-3)]',   text: 'text-[color:var(--ink-2)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
    archived:  { label: 'archived',  dot: 'bg-[color:var(--ink-3)]/60',text: 'text-[color:var(--ink-3)]',    border: 'border-[color:var(--rule)] bg-[color:var(--paper-2)]',          pulse: false },
  } as const;
  const m = map[status] ?? map.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 h-6 ${m.border}`}>
      {m.pulse ? (
        <span className="relative inline-flex">
          <span className={`relative inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} />
          <span className={`absolute inset-0 inline-block w-1.5 h-1.5 rounded-full ${m.dot} opacity-60 animate-ping`} />
        </span>
      ) : (
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${m.dot}`} />
      )}
      <span className={`font-mono text-[10.5px] ${m.text}`}>{m.label}</span>
    </span>
  );
}

export default function CampaignsListPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);

  // Reset to page 1 when filter changes — otherwise users on page 4
  // of "All" who switch to "Drafts" land on a blank page.
  useEffect(() => { setPage(1); }, [filter]);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns-list', workspaceId, filter],
    queryFn: () => {
      const qs = filter === 'all' ? '' : `&status=${filter}`;
      return apiFetch<ApiResponse<CampaignsListResponse>>(
        `/api/v1/workspaces/${workspaceId}/campaigns?limit=100${qs}`,
      );
    },
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const campaigns = data?.data?.data ?? [];
  const total = data?.data?.total ?? 0;

  // Counts per status for the segmented filter — fetched all-at-once
  // and computed client-side so the bar doesn't need 5 separate calls.
  const { data: allData } = useQuery({
    queryKey: ['campaigns-counts', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<CampaignsListResponse>>(
        `/api/v1/workspaces/${workspaceId}/campaigns?limit=100`,
      ),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
  const counts = useMemo(() => {
    const all = allData?.data?.data ?? [];
    return {
      all:       all.length,
      active:    all.filter((c) => c.status === 'active').length,
      paused:    all.filter((c) => c.status === 'paused').length,
      draft:     all.filter((c) => c.status === 'draft').length,
      completed: all.filter((c) => c.status === 'completed').length,
    };
  }, [allData]);

  const pagedCampaigns = campaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 animate-fade-up">
      {/* Header — inline pattern matching the rest of the redesign */}
      <section className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
            Campaigns
          </h1>
          <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
            {isLoading ? '...' : counts.all}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageHelp
            title="Campaigns"
            body="Email outreach sequences. Each campaign points at a lead file (the audience), runs a multi-step sequence on a schedule, and pauses on reply. Open one to see live KPIs."
            tips={[
              'New campaigns save as drafts. Activate them when you are ready to send.',
              'A paused campaign keeps existing enrollments paused — resume to continue sending.',
              'Click any row to open the campaign and see per-step delivery + reply stats.',
            ]}
          />
          <button
            onClick={() => router.push('/dashboard/campaigns/new')}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
          >
            New campaign
            <ArrowEast className="w-3 h-3" />
          </button>
        </div>
      </section>

      {/* Filter bar — segmented, mono tabular counts */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4 -mx-1 px-1 overflow-x-auto">
        <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 shrink-0">
          {FILTERS.map((f) => {
            const on = filter === f.k;
            const n = counts[f.k as keyof typeof counts];
            return (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12.5px] transition-colors ${
                  on
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                }`}
              >
                <span>{f.label}</span>
                <span className={`font-mono text-[10.5px] tabular-nums ${on ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading campaigns…</span>
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState filter={filter} onCreate={() => router.push('/dashboard/campaigns/new')} />
      ) : (
        <>
          <div className="rounded-xl border border-[color:var(--rule)] overflow-hidden bg-[color:var(--paper)]">
            {pagedCampaigns.map((c) => {
              const sent = c.stats?.sent ?? 0;
              const replied = c.stats?.replied ?? 0;
              return (
                <Link
                  key={c._id}
                  href={`/dashboard/campaigns/${c._id}`}
                  className="group flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 border-b border-[color:var(--rule)] last:border-b-0 hover:bg-[color:var(--paper-2)]/60 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium text-[color:var(--ink)] truncate group-hover:text-[color:var(--ember)] transition-colors">
                      {c.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] truncate">
                      Updated {relativeTime(c.updatedAt)}
                      {c.description ? ` · ${c.description.slice(0, 90)}` : ''}
                    </div>
                  </div>

                  {/* Inline mini-metrics — only when there's anything to report */}
                  {(sent > 0 || replied > 0) && (
                    <div className="hidden md:flex items-center gap-4 shrink-0 font-mono text-[10.5px] tabular-nums">
                      <span className="text-[color:var(--ink-3)]">
                        <span className="text-[color:var(--ink-2)]">{sent}</span>
                        <span className="text-[color:var(--ink-3)]/60 ml-1">sent</span>
                      </span>
                      <span className="text-[color:var(--ink-3)]">
                        <span className="text-[color:var(--ink-2)]">{replied}</span>
                        <span className="text-[color:var(--ink-3)]/60 ml-1">repl</span>
                      </span>
                    </div>
                  )}

                  <div className="shrink-0">
                    <StatusPill status={c.status} />
                  </div>

                  <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              );
            })}
          </div>

          <Pagination
            page={page}
            total={campaigns.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={campaigns.length === 1 ? 'campaign' : 'campaigns'}
          />

          {/* When the filtered count is small but `total` (the unfiltered)
              is larger, show a hint that the user has more campaigns
              elsewhere. Helps users who toggled to "Drafts" wonder why
              their active campaigns disappeared. */}
          {filter !== 'all' && total < counts.all && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setFilter('all')}
                className="font-mono text-[10.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
              >
                Show all {counts.all} campaigns
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({
  filter,
  onCreate,
}: {
  filter: FilterKey;
  onCreate: () => void;
}) {
  // Different empty copy depending on whether the user has zero
  // campaigns total vs. zero matching the current filter.
  const isFirstTime = filter === 'all';
  return (
    <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-14 text-center">
      <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">
        {isFirstTime ? 'No campaigns yet' : `No ${filter} campaigns`}
      </h3>
      <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[480px] mx-auto leading-[1.55]">
        {isFirstTime ? (
          <>
            A campaign sends a sequence of emails to your audience.
            Pick leads from your workspace, write the steps, set a
            schedule — the agent handles the rest.
          </>
        ) : (
          <>Switch the filter above to see campaigns in other states.</>
        )}
      </p>
      {isFirstTime && (
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
        >
          New campaign
          <ArrowEast className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
