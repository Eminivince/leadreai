'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LeadTable, type Lead } from '@/components/leads/LeadTable';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type QualificationTab = 'qualified' | 'dust' | 'pending';

interface LeadsResponse {
  success: true;
  data: Lead[];
  total: number;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

interface TabButtonProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

function TabButton({ label, active, count, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-indigo-500 text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {label}
      {count !== undefined && (
        <span
          className={[
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
            active ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' : 'bg-muted text-muted-foreground',
          ].join(' ')}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<QualificationTab>('qualified');
  const [search, setSearch] = useState('');

  // ── Queries (one per tab so counts are always fresh) ──────────────────────

  const qualifiedQuery = useQuery({
    queryKey: ['leads', workspaceId, 'qualified', search],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: '100',
        isDuplicate: 'false',
        qualificationStatus: 'qualified',
      });
      if (search) params.set('q', search);
      return apiFetch<LeadsResponse>(`/api/v1/workspaces/${workspaceId!}/leads?${params}`);
    },
    enabled: !!workspaceId,
  });

  const dustQuery = useQuery({
    queryKey: ['leads', workspaceId, 'dust', search],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: '100',
        isDuplicate: 'false',
        qualificationStatus: 'dust',
      });
      if (search) params.set('q', search);
      return apiFetch<LeadsResponse>(`/api/v1/workspaces/${workspaceId!}/leads?${params}`);
    },
    enabled: !!workspaceId,
  });

  const pendingQuery = useQuery({
    queryKey: ['leads', workspaceId, 'pending', search],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: '100',
        isDuplicate: 'false',
        qualificationStatus: 'pending',
      });
      if (search) params.set('q', search);
      return apiFetch<LeadsResponse>(`/api/v1/workspaces/${workspaceId!}/leads?${params}`);
    },
    enabled: !!workspaceId,
  });

  // ── Promote mutation (dust → qualified) ───────────────────────────────────

  const [promotingIds, setPromotingIds] = useState<Set<string>>(new Set());

  const promoteMutation = useMutation({
    mutationFn: (leadId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId!}/leads/${leadId}`, {
        method: 'PATCH',
        body: JSON.stringify({ qualificationStatus: 'qualified' }),
      }),
    onMutate: (leadId) => {
      setPromotingIds((prev) => new Set(prev).add(leadId));
    },
    onSuccess: (_data, leadId) => {
      toast.success('Lead promoted to Qualified.');
      setPromotingIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId, 'qualified'] });
      void queryClient.invalidateQueries({ queryKey: ['leads', workspaceId, 'dust'] });
    },
    onError: (err, leadId) => {
      setPromotingIds((prev) => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
      toast.error(err instanceof Error ? err.message : 'Failed to promote lead.');
    },
  });

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(format: 'csv' | 'xlsx') {
    if (!workspaceId) return;
    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const token = getAccessToken();
    const res = await fetch(
      `${API_BASE}/api/v1/workspaces/${workspaceId}/export/leads?format=${format}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const activeQuery =
    activeTab === 'qualified' ? qualifiedQuery : activeTab === 'dust' ? dustQuery : pendingQuery;

  const leads = activeQuery.data?.data ?? [];
  const isLoading = activeQuery.isLoading;
  const totalShown = activeQuery.data?.total ?? 0;

  const dustCount = dustQuery.data?.total;
  const pendingCount = pendingQuery.data?.total;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Leads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalShown} {activeTab} lead{totalShown !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleExport('csv')}
          >
            <Download size={14} /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleExport('xlsx')}
          >
            <Download size={14} /> Excel
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-6 border-b border-border">
        <TabButton
          label="Qualified"
          active={activeTab === 'qualified'}
          onClick={() => setActiveTab('qualified')}
        />
        <TabButton
          label="Dust"
          active={activeTab === 'dust'}
          count={dustCount}
          onClick={() => setActiveTab('dust')}
        />
        <TabButton
          label="Pending"
          active={activeTab === 'pending'}
          count={pendingCount}
          onClick={() => setActiveTab('pending')}
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Table */}
      {leads.length === 0 && !isLoading ? (
        <EmptyState
          title={
            activeTab === 'qualified'
              ? 'No qualified leads yet'
              : activeTab === 'dust'
              ? 'No dust leads'
              : 'No pending leads'
          }
          description={
            activeTab === 'qualified'
              ? 'Run the AI qualification step to score your leads.'
              : activeTab === 'dust'
              ? 'Leads the AI filtered out will appear here.'
              : 'Submit a prospecting query to start generating leads.'
          }
        />
      ) : (
        <LeadTable
          leads={leads}
          isLoading={isLoading}
          showQualificationScore={activeTab === 'qualified'}
          onPromote={activeTab === 'dust' ? (lead) => promoteMutation.mutate(lead._id) : undefined}
          promotingIds={activeTab === 'dust' ? promotingIds : undefined}
        />
      )}
    </div>
  );
}
