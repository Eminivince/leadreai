'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import { ArrowEast, GhostButton, PrimaryButton } from '@/components/settings/primitives';

/* ─────────────────────────────────────────────────────────────────
 * Library — single document view.
 *
 * Shows metadata header, inline-editable title, retry-on-failed,
 * paginated chunk list so the user can see exactly what the agent
 * is working with. Deliberately read-only otherwise: chunks are
 * derived state from the uploaded file.
 * ───────────────────────────────────────────────────────────────── */

interface LibraryDocument {
  _id: string;
  originalFilename: string;
  title?: string;
  fileType: string;
  mimeType?: string;
  bytes: number;
  status: 'pending' | 'parsing' | 'embedding' | 'ready' | 'failed';
  errorMessage?: string;
  pageCount?: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface Chunk {
  _id: string;
  idx: number;
  pageHint?: number;
  text: string;
  embeddingDims: number;
}

interface DocResponse {
  success: true;
  data: LibraryDocument;
}

interface ChunksResponse {
  success: true;
  data: { data: Chunk[]; total: number; page: number; limit: number };
}

function bytesLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function statusTone(s: LibraryDocument['status']): { label: string; className: string } {
  switch (s) {
    case 'ready':
      return { label: 'Filed', className: 'text-[color:var(--ember)] border-[color:var(--ember)]/40' };
    case 'failed':
      return { label: 'Failed', className: 'text-[color:var(--warn)] border-[color:var(--warn)]/40' };
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

export default function LibraryDocumentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const documentId = params.documentId as string;
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [page, setPage] = useState(1);
  const CHUNK_PAGE_SIZE = 25;

  const { data: docData, isLoading: docLoading } = useQuery({
    queryKey: ['library-doc', workspaceId, documentId],
    queryFn: () =>
      apiFetch<DocResponse>(`/api/v1/workspaces/${workspaceId}/library/${documentId}`),
    enabled: !!workspaceId && !!documentId,
    refetchInterval: (q) => {
      const res = q.state.data as DocResponse | undefined;
      const s = res?.data?.status;
      return s === 'pending' || s === 'parsing' || s === 'embedding' ? 4000 : false;
    },
  });
  const doc = docData?.data;

  const { data: chunksData, isLoading: chunksLoading } = useQuery({
    queryKey: ['library-doc-chunks', workspaceId, documentId, page],
    queryFn: () =>
      apiFetch<ChunksResponse>(
        `/api/v1/workspaces/${workspaceId}/library/${documentId}/chunks?page=${page}&limit=${CHUNK_PAGE_SIZE}`,
      ),
    enabled: !!workspaceId && !!documentId && doc?.status === 'ready',
  });
  const chunks = chunksData?.data?.data ?? [];
  const totalChunks = chunksData?.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalChunks / CHUNK_PAGE_SIZE));

