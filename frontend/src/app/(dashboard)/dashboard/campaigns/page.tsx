'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { Campaign } from '@leadreai/shared';
import type { ApiResponse } from '@leadreai/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CampaignsResponse {
  success: true;
  data: Campaign[];
}

interface CampaignFormState {
  name: string;
  description: string;
  tone: string;
  language: string;
}

const EMPTY_FORM: CampaignFormState = {
  name: '',
  description: '',
  tone: 'professional',
  language: 'English',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Campaign['status'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  completed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

function StatusBadge({ status }: { status: Campaign['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', workspaceId],
    queryFn: () =>
      apiFetch<CampaignsResponse>(`/api/v1/workspaces/${workspaceId}/campaigns`),
    enabled: !!workspaceId,
  });

  const campaigns = data?.data ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (payload: CampaignFormState) =>
      apiFetch<ApiResponse<Campaign>>(`/api/v1/workspaces/${workspaceId}/campaigns`, {
        method: 'POST',
        body: JSON.stringify({
          name: payload.name,
          description: payload.description || undefined,
          outreachConfig: {
            tone: payload.tone,
            language: payload.language,
            channel: 'email',
            personalization: [],
          },
        }),
      }),
    onSuccess: (res) => {
      toast.success('Campaign created.');
      void queryClient.invalidateQueries({ queryKey: ['campaigns', workspaceId] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/dashboard/campaigns/${res.data._id}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create campaign.');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    createMutation.mutate(form);
  }

  function closeDialog() {
    setDialogOpen(false);
    setForm(EMPTY_FORM);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Campaigns</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage your outreach campaigns.</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!workspaceId}>
          <Plus size={14} className="mr-1.5" />
          New Campaign
        </Button>
      </div>

      {/* Campaign list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Create your first campaign."
              action={
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus size={14} className="mr-1.5" />
                  New Campaign
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <button
                  key={c._id}
                  onClick={() => router.push(`/dashboard/campaigns/${c._id}`)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {c.name}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    {c.description && (
                      <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-5 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">{c.leadIds?.length ?? 0}</span>{' '}
                      leads
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        {c.stats?.draftsCreated ?? 0}
                      </span>{' '}
                      drafts
                    </span>
                    <span>{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Campaign dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
            <DialogDescription>Set up a new outreach campaign.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-name">Name *</Label>
              <Input
                id="campaign-name"
                placeholder="e.g. Q2 SaaS Outreach"
                maxLength={200}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-desc">Description</Label>
              <Textarea
                id="campaign-desc"
                placeholder="Optional description…"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-tone">Tone</Label>
              <Select
                value={form.tone}
                onValueChange={(v) => setForm((f) => ({ ...f, tone: v }))}
              >
                <SelectTrigger id="campaign-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <Label htmlFor="campaign-lang">Language</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}
              >
                <SelectTrigger id="campaign-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Spanish">Spanish</SelectItem>
                  <SelectItem value="French">French</SelectItem>
                  <SelectItem value="Portuguese">Portuguese</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !form.name.trim()}>
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
