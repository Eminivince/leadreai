'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { PageHelp } from '@/components/ui/PageHelp';
import { Pagination } from '@/components/shared/Pagination';

const PAGE_SIZE = 20;

/* ─────────────────────────────────────────────────────────────────
 * The Library — editorial stack of the user's own source material.
 *
 * Drop a PDF / DOCX / XLSX / CSV / TXT / HTML / MD and the agent
 * has it as searchable context for every dispatch. Files are parsed
 * + chunked + embedded in the background; the UI polls status while
 * any doc is mid-processing.
 * ───────────────────────────────────────────────────────────────── */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const ACCEPTED_EXTS = [
  // documents
  '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.markdown', '.html', '.htm',
  // audio / video (transcribed via Whisper)
  '.mp3', '.m4a', '.wav', '.mp4', '.webm', '.ogg', '.aac', '.flac',
];

type DocStatus = 'pending' | 'parsing' | 'embedding' | 'ready' | 'failed';

interface LibraryDocument {
  _id: string;
  originalFilename: string;
  title?: string;
  fileType: string;
  bytes: number;
  status: DocStatus;
  errorMessage?: string;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  success: true;
  data: { data: LibraryDocument[]; total: number; page: number; limit: number };
}

function bytesLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/**
 * Status pill spec — same shape used across the dashboard for live
 * state (running jobs, dispatched leads, library docs). Dot colour
 * encodes status; label is lowercase mono. The "live" branch returns
 * `pulse: true` so the row can render a ping animation alongside.
 */
function statusTone(s: DocStatus): {
  label: string;
  dotClass: string;
  textClass: string;
  pulse: boolean;
} {
  switch (s) {
    case 'ready':
      return {
        label: 'ready',
        dotClass: 'bg-[color:var(--ember)]',
        textClass: 'text-[color:var(--ember-2)]',
        pulse: false,
      };
    case 'failed':
      return {
        label: 'failed',
        dotClass: 'bg-[color:var(--warn)]',
        textClass: 'text-[color:var(--warn)]',
        pulse: false,
      };
    case 'pending':
      return {
        label: 'queued',
        dotClass: 'bg-[color:var(--ink-3)]',
        textClass: 'text-[color:var(--ink-3)]',
        pulse: true,
      };
    case 'parsing':
      return {
        label: 'parsing',
        dotClass: 'bg-[color:var(--ink-2)]',
        textClass: 'text-[color:var(--ink-2)]',
        pulse: true,
      };
    case 'embedding':
      return {
        label: 'indexing',
        dotClass: 'bg-[color:var(--ink-2)]',
        textClass: 'text-[color:var(--ink-2)]',
        pulse: true,
      };
    default:
      return {
        label: s,
        dotClass: 'bg-[color:var(--ink-3)]',
        textClass: 'text-[color:var(--ink-3)]',
        pulse: false,
      };
  }
}

/* ── Icons ─────────────────────────────────────────────────────── */

function TrashIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
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

function UploadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 16V4m0 0-4 4m4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <polyline
        points="20 6 9 17 4 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── BulkBar ────────────────────────────────────────────────────── */

interface BulkBarProps {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  isDeleting: boolean;
}

