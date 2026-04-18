'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, CheckCircle, ArrowLeft, ExternalLink, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { OutreachDraft, Lead } from '@leadreai/shared';
import type { ApiResponse } from '@leadreai/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  draftId: string;
  campaignId: string;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

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

// ─── Word counter ─────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Editor ───────────────────────────────────────────────────────────────────

export function OutreachDraftEditor({ draftId, campaignId }: Props) {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Local editable state
  const [firstLine, setFirstLine] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [initialized, setInitialized] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: draftData, isLoading: draftLoading } = useQuery({
    queryKey: ['draft', workspaceId, draftId],
    queryFn: () =>
      apiFetch<ApiResponse<OutreachDraft>>(
        `/api/v1/workspaces/${workspaceId}/outreach/${draftId}`
      ),
    enabled: !!workspaceId && !!draftId,
  });

  const draft = draftData?.data;

  // Seed local state once draft loads
  useEffect(() => {
    if (draft && !initialized) {
      setFirstLine(draft.firstLine ?? '');
      setSubject(draft.subject ?? '');
      setBody(draft.body ?? '');
      setInitialized(true);
    }
  }, [draft, initialized]);

  const { data: leadData } = useQuery({
    queryKey: ['lead', workspaceId, draft?.leadId],
    queryFn: () =>
      apiFetch<ApiResponse<Lead>>(
        `/api/v1/workspaces/${workspaceId}/leads/${draft!.leadId}`
      ),
    enabled: !!workspaceId && !!draft?.leadId,
  });

  const lead = leadData?.data;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (fields: Partial<{ firstLine: string; subject: string; body: string }>) =>
      apiFetch<ApiResponse<OutreachDraft>>(
        `/api/v1/workspaces/${workspaceId}/outreach/${draftId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(fields),
        }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['draft', workspaceId, draftId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-drafts', workspaceId, campaignId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save draft.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/outreach/${draftId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Draft approved.');
      void queryClient.invalidateQueries({ queryKey: ['draft', workspaceId, draftId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-drafts', workspaceId, campaignId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to approve draft.');
    },
  });

  const sendMutation = useMutation({
    mutationFn: () =>
      apiFetch<ApiResponse<OutreachDraft>>(
        `/api/v1/workspaces/${workspaceId}/outreach/${draftId}/send`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      toast.success('Email sent successfully.');
      void queryClient.invalidateQueries({ queryKey: ['draft', workspaceId, draftId] });
      void queryClient.invalidateQueries({ queryKey: ['campaign-drafts', workspaceId, campaignId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to send email.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/outreach/${draftId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Draft deleted.');
      void queryClient.invalidateQueries({ queryKey: ['campaign-drafts', workspaceId, campaignId] });
      router.push(`/dashboard/campaigns/${campaignId}`);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete draft.');
    },
  });

  // ── Blur save handlers ─────────────────────────────────────────────────────

  function handleBlur(field: 'firstLine' | 'subject' | 'body', value: string) {
    if (!draft) return;
    const original = field === 'firstLine' ? (draft.firstLine ?? '') : field === 'subject' ? (draft.subject ?? '') : draft.body;
    if (value !== original) {
      updateMutation.mutate({ [field]: value });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (draftLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Loading draft…</div>
    );
  }

  if (!draft) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Draft not found.</div>
    );
  }

  const flWordCount = wordCount(firstLine);
  const isApproved = draft.status === 'approved';
  const isSent = draft.status === 'sent';

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/campaigns/${campaignId}`)}
          className="gap-1.5 text-muted-foreground"
        >
          <ArrowLeft size={14} />
          Back to campaign
        </Button>
        <DraftStatusBadge status={draft.status} />
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── Left: lead info ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Lead Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!lead ? (
              <p className="text-xs text-muted-foreground">Loading lead…</p>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-foreground">{lead.companyName}</p>
                  {lead.companyDomain && (
                    <p className="text-xs text-muted-foreground">{lead.companyDomain}</p>
                  )}
                </div>

                {lead.industry && (
                  <InfoRow label="Industry" value={lead.industry} />
                )}

                {lead.address && (
                  <InfoRow
                    label="Location"
                    value={[lead.address.city, lead.address.country].filter(Boolean).join(', ')}
                  />
                )}

                {lead.emails.length > 0 && (
                  <InfoRow label="Email" value={lead.emails[0]?.address ?? '—'} />
                )}

                {lead.phones.length > 0 && (
                  <InfoRow label="Phone" value={lead.phones[0]?.raw ?? '—'} />
                )}

                {lead.socialProfiles?.linkedinUrl && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">LinkedIn</p>
                    <a
                      href={lead.socialProfiles.linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:underline"
                    >
                      View profile <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Right: editable fields ──────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Edit Draft</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* First Line */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="draft-firstline">First Line</Label>
                <span
                  className={`text-xs ${flWordCount > 25 ? 'text-red-400' : 'text-muted-foreground'}`}
                >
                  {flWordCount}/25 words
                </span>
              </div>
              <Input
                id="draft-firstline"
                value={firstLine}
                onChange={(e) => setFirstLine(e.target.value)}
                onBlur={() => handleBlur('firstLine', firstLine)}
                placeholder="Opening line…"
              />
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label htmlFor="draft-subject">Subject</Label>
              <Input
                id="draft-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={() => handleBlur('subject', subject)}
                placeholder="Email subject…"
              />
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="draft-body">Body</Label>
              <Textarea
                id="draft-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => handleBlur('body', body)}
                rows={12}
                placeholder="Email body…"
                className="font-mono text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive gap-1.5"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} />
                Delete
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => approveMutation.mutate()}
                  disabled={isApproved || isSent || approveMutation.isPending}
                  className="gap-1.5"
                >
                  <CheckCircle size={14} />
                  {isApproved || isSent ? 'Approved' : 'Approve'}
                </Button>

                <Button
                  size="sm"
                  onClick={() => sendMutation.mutate()}
                  disabled={!isApproved || isSent || sendMutation.isPending}
                  className="gap-1.5"
                >
                  <Send size={14} />
                  {isSent ? 'Sent' : sendMutation.isPending ? 'Sending…' : 'Send'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
