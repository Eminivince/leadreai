'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import type { KnowledgeBaseEntry } from '@leadreai/shared';
import {
  Label,
  HairlineInput,
  HairlineTextarea,
  HairlineSelect,
  SectionHead,
  PrimaryButton,
  GhostButton,
} from '@/components/settings/primitives';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/* ─────────────────────────────────────────────────────────────────
 * Knowledge base — house style.
 * Same endpoints as the previous settings page, re-skinned editorially.
 * Max 20 entries; types: about_company / value_proposition / etc.
 * ───────────────────────────────────────────────────────────────── */

const MAX_ENTRIES = 20;

const TYPE_LABELS: Record<string, string> = {
  about_company: 'About the company',
  value_proposition: 'Value proposition',
  target_customer: 'Target customer',
  tone_guidelines: 'Tone guidelines',
  other: 'Other',
};
const ENTRY_TYPES = Object.keys(TYPE_LABELS);

interface FormState {
  title: string;
  content: string;
  type: string;
}
const EMPTY_FORM: FormState = { title: '', content: '', type: 'about_company' };

function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EditGlyph({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M17 3 21 7l-11 11H6v-4L17 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TrashGlyph({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function KnowledgeBaseSettingsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBaseEntry | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['knowledge-base', workspaceId],
    queryFn: () =>
      apiFetch<{ data: KnowledgeBaseEntry[] }>(
        `/api/v1/workspaces/${workspaceId}/knowledge-base`,
      ),
    enabled: !!workspaceId,
  });
  const entries = data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: FormState) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Entry saved.');
      qc.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
      closeDialog();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to file entry.'),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: FormState }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('Entry updated.');
      qc.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
      closeDialog();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update.'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/knowledge-base/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Entry removed.');
      qc.invalidateQueries({ queryKey: ['knowledge-base', workspaceId] });
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to delete.');
      setDeleteTarget(null);
    },
  });

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function openEdit(entry: KnowledgeBaseEntry) {
    setEditing(entry);
    setForm({ title: entry.title, content: entry.content, type: entry.type });
    setDialogOpen(true);
  }
  function closeDialog() {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const atLimit = entries.length >= MAX_ENTRIES;

  return (
    <div className="flex flex-col gap-14">
      <section>
        <SectionHead
          n="01"
          title={
            <>
              House style{' '}
              <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] not-italic ml-3">
                {entries.length} / {MAX_ENTRIES}
              </span>
            </>
          }
        />
        <div className="">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <p className=" text-[14px] leading-[1.5] text-[color:var(--ink-2)] max-w-[560px]">
              Entries teach the agent what to say, how to say it, and who you sell to. The engine
              reads these when drafting outreach and ranking leads.
            </p>
            <div className="self-start sm:self-auto">
              <PrimaryButton type="button" onClick={openAdd} disabled={atLimit || !workspaceId}>
                {atLimit ? 'At limit' : 'Add entry'}
              </PrimaryButton>
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 text-center  text-[14px] text-[color:var(--ink-2)]">
              Loading entries…
            </div>
          ) : entries.length === 0 ? (
            <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-12 text-center">
              <h4 className="text-[15px] font-semibold text-[color:var(--ink)]">
                No entries yet
              </h4>
              <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[420px] mx-auto leading-[1.55]">
                Start with an <span className="font-medium text-[color:var(--ink)]">About the company</span> entry — the agent will quote it when drafting outreach.
              </p>
            </div>
          ) : (
            <ol className="border-t border-[color:var(--rule)]">
              {entries.map((entry) => (
                <li
                  key={entry._id}
                  className="grid grid-cols-[1fr_auto] gap-6 items-start py-5 border-b border-[color:var(--rule)]/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <h4 className=" text-[18px] leading-tight text-[color:var(--ink)]">
                        {entry.title}
                      </h4>
                      <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-2)] border border-[color:var(--rule)] px-2 py-0.5 bg-[color:var(--paper-3)]">
                        {TYPE_LABELS[entry.type] ?? entry.type}
                      </span>
                    </div>
                    <p className=" text-[13.5px] leading-[1.55] text-[color:var(--ink-2)]">
                      {entry.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(entry)}
                      className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
                      title="Edit"
                    >
                      <EditGlyph />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: entry._id, name: entry.title })}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60"
                      title="Delete"
                      aria-label={`Delete knowledge-base entry ${entry.title}`}
                    >
                      <TrashGlyph />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Dialog */}
      {dialogOpen && (
        <>
          <style>{`
            @keyframes kbFade { from { opacity: 0 } to { opacity: 1 } }
            @keyframes kbSlide  { from { transform: translateX(16px); opacity: 0 } to { transform: none; opacity: 1 } }
          `}</style>
          <div className="fixed inset-0 z-[70] flex justify-end">
            <div
              className="absolute inset-0 bg-[color:var(--ink)]/30"
              style={{ animation: 'kbFade .18s ease-out both' }}
              onClick={closeDialog}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.title.trim() || !form.content.trim()) return;
                if (editing) {
                  updateMutation.mutate({ id: editing._id, payload: form });
                } else {
                  createMutation.mutate(form);
                }
              }}
              className="relative w-full sm:max-w-[560px] h-full bg-[color:var(--paper)] border-l border-[color:var(--rule)] overflow-y-auto"
              style={{ animation: 'kbSlide .26s cubic-bezier(.2,.9,.25,1) both' }}
            >
              <div className="flex items-center justify-between px-5 sm:px-7 pt-6 sm:pt-7 pb-4 border-b border-[color:var(--rule)]">
                <span className="font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)]">
                  {editing ? 'Edit entry' : 'New entry'}
                </span>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="px-5 sm:px-7 pt-5 pb-4 border-b border-[color:var(--rule)]">
                <h2 className="text-[18px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
                  {editing ? editing.title : 'Add a knowledge entry'}
                </h2>
                <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
                  Anything the agent should remember about your company or how you write.
                </p>
              </div>

              <div className="px-5 sm:px-7 py-6 sm:py-7 flex flex-col gap-6">
                <div>
                  <Label>Title</Label>
                  <HairlineInput
                    placeholder="e.g. What we do"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    maxLength={200}
                    required
                  />
                </div>
                <div>
                  <Label>Type</Label>
                  <HairlineSelect
                    value={form.type}
                    onChange={(v) => setForm((f) => ({ ...f, type: v }))}
                  >
                    {ENTRY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </HairlineSelect>
                </div>
                <div>
                  <div className="flex items-baseline justify-between mb-2">
                    <Label>Content</Label>
                    <span className="font-mono text-[10px] text-[color:var(--ink-3)]">
                      {form.content.length} / 2000
                    </span>
                  </div>
                  <HairlineTextarea
                    rows={10}
                    placeholder="Describe your product, audience, tone, or proof points."
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    maxLength={2000}
                    required
                  />
                </div>
              </div>

              <div className="sticky bottom-0 bg-[color:var(--paper)] border-t border-[color:var(--rule)] px-5 sm:px-7 py-4 flex items-center justify-end gap-3">
                <GhostButton type="button" onClick={closeDialog} disabled={isSaving}>
                  Cancel
                </GhostButton>
                <PrimaryButton type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving…' : editing ? 'Update entry' : 'File entry'}
                </PrimaryButton>
              </div>
            </form>
          </div>
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => { if (!next) setDeleteTarget(null); }}
        title="Delete this entry?"
        description="The agent will lose this context on its next run. This cannot be undone."
        itemName={deleteTarget?.name}
        confirmLabel="Delete entry"
        loading={deleteMutation.isPending}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
      />
    </div>
  );
}