function BulkBar({ count, onDelete, onClear, isDeleting }: BulkBarProps) {
  const [confirming, setConfirming] = useState(false);

  function handleDeleteClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onDelete();
  }

  function handleClear() {
    setConfirming(false);
    onClear();
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-up">
      <div className="flex items-center gap-3 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-3 rounded-xl shadow-2xl border border-[color:var(--paper)]/10">
        <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">
          {count} selected
        </span>

        <span className="w-px h-5 bg-[color:var(--paper)]/20 shrink-0" />

        <button
          onClick={handleDeleteClick}
          disabled={isDeleting}
          className={`flex items-center gap-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap disabled:opacity-50 ${
            confirming
              ? 'text-[color:var(--warn)] font-semibold'
              : 'text-[color:var(--warn)] hover:opacity-80'
          }`}
        >
          <TrashIcon className="w-3.5 h-3.5" />
          {isDeleting ? 'Deleting…' : confirming ? 'Confirm delete' : 'Delete'}
        </button>

        {confirming && (
          <button
            onClick={() => setConfirming(false)}
            className="text-[12px] text-[color:var(--paper)]/60 hover:text-[color:var(--paper)] transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
        )}

        <span className="w-px h-5 bg-[color:var(--paper)]/20 shrink-0" />

        <button
          onClick={handleClear}
          className="p-1 text-[color:var(--paper)]/50 hover:text-[color:var(--paper)] transition-colors rounded"
          aria-label="Clear selection"
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

export default function LibraryPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['library', workspaceId],
    queryFn: () =>
      apiFetch<ListResponse>(`/api/v1/workspaces/${workspaceId}/library?limit=100`),
    enabled: !!workspaceId,
    // Keep polling while any doc is still processing.
    refetchInterval: (query) => {
      const res = query.state.data as ListResponse | undefined;
      const rows = res?.data?.data ?? [];
      const anyInFlight = rows.some((d) =>
        d.status === 'pending' || d.status === 'parsing' || d.status === 'embedding',
      );
      return anyInFlight ? 4000 : false;
    },
  });

  const docs = useMemo(() => data?.data?.data ?? [], [data]);
  const total = data?.data?.total ?? 0;

  const summary = useMemo(() => {
    const ready = docs.filter((d) => d.status === 'ready').length;
    const inFlight = docs.filter(
      (d) => d.status === 'pending' || d.status === 'parsing' || d.status === 'embedding',
    ).length;
    const failed = docs.filter((d) => d.status === 'failed').length;
    return { ready, inFlight, failed };
  }, [docs]);

  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/library/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Removed from the Library.');
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove.'),
  });

  const retryMutation = useMutation({
    mutationFn: (documentId: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/library/${documentId}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Re-queued for processing.');
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Retry failed.'),
  });

  /* ── Selection helpers ── */

  const allSelected = docs.length > 0 && selected.size === docs.length;
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(docs.map((d) => d._id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (!workspaceId || selected.size === 0) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          apiFetch(`/api/v1/workspaces/${workspaceId}/library/${id}`, { method: 'DELETE' }),
        ),
      );
      toast.success(`Removed ${selected.size} ${selected.size === 1 ? 'document' : 'documents'}.`);
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk delete failed.');
    } finally {
      setBulkDeleting(false);
    }
  }

  /* ── Upload helpers ── */

  async function uploadFile(file: File) {
    if (!workspaceId) return;
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast.error(`Unsupported file type: ${ext}. Try PDF, DOCX, XLSX, CSV, TXT, MD, or HTML.`);
      return;
    }

    setUploading(true);
    try {
      const token = getAccessToken();
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`${API_BASE}/api/v1/workspaces/${workspaceId}/library`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(json?.error?.message ?? 'Upload failed.');
      }
      toast.success(`Uploaded ${file.name}.`);
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Upload sequentially — simpler UX and keeps the server warm.
    for (const file of Array.from(files)) {
      await uploadFile(file);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function onDragLeave() {
    setIsDragging(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    await onFilesChosen(e.dataTransfer.files);
  }

  const pagedDocs = docs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10 animate-fade-up">
      {/* Settings → Context breadcrumb. Library is now framed as
          configuration (the agent's reading list); users reach it
          from Settings rather than the primary nav. */}
      <div className="flex items-center gap-1.5 mb-3 font-mono text-[10.5px] text-[color:var(--ink-3)]">
        <Link
          href="/dashboard/settings"
          className="hover:text-[color:var(--ink)] transition-colors"
        >
          Settings
        </Link>
        <span className="text-[color:var(--ink-3)]/60">/</span>
        <span className="text-[color:var(--ink-2)]">Context</span>
      </div>
      <section className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 flex-wrap">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
              Context
            </h1>
            <span className="font-mono text-[12px] tabular-nums text-[color:var(--ink-3)]">
              {isLoading ? '...' : total}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] text-[color:var(--ink-3)]">
            Documents the agent reads on every search.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageHelp
            title="Context"
            body="Documents the agent reads on every search — pitch decks, ICP notes, portfolio lists, case studies. Upload them once; they shape the results of every dispatch from then on."
            tips={[
              'Upload PDF, DOCX, or TXT files. They are parsed and indexed automatically.',
              'Select documents to delete them in bulk.',
              'The more specific your documents, the more targeted your searches will be.',
            ]}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--ember)] transition-colors disabled:opacity-50"
          >
            <UploadIcon className="w-3.5 h-3.5" />
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </section>

      {/* Drop zone — same rounded-xl card pattern, soft amber accent
          when dragging. No italic copy, no editorial framing. */}
      <section
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
        onClick={() => inputRef.current?.click()}
        className={`mb-6 border border-dashed rounded-xl transition-all cursor-pointer text-center px-6 py-9 ${
          isDragging
            ? 'border-[color:var(--ember)]/60 bg-[color:var(--ember)]/[0.04] shadow-[0_0_0_4px_color-mix(in_srgb,var(--ember)_8%,transparent)]'
            : 'border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 hover:border-[color:var(--ink-3)] hover:bg-[color:var(--paper-2)]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_EXTS.join(',')}
          onChange={(e) => void onFilesChosen(e.target.files)}
        />
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[color:var(--paper)] border border-[color:var(--rule)] mb-3 text-[color:var(--ink-2)]">
          <UploadIcon />
        </div>
        <div className="text-[14px] font-medium text-[color:var(--ink)]">
          Drop files here, or click to browse
        </div>
        <p className="mt-1.5 font-mono text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)]">
          PDF · DOCX · XLSX · CSV · TXT · MD · HTML · MP3 · M4A · WAV · MP4 · WebM
          <span className="text-[color:var(--ink-3)]/60 ml-1.5">— up to 25MB</span>
        </p>
      </section>

      {/* Summary strip — only when there's data, mono tabular pills */}
      {(docs.length > 0 || isLoading) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {summary.ready > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ember)]/30 bg-[color:var(--ember)]/[0.06] px-2 h-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ember)]" aria-hidden />
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ember-2)]">
                {summary.ready} ready
              </span>
            </span>
          )}
          {summary.inFlight > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper)] px-2 h-6">
              <span className="relative inline-flex">
                <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-2)]" />
                <span className="absolute inset-0 inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--ink-2)] opacity-60 animate-ping" />
              </span>
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-2)]">
                {summary.inFlight} processing
              </span>
            </span>
          )}
          {summary.failed > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--warn)]/30 bg-[color:var(--warn)]/[0.04] px-2 h-6">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--warn)]" aria-hidden />
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--warn)]">
                {summary.failed} failed
              </span>
            </span>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center">
          <span className="font-mono text-[12px] text-[color:var(--ink-3)]">Loading the library…</span>
        </div>
      ) : docs.length === 0 ? (
        <div className="border border-[color:var(--rule)] bg-[color:var(--paper-2)]/40 rounded-xl p-10 md:p-12 text-center">
          <h3 className="text-[15px] font-semibold text-[color:var(--ink)]">No documents yet</h3>
          <p className="mt-1.5 text-[13px] text-[color:var(--ink-2)] max-w-[420px] mx-auto leading-[1.55]">
            Drop a pitch deck, portfolio list, or ICP doc into the zone above and the
            agent will start citing it on every search.
          </p>
        </div>
      ) : (
        <>
          {/* Select-all row — same pattern as Tables / Files */}
          <div className="flex items-center justify-between gap-3 mb-3 min-h-[24px]">
            <button
              onClick={allSelected ? clearSelection : selectAll}
              className="flex items-center gap-2 text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
            >
              <span
                className={`w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors ${
                  allSelected
                    ? 'bg-[color:var(--ink)] border-[color:var(--ink)]'
                    : someSelected
                      ? 'bg-[color:var(--ink)]/20 border-[color:var(--ink)]'
                      : 'border-[color:var(--rule)] bg-[color:var(--paper)]'
                }`}
              >
                {(allSelected || someSelected) && (
                  <CheckIcon className="w-2.5 h-2.5 text-[color:var(--paper)]" />
                )}
              </span>
              <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
            </button>
            {someSelected && (
              <span className="font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)]">
                {selected.size} / {docs.length}
              </span>
            )}
          </div>

          {/* List card */}
          <ul className="rounded-xl border border-[color:var(--rule)] overflow-hidden bg-[color:var(--paper)]">
            {pagedDocs.map((d) => {
              const tone = statusTone(d.status);
              const canRetry = d.status === 'failed';
              const isSelected = selected.has(d._id);
              return (
                <li
                  key={d._id}
                  className={`group flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 border-b border-[color:var(--rule)] last:border-b-0 transition-colors ${
                    isSelected
                      ? 'bg-[color:var(--paper-2)]'
                      : 'hover:bg-[color:var(--paper-2)]/60'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOne(d._id);
                    }}
                    className={`shrink-0 w-4 h-4 rounded-[3px] border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[color:var(--ink)] border-[color:var(--ink)] opacity-100'
                        : `border-[color:var(--rule)] bg-[color:var(--paper)] ${someSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`
                    }`}
                    aria-label={isSelected ? 'Deselect document' : 'Select document'}
                  >
                    {isSelected && <CheckIcon className="w-2.5 h-2.5 text-[color:var(--paper)]" />}
                  </button>

                  {/* Title + meta — clickable, takes the user to the doc detail */}
                  <button
                    onClick={() => router.push(`/dashboard/library/${d._id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="text-[13.5px] font-medium text-[color:var(--ink)] truncate group-hover:text-[color:var(--ember)] transition-colors">
                      {d.title ?? d.originalFilename}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] truncate">
                      {d.fileType.toUpperCase()} · {bytesLabel(d.bytes)}
                      {d.pageCount ? ` · ${d.pageCount}p` : ''}
                      {d.chunkCount ? ` · ${d.chunkCount} chunks` : ''}
                      {d.status === 'failed' && d.errorMessage
                        ? ` · ${d.errorMessage.slice(0, 100)}`
                        : ''}
                    </div>
                  </button>

                  {/* Status pill — dot + lowercase mono */}
                  <span
                    className={`hidden md:inline-flex items-center gap-1.5 shrink-0 ${tone.textClass}`}
                  >
                    {tone.pulse ? (
                      <span className="relative inline-flex">
                        <span className={`relative inline-block w-1.5 h-1.5 rounded-full ${tone.dotClass}`} />
                        <span className={`absolute inset-0 inline-block w-1.5 h-1.5 rounded-full ${tone.dotClass} opacity-60 animate-ping`} />
                      </span>
                    ) : (
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${tone.dotClass}`} />
                    )}
                    <span className="font-mono text-[10.5px]">{tone.label}</span>
                  </span>

                  {/* Relative time */}
                  <span className="hidden sm:inline font-mono text-[10.5px] tabular-nums text-[color:var(--ink-3)] whitespace-nowrap shrink-0 w-14 text-right">
                    {relativeTime(d.createdAt)}
                  </span>

                  {/* Actions — visible on hover */}
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canRetry && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          retryMutation.mutate(d._id);
                        }}
                        disabled={retryMutation.isPending}
                        title="Retry processing"
                        className="text-[11.5px] font-medium text-[color:var(--ember-2)] hover:text-[color:var(--ember)] transition-colors disabled:opacity-60 px-2 h-7 rounded-md hover:bg-[color:var(--paper-3)]"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(d._id);
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 rounded-md text-[color:var(--ink-3)] hover:text-[color:var(--warn)] hover:bg-[color:var(--paper-3)] transition-colors disabled:opacity-60"
                      title="Remove"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination — auto-hides when ≤ 20 docs */}
          <Pagination
            page={page}
            total={docs.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel={docs.length === 1 ? 'document' : 'documents'}
          />
        </>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <BulkBar
          count={selected.size}
          onDelete={() => void bulkDelete()}
          onClear={clearSelection}
          isDeleting={bulkDeleting}
        />
      )}
    </div>
  );
}
