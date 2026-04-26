'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AttentionStrip } from '@/components/dashboard/AttentionStrip';
import { UsageMeters } from '@/components/dashboard/UsageMeters';
import { PipelineSnapshot } from '@/components/dashboard/PipelineSnapshot';
import { OutcomeChart } from '@/components/dashboard/OutcomeChart';
import { RunningJobs } from '@/components/dashboard/RunningJobs';
import { Shortcuts } from '@/components/dashboard/Shortcuts';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { NewQueryModal } from '@/components/dashboard/NewQueryModal';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useCredits } from '@/hooks/useCredits';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, ProspectingJob } from '@leadreai/shared';

export default function DashboardPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: stats } = useDashboardStats(workspaceId ?? null);
  const { data: credits } = useCredits();

  const { data: jobsData } = useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: () =>
      apiFetch<ApiResponse<ProspectingJob[]> & { total: number }>(
        `/api/v1/workspaces/${workspaceId}/jobs?limit=20`,
      ),
    enabled: !!workspaceId,
  });

  const jobs = jobsData?.data ?? [];
  const failedJobs = jobs.filter(j => j.status === 'failed');

  async function handleSubmit(rawQuery: string): Promise<string | null> {
    if (!workspaceId) return null;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch<{ success: true; data: { _id: string } }>(
        `/api/v1/workspaces/${workspaceId}/jobs`,
        { method: 'POST', body: JSON.stringify({ rawQuery }) },
      );
      await queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-stats', workspaceId] });
      return res.data._id;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create job. Please try again.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <AttentionStrip
        failedJobs={failedJobs}
        creditsBalance={credits?.creditsBalance}
      />

      <UsageMeters
        creditsBalance={credits?.creditsBalance}
        totalJobsRun={stats?.totalJobsRun}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <PipelineSnapshot
            totalLeadsFound={stats?.totalLeadsFound}
            totalExports={stats?.totalExports}
          />
          <OutcomeChart />
          <RunningJobs
            jobs={jobs}
            onRetry={async (jobId) => {
              await queryClient.invalidateQueries({ queryKey: ['jobs', workspaceId] });
            }}
          />
        </div>

        {/* Right 1/3 */}
        <div className="flex flex-col gap-4">
          <Shortcuts />
          <ActivityFeed />
        </div>
      </div>

      <NewQueryModal
        workspaceId={workspaceId ?? ''}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        error={submitError}
      />
    </div>
  );
}
