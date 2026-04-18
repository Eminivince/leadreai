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
  tags: string[];
  notes?: string;
  createdAt: string;
}

interface LeadTableProps {
  leads: Lead[];
  isLoading?: boolean;
}

export function LeadTable({ leads, isLoading }: LeadTableProps) {
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
            className="text-left font-medium text-foreground hover:text-indigo-400 transition-colors"
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
              <span className="text-emerald-400">
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
              <span className="text-blue-400">
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
              ? 'text-emerald-400'
              : score >= 40
              ? 'text-yellow-400'
              : 'text-muted-foreground';
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
    ],
    []
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
