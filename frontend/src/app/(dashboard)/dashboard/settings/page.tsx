'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus, Mail, CheckCircle2 } from 'lucide-react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKeyMeta {
  _id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

type EmailProvider = 'smtp' | 'resend' | 'sendgrid';

interface EmailConfig {
  provider: EmailProvider;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  apiKey?: string;        // only sent on save, never returned
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;      // only sent on save, never returned
  hasApiKey?: boolean;
  hasSmtpPass?: boolean;
  verifiedAt?: string;
}

const EMPTY_EMAIL_FORM: Omit<EmailConfig, 'provider'> & { provider: EmailProvider } = {
  provider: 'resend',
  fromEmail: '',
  fromName: '',
  replyTo: '',
  apiKey: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
};

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

// ─── KB Types ─────────────────────────────────────────────────────────────────

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

  // KB dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KnowledgeBaseEntry | null>(null);
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM);

  // Email config form state
  const [emailForm, setEmailForm] = useState<typeof EMPTY_EMAIL_FORM>(EMPTY_EMAIL_FORM);
  const [emailFormDirty, setEmailFormDirty] = useState(false);

  // API key state
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<ApiResponse<Workspace>>(`/api/v1/workspaces/${workspaceId}`),
    enabled: !!workspaceId,
  });

  const { data: emailConfigData } = useQuery({
    queryKey: ['email-config', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: EmailConfig | null }>(
        `/api/v1/workspaces/${workspaceId}/email-config`
      ),
    enabled: !!workspaceId,
    select: (r) => r.data,
  });

  const { data: kbData, isLoading: kbLoading } = useQuery({
    queryKey: ['knowledge-base', workspaceId],
    queryFn: () =>
      apiFetch<{ data: KnowledgeBaseEntry[] }>(
        `/api/v1/workspaces/${workspaceId}/knowledge-base`
      ),
    enabled: !!workspaceId,
  });

  const { data: apiKeysQuery } = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () =>
      apiFetch<{ success: true; data: ApiKeyMeta[] }>(
        `/api/v1/workspaces/${workspaceId}/api-keys`
      ),
    enabled: !!workspaceId,
    select: (r) => r.data,
  });

  const apiKeysData = apiKeysQuery ?? [];

  const workspace = workspaceData?.data;
  const cheapMode = workspace?.settings?.cheapMode ?? false;
  const entries = kbData?.data ?? [];

  // Seed email form when config loads (only if user hasn't started editing)
  useEffect(() => {
    if (emailConfigData && !emailFormDirty) {
      const cfg = emailConfigData;
      setEmailForm({
        provider: cfg.provider,
        fromEmail: cfg.fromEmail,
        fromName: cfg.fromName ?? '',
        replyTo: cfg.replyTo ?? '',
        smtpHost: cfg.smtpHost ?? '',
        smtpPort: cfg.smtpPort ?? 587,
        smtpSecure: cfg.smtpSecure ?? false,
        smtpUser: cfg.smtpUser ?? '',
        apiKey: '',
        smtpPass: '',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailConfigData]);

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

  const saveEmailMutation = useMutation({
    mutationFn: (payload: typeof EMPTY_EMAIL_FORM) => {
      const body: Record<string, unknown> = {
        provider: payload.provider,
        fromEmail: payload.fromEmail,
        fromName: payload.fromName,
        replyTo: payload.replyTo || undefined,
      };
      if (payload.provider !== 'smtp' && payload.apiKey) body['apiKey'] = payload.apiKey;
      if (payload.provider === 'smtp') {
        body['smtpHost'] = payload.smtpHost;
        body['smtpPort'] = payload.smtpPort;
        body['smtpSecure'] = payload.smtpSecure;
        if (payload.smtpUser) body['smtpUser'] = payload.smtpUser;
        if (payload.smtpPass) body['smtpPass'] = payload.smtpPass;
      }
      return apiFetch(`/api/v1/workspaces/${workspaceId}/email-config`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success('Email configuration saved.');
      setEmailFormDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['email-config', workspaceId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to save email config.');
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ success: true; data: { key: string; prefix: string; name: string } }>(
        `/api/v1/workspaces/${workspaceId}/api-keys`,
        { method: 'POST', body: JSON.stringify({ name }) }
      ),
    onSuccess: (res) => {
      setCreatedKey(res.data.key);
      setNewKeyName('');
      void queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to generate API key.');
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/api-keys/${keyId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('API key revoked.');
      void queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke API key.');
    },
  });

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

      {/* ── Section 2: Email Configuration ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Email Configuration</CardTitle>
          </div>
          <CardDescription>
            Connect your email provider so outreach is sent from your own domain and address.
          </CardDescription>
          {emailConfigData?.verifiedAt && (
            <div className="flex items-center gap-1.5 text-xs text-green-400 mt-1">
              <CheckCircle2 size={12} />
              Connected · {emailConfigData.fromEmail}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveEmailMutation.mutate(emailForm);
            }}
            className="space-y-4"
          >
            {/* Provider */}
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={emailForm.provider}
                onValueChange={(v) => {
                  setEmailFormDirty(true);
                  setEmailForm((f) => ({ ...f, provider: v as EmailProvider }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">Resend</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="smtp">SMTP (Gmail, Outlook, custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* From fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from-name">From Name</Label>
                <Input
                  id="from-name"
                  placeholder="Acme Sales"
                  value={emailForm.fromName}
                  onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, fromName: e.target.value })); }}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-email">From Email</Label>
                <Input
                  id="from-email"
                  type="email"
                  placeholder="outreach@yourcompany.com"
                  value={emailForm.fromEmail}
                  onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, fromEmail: e.target.value })); }}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reply-to">Reply-To <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="reply-to"
                type="email"
                placeholder="Same as From Email"
                value={emailForm.replyTo ?? ''}
                onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, replyTo: e.target.value })); }}
              />
            </div>

            {/* API key providers */}
            {(emailForm.provider === 'resend' || emailForm.provider === 'sendgrid') && (
              <div className="space-y-1.5">
                <Label htmlFor="api-key">
                  API Key
                  {emailConfigData?.hasApiKey && (
                    <span className="ml-2 text-xs text-green-400">· saved (leave blank to keep)</span>
                  )}
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={emailConfigData?.hasApiKey ? '••••••••••••••••' : 'sk_live_…'}
                  value={emailForm.apiKey ?? ''}
                  onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, apiKey: e.target.value })); }}
                  required={!emailConfigData?.hasApiKey}
                />
              </div>
            )}

            {/* SMTP fields */}
            {emailForm.provider === 'smtp' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder="smtp.gmail.com"
                      value={emailForm.smtpHost ?? ''}
                      onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, smtpHost: e.target.value })); }}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      value={emailForm.smtpPort ?? 587}
                      onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, smtpPort: Number(e.target.value) })); }}
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-user">Username</Label>
                    <Input
                      id="smtp-user"
                      placeholder="you@gmail.com"
                      value={emailForm.smtpUser ?? ''}
                      onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, smtpUser: e.target.value })); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp-pass">
                      Password / App Password
                      {emailConfigData?.hasSmtpPass && (
                        <span className="ml-2 text-xs text-green-400">· saved</span>
                      )}
                    </Label>
                    <Input
                      id="smtp-pass"
                      type="password"
                      placeholder={emailConfigData?.hasSmtpPass ? '••••••••' : 'App password'}
                      value={emailForm.smtpPass ?? ''}
                      onChange={(e) => { setEmailFormDirty(true); setEmailForm((f) => ({ ...f, smtpPass: e.target.value })); }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" disabled={saveEmailMutation.isPending || !workspaceId}>
                {saveEmailMutation.isPending ? 'Saving…' : 'Save Email Config'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Section 3: Knowledge Base ─────────────────────────────────────── */}
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

      {/* ── Section 4: API Keys ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">API Keys</CardTitle>
          <CardDescription>
            Generate workspace-scoped API keys for programmatic access. Keys are shown once — save them securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(e) => { e.preventDefault(); if (newKeyName.trim()) createKeyMutation.mutate(newKeyName.trim()); }}
            className="flex gap-2"
          >
            <Input
              placeholder="Key name (e.g. Production)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              maxLength={100}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={createKeyMutation.isPending || !newKeyName.trim()}>
              Generate
            </Button>
          </form>

          {createdKey && (
            <div className="rounded-md border border-green-600/30 bg-green-600/10 p-3 text-xs">
              <p className="mb-1 font-medium text-green-400">Copy this key — it will not be shown again:</p>
              <code className="block break-all text-green-300 select-all">{createdKey}</code>
              <Button variant="ghost" size="sm" className="mt-2 h-6 text-xs" onClick={() => { void navigator.clipboard.writeText(createdKey); toast.success('Copied'); }}>
                Copy
              </Button>
            </div>
          )}

          {apiKeysData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          ) : (
            <div className="space-y-2">
              {apiKeysData.map((k) => (
                <div key={k._id} className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground">{k.prefix}•••• · Created {new Date(k.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeKeyMutation.mutate(k._id)}
                    disabled={revokeKeyMutation.isPending}
                  >
                    <Trash2 size={13} />
                  </Button>
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
