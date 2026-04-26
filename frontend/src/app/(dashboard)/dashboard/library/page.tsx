'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { ArrowEast, GhostButton } from '@/components/settings/primitives';

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

function statusTone(s: DocStatus): { label: string; className: string } {
  switch (s) {
    case 'ready':
      return {
        label: 'Filed',
        className: 'text-[color:var(--forest)] border-[color:var(--forest)]/40',
      };
    case 'failed':
      return {
        label: 'Failed',
        className: 'text-[color:var(--warn)] border-[color:var(--warn)]/40',
      };
    case 'pending':
    case 'parsing':
    case 'embedding':
      return {
        label: s === 'pending' ? 'Queued' : s === 'parsing' ? 'Parsing' : 'Embedding',
        className: 'text-[color:var(--ink-2)] border-[color:var(--rule)]',
      };
    default:
      return { label: s, className: 'text-[color:var(--ink-3)] border-[color:var(--rule)]' };
  }
}

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

export default function LibraryPage() {
  const router = useRouter();
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const docs = data?.data?.data ?? [];
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

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-12">
      {/* Hero */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-5">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            The library
          </span>
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-[780px]">
            <h1 className="font-[family-name:var(--font-instrument-serif)] text-[44px] md:text-[60px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
              Your <em className="italic text-[color:var(--forest)]">source material</em>.
            </h1>
            <p className="mt-4 font-[family-name:var(--font-barlow)] text-[15px] leading-[1.55] text-[color:var(--ink-2)]">
              Drop in pitch decks, portfolio lists, ICP notes, case studies — anything that should inform a
              dispatch. We parse, chunk, and index each file so the agent can quote them back to you while
              researching.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <GhostButton
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload file'}
            </GhostButton>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2.5 rounded-full font-[family-name:var(--font-barlow)] text-[13px] font-medium hover:bg-[color:var(--forest)] transition-colors"
            >
              Back to the desk <ArrowEast className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Drop zone */}
      <section
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
        onClick={() => inputRef.current?.click()}
        className={`mb-10 border-2 border-dashed rounded-sm transition-colors cursor-pointer text-center px-6 py-12 ${
          isDragging
            ? 'border-[color:var(--ink)] bg-[color:var(--paper-3)]'
            : 'border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 hover:border-[color:var(--ink-2)]'
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
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[color:var(--paper)] border border-[color:var(--rule)] mb-3 text-[color:var(--ink-2)]">
          <UploadIcon />
        </div>
        <div className="font-[family-name:var(--font-instrument-serif)] text-[22px] text-[color:var(--ink)]">
          Drop files here <em className="italic text-[color:var(--forest)]">or click to browse</em>
        </div>
        <p className="mt-2 font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-2)]">
          Docs: PDF · DOCX · XLSX · CSV · TXT · MD · HTML — Audio: MP3 · M4A · WAV · MP4 · WebM — up to 25MB each
        </p>
      </section>

      {/* Summary strip */}
      {(docs.length > 0 || isLoading) && (
        <div className="flex items-center gap-6 pb-4 mb-6 border-b border-[color:var(--rule)] flex-wrap">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
            {total} {total === 1 ? 'file' : 'files'}
          </span>
          {summary.inFlight > 0 && (
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)] tabular-nums">
              {summary.inFlight} processing…
            </span>
          )}
          {summary.failed > 0 && (
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--warn)] tabular-nums">
              {summary.failed} failed
            </span>
          )}
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--forest)] tabular-nums">
            {summary.ready} searchable
          </span>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="py-12 text-center font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-2)]">
          Loading the library…
        </div>
      ) : docs.length === 0 ? (
        <div className="py-20 text-center">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            Empty shelf
          </span>
          <h3 className="mt-3 font-[family-name:var(--font-instrument-serif)] text-[28px] text-[color:var(--ink)]">
            Nothing filed yet.
          </h3>
          <p className="mt-2 font-[family-name:var(--font-barlow)] italic text-[14px] text-[color:var(--ink-2)]">
            Drop a pitch deck, portfolio list, or ICP doc above and the agent will start citing it.
          </p>
        </div>
      ) : (
        <ul>
          {docs.map((d, i) => {
            const tone = statusTone(d.status);
            const canRetry = d.status === 'failed';
            return (
              <li
                key={d._id}
                className="grid grid-cols-[40px_1fr_auto_auto_auto] gap-4 items-center py-3 border-b border-[color:var(--rule)]/70 hover:bg-[color:var(--paper-3)]/60 transition-colors"
              >
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <button
                  onClick={() => router.push(`/dashboard/library/${d._id}`)}
                  className="min-w-0 text-left"
                >
                  <div className="font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink)] truncate">
                    {d.title ?? d.originalFilename}
                  </div>
                  <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] text-[color:var(--ink-3)] truncate">
                    {d.fileType.toUpperCase()} · {bytesLabel(d.bytes)}
                    {d.pageCount ? ` · ${d.pageCount} pages` : ''}
                    {d.chunkCount ? ` · ${d.chunkCount} chunks` : ''}
                    {d.status === 'failed' && d.errorMessage
                      ? ` · ${d.errorMessage.slice(0, 120)}`
                      : ''}
                  </div>
                </button>
                <span
                  className={`font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.18em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${tone.className}`}
                >
                  {tone.label}
                </span>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] tabular-nums whitespace-nowrap">
                  {relativeTime(d.createdAt)}
                </span>
                <div className="flex items-center gap-1">
                  {canRetry && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        retryMutation.mutate(d._id);
                      }}
                      disabled={retryMutation.isPending}
                      title="Retry processing"
                      className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--forest)] hover:text-[color:var(--ink)] transition disabled:opacity-60 px-1.5"
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
                    className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--warn)] transition disabled:opacity-60"
                    title="Remove"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
