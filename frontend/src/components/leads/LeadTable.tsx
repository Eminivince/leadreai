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
        header: 'Emails',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.emails.length > 0 ? (
              <span className="text-foreground">
                {row.original.emails.length} email{row.original.emails.length > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
      },
      {
        id: 'phones',
        header: 'Phones',
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.phones.length > 0 ? (
              <span className="text-foreground">
                {row.original.phones.length} phone{row.original.phones.length > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </span>
        ),
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
                const reason = row.original.qualificationReason;
                if (score == null) return <span className="text-muted-foreground text-sm">—</span>;
                return (
                  <span
                    className="inline-flex items-center gap-1 text-sm font-semibold text-foreground"
                    title={reason ?? undefined}
                  >
                    {Math.round(score)}%
                    {reason && (
                      <span
                        className="inline-flex h-4 w-4 cursor-default items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground"
                        title={reason}
                      >
                        ?
                      </span>
                    )}
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
