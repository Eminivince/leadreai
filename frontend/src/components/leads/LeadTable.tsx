'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { LeadDetailDrawer } from './LeadDetailDrawer';

export interface Lead {
  _id: string;
  companyName: string;
  companyDomain?: string;
  industry?: string;
  website?: string;
  address?: { city?: string; state?: string; country?: string };
  emails: Array<{ address: string; type: string; confidence: number; source: string }>;
  phones: Array<{ raw: string; normalized?: string; type?: string }>;
  socialProfiles?: { linkedinUrl?: string };
  osint?: Record<string, unknown>;
  sources: Array<{ url: string; type: string }>;
  rankScore: number;
  completenessScore: number;
  isDuplicate: boolean;
  outreachStatus: string;
  qualificationStatus?: 'pending' | 'qualified' | 'dust';
  qualificationScore?: number;
  qualificationReason?: string;
  contactSummary?: {
    totalContacts: number;
    topContact?: { fullName: string; title: string; seniority: string };
  };
  tags: string[];
  notes?: string;
  createdAt: string;
}

interface LeadTableProps {
  leads: Lead[];
  isLoading?: boolean;
  showQualificationScore?: boolean;
  onPromote?: (lead: Lead) => void;
  promotingIds?: Set<string>;
}

export function LeadTable({
  leads,
  isLoading,
  showQualificationScore,
  onPromote,
  promotingIds,
}: LeadTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const columns = useMemo<ColumnDef<Lead>[]>(
    () => [
      {
        accessorKey: 'companyName',
        header: 'Company',
        cell: ({ row }) => (
          <button
            onClick={() => setSelectedLead(row.original)}
            className="text-left font-medium text-foreground transition-colors hover:text-muted-foreground"
          >
            {row.original.companyName}
            {row.original.companyDomain && (
              <span className="block text-xs text-muted-foreground font-normal">
                {row.original.companyDomain}
              </span>
            )}
          </button>
        ),
      },
      {
        accessorKey: 'industry',
        header: 'Industry',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue<string>() ?? '—'}</span>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        cell: ({ row }) => {
          const { city, country } = row.original.address ?? {};
          return (
            <span className="text-sm text-muted-foreground">
              {[city, country].filter(Boolean).join(', ') || '—'}
            </span>
          );
        },
      },
      {
        id: 'emails',
        header: 'Email',
        cell: ({ row }) => {
          const emails = row.original.emails ?? [];
          const real = emails.filter((e) => e.type !== 'pattern_inferred');
          const inferredCount = emails.length - real.length;
          const first = real[0];

          if (!first?.address) {
            // No real email. Show a quiet "guess only" hint if there are
            // inferred emails — never a real address as the primary email.
            if (inferredCount > 0) {
              return (
                <span
                  className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-500"
                  title={`${inferredCount} inferred email guess${inferredCount === 1 ? '' : 'es'} only — no public source.`}
                >
                  Guess only
                </span>
              );
            }
            return <span className="text-xs text-muted-foreground">—</span>;
          }

          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-foreground truncate max-w-[180px]">{first.address}</span>
              {real.length > 1 && (
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-secondary rounded px-1">+{real.length - 1}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'phones',
        header: 'Phone',
        cell: ({ row }) => {
          const phones = row.original.phones;
          const p0 = phones[0];
          if (!p0) return <span className="text-xs text-muted-foreground">—</span>;
          const display = p0.normalized ?? p0.raw;
          return (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs text-foreground font-mono whitespace-nowrap">{display}</span>
              {phones.length > 1 && (
                <span className="shrink-0 text-[10px] font-mono text-muted-foreground bg-secondary rounded px-1">+{phones.length - 1}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'contacts',
        header: 'Contacts',
        cell: ({ row }) => {
          const total = row.original.contactSummary?.totalContacts;
          if (!total) return <span className="text-xs text-muted-foreground">—</span>;
          return <span className="text-xs font-medium text-foreground">{total}</span>;
        },
      },
      {
        accessorKey: 'rankScore',
        header: 'Rank',
        cell: ({ getValue }) => {
          const score = getValue<number>();
          const color =
            score >= 70
              ? 'text-foreground'
              : score >= 40
              ? 'text-muted-foreground'
              : 'text-muted-foreground/70';
          return <span className={`text-sm font-semibold ${color}`}>{score}</span>;
        },
      },
      {
        accessorKey: 'outreachStatus',
        header: 'Status',
        cell: ({ getValue }) => (
          <Badge variant="secondary" className="text-xs capitalize">
            {String(getValue()).replace('_', ' ')}
          </Badge>
        ),
      },
      ...(showQualificationScore
        ? ([
            {
              id: 'qualificationScore',
              header: 'AI Score',
              cell: ({ row }) => {
                const score = row.original.qualificationScore;
                if (score === undefined || score === null) return <span className="text-xs text-muted-foreground">—</span>;
                const pct = Math.round(score);
                const color =
                  pct >= 70 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  pct >= 40 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                             'bg-red-500/20 text-red-400 border-red-500/30';
                return (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${color}`}
                    title={row.original.qualificationReason ?? undefined}
                  >
                    {pct}
                  </span>
                );
              },
            },
          ] as ColumnDef<Lead>[])
        : []),
      ...(onPromote
        ? ([
            {
              id: 'promote',
              header: '',
              cell: ({ row }) => {
                const lead = row.original;
                const isPending = promotingIds?.has(lead._id) ?? false;
                return (
                  <button
                    disabled={isPending}
                    onClick={() => onPromote(lead)}
                    className="rounded border border-border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary/70 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? 'Promoting…' : 'Promote'}
                  </button>
                );
              },
            },
          ] as ColumnDef<Lead>[])
        : []),
    ],
    [showQualificationScore, onPromote, promotingIds]
  );

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-sm text-muted-foreground">Loading leads...</div>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border bg-secondary/30">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ChevronUp size={12} />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDown size={12} />}
                      {!header.column.getIsSorted() && header.column.getCanSort() && (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {leads.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">No leads found.</div>
        )}
      </div>

      <LeadDetailDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </>
  );
}
