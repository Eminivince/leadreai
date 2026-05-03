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

/* ─────────────────────────────────────────────────────────────────
 * Leads — editorial dossier table.
 *
 * Two modes:
 *   · /dashboard/leads            → the archive (all leads across jobs)
 *   · /dashboard/leads?jobId=X    → a single dossier with outputSchema columns
 *
 * Columns in dossier mode: Company, Contact, Email, Phone,
 * [dynamic schema columns reading lead.facts[key]], Score, Status.
 * Archive mode omits the dynamic columns (they don't generalize).
 *
 * Honest missing data: "—" for truly absent, loading state for streaming,
 * distinct from "rejected" per the honesty principle.
 * ───────────────────────────────────────────────────────────────── */

const SEARCH_PLACEHOLDER = 'Search company, email, phone, domain\u2026';

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

/* Format a fact value by declared type. */
function formatFact(val: FactValue, type: OutputSchemaColumn['type']): string {
  if (val.value === null || val.value === undefined || val.value === '') return '—';
  const v = val.value;
  switch (type) {
    case 'currency': {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!Number.isFinite(n)) return String(v);
      const unit = val.unit ?? 'USD';
      // Compact: 1.2M, 55K, 10B
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
    qualified: { label: 'Qualified', tone: 'text-[color:var(--forest)] border-[color:var(--forest)]/40' },
    pending:   { label: 'New',       tone: 'text-[color:var(--ink-2)] border-[color:var(--rule)]' },
    dust:      { label: 'Rejected',  tone: 'text-[color:var(--ink-3)] border-[color:var(--rule)]/60' },
  };
  const chip = map[status] ?? map.pending!;
  return (
    <span className={`inline-flex items-center font-mono text-[9.5px] tracking-[0.18em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${chip.tone}`}>
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
  return (
    <section className="mb-10">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard"
          className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
        >
          Searches
        </Link>
        <span className="font-mono text-[10px] text-[color:var(--ink-3)]">/</span>
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          Search №.&nbsp;{job._id.slice(-4).toUpperCase()}
        </span>
      </div>

      <div className="relative">
        <div className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/20 rounded-sm" aria-hidden />
        <div className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-sm p-6 md:p-8">
          <div className="flex items-start gap-4 md:gap-6">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)] pt-[7px] shrink-0 w-14">
              Subject
            </span>
            <p className=" italic text-[22px] md:text-[28px] leading-[1.2] text-[color:var(--ink)]">
              &ldquo;{job.rawQuery}&rdquo;
            </p>
          </div>
          <div className="mt-5 pt-5 border-t border-dashed border-[color:var(--rule)] grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <div>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">Filed</span>
              <div className="mt-1  text-[13px] text-[color:var(--ink)]">
                {relativeTime(job.createdAt)}
              </div>
            </div>
            <div>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">Leads</span>
              <div className="mt-1  text-[20px] leading-none tabular-nums text-[color:var(--ink)]">
                {job.progress?.leadsFoundSoFar ?? 0}
                <span className="font-mono text-[11px] text-[color:var(--ink-3)] ml-1">
                  / {job.parsedIntent?.targetCount ?? '—'}
                </span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">Status</span>
              <div className="mt-1  text-[13px] text-[color:var(--ink)] capitalize">
                {job.status}
              </div>
            </div>
            <div>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">Columns</span>
              <div className="mt-1  text-[13px] text-[color:var(--ink)]">
                {schema.length > 0 ? `${schema.length} extra` : 'Standard'}
              </div>
            </div>
          </div>
          {schema.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[color:var(--rule)] flex flex-wrap gap-2">
              {schema.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5  text-[11.5px] text-[color:var(--ink-2)] bg-[color:var(--paper)] border border-[color:var(--rule)] px-2 py-1"
                >
                  {c.label}
                  <span className="font-mono text-[9px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                    · {c.type}
                  </span>
                  {c.required && (
                    <span className="font-mono text-[8.5px] text-[color:var(--rust)]">req</span>
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
                    className="font-mono text-[12.5px] text-[color:var(--ink)] hover:text-[color:var(--forest)] truncate transition"
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
                    className="font-mono text-[12.5px] text-[color:var(--ink)] hover:text-[color:var(--forest)] transition"
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
                              className="ml-2 inline-flex items-baseline font-mono text-[9.5px] text-[color:var(--forest)] hover:underline"
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

          {/* Provenance (sources) */}
          {lead.sources?.length > 0 && (
            <div className="pt-5 border-t border-[color:var(--rule)]">
              <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                Provenance
              </span>
              <ol className="mt-3 space-y-1.5">
                {lead.sources.slice(0, 5).map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2  text-[12px] text-[color:var(--ink-2)]">
                    <sup className="text-[color:var(--forest)] font-mono">{i + 1}</sup>
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

          {/* Score + scoring signal */}
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
            {lead.qualificationReason && (
              <p className="text-[12.5px] text-[color:var(--ink-2)] leading-relaxed">
                {lead.qualificationReason}
              </p>
            )}
          </div>

          {/* Esc hint */}
          <div className="pt-2 font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] text-center">
            Press Esc to close
          </div>
        </div>
      </div>
    </div>
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
      <td className="py-3 pl-4 pr-2 align-middle" onClick={(e) => { e.stopPropagation(); onToggle(lead._id); }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(lead._id)}
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
            <div className=" text-[13px] text-[color:var(--ink)] truncate">
              {contact.fullName}
            </div>
            <div className=" italic text-[12px] text-[color:var(--ink-2)] truncate leading-tight">
              {contact.title || '\u2014'}
            </div>
          </>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
            —
          </span>
        )}
      </td>
      <td className="py-3 px-3 align-middle max-w-[220px]">
        {primaryEmail(lead) ? (
          <span className="font-mono text-[11.5px] text-[color:var(--ink)] truncate block">
            {primaryEmail(lead)}
            {primaryEmailSource(lead) && (
              <sup className="ml-0.5 text-[9px] text-[color:var(--forest)]" title={`Source: ${primaryEmailSource(lead)}`}>
                {lead.emails[0]?.verified ? '✓' : '*'}
              </sup>
            )}
          </span>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
            —
          </span>
        )}
      </td>
      <td className="py-3 px-3 align-middle max-w-[150px]">
        {primaryPhone(lead) ? (
          <span className="font-mono text-[11.5px] text-[color:var(--ink-2)] truncate block">
            {primaryPhone(lead)}
          </span>
        ) : (
          <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
            —
          </span>
        )}
      </td>

      {/* Dynamic schema columns */}
      {isJobScoped &&
        schema.map((c) => {
          const f = lead.facts?.[c.key];
          const formatted = f ? formatFact(f, c.type) : '—';
          const hasSource = !!f?.sourceUrl;
          return (
            <td key={c.key} className="py-3 px-3 align-middle max-w-[160px]">
              {f && f.value !== null && f.value !== undefined ? (
                <span className=" text-[13px] text-[color:var(--ink)] truncate block">
                  {formatted}
                  {hasSource && <sup className="ml-0.5 text-[9px] text-[color:var(--forest)]">†</sup>}
                </span>
              ) : (
                <span className=" italic text-[12.5px] text-[color:var(--ink-3)]">
                  —
                </span>
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

  const leadsPath = jobId
    ? `/api/v1/workspaces/${workspaceId}/leads?limit=200&isDuplicate=false&jobId=${jobId}`
    : `/api/v1/workspaces/${workspaceId}/leads?limit=200&isDuplicate=false`;

  const { data: leadsData, isLoading } = useQuery({
    queryKey: ['leads-all', workspaceId, jobId ?? 'all'],
    queryFn: () =>
      apiFetch<ApiResponse<Lead[]> & { total: number }>(leadsPath),
    enabled: !!workspaceId,
  });

  const { data: jobData } = useQuery({
    queryKey: ['job', workspaceId, jobId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob>>(`/api/v1/workspaces/${workspaceId}/jobs/${jobId}`),
    enabled: !!workspaceId && !!jobId,
  });

  const allLeads = leadsData?.data ?? [];
  const total = leadsData?.total ?? 0;
  const job = jobData?.data;
  const schema: OutputSchemaColumn[] = job?.parsedIntent?.outputSchema ?? [];
  const isJobScoped = !!jobId && !!job;

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

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-12">
      {/* Header */}
      {isJobScoped && job ? (
        <DossierHeader job={job} />
      ) : (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="block w-8 h-px bg-[color:var(--ink)]" />
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
              All leads
            </span>
          </div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="max-w-[720px]">
              <h1 className=" text-[44px] md:text-[60px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
                All leads <em className="italic text-[color:var(--forest)]">you&apos;ve collected</em>.
              </h1>
              <p className="mt-4  text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
                {isLoading ? 'Loading\u2026' : `${total} leads across all searches.`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="inline-flex items-center gap-1.5  text-[13px] text-[color:var(--ink)] border border-[color:var(--rule)] bg-[color:var(--paper-3)] hover:border-[color:var(--ink)] px-4 py-2.5 rounded-full transition"
              >
                Export CSV
              </button>
              <button
                onClick={() => router.push('/dashboard/campaigns')}
                className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full  text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
              >
                Start a campaign <ArrowEast className="w-3 h-3" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6 pb-5 border-b border-[color:var(--rule)]">
        <div className="inline-flex items-center gap-0 rounded-full border border-[color:var(--rule)] bg-[color:var(--paper-3)] p-1">
          {FILTERS.map((f) => {
            const on = filter === f.k;
            const n = counts[f.k as keyof typeof counts];
            return (
              <button
                key={f.k}
                onClick={() => setFilter(f.k)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full  text-[12.5px] transition-colors ${
                  on
                    ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
                    : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                }`}
              >
                <span>{f.label}</span>
                <span className={`font-mono text-[10px] tabular-nums ${on ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 border border-[color:var(--rule)] bg-[color:var(--paper-3)] rounded-full w-[260px] md:w-[320px]">
          <SearchIcon className="w-3.5 h-3.5 text-[color:var(--ink-3)] shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            className="bg-transparent outline-none flex-1  text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
            >
              <CloseIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Bulk-action bar */}
      {selCount > 0 && (
        <div className="mb-4 flex items-center gap-4 flex-wrap bg-[color:var(--paper-2)] border border-[color:var(--rule)] px-4 py-3 rounded-sm">
          <span className=" text-[13px] text-[color:var(--ink)]">
            <span className="font-medium tabular-nums">{selCount}</span> selected
          </span>
          <span className="h-3 w-px bg-[color:var(--rule)]" />
          <div ref={saveMenuRef} className="relative">
            <button
              onClick={() => setSaveMenuOpen((v) => !v)}
              className=" text-[12.5px] text-[color:var(--ink)] hover:text-[color:var(--forest)] font-medium"
            >
              Save to file ▾
            </button>
            {saveMenuOpen && (
              <div className="absolute top-full left-0 mt-2 z-20 w-[320px] bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-sm shadow-xl">
                <div className="px-3 py-2 border-b border-[color:var(--rule)]">
                  <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                    Pick a file
                  </span>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {files.length === 0 ? (
                    <div className="px-3 py-4  italic text-[12.5px] text-[color:var(--ink-2)]">
                      No files yet. Create one below.
                    </div>
                  ) : (
                    files
                      .filter((f) => !f.archivedAt)
                      .map((f) => (
                        <button
                          key={f._id}
                          onClick={() =>
                            addToFileMutation.mutate({
                              fileId: f._id,
                              leadIds: Array.from(selected),
                            })
                          }
                          disabled={addToFileMutation.isPending}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[color:var(--paper-3)]/60 transition disabled:opacity-60"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block  text-[13px] text-[color:var(--ink)] truncate">
                              {f.name}
                            </span>
                            <span className="block font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
                              {f.source === 'job' ? 'From search' : 'Curated'} · {f.leadCount}
                            </span>
                          </span>
                        </button>
                      ))
                  )}
                </div>
                <div className="px-3 py-3 border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]/60">
                  <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-1.5">
                    Or cut a new file
                  </span>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = newFileName.trim();
                      if (!name) return;
                      createFileWithLeadsMutation.mutate({
                        name,
                        leadIds: Array.from(selected),
                      });
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="New file name"
                      maxLength={200}
                      className="flex-1 bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] outline-none py-1  text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
                    />
                    <button
                      type="submit"
                      disabled={!newFileName.trim() || createFileWithLeadsMutation.isPending}
                      className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--forest)] hover:text-[color:var(--ink)] disabled:opacity-60"
                    >
                      {createFileWithLeadsMutation.isPending ? 'Opening…' : 'Open'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            className=" text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
          >
            Export CSV
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="border border-[color:var(--rule)] rounded-sm overflow-hidden bg-[color:var(--paper)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[color:var(--paper-2)] border-b border-[color:var(--rule)]">
              <tr>
                <th className="py-2.5 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelectedOnPage}
                    onChange={toggleAll}
                    className="accent-[color:var(--ink)] cursor-pointer"
                  />
                </th>
                {['Company', 'Contact', 'Email', 'Phone', ...schema.map((c) => c.label), 'Score', 'Status', ''].map((h, i) => (
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
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7 + schema.length} className="py-16 text-center">
                    <span className=" italic text-[14px] text-[color:var(--ink-2)]">
                      Loading leads\u2026
                    </span>
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
                  <td colSpan={7 + schema.length} className="py-20 text-center">
                    <div className="max-w-[400px] mx-auto">
                      <h3 className=" text-[22px] text-[color:var(--ink)]">
                        Nothing matched those filters.
                      </h3>
                      <p className="mt-2  text-[13.5px] italic text-[color:var(--ink-2)]">
                        Clear the search or try a different filter.
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
              <sup className="text-[color:var(--forest)] mr-1">†</sup>
              Hover for source
            </span>
          )}
        </div>
      </div>

      <LeadDrawer lead={drawerLead} schema={schema} onClose={() => setDrawerId(null)} />
    </div>
  );
}
