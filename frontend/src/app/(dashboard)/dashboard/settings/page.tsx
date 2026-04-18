'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import { useWorkspace } from '@/hooks/useWorkspace';
import { apiFetch } from '@/lib/api';
import type { Workspace, KnowledgeBaseEntry } from '@leadreai/shared';
import type { ApiResponse } from '@leadreai/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 20;

const TYPE_LABELS: Record<string, string> = {
  about_company: 'About Company',
  value_proposition: 'Value Proposition',
  target_customer: 'Target Customer',
  tone_guidelines: 'Tone Guidelines',
  other: 'Other',
};

const ENTRY_TYPES = Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryFormState {
  title: string;
  content: string;
  type: string;
}

const EMPTY_FORM: EntryFormState = {
  title: '',
  content: '',
  type: 'about_company',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<ApiResponse<Workspace>>(`/api/v1/workspaces/${workspaceId}`),
    enabled: !!workspaceId,
  });

  const { data: kbData, isLoading: kbLoading } = useQuery({
    queryKey: ['knowledge-base', workspaceId],
    queryFn: () =>
      apiFetch<{ data: KnowledgeBaseEntry[] }>(
        `/api/v1/workspaces/${workspaceId}/knowledge-base`
      ),
    enabled: !!workspaceId,
  });

  const workspace = workspaceData?.data;
  const cheapMode = workspace?.settings?.cheapMode ?? false;
  const entries = kbData?.data ?? [];

  // ── Mutations ──────────────────────────────────────────────────────────────

  const cheapModeMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ settings: { cheapMode: enabled } }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update setting.');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: EntryFormState) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Entry added.');
      void queryClient.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
      closeDialog();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to add entry.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<EntryFormState> }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Entry updated.');
      void queryClient.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
      closeDialog();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to update entry.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Entry deleted.');
      void queryClient.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete entry.');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function openAddDialog() {
    setEditingEntry(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(entry: KnowledgeBaseEntry) {
    setEditingEntry(entry);
    setForm({ title: entry.title, content: entry.content, type: entry.type });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingEntry(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;

    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry._id, payload: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const atLimit = entries.length >= MAX_ENTRIES;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your workspace configuration and AI knowledge base.
        </p>
      </div>

      {/* ── Section 1: General Settings ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">General Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <Switch
              id="cheap-mode"
              checked={cheapMode}
              disabled={cheapModeMutation.isPending || !workspaceId}
              onCheckedChange={(checked) => cheapModeMutation.mutate(checked)}
            />
            <div>
              <Label htmlFor="cheap-mode" className="cursor-pointer font-medium text-foreground">
                Cheap Mode
              </Label>
              <p className="mt-0.5 text-sm text-muted-foreground">
                When enabled, skips SerpAPI calls during prospecting — faster and free but less
                research data.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Knowledge Base ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Knowledge Base</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {entries.length}/{MAX_ENTRIES} entries
              </Badge>
            </div>
            <CardDescription>
              Teach the AI about your product or service to generate better outreach.
            </CardDescription>
          </div>
          <Button
            size="sm"
            disabled={atLimit || !workspaceId}
            onClick={openAddDialog}
            className="shrink-0"
          >
            <Plus size={14} className="mr-1.5" />
            Add Entry
          </Button>
        </CardHeader>

        <CardContent>
          {kbLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading entries…</div>
          ) : entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border py-10 text-center">
              <p className="text-sm font-medium text-foreground">No entries yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add your first knowledge base entry.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-start gap-3 rounded-md border border-border bg-secondary/20 p-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-foreground truncate">
                        {entry.title}
                      </span>
                      <Badge variant="indigo" className="shrink-0 text-xs">
                        {TYPE_LABELS[entry.type] ?? entry.type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {entry.content.slice(0, 100)}
                      {entry.content.length > 100 ? '…' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => openEditDialog(entry)}
                    >
                      <Pencil size={13} />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(entry._id)}
                    >
                      <Trash2 size={13} />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit Entry' : 'Add Entry'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Update this knowledge base entry.'
                : 'Add information to help the AI generate better outreach.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="entry-title">Title</Label>
              <Input
                id="entry-title"
                placeholder="e.g. What we do"
                maxLength={200}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="entry-type">Type</Label>
              <Select
                value={form.type}
                onValueChange={(val) => setForm((f) => ({ ...f, type: val }))}
              >
                <SelectTrigger id="entry-type">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Content */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="entry-content">Content</Label>
                <span className="text-xs text-muted-foreground">
                  {form.content.length}/2000
                </span>
              </div>
              <Textarea
                id="entry-content"
                placeholder="Describe your product, value proposition, audience, tone, etc."
                maxLength={2000}
                rows={6}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : editingEntry ? 'Update' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
