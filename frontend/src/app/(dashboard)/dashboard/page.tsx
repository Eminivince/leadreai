'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, Users, ArrowDownToLine, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryInput } from '@/components/prospecting/QueryInput';
import { JobCard } from '@/components/prospecting/JobCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { LeadsAreaChart } from '@/components/dashboard/LeadsAreaChart';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, ProspectingJob } from '@leadreai/shared';

export default function DashboardPage() {
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useDashboardStats(workspaceId ?? null);

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob[]> & { total: number }>(
        `/api/v1/workspaces/${workspaceId}/jobs?limit=20`,
      ),
    enabled: !!workspaceId,
  });

  const jobs = jobsData?.data ?? [];

  async function handleSubmit(rawQuery: string) {
    if (!workspaceId) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/api/v1/workspaces/${workspaceId}/jobs`, {
        method: 'POST',
        body: JSON.stringify({ rawQuery }),
      });
      await queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-stats', workspaceId] });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your lead generation workspace at a glance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Jobs Run"
          value={stats?.totalJobsRun}
          description="Prospecting jobs submitted"
          icon={BriefcaseBusiness}
          isLoading={statsLoading}
        />
        <StatCard
          title="Leads Found"
          value={stats?.totalLeadsFound}
          description="Across all jobs"
          icon={Users}
          isLoading={statsLoading}
        />
        <StatCard
          title="Exports"
          value={stats?.totalExports}
          description="CSV / Excel downloads"
          icon={ArrowDownToLine}
          isLoading={statsLoading}
        />
        <StatCard
          title="Credits Used"
          value={stats?.creditsUsed}
          description="This workspace"
          icon={Zap}
          isLoading={statsLoading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">New Prospecting Query</CardTitle>
            </CardHeader>
            <CardContent>
              <QueryInput
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting || workspaceLoading}
                error={submitError}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Leads Found — Last 14 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadsAreaChart jobs={jobs} isLoading={jobsLoading} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Jobs</h3>
          {jobsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-20 animate-pulse rounded-lg bg-card border border-border" />
              ))}
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Submit a query to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.slice(0, 8).map(job => (
                <JobCard
                  key={job._id}
                  job={job}
                  onRefresh={() => {
                    void queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
                    void queryClient.invalidateQueries({ queryKey: ['workspace-stats', workspaceId] });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