  const renameMutation = useMutation({
    mutationFn: (title: string) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/library/${documentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => {
      toast.success('Renamed.');
      setRenaming(false);
      void qc.invalidateQueries({ queryKey: ['library-doc', workspaceId, documentId] });
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Rename failed.'),
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/library/${documentId}/retry`, {
        method: 'POST',
      }),
    onSuccess: () => {
      toast.success('Re-queued for processing.');
      void qc.invalidateQueries({ queryKey: ['library-doc', workspaceId, documentId] });
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Retry failed.'),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/library/${documentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Removed.');
      void qc.invalidateQueries({ queryKey: ['library', workspaceId] });
      router.push('/dashboard/library');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Delete failed.'),
  });

  const toFileMutation = useMutation({
    mutationFn: () =>
      apiFetch<{
        success: true;
        data: {
          fileId: string;
          leadCount: number;
          skippedNoEmail: number;
          skippedDuplicate: number;
          detectedColumns: Record<string, string | null>;
        };
      }>(`/api/v1/workspaces/${workspaceId}/library/${documentId}/to-file`, {
        method: 'POST',
      }),
    onSuccess: (res) => {
      toast.success(
        `Filed ${res.data.leadCount} lead${res.data.leadCount === 1 ? '' : 's'}. Skipped ${
          res.data.skippedNoEmail + res.data.skippedDuplicate
        }.`,
      );
      void qc.invalidateQueries({ queryKey: ['files', workspaceId] });
      void qc.invalidateQueries({ queryKey: ['jobs', workspaceId] });
      router.push(`/dashboard/files/${res.data.fileId}`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Import failed.'),
  });

  if (docLoading) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-16  italic text-[14px] text-[color:var(--ink-2)] text-center">
        Loading document…
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-20 text-center">
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
          Missing
        </span>
        <h1 className="mt-3  text-[32px] text-[color:var(--ink)]">
          Document not found.
        </h1>
        <Link
          href="/dashboard/library"
          className="mt-4 inline-block  italic text-[13.5px] text-[color:var(--ink-2)] underline underline-offset-[4px] decoration-[color:var(--rule)]"
        >
          Back to the Library
        </Link>
      </div>
    );
  }

  const tone = statusTone(doc.status);
  const displayTitle = doc.title ?? doc.originalFilename;
  const isAudio = ['mp3', 'm4a', 'wav', 'mp4', 'webm', 'ogg', 'aac', 'flac'].includes(doc.fileType);
  const canMakeFile =
    doc.status === 'ready' && ['csv', 'xlsx', 'xls'].includes(doc.fileType);

  return (
    <div className="max-w-[1480px] mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-10 md:py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6 font-mono text-[10px] tracking-[0.22em] uppercase">
        <Link
          href="/dashboard/library"
          className="text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
        >
          Library
        </Link>
        <span className="text-[color:var(--ink-3)]">/</span>
        <span className="text-[color:var(--ink-2)] truncate max-w-[420px]">{displayTitle}</span>
      </div>

      {/* Header */}
      <section className="mb-6 sm:mb-10 pb-6 sm:pb-8 border-b border-[color:var(--rule)]">
        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            {isAudio ? 'Transcript' : 'Document'}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 sm:gap-6 flex-wrap">
          <div className="max-w-[780px]">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={titleDraft}
                  autoFocus
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameMutation.mutate(titleDraft.trim());
                    else if (e.key === 'Escape') setRenaming(false);
                  }}
                  className="bg-transparent border-b-2 border-[color:var(--ink)] outline-none py-1  text-[26px] sm:text-[36px] md:text-[44px] leading-tight text-[color:var(--ink)] flex-1"
                />
                <button
                  onClick={() => renameMutation.mutate(titleDraft.trim())}
                  disabled={!titleDraft.trim() || renameMutation.isPending}
                  className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ember)] disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  onClick={() => setRenaming(false)}
                  className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h1
                onDoubleClick={() => {
                  setTitleDraft(displayTitle);
                  setRenaming(true);
                }}
                title="Double-click to rename"
                className=" text-[26px] sm:text-[36px] md:text-[48px] leading-[0.98] tracking-[-0.015em] text-[color:var(--ink)] cursor-text"
              >
                {displayTitle}
              </h1>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
              <span
                className={`inline-flex items-center px-2 py-0.5 border bg-[color:var(--paper-3)] ${tone.className}`}
              >
                {tone.label}
              </span>
              <span>{doc.fileType.toUpperCase()}</span>
              <span>{bytesLabel(doc.bytes)}</span>
              {doc.pageCount ? <span>{doc.pageCount} pages</span> : null}
              {doc.chunkCount ? <span>{doc.chunkCount} chunks</span> : null}
              <span>Uploaded {new Date(doc.createdAt).toLocaleDateString()}</span>
            </div>

            {doc.status === 'failed' && doc.errorMessage && (
              <div className="mt-4 border-l-2 border-[color:var(--warn)] pl-3 py-1 max-w-[640px]">
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--warn)]">
                  Failure
                </p>
                <p className="mt-1  italic text-[13px] text-[color:var(--ink-2)] leading-[1.5] break-words">
                  {doc.errorMessage}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <GhostButton
              type="button"
              onClick={() => {
                setTitleDraft(displayTitle);
                setRenaming(true);
              }}
            >
              Rename
            </GhostButton>
            {doc.status === 'failed' && (
              <PrimaryButton
                type="button"
                onClick={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? 'Retrying…' : 'Retry processing'}
              </PrimaryButton>
            )}
            {canMakeFile && (
              <PrimaryButton
                type="button"
                onClick={() => toFileMutation.mutate()}
                disabled={toFileMutation.isPending}
                title="Extract rows into Leads + bundle them as a File"
              >
                {toFileMutation.isPending ? 'Importing\u2026' : 'Make a file from this'}
              </PrimaryButton>
            )}
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className=" text-[13px] text-[color:var(--warn)] hover:text-[color:var(--ink)] transition disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        </div>
      </section>

      {/* AI plan-a-dispatch panel — only when the doc is parseable */}
      {doc.status === 'ready' && (
        <AnalysisPanel
          workspaceId={workspaceId}
          documentId={documentId}
          displayTitle={displayTitle}
        />
      )}

      {/* Chunks */}
      {doc.status !== 'ready' ? (
        <div className="py-14 text-center">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            {doc.status === 'failed' ? 'Unavailable' : 'Processing'}
          </span>
          <h3 className="mt-3  text-[26px] text-[color:var(--ink)]">
            {doc.status === 'failed'
              ? 'Chunks not available — processing failed.'
              : 'We\u2019re chunking + embedding this document.'}
          </h3>
          <p className="mt-2  italic text-[14px] text-[color:var(--ink-2)]">
            {doc.status === 'failed'
              ? 'Click Retry to re-run, or remove the document and re-upload.'
              : 'Audio files take longer (Whisper transcription). Status updates every few seconds.'}
          </p>
        </div>
      ) : (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-4">
            <div>
              <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
                Extracted passages
              </span>
              <span className="ml-3 font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                {totalChunks} chunks · page {page}/{totalPages}
              </span>
            </div>
            <Link
              href={`/dashboard?prefill=${encodeURIComponent(
                `Using my uploaded "${displayTitle}" as context, find 20 similar prospects. Pull specifics from the doc via read_document first, then search.`,
              )}`}
              className="inline-flex items-center gap-2  italic text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
            >
              Use in a search <ArrowEast className="w-2.5 h-2.5" />
            </Link>
          </div>

          {chunksLoading ? (
            <div className="py-10 text-center  italic text-[14px] text-[color:var(--ink-2)]">
              Loading passages…
            </div>
          ) : chunks.length === 0 ? (
            <div className="py-10 text-center  italic text-[14px] text-[color:var(--ink-2)]">
              No extracted text (file may have been blank or image-only beyond OCR reach).
            </div>
          ) : (
            <ul>
              {chunks.map((c) => (
                <li
                  key={c._id}
                  className="grid grid-cols-[60px_1fr_auto] gap-4 items-baseline py-4 border-b border-[color:var(--rule)]/70"
                >
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                    #{String(c.idx + 1).padStart(3, '0')}
                  </span>
                  <p className=" text-[13.5px] leading-[1.55] text-[color:var(--ink)] whitespace-pre-wrap break-words">
                    {c.text}
                  </p>
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[color:var(--ink-3)] whitespace-nowrap">
                    {c.pageHint ? `p. ${c.pageHint}` : c.embeddingDims > 0 ? 'embedded' : 'no embed'}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-2)] hover:text-[color:var(--ink)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * Analysis panel — "what the AI understands + proposed dispatches."
 *
 * Lazy-loaded: a CTA button triggers POST /library/:id/analyze. The
 * endpoint caches the result on the document, so subsequent reads
 * (including page refreshes) come back instantly. A "Refresh" button
 * forces a fresh LLM call when the user has edited the doc.
 * ───────────────────────────────────────────────────────────────── */

interface DocAnalysis {
  docType: string;
  summary: string;
  keyEntities: {
    industries: string[];
    geographies: string[];
    personas: string[];
    companies: string[];
  };
  proposedDispatches: Array<{
    prompt: string;
    rationale: string;
    targetCount?: number;
  }>;
  ambiguities: string[];
  model?: string;
  generatedAt?: string;
  cached?: boolean;
}

function AnalysisPanel({
  workspaceId,
  documentId,
  displayTitle,
}: {
  workspaceId: string | null;
  documentId: string;
  displayTitle: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<DocAnalysis | null>(null);

  const runAnalysis = useMutation({
    mutationFn: (refresh: boolean) =>
      apiFetch<{ success: true; data: DocAnalysis }>(
        `/api/v1/workspaces/${workspaceId}/library/${documentId}/analyze${
          refresh ? '?refresh=true' : ''
        }`,
        { method: 'POST' },
      ),
    onSuccess: (res) => {
      setAnalysis(res.data);
      setExpanded(true);
      void qc.invalidateQueries({ queryKey: ['library-doc', workspaceId, documentId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Analysis failed.'),
  });

  function launchDispatch(prompt: string) {
    router.push(`/dashboard?prefill=${encodeURIComponent(prompt)}`);
  }

  const empty = !analysis && !runAnalysis.isPending;
  const entityChip = (label: string, items: string[]) =>
    items.length === 0 ? null : (
      <div key={label} className="flex items-baseline gap-3 flex-wrap">
        <span className="font-mono text-[9.5px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] w-[90px] shrink-0">
          {label}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {items.map((v) => (
            <span
              key={v}
              className=" italic text-[12.5px] text-[color:var(--ink-2)] bg-[color:var(--paper-3)] border border-[color:var(--rule)] px-2 py-0.5"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    );

  return (
    <section className="mb-10 pb-10 border-b border-[color:var(--rule)]">
      <div className="flex items-center gap-3 mb-5">
        <span className="block w-8 h-px bg-[color:var(--ember)]" />
        <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ember)]">
          What the AI understands
        </span>
      </div>

      {empty && (
        <div className="border border-dashed border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-sm p-6 md:p-8">
          <h3 className=" text-[24px] md:text-[28px] leading-[1.15] text-[color:var(--ink)]">
            Let the AI read <em className="italic text-[color:var(--ember)]">{displayTitle}</em> and propose searches.
          </h3>
          <p className="mt-2  italic text-[13.5px] text-[color:var(--ink-2)] max-w-[640px] leading-[1.55]">
            You&rsquo;ll see what it classifies this as, the entities it picked up, and 3 distinct
            prompt cards you can run with one click. Cached — analyzing once is free forever.
          </p>
          <div className="mt-5">
            <PrimaryButton
              type="button"
              onClick={() => runAnalysis.mutate(false)}
              disabled={runAnalysis.isPending}
            >
              Analyze this document
            </PrimaryButton>
          </div>
        </div>
      )}

      {runAnalysis.isPending && !analysis && (
        <div className="border border-[color:var(--rule)] bg-[color:var(--paper-3)]/60 rounded-sm p-6 text-center">
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
            Reading
          </span>
          <p className="mt-2  italic text-[18px] text-[color:var(--ink)]">
            Scanning chunks and drafting proposals\u2026
          </p>
        </div>
      )}

      {analysis && expanded && (
        <div className="flex flex-col gap-6">
          {/* Gist */}
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase border border-[color:var(--ember)]/40 bg-[color:var(--ember)]/5 text-[color:var(--ember)] px-2 py-0.5">
                {analysis.docType}
              </span>
              {analysis.cached ? (
                <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                  Cached
                </span>
              ) : (
                <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
                  Fresh
                </span>
              )}
              <button
                onClick={() => runAnalysis.mutate(true)}
                disabled={runAnalysis.isPending}
                className="ml-auto font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition disabled:opacity-60"
              >
                {runAnalysis.isPending ? 'Refreshing\u2026' : 'Refresh analysis'}
              </button>
            </div>
            <p className=" italic text-[20px] md:text-[22px] leading-[1.35] text-[color:var(--ink)] max-w-[820px]">
              {analysis.summary}
            </p>
          </div>

          {/* Entities */}
          {(analysis.keyEntities.industries.length > 0 ||
            analysis.keyEntities.geographies.length > 0 ||
            analysis.keyEntities.personas.length > 0 ||
            analysis.keyEntities.companies.length > 0) && (
            <div className="flex flex-col gap-2.5">
              {entityChip('Industries', analysis.keyEntities.industries)}
              {entityChip('Geographies', analysis.keyEntities.geographies)}
              {entityChip('Personas', analysis.keyEntities.personas)}
              {entityChip('Companies', analysis.keyEntities.companies)}
            </div>
          )}

          {/* Proposed dispatches */}
          {analysis.proposedDispatches.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)]">
                  Proposed dispatches
                </span>
                <span className="flex-1 h-px bg-[color:var(--rule)]" />
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {analysis.proposedDispatches.map((d, i) => (
                  <li
                    key={i}
                    className="border border-[color:var(--rule)] bg-[color:var(--paper-3)]/50 p-4 flex flex-col gap-3 hover:border-[color:var(--ink-2)] transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className=" italic text-[28px] leading-none text-[color:var(--ember)] tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      {d.targetCount !== undefined && (
                        <span className="font-mono text-[9.5px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] tabular-nums">
                          ≈{d.targetCount} leads
                        </span>
                      )}
                    </div>
                    <p className=" text-[13.5px] leading-[1.5] text-[color:var(--ink)] line-clamp-5">
                      {d.prompt}
                    </p>
                    {d.rationale && (
                      <p className=" italic text-[12px] leading-[1.45] text-[color:var(--ink-2)] line-clamp-3">
                        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] mr-2">
                          Why
                        </span>
                        {d.rationale}
                      </p>
                    )}
                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <button
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(d.prompt)
                            .then(() => toast.success('Prompt copied'))
                            .catch(() => toast.error('Could not copy'));
                        }}
                        className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => launchDispatch(d.prompt)}
                        className="inline-flex items-center gap-1.5  text-[12.5px] font-medium text-[color:var(--ink)] hover:text-[color:var(--ember)] transition"
                      >
                        File this <ArrowEast className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Ambiguities */}
          {analysis.ambiguities.length > 0 && (
            <div className="border-l-2 border-[color:var(--ember-2)] pl-4 py-1 max-w-[820px]">
              <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ember-2)]">
                Before you dispatch — clarify these
              </span>
              <ul className="mt-2 space-y-1.5">
                {analysis.ambiguities.map((q, i) => (
                  <li
                    key={i}
                    className=" italic text-[13px] leading-[1.5] text-[color:var(--ink-2)]"
                  >
                    · {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
