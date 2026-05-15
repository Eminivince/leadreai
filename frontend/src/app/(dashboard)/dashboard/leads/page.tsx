'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import type { ApiResponse, Lead, LeadFileSummary, ProspectingJob, OutputSchemaColumn, FactValue } from '@leadreai/shared';
import { PageHelp } from '@/components/ui/PageHelp';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Pagination } from '@/components/shared/Pagination';
import { SectionTabs } from '@/components/shared/SectionTabs';

const GROUPS_PAGE_SIZE = 20;

/* ─────────────────────────────────────────────────────────────────
 * Leads page.
 *
 * Two modes:
 *   · /dashboard/leads            → archive, leads grouped by query
 *   · /dashboard/leads?jobId=X    → single-job dossier with schema cols
 * ───────────────────────────────────────────────────────────────── */

const SEARCH_PLACEHOLDER = 'Search company, email, phone, domain…';

/* ── Helpers ─────────────────────────────────────────────────── */
function primaryEmail(lead: Lead): string | undefined {
  return lead.emails?.[0]?.address?.trim() || undefined;
}
function primaryPhone(lead: Lead): string | undefined {
  const p = lead.phones?.[0];
  if (!p) return undefined;
  return (p.normalized ?? p.raw)?.trim() || undefined;
}
function primaryEmailSource(lead: Lead): string | undefined {
  return lead.emails?.[0]?.source?.trim() || undefined;
}
function leadLocation(lead: Lead): string | undefined {
  const a = lead.address;
  if (!a) return undefined;
  return [a.city, a.state, a.country].filter(Boolean).join(', ') || undefined;
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·';
}
function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatFact(val: FactValue, type: OutputSchemaColumn['type']): string {
  if (val.value === null || val.value === undefined || val.value === '') return '—';
  const v = val.value;
  switch (type) {
    case 'currency': {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!Number.isFinite(n)) return String(v);
      const unit = val.unit ?? 'USD';
      const abs = Math.abs(n);
      let out: string;
      if (abs >= 1_000_000_000) out = `${(n / 1_000_000_000).toFixed(1)}B`;
      else if (abs >= 1_000_000) out = `${(n / 1_000_000).toFixed(1)}M`;
      else if (abs >= 1_000) out = `${(n / 1_000).toFixed(1)}K`;
      else out = n.toString();
      return `${unit === 'USD' ? '$' : ''}${out}${unit !== 'USD' ? ` ${unit}` : ''}`;
    }
    case 'percentage': {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!Number.isFinite(n)) return String(v);
      return `${n <= 1 ? (n * 100).toFixed(0) : n.toFixed(0)}%`;
    }
    case 'date': {
      try {
        return new Date(String(v)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch {
        return String(v);
      }
    }
    case 'number': {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n.toLocaleString() : String(v);
    }
    case 'url':
      return String(v).replace(/^https?:\/\//, '');
    case 'tags':
      return Array.isArray(v) ? v.slice(0, 3).join(', ') : String(v);
    default:
      return String(v);
  }
}

/* ── Glyphs ─────────────────────────────────────────────────── */
const Svg = ({ className = 'w-3.5 h-3.5', sw = 1.5, children }: { className?: string; sw?: number; children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <g stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </g>
  </svg>
);
const SearchIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
const CloseIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
const ExternalIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M7 17 17 7M7 7h10v10" />
  </Svg>
);
const ChevronIcon = ({ open, className = 'w-3.5 h-3.5' }: { open: boolean; className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={`${className} transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Status chip ────────────────────────────────────────────── */
function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    qualified: { label: 'Qualified', tone: 'bg-[color:var(--success)]/10 text-[color:var(--success)]' },
    pending:   { label: 'New',       tone: 'bg-[color:var(--ember-bg)] text-[color:var(--ember)]' },
    dust:      { label: 'Rejected',  tone: 'bg-[color:var(--paper-2)] text-[color:var(--ink-3)]' },
  };
  const chip = map[status] ?? map.pending!;
  return (
    <span className={`inline-flex items-center font-mono text-[9.5px] tracking-[0.16em] uppercase px-2 py-0.5 rounded-full ${chip.tone}`}>
      {chip.label}
    </span>
  );
}

function ScorePill({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center font-mono text-[11px] tabular-nums px-1.5 py-0.5 bg-[color:var(--ink)] text-[color:var(--paper)]">
      {v.toFixed(2)}
    </span>
  );
}

/* ── Dossier header (when viewing ?jobId=X) ─────────────────── */
function DossierHeader({ job }: { job: ProspectingJob }) {
  const schema = job.parsedIntent?.outputSchema ?? [];
  const dossierId = job._id.slice(-4).toUpperCase();
  const isLive = job.status !== 'complete' && job.status !== 'failed' && job.status !== 'cancelled';
  const leadsValue =
    job.status === 'complete'
      ? (job.result?.totalLeadsFound ?? 0)
      : (job.progress?.leadsFoundSoFar ?? 0);
  return (
    <section className="mb-6">
      {/* Breadcrumb — compact mono row, no editorial tracking */}
      <div className="flex items-center gap-1.5 mb-3 font-mono text-[10.5px] text-[color:var(--ink-3)]">
        <Link
          href="/dashboard"
          className="hover:text-[color:var(--ink)] transition-colors"
        >
          Dashboard
        </Link>
        <span className="text-[color:var(--ink-3)]/60">/</span>
        <Link
          href="/dashboard/leads"
          className="hover:text-[color:var(--ink)] transition-colors"
        >
          Leads
        </Link>
        <span className="text-[color:var(--ink-3)]/60">/</span>
        <span className="text-[color:var(--ink-2)] tabular-nums">#{dossierId}</span>
      </div>

      {/* Single calm card — no decorative paper-shadow, no italic
          "Subject" quote, no dashed rule. The query reads as plain
          medium-weight text; metric row mirrors the dashboard's
          ActiveDispatch so the two surfaces feel like one product. */}
      <div className="bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-3 border-b border-[color:var(--rule)]">
          <div className="flex items-center gap-2">
            {isLive ? (
              <span className="relative inline-flex">
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" />
                <span className="absolute inset-0 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)] opacity-60 animate-ping" />
              </span>
            ) : (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-3)]" />
            )}
            <span className="font-mono text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
              {isLive ? 'Running' : 'Search'}
            </span>
          </div>
          <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
            Started {relativeTime(job.createdAt)}
          </span>
        </div>

        <div className="px-5 md:px-6 py-5">
          <p className="text-[15px] md:text-[16.5px] leading-[1.55] text-[color:var(--ink)] font-medium">
            {job.rawQuery}
          </p>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 pt-5 border-t border-[color:var(--rule)]">
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Leads
              </span>
              <div className="mt-1 font-mono text-[24px] leading-none tabular-nums text-[color:var(--ink)]">
                {leadsValue}
                <span className="text-[12px] text-[color:var(--ink-3)] ml-1">
                  / {job.parsedIntent?.targetCount ?? '—'}
                </span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Status
              </span>
              <div className="mt-1.5">
                <StatusChip status={job.status} />
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Started
              </span>
              <div className="mt-1.5 text-[13px] text-[color:var(--ink-2)]">
                {relativeTime(job.createdAt)}
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                Columns
              </span>
              <div className="mt-1.5 text-[13px] text-[color:var(--ink-2)]">
                {schema.length > 0 ? `${schema.length} extra` : 'Standard'}
              </div>
            </div>
          </div>

          {schema.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[color:var(--rule)] flex flex-wrap gap-1.5">
              {schema.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-2)] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-md px-2 py-1"
                >
                  {c.label}
                  <span className="font-mono text-[10px] text-[color:var(--ink-3)]">
                    {c.type}
                  </span>
                  {c.required && (
                    <span className="font-mono text-[10px] text-[color:var(--ember-2)]">·req</span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── Drawer ─────────────────────────────────────────────────── */
function LeadDrawer({
  lead,
  schema,
  onClose,
}: {
  lead: Lead | null;
  schema: OutputSchemaColumn[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!lead) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lead, onClose]);

  if (!lead) return null;

  const contact = lead.contactSummary?.topContact;
  const score = lead.qualificationScore ?? (lead.rankScore ? lead.rankScore / 100 : 0.7);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end pointer-events-none">
      <style>{`
        @keyframes ldFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ldSlide  { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
      <div
        className="absolute inset-0 bg-[color:var(--ink)]/30 pointer-events-auto"
        style={{ animation: 'ldFadeIn .18s ease-out both' }}
        onClick={onClose}
      />
      <div
        className="relative pointer-events-auto w-full max-w-[520px] h-full bg-[color:var(--paper)] border-l border-[color:var(--rule)] overflow-y-auto"
        style={{ animation: 'ldSlide .26s cubic-bezier(.2,.9,.25,1) both' }}
      >
        <div className="p-7 md:p-8 flex flex-col gap-6">
          {/* top bar */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
              Lead · {String(lead._id).slice(-6).toUpperCase()}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
              title="Close (Esc)"
              aria-label="Close lead details"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>

          {/* identity */}
          <div>
            <h2 className=" text-[34px] leading-[1.05] tracking-[-0.01em] text-[color:var(--ink)]">
              {lead.companyName}
            </h2>
            {lead.companyDomain && (
              <a
                href={`https://${lead.companyDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
              >
                {lead.companyDomain} <ExternalIcon className="w-2.5 h-2.5" />
              </a>
            )}
            {(lead.industry || leadLocation(lead)) && (
              <div className="mt-2  text-[13px] italic text-[color:var(--ink-2)]">
                {[lead.industry, leadLocation(lead)].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>

          {/* Named contact */}
          {contact?.fullName && (
            <div className="pt-5 border-t border-[color:var(--rule)]">
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Named contact
              </span>
              <div className="mt-2 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-[color:var(--ink)] text-[color:var(--paper)] flex items-center justify-center shrink-0  italic text-[14px]">
                  {initials(contact.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className=" font-medium text-[15px] text-[color:var(--ink)] truncate">
                    {contact.fullName}
                  </div>
                  {contact.title && (
                    <div className=" italic text-[14px] text-[color:var(--ink-2)] leading-tight mt-0.5">
                      {contact.title}
                    </div>
                  )}
                  {contact.seniority && contact.seniority !== 'unknown' && (
                    <div className="mt-1 font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                      {contact.seniority.replace('_', '-')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Contact paths */}
          <div className="pt-5 border-t border-[color:var(--rule)] flex flex-col gap-3">
            <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Contact paths
            </span>
            {lead.emails?.length > 0 ? (
              lead.emails.slice(0, 3).map((e, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <a
                    href={`mailto:${e.address}`}
                    className="font-mono text-[12.5px] text-[color:var(--ink)] hover:text-[color:var(--ember)] truncate transition"
                  >
                    {e.address}
                  </a>
                  <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] shrink-0">
                    {e.verified ? 'verified' : `${Math.round((e.confidence ?? 0.6) * 100)}%`}
                  </span>
                </div>
              ))
            ) : (
              <span className=" italic text-[13px] text-[color:var(--ink-3)]">No email on file</span>
            )}
            {lead.phones?.length > 0 &&
              lead.phones.slice(0, 2).map((p, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3">
                  <a
                    href={`tel:${p.normalized ?? p.raw}`}
                    className="font-mono text-[12.5px] text-[color:var(--ink)] hover:text-[color:var(--ember)] transition"
                  >
                    {p.normalized ?? p.raw}
                  </a>
                  <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] shrink-0">
                    {p.type ?? 'phone'}
                  </span>
                </div>
              ))}
          </div>

          {/* Facts (schema-driven) */}
          {schema.length > 0 && lead.facts && (
            <div className="pt-5 border-t border-[color:var(--rule)]">
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Requested fields
              </span>
              <div className="mt-3 grid grid-cols-1 gap-3">
                {schema.map((c) => {
                  const f = lead.facts?.[c.key];
                  const formatted = f ? formatFact(f, c.type) : '—';
                  return (
                    <div key={c.key} className="flex items-baseline justify-between gap-3">
                      <div className="flex flex-col min-w-0">
                        <span className="font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
                          {c.label}
                        </span>
                        <span className=" text-[14px] text-[color:var(--ink)] mt-0.5">
                          {formatted}
                          {f?.sourceUrl && (
                            <a
                              href={f.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 inline-flex items-baseline font-mono text-[9.5px] text-[color:var(--ember)] hover:underline"
                            >
                              source <ExternalIcon className="w-2.5 h-2.5 ml-0.5 self-center" />
                            </a>
                          )}
                        </span>
                      </div>
                      {f?.confidence !== undefined && (
                        <span className="font-mono text-[10px] tabular-nums text-[color:var(--ink-3)] shrink-0">
                          conf {f.confidence.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provenance */}
          {lead.sources?.length > 0 && (
            <div className="pt-5 border-t border-[color:var(--rule)]">
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Provenance
              </span>
              <ol className="mt-3 space-y-1.5">
                {lead.sources.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2  text-[12px] text-[color:var(--ink-2)]">
                    <sup className="text-[color:var(--ember)] font-mono">{i + 1}</sup>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:text-[color:var(--ink)] underline underline-offset-[3px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)] transition"
                    >
                      {s.url.replace(/^https?:\/\//, '')}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Score */}
          <div className="pt-5 border-t border-[color:var(--rule)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                  AI score
                </span>
                <span className="mt-1 text-[32px] leading-none tabular-nums text-[color:var(--ink)]">
                  {Math.round(score * 100)}
                  <span className="font-mono text-[11px] text-[color:var(--ink-3)] ml-1">/100</span>
                </span>
              </div>
              <StatusChip status={lead.qualificationStatus ?? 'pending'} />
            </div>
            {(lead.agentReasoning || lead.qualificationReason) && (
              <p className="text-[12.5px] text-[color:var(--ink-2)] leading-relaxed">
                {lead.agentReasoning || lead.qualificationReason}
              </p>
            )}
          </div>

          <div className="pt-2 font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] text-center">
            Press Esc to close
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Table header row ────────────────────────────────────────── */
function LeadsTableHead({ schema, isJobScoped }: { schema: OutputSchemaColumn[]; isJobScoped: boolean }) {
  return (
    <thead className="bg-[color:var(--paper-2)] border-b border-[color:var(--rule)]">
      <tr>
        <th className="py-2.5 pl-4 pr-2 w-10" />
        {['Company', 'Contact', 'Email', 'Phone', ...(isJobScoped ? schema.map((c) => c.label) : []), 'Score', 'Status', ''].map((h, i) => (
          <th
            key={`${h}-${i}`}
            className={`py-2.5 px-3 font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-2)] ${
              h === 'Score' ? 'text-right' : ''
            }`}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/* ── Row ─────────────────────────────────────────────────────── */
function LeadRow({
  lead,
  selected,
  onToggle,
  onOpen,
  active,
  schema,
  isJobScoped,
}: {
  lead: Lead;
  selected: boolean;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  active: boolean;
  schema: OutputSchemaColumn[];
  isJobScoped: boolean;
}) {
  const contact = lead.contactSummary?.topContact;
  const score = lead.qualificationScore ?? (lead.rankScore ? lead.rankScore / 100 : 0.7);

  return (
    <tr
      onClick={() => onOpen(lead._id)}
      className={`group border-b border-[color:var(--rule)]/70 cursor-pointer transition-colors ${
        active ? 'bg-[color:var(--paper-3)]' : 'hover:bg-[color:var(--paper-3)]/60'
      }`}
    >
      <td className="py-3 pl-4 pr-2 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(lead._id)}
          onClick={(e) => e.stopPropagation()}
          className="accent-[color:var(--ink)] cursor-pointer"
        />
      </td>
      <td className="py-3 px-3 align-middle">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-sm bg-[color:var(--paper-2)] border border-[color:var(--rule)] flex items-center justify-center shrink-0  italic text-[12px] text-[color:var(--ink)]">
            {initials(lead.companyName)}
          </div>
          <div className="min-w-0">
            <div className=" font-medium text-[13.5px] text-[color:var(--ink)] truncate">
              {lead.companyName}
            </div>
            <div className="font-mono text-[10.5px] text-[color:var(--ink-3)] truncate">
              {lead.companyDomain ?? '—'}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-3 align-middle">
        {contact?.fullName ? (
          <>
            <div className=" text-[13px] text-[color:var(--ink)] truncate">{contact.fullName}</div>
            <div className=" italic text-[12px] text-[color:var(--ink-2)] truncate leading-tight">
              {contact.title || '—'}
            </div>
          </>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">—</span>
        )}
      </td>
      <td className="py-3 px-3 align-middle max-w-[220px]">
        {primaryEmail(lead) ? (
          <span className="font-mono text-[11.5px] text-[color:var(--ink)] truncate block">
            {primaryEmail(lead)}
            {primaryEmailSource(lead) && (
              <sup className="ml-0.5 text-[9px] text-[color:var(--ember)]" title={`Source: ${primaryEmailSource(lead)}`}>
                {lead.emails[0]?.verified ? '✓' : '*'}
              </sup>
            )}
          </span>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">—</span>
        )}
      </td>
      <td className="py-3 px-3 align-middle max-w-[150px]">
        {primaryPhone(lead) ? (
          <span className="font-mono text-[11.5px] text-[color:var(--ink-2)] truncate block">
            {primaryPhone(lead)}
          </span>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">—</span>
        )}
      </td>

      {isJobScoped &&
        schema.map((c) => {
          const f = lead.facts?.[c.key];
          const formatted = f ? formatFact(f, c.type) : '—';
          return (
            <td key={c.key} className="py-3 px-3 align-middle max-w-[160px]">
              {f && f.value !== null && f.value !== undefined ? (
                <span className=" text-[13px] text-[color:var(--ink)] truncate block">
                  {formatted}
                  {f?.sourceUrl && <sup className="ml-0.5 text-[9px] text-[color:var(--ember)]">†</sup>}
                </span>
              ) : (
                <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">—</span>
              )}
            </td>
          );
        })}

      <td className="py-3 px-3 align-middle text-right">
        <ScorePill v={score} />
      </td>
      <td className="py-3 px-3 align-middle">
        <StatusChip status={lead.qualificationStatus ?? 'pending'} />
      </td>
      <td className="py-3 pr-4 pl-2 align-middle text-right">
        <ArrowEast className="w-3 h-3 text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition-transform inline-block" />
      </td>
    </tr>
  );
}

/* ── Query group (collapsible section) ───────────────────────── */
function QueryGroup({
  jobId,
  query,
  timestamp,
  leads,
  selected,
  onToggle,
  onOpen,
  drawerId,
  schema,
  isJobScoped,
  colCount: _colCount,
}: {
  jobId: string | null;
  query: string;
  timestamp: string;
  leads: Lead[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  drawerId: string | null;
  schema: OutputSchemaColumn[];
  isJobScoped: boolean;
  colCount: number;
}) {
  const [open, setOpen] = useState(true);

  // Naming chain — every group gets a useful label, never just
  // "Ungrouped leads":
  //   1. Original query (truncated) — best signal of what the search
  //      was about, so the user can scan the page by purpose.
  //   2. "Search · #ABCD" — when the job exists but its query isn't
  //      in our 200-job window (older searches, very rare).
  //   3. "Imported leads" — when there's no jobId at all (manual
  //      adds, future CSV imports). Honest about the source.
  // Subtitle is always relative time + dossier ID when available, so
  // the user has additional context regardless of which label fired.
  const dossierId = jobId ? jobId.slice(-4).toUpperCase() : null;
  const titleText = query
    ? (query.length > 96 ? query.slice(0, 94) + '…' : query)
    : dossierId
      ? `Search · #${dossierId}`
      : 'Imported leads';
  const titleIsQuery = Boolean(query);
  const subtitleParts: string[] = [];
  if (timestamp) subtitleParts.push(relativeTime(timestamp));
  if (dossierId && titleIsQuery) subtitleParts.push(`#${dossierId}`);
  if (!jobId && !timestamp) subtitleParts.push('No source job');

  return (
    <div className="border border-[color:var(--rule)] rounded-xl overflow-hidden bg-[color:var(--paper)] mb-4">
      {/* Group header — chevron + title block + count + dossier link */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 md:px-5 py-3 bg-[color:var(--paper-2)]/60 border-b border-[color:var(--rule)] hover:bg-[color:var(--paper-2)] transition-colors text-left"
      >
        <ChevronIcon open={open} className="w-3.5 h-3.5 text-[color:var(--ink-3)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[13.5px] leading-[1.4] truncate ${
                titleIsQuery
                  ? 'text-[color:var(--ink)] font-medium'
                  : 'text-[color:var(--ink-2)]'
              }`}
            >
              {titleText}
            </span>
          </div>
          {subtitleParts.length > 0 && (
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
              {subtitleParts.map((part, i) => (
                <span key={part} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[color:var(--ink-3)]/50">·</span>}
                  {part}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)]">
            {leads.length}
            <span className="text-[color:var(--ink-3)] ml-1">
              {leads.length === 1 ? 'lead' : 'leads'}
            </span>
          </span>
          {jobId && (
            <Link
              href={`/dashboard/leads?jobId=${jobId}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[color:var(--ink-2)] hover:text-[color:var(--ember)] transition-colors"
            >
              Open
              <ArrowEast className="w-3 h-3" />
            </Link>
          )}
        </div>
      </button>

      {/* Leads table */}
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <LeadsTableHead schema={schema} isJobScoped={isJobScoped} />
            <tbody>
              {leads.map((lead) => (
                <LeadRow
                  key={lead._id}
                  lead={lead}
                  selected={selected.has(lead._id)}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  active={drawerId === lead._id}
                  schema={schema}
                  isJobScoped={isJobScoped}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
const FILTERS: Array<{ k: string; label: string }> = [
  { k: 'all',       label: 'All' },
  { k: 'pending',   label: 'New' },
  { k: 'qualified', label: 'Qualified' },
  { k: 'dust',      label: 'Rejected' },
];

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const jobId = searchParams.get('jobId');

  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupsPage, setGroupsPage] = useState(1);

  // When the user changes filter/search, the visible group set
  // shrinks — reset to page 1 so they don't land on an empty page.
  useEffect(() => { setGroupsPage(1); }, [filter, search]);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const saveMenuRef = useRef<HTMLDivElement | null>(null);

  const { data: filesData } = useQuery({
    queryKey: ['files', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<{ data: LeadFileSummary[]; total: number }>>(
        `/api/v1/workspaces/${workspaceId}/files?limit=100`,
      ),
    enabled: !!workspaceId,
  });
  const files = filesData?.data?.data ?? [];

  const addToFileMutation = useMutation({
    mutationFn: async ({ fileId, leadIds }: { fileId: string; leadIds: string[] }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/files/${fileId}/leads`, {
        method: 'POST',
        body: JSON.stringify({ leadIds }),
      }),
    onSuccess: (_d, variables) => {
      const file = files.find((f) => f._id === variables.fileId);
      toast.success(`Saved ${variables.leadIds.length} to ${file?.name ?? 'file'}.`);
      setSelected(new Set());
      setSaveMenuOpen(false);
      void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
      void qc.invalidateQueries({ queryKey: ['file', workspaceId, variables.fileId] });
      void qc.invalidateQueries({ queryKey: ['file-leads', workspaceId, variables.fileId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
  });

  const createFileWithLeadsMutation = useMutation({
    mutationFn: async ({ name, leadIds }: { name: string; leadIds: string[] }) =>
      apiFetch<ApiResponse<{ _id: string; name: string }>>(
        `/api/v1/workspaces/${workspaceId}/files`,
        {
          method: 'POST',
          body: JSON.stringify({ name, leadIds }),
        },
      ),
    onSuccess: (result, variables) => {
      toast.success(`Opened ${result.data.name} with ${variables.leadIds.length} leads.`);
      setSelected(new Set());
      setSaveMenuOpen(false);
      setNewFileName('');
      void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create file.'),
  });

  // Bulk suppression (Task #27). Mode picker lets the agency pick
  // email-only (target individual reachout), domain-only (blanket the
  // whole org), or both.
  const [suppressOpen, setSuppressOpen] = useState(false);
  const [suppressMode, setSuppressMode] = useState<'email' | 'domain' | 'both'>('email');

  const bulkSuppressMutation = useMutation({
    mutationFn: async ({ leadIds, mode }: { leadIds: string[]; mode: 'email' | 'domain' | 'both' }) =>
      apiFetch<ApiResponse<{ suppressed: number }>>(
        `/api/v1/workspaces/${workspaceId}/leads/bulk-suppress`,
        { method: 'POST', body: JSON.stringify({ leadIds, mode }) },
      ),
    onSuccess: (res) => {
      toast.success(`Suppressed ${res.data.suppressed} entr${res.data.suppressed === 1 ? 'y' : 'ies'}.`);
      setSuppressOpen(false);
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['suppression', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to suppress.'),
  });

  const leadsPath = jobId
    ? `/api/v1/workspaces/${workspaceId}/leads?limit=200&isDuplicate=false&jobId=${jobId}`
    : `/api/v1/workspaces/${workspaceId}/leads?limit=200&isDuplicate=false`;

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads-all', workspaceId, jobId ?? 'all'],
    queryFn: () => apiFetch<ApiResponse<Lead[]> & { total: number }>(leadsPath),
    enabled: !!workspaceId,
  });

  const { data: jobData } = useQuery({
    queryKey: ['job', workspaceId, jobId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob>>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`),
    enabled: !!workspaceId && !!jobId,
  });

  // Fetch all jobs so we can show the rawQuery label per group in archive mode
  const { data: jobsData } = useQuery({
    queryKey: ['jobs-list', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<{ data: ProspectingJob[]; total: number }>>(
        `/api/v1/workspaces/${workspaceId}/jobs?limit=200`,
      ),
    enabled: !!workspaceId && !jobId,
  });

  const allLeads = useMemo(() => leadsData?.data ?? [], [leadsData]);
  const total = leadsData?.total ?? 0;
  const job = jobData?.data;
  const schema: OutputSchemaColumn[] = job?.parsedIntent?.outputSchema ?? [];
  const isJobScoped = !!jobId && !!job;

  // Build a jobId → {query, createdAt} map for grouping labels.
  // We also keep createdAt so each group can show "2 days ago" under
  // the title without us needing a second fetch.
  const jobQueryMap = useMemo(() => {
    const map = new Map<string, { query: string; createdAt: string }>();
    (jobsData?.data?.data ?? []).forEach((j) =>
      map.set(j._id, { query: j.rawQuery, createdAt: j.createdAt }),
    );
    return map;
  }, [jobsData]);

  const filtered = useMemo(() => {
    let L = allLeads;
    if (filter !== 'all') L = L.filter((r) => (r.qualificationStatus ?? 'pending') === filter);
    if (search) {
      const q = search.toLowerCase();
      L = L.filter((r) => {
        const hay = [
          r.companyName,
          r.companyDomain,
          r.website,
          r.industry,
          r.contactSummary?.topContact?.fullName,
          r.contactSummary?.topContact?.title,
          primaryEmail(r),
          primaryPhone(r),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return L;
  }, [allLeads, filter, search]);

  // Group filtered leads by jobId (only in archive mode). For each
  // group we attach (a) the original query when we know it, (b) the
  // job's createdAt for "X days ago" subtitle, and (c) the latest
  // lead.createdAt as a fallback when the job itself isn't in our
  // 200-job window. Sorted newest-first so users see fresh searches
  // at the top, with imported/orphaned leads sinking below.
  const groups = useMemo(() => {
    if (isJobScoped) return null;
    const map = new Map<string, Lead[]>();
    for (const lead of filtered) {
      const key = lead.jobId ?? '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lead);
    }
    const items = Array.from(map.entries()).map(([key, leads]) => {
      const jobId = key === '__none__' ? null : key;
      const fromJob = jobId ? jobQueryMap.get(jobId) : undefined;
      // Latest lead in the group, used as a fallback timestamp so even
      // imported / no-job leads can show a "X days ago" anchor.
      const latestLeadAt = leads.reduce<string>((acc, l) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (l as any).createdAt as string | undefined;
        return t && t > acc ? t : acc;
      }, '');
      return {
        jobId,
        query: fromJob?.query ?? '',
        timestamp: fromJob?.createdAt ?? latestLeadAt,
        leads,
      };
    });
    items.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    return items;
  }, [filtered, isJobScoped, jobQueryMap]);

  const counts = useMemo(
    () => ({
      all: allLeads.length,
      pending: allLeads.filter((r) => (r.qualificationStatus ?? 'pending') === 'pending').length,
      qualified: allLeads.filter((r) => r.qualificationStatus === 'qualified').length,
      dust: allLeads.filter((r) => r.qualificationStatus === 'dust').length,
    }),
    [allLeads],
  );

  const allSelectedOnPage = filtered.length > 0 && filtered.every((r) => selected.has(r._id));
  const toggleAll = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelectedOnPage) filtered.forEach((r) => n.delete(r._id));
      else filtered.forEach((r) => n.add(r._id));
      return n;
    });
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selCount = selected.size;
  const drawerLead = allLeads.find((l) => l._id === drawerId) ?? null;

  async function handleExport() {
    if (!workspaceId) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const token = getAccessToken();
    const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/export/leads?format=csv`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const colCount = 7 + (isJobScoped ? schema.length : 0);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
      {/* Header */}
      {isJobScoped && job ? (
        <DossierHeader job={job} />
      ) : (
        <section className="mb-5 sm:mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
                Leads
              </h1>
              <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
                {isLoading ? '...' : total}
              </span>
              {/* SectionTabs sits next to the count so the user sees
                  Leads + Files belong together. /files keeps working
                  as a deep link for the campaign builder + anyone
                  who already has the URL. */}
              <SectionTabs
                tabs={[
                  { key: 'leads', label: 'All', href: '/dashboard/leads' },
                  { key: 'files', label: 'Files', href: '/dashboard/files' },
                ]}
                className="sm:ml-2"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <PageHelp
                title="Leads"
                body="All contacts your searches have found, grouped by the query that produced them. Click any row to open the full lead profile."
                tips={[
                  'Filter by status (New / Qualified / Rejected) to focus your review.',
                  'Select leads using the checkboxes, then save them to a named file for campaigns.',
                  'Click "Open" on a group header to see only that search.',
                ]}
              />
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium text-[color:var(--ink-2)] border border-[color:var(--rule)] bg-[color:var(--paper-2)] hover:border-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={() => router.push('/dashboard/campaigns')}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
              >
                Start campaign
                <ArrowEast className="w-3 h-3" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Toolbar — segmented filter on the left, search on the right.
          Matches the dashboard aesthetic: rounded-md (not full pills),
          mono tabular counts, hairline borders. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap mb-4">
        <div className="inline-flex items-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] p-0.5 self-start overflow-x-auto max-w-full">
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

        <div className="flex items-center gap-2 h-9 sm:h-8 px-3 border border-[color:var(--rule)] bg-[color:var(--paper)] hover:border-[color:var(--ink-3)] focus-within:border-[color:var(--ember)]/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ember)_8%,transparent)] rounded-md w-full sm:w-[260px] md:w-[320px] transition-colors">
          <SearchIcon className="w-3.5 h-3.5 text-[color:var(--ink-3)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            className="bg-transparent outline-none flex-1 text-[12.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)]">
              <CloseIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Floating bulk-action bar */}
      {selCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up">
          <div className="flex items-center gap-3 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-3 rounded-xl shadow-2xl border border-[color:var(--paper)]/10">
            <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">
              {selCount} selected
            </span>
            <div className="w-px h-5 bg-[color:var(--paper)]/20" />

            <div ref={saveMenuRef} className="relative">
              <button
                onClick={() => setSaveMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition"
              >
                Save to file ▾
              </button>
              {saveMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 z-20 w-[320px] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-lg shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-[color:var(--rule)]">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)]">
                      Add to file
                    </span>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto">
                    {files.length === 0 ? (
                      <div className="px-3 py-4 text-[12.5px] text-[color:var(--ink-3)]">
                        No files yet — create one below.
                      </div>
                    ) : (
                      files
                        .filter((f) => !f.archivedAt)
                        .map((f) => (
                          <button
                            key={f._id}
                            onClick={() => addToFileMutation.mutate({ fileId: f._id, leadIds: Array.from(selected) })}
                            disabled={addToFileMutation.isPending}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[color:var(--paper-2)] transition disabled:opacity-60"
                          >
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] text-[color:var(--ink)] truncate">{f.name}</span>
                              <span className="block font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
                                {f.source === 'job' ? 'From search' : 'Curated'} · {f.leadCount}
                              </span>
                            </span>
                          </button>
                        ))
                    )}
                  </div>
                  <div className="px-3 py-3 border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]/60">
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-3)] block mb-1.5">
                      New file
                    </span>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = newFileName.trim();
                        if (!name) return;
                        createFileWithLeadsMutation.mutate({ name, leadIds: Array.from(selected) });
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        placeholder="File name"
                        maxLength={200}
                        className="flex-1 bg-transparent border border-[color:var(--rule)] focus:border-[color:var(--ember)]/60 rounded-md outline-none px-2 py-1 text-[12.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] transition-colors"
                      />
                      <button
                        type="submit"
                        disabled={!newFileName.trim() || createFileWithLeadsMutation.isPending}
                        className="px-2.5 h-7 rounded-md text-[11.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] disabled:opacity-50 transition-colors"
                      >
                        {createFileWithLeadsMutation.isPending ? '…' : 'Create'}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition"
            >
              Export CSV
            </button>

            {/* Bulk suppress (Task #27) — adds every selected lead's
                primary email + domain to the workspace suppression
                list. Behind a confirm because it's effectively
                irreversible: removing from suppression doesn't
                automatically re-engage a paused sequence. */}
            <button
              onClick={() => setSuppressOpen(true)}
              className="flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--paper)]/80 hover:text-[color:var(--paper)] transition"
            >
              Suppress
            </button>

            <div className="w-px h-5 bg-[color:var(--paper)]/20" />
            <button
              onClick={() => setSelected(new Set())}
              className="p-1 text-[color:var(--paper)]/50 hover:text-[color:var(--paper)] transition rounded"
              aria-label="Clear selection"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Grouped archive view ─────────────────────────────── */}
      {!isJobScoped && (
        <>
          {isLoading && (
            <div className="py-16 text-center">
              <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading leads…</span>
            </div>
          )}
          {!isLoading && filtered.length === 0 && total === 0 && (
            // True zero-state: workspace has no leads yet. Point the
            // user at the dashboard's compose box, which is where
            // leads come from. Distinct from the filter-mismatch case
            // below — that one shouldn't lecture about running a
            // search, the user already has plenty.
            <div className="border border-[color:var(--rule)] rounded-xl p-10 md:p-14 text-center bg-[color:var(--paper-2)]/40">
              <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">
                No leads yet
              </h3>
              <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[460px] mx-auto leading-[1.55]">
                Run a search on the dashboard — describe who you&rsquo;re looking for in
                a sentence, and the agent returns contacts with source links.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="mt-5 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors"
              >
                Run a search
                <ArrowEast className="w-3 h-3" />
              </button>
            </div>
          )}
          {!isLoading && filtered.length === 0 && total > 0 && (
            // Filter mismatch: there ARE leads in the workspace, the
            // current filter combo just doesn't match any. Don't push
            // a "run a search" CTA here — the leads exist, the filter
            // is the wrong shape.
            <div className="border border-[color:var(--rule)] rounded-xl p-10 md:p-14 text-center bg-[color:var(--paper-2)]/40">
              <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">
                No leads match those filters
              </h3>
              <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)]">
                Clear the search or try a different status filter.
              </p>
            </div>
          )}
          {!isLoading && groups && groups
            .slice((groupsPage - 1) * GROUPS_PAGE_SIZE, groupsPage * GROUPS_PAGE_SIZE)
            .map((g) => (
              <QueryGroup
                key={g.jobId ?? '__none__'}
                jobId={g.jobId}
                query={g.query}
                timestamp={g.timestamp}
                leads={g.leads}
                selected={selected}
                onToggle={toggleOne}
                onOpen={setDrawerId}
                drawerId={drawerId}
                schema={schema}
                isJobScoped={false}
                colCount={colCount}
              />
            ))}
          {!isLoading && groups && (
            <Pagination
              page={groupsPage}
              total={groups.length}
              pageSize={GROUPS_PAGE_SIZE}
              onPageChange={setGroupsPage}
              itemLabel={groups.length === 1 ? 'search' : 'searches'}
            />
          )}
          {!isLoading && filtered.length > 0 && (
            <div className="mt-3 flex items-center justify-between">
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
                Showing <span className="text-[color:var(--ink-2)]">{filtered.length}</span> of{' '}
                <span className="text-[color:var(--ink-2)]">{total}</span>
              </span>
              <button
                onClick={toggleAll}
                className="font-mono text-[10.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
              >
                {allSelectedOnPage ? 'Deselect all' : 'Select all'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Single-job dossier table ─────────────────────────── */}
      {isJobScoped && (
        <div className="border border-[color:var(--rule)] rounded-xl overflow-hidden bg-[color:var(--paper)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left">
              <LeadsTableHead schema={schema} isJobScoped={isJobScoped} />
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={colCount} className="py-16 text-center">
                      <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading leads…</span>
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((lead) => (
                    <LeadRow
                      key={lead._id}
                      lead={lead}
                      selected={selected.has(lead._id)}
                      onToggle={toggleOne}
                      onOpen={setDrawerId}
                      active={drawerId === lead._id}
                      schema={schema}
                      isJobScoped={isJobScoped}
                    />
                  ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="py-16 text-center">
                      <div className="max-w-[400px] mx-auto">
                        <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">No leads match those filters</h3>
                        <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)]">
                          Clear the search or try a different status filter.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[color:var(--rule)] flex items-center justify-between bg-[color:var(--paper-2)]">
            <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              Showing <span className="tabular-nums text-[color:var(--ink-2)]">{filtered.length}</span> of{' '}
              <span className="tabular-nums text-[color:var(--ink-2)]">{total}</span>
            </span>
            {isJobScoped && schema.length > 0 && (
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
                <sup className="text-[color:var(--ember)] mr-1">†</sup>
                Hover for source
              </span>
            )}
          </div>
        </div>
      )}

      <LeadDrawer lead={drawerLead} schema={schema} onClose={() => setDrawerId(null)} />

      {/* Bulk suppress confirm (Task #27) */}
      <ConfirmDialog
        open={suppressOpen}
        onOpenChange={setSuppressOpen}
        title={`Suppress ${selCount} lead${selCount === 1 ? '' : 's'}?`}
        description="Adds the primary email and/or domain of each selected lead to your suppression list. Suppressed addresses are skipped on every send — including in-flight sequences. Removing from suppression later does not auto-resume."
        itemName={`Mode: ${suppressMode}`}
        confirmLabel="Suppress"
        loading={bulkSuppressMutation.isPending}
        onConfirm={() =>
          bulkSuppressMutation.mutate({
            leadIds: Array.from(selected),
            mode: suppressMode,
          })
        }
      />
    </div>
  );
}
