'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Users, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { QueryInput } from '@/components/prospecting/QueryInput';
import { JobCard } from '@/components/prospecting/JobCard';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { ProspectingJob, ApiResponse } from '@leadreai/shared';

const statCards = [
  {
    title: 'Prospecting Jobs',
    value: '0',
    description: 'Total jobs submitted',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Leads Found',
    value: '—',
    description: 'Across all campaigns',
    icon: Users,
  },
  {
    title: 'Credits Remaining',
    value: '0',
    description: 'Free tier',
    icon: Coins,
  },
];

export default function DashboardPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: jobsData } = useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob[]> & { total: number }>(
        `/api/v1/workspaces/${workspaceId}/jobs?limit=5`
      ),
    enabled: !!workspaceId,
  });

  const jobs = jobsData?.data ?? [];

  async function handleSubmit(rawQuery: string) {
    if (!workspaceId) return;
    setIsSubmitting(true);
    try {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/jobs`, {
        method: 'POST',
        body: JSON.stringify({ rawQuery }),
      });
      await queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
    } catch (err) {
      console.error('Failed to create job', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a prospecting query to start generating leads.
        </p>
      </div>

      {/* Query input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">New Prospecting Query</CardTitle>
        </CardHeader>
        <CardContent>
          <QueryInput onSubmit={handleSubmit} isSubmitting={isSubmitting} />
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map(({ title, value, description, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600/15">
                <Icon size={16} className="text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent jobs */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Jobs</h3>
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                title="No prospecting jobs yet"
                description="Submit a query to find your next customers using natural language."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
