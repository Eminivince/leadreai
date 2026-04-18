'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Zap, CheckCircle2, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useOutreachGeneration } from '@/hooks/useOutreachGeneration';
import { apiFetch } from '@/lib/api';
import type { Campaign, Lead, OutreachDraft } from '@leadreai/shared';
import type { ApiResponse } from '@leadreai/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignLeadsResponse {
  success: true;
  data: Lead[];
}

interface AllLeadsResponse {
  success: true;
  data: Lead[];
  total: number;
}

interface DraftsResponse {
  success: true;
  data: OutreachDraft[];
}

// ─── Status badge helpers ─────────────────────────────────────────────────────

const CAMPAIGN_STATUS_STYLES: Record<Campaign['status'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${CAMPAIGN_STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

const DRAFT_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  approved: 'bg-green-500/15 text-green-400 border-green-500/30',
  sent: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
};

function DraftStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${DRAFT_STATUS_STYLES[status] ?? DRAFT_STATUS_STYLES.draft}`}
    >
      {status}
    </span>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full rounded-full bg-indigo-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.campaignId as string;
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [addLeadsOpen, setAddLeadsOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [leadSearch, setLeadSearch] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: campaignData, isLoading: campaignLoading } = useQuery({
    queryKey: ['campaign', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<ApiResponse<Campaign>>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}`
      ),
    enabled: !!workspaceId && !!campaignId,
  });

  const { data: campaignLeadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['campaign-leads', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<CampaignLeadsResponse>(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/leads`
      ),
    enabled: !!workspaceId && !!campaignId,
  });

  const { data: draftsData, isLoading: draftsLoading } = useQuery({
    queryKey: ['campaign-drafts', workspaceId, campaignId],
    queryFn: () =>
      apiFetch<DraftsResponse>(
        `/api/v1/workspaces/${workspaceId}/outreach?campaignId=${campaignId}`
      ),
    enabled: !!workspaceId && !!campaignId,
  });

  const { data: allLeadsData } = useQuery({
    queryKey: ['leads-all-qualified', workspaceId, leadSearch],
    queryFn: () => {
      const params = new URLSearchParams({
        limit: '100',
        qualificationStatus: 'qualified',
        isDuplicate: 'false',
      });
      if (leadSearch) params.set('q', leadSearch);
      return apiFetch<AllLeadsResponse>(
        `/api/v1/workspaces/${workspaceId}/leads?${params}`
      );
    },
    enabled: !!workspaceId && addLeadsOpen,
  });

  const campaign = campaignData?.data;
  const campaignLeads = campaignLeadsData?.data ?? [];
  const drafts = draftsData?.data ?? [];
  const allLeads = allLeadsData?.data ?? [];

  // Already-added lead IDs for filtering
  const addedLeadIdSet = new Set(campaignLeads.map((l) => l._id));

  // ── Generation hook ────────────────────────────────────────────────────────

  const { done, total, percentage, isComplete, isGenerating, startGeneration } =
    useOutreachGeneration({
      workspaceId: workspaceId ?? '',
      campaignId,
      onComplete: () => {
        void queryClient.invalidateQueries({ queryKey: ['campaign-drafts', workspaceId, campaignId] });
        toast.success('Draft generation complete!');
      },
    });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addLeadsMutation = useMutation({
    mutationFn: (leadIds: string[]) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/leads`, {
        method: 'POST',
        body: JSON.stringify({ leadIds }),
      }),
    onSuccess: () => {
      toast.success('Leads added to campaign.');
      void queryClient.invalidateQueries({ queryKey: ['campaign-leads', workspaceId, campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign', workspaceId, campaignId] });
      setAddLeadsOpen(false);
      setSelectedLeadIds(new Set());
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add leads.');
    },
  });

  const removeLeadMutation = useMutation({
    mutationFn: (leadId: string) =>
      apiFetch(
        `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/leads/${leadId}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      toast.success('Lead removed.');
      void queryClient.invalidateQueries({ queryKey: ['campaign-leads', workspaceId, campaignId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign', workspaceId, campaignId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to remove lead.');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function toggleLeadSelection(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleAddSelected() {
    if (selectedLeadIds.size === 0) return;
    addLeadsMutation.mutate(Array.from(selectedLeadIds));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (campaignLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Loading campaign…</div>
    );
  }

  if (!campaign) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Campaign not found.</div>
    );
  }

  const canGenerate = campaignLeads.length > 0 && !isGenerating;

  return (
    <div className="space-y-8">
      {/* ── Campaign header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-foreground">{campaign.name}</h2>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          {campaign.description && (
            <p className="text-sm text-muted-foreground mb-2">{campaign.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Tone: <span className="text-foreground capitalize">{campaign.outreachConfig.tone}</span></span>
            <span>Language: <span className="text-foreground">{campaign.outreachConfig.language}</span></span>
            <span>Created: {new Date(campaign.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* ── Leads section ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base font-semibold">
            Leads{' '}
            <Badge variant="secondary" className="ml-1 text-xs">
              {campaignLeads.length}
            </Badge>
          </CardTitle>
          <Button size="sm" onClick={() => setAddLeadsOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            Add Leads
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {leadsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading leads…</div>
          ) : campaignLeads.length === 0 ? (
            <EmptyState title="No leads added yet." description="Add qualified leads to this campaign." />
          ) : (
            <div className="divide-y divide-border">
              {campaignLeads.map((lead) => (
                <div
                  key={lead._id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {lead.companyName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.companyDomain ?? '—'}
                      {lead.industry ? ` · ${lead.industry}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span>{lead.emails.length} email{lead.emails.length !== 1 ? 's' : ''}</span>
                    <span className="capitalize">{lead.outreachStatus}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLeadMutation.mutate(lead._id)}
                      disabled={removeLeadMutation.isPending}
                    >
                      <Trash2 size={13} />
                      <span className="sr-only">Remove</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Generate Drafts section ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base font-semibold">Generate Drafts</CardTitle>
          <Button
            size="sm"
            onClick={startGeneration}
            disabled={!canGenerate || !workspaceId}
          >
            <Zap size={14} className="mr-1.5" />
            {isGenerating ? 'Generating…' : 'Generate Drafts'}
          </Button>
        </CardHeader>
        <CardContent>
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Generating drafts…</span>
                <span>{done}/{total}</span>
              </div>
              <ProgressBar value={percentage} />
            </div>
          )}
          {isComplete && !isGenerating && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle2 size={16} />
              Generation complete!
            </div>
          )}
          {!isGenerating && !isComplete && (
            <p className="text-xs text-muted-foreground">
              {campaignLeads.length === 0
                ? 'Add leads first to enable draft generation.'
                : `Generate personalized outreach drafts for ${campaignLeads.length} lead${campaignLeads.length !== 1 ? 's' : ''}.`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Drafts section ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Drafts{' '}
            <Badge variant="secondary" className="ml-1 text-xs">
              {drafts.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {draftsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading drafts…</div>
          ) : drafts.length === 0 ? (
            <EmptyState title="No drafts generated yet." description="Generate drafts from the section above." />
          ) : (
            <div className="divide-y divide-border">
              {drafts.map((draft) => (
                <button
                  key={draft._id}
                  onClick={() =>
                    router.push(`/dashboard/campaigns/${campaignId}/drafts/${draft._id}`)
                  }
                  className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {draft.subject ?? '(No subject)'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {draft.firstLine ?? draft.body.slice(0, 80)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <DraftStatusBadge status={draft.status} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add Leads dialog ────────────────────────────────────────────── */}
      <Dialog open={addLeadsOpen} onOpenChange={(open) => { if (!open) { setAddLeadsOpen(false); setSelectedLeadIds(new Set()); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Leads</DialogTitle>
            <DialogDescription>
              Select qualified leads to add to this campaign.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Search leads…"
              value={leadSearch}
              onChange={(e) => setLeadSearch(e.target.value)}
            />

            <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {allLeads.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No qualified leads found.
                </div>
              ) : (
                allLeads.map((lead) => {
                  const alreadyAdded = addedLeadIdSet.has(lead._id);
                  const selected = selectedLeadIds.has(lead._id);
                  return (
                    <label
                      key={lead._id}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors ${alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-secondary/40'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={alreadyAdded}
                        onChange={() => toggleLeadSelection(lead._id)}
                        className="h-4 w-4 rounded border-border accent-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.companyName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.companyDomain ?? '—'}
                          {alreadyAdded ? ' · already added' : ''}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {selectedLeadIds.size} selected
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAddLeadsOpen(false); setSelectedLeadIds(new Set()); }}
              disabled={addLeadsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={selectedLeadIds.size === 0 || addLeadsMutation.isPending}
            >
              {addLeadsMutation.isPending ? 'Adding…' : `Add Selected (${selectedLeadIds.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
