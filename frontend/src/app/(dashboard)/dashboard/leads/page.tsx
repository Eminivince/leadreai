'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/shared/EmptyState';
import { LeadTable } from '@/components/leads/LeadTable';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

interface Lead {
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

export default function LeadsPage() {
  const { workspaceId } = useWorkspace();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leads', workspaceId, search],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '100', isDuplicate: 'false' });
      if (search) params.set('q', search);
      return apiFetch<{ success: true; data: Lead[]; total: number }>(
        `/api/v1/workspaces/${workspaceId!}/leads?${params}`
      );
    },
    enabled: !!workspaceId,
  });

  const leads = data?.data ?? [];

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Leads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.total ?? 0} leads found across all jobs
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

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {leads.length === 0 && !isLoading ? (
        <EmptyState
          title="No leads yet"
          description="Submit a prospecting query from the dashboard to start generating leads."
        />
      ) : (
        <LeadTable leads={leads} isLoading={isLoading} />
      )}
    </div>
  );
}
