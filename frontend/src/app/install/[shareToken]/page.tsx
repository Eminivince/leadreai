'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { WorkflowPublicPreview, Workflow, Workspace } from '@leadreai/shared';

/**
 * Public install landing page (Phase 11 M2).
 *
 * The URL the publishing workspace pastes into Slack / docs / wherever
 * lands here. Unauthenticated visitors get a redacted preview (no
 * source workspace, no author identity) and a CTA to sign in or
 * register. Authenticated visitors get a workspace picker + install
 * button — install creates an independent-copy Workflow in their target
 * workspace and redirects to its detail page.
 */
export default function InstallWorkflowPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [preview, setPreview] = useState<WorkflowPublicPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [targetWorkspaceId, setTargetWorkspaceId] = useState<string>('');

  useEffect(() => {
    if (!shareToken) return;
    const url = new URL(`/api/v1/workflows/install/${shareToken}`, process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');
    fetch(url.toString())
      .then((res) => res.json())
      .then((body: { success: boolean; data?: WorkflowPublicPreview; error?: { message?: string } }) => {
        if (body.success && body.data) {
          setPreview(body.data);
        } else {
          setPreviewError(body.error?.message ?? 'This install link is no longer valid.');
        }
      })
      .catch(() => setPreviewError('Could not load this install link.'));
  }, [shareToken]);

  // Pull the user's full workspace list (User.workspaces only carries
  // {workspaceId, role}; we need names for the picker). Fires once the
  // session is confirmed.
  useEffect(() => {
    if (!user) return;
    apiFetch<{ success: true; data: Workspace[] }>('/api/v1/workspaces')
      .then((res) => {
        setWorkspaces(res.data);
        if (res.data[0] && !targetWorkspaceId) {
          setTargetWorkspaceId(res.data[0]._id);
        }
      })
      .catch(() => {
        // Non-fatal — the install POST will still validate membership.
      });
  }, [user, targetWorkspaceId]);

  async function handleInstall() {
    if (!targetWorkspaceId || !shareToken) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await apiFetch<{ success: true; data: Workflow }>(
        `/api/v1/workflows/install/${shareToken}`,
        {
          method: 'POST',
          body: JSON.stringify({ targetWorkspaceId }),
        },
      );
      router.push(`/dashboard/workflows/${res.data._id}`);
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install failed');
      setInstalling(false);
    }
  }

  if (previewError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center bg-[color:var(--paper)] px-6 text-center">
        <h1 className="font-display text-[28px] text-[color:var(--ink)]">Link not available</h1>
        <p className="mt-3 font-sans text-[14px] text-[color:var(--ink-2)]">{previewError}</p>
        <Link
          href="/"
          className="mt-6 font-sans text-[13px] text-[color:var(--ember)] hover:text-[color:var(--ember-2)] hover:underline"
        >
          Go home →
        </Link>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center bg-[color:var(--paper)] px-6">
        <p className="font-sans text-[14px] text-[color:var(--ink-3)]">Loading preview…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--paper)]">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-10 sm:py-16">
        <div className="bg-white border border-[color:var(--rule)] rounded-2xl p-6 sm:p-8">
          <span className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
            Install workflow
          </span>
          <h1 className="mt-2 font-display text-[28px] leading-tight text-[color:var(--ink)]">
            {preview.name}
          </h1>
          {preview.description ? (
            <p className="mt-3 font-sans text-[14px] leading-[1.55] text-[color:var(--ink-2)]">
              {preview.description}
            </p>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Stat label="Row type" value={preview.tableTemplate.rowType} />
            <Stat label="Columns" value={String(preview.tableTemplate.columns.length)} />
            <Stat label="Has seed query" value={preview.hasSeed ? 'Yes' : 'No'} />
            <Stat label="Times installed" value={String(preview.publishStats.installs)} />
          </div>

          {preview.seedParameters && preview.seedParameters.length > 0 ? (
            <div className="mt-6">
              <h3 className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
                Parameters
              </h3>
              <ul className="mt-2 space-y-1 font-sans text-[13px] text-[color:var(--ink-2)]">
                {preview.seedParameters.map((p) => (
                  <li key={p.key}>
                    <span className="font-mono text-[color:var(--ink)]">{p.key}</span> · {p.type}
                    {p.required ? ' · required' : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-8 border-t border-[color:var(--rule)] pt-6">
            {authLoading ? (
              <p className="font-sans text-[13px] text-[color:var(--ink-3)]">Checking your session…</p>
            ) : !user ? (
              <div className="flex flex-col gap-3">
                <p className="font-sans text-[14px] text-[color:var(--ink-2)]">
                  Sign in to install this workflow into your workspace.
                </p>
                <Link
                  href={`/login?returnTo=${encodeURIComponent(`/install/${shareToken}`)}`}
                  className="inline-flex items-center justify-center bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity"
                >
                  Sign in to install
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {workspaces.length > 1 ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="font-sans font-medium text-[12.5px] text-[color:var(--ink-2)]">
                      Install into
                    </span>
                    <select
                      value={targetWorkspaceId}
                      onChange={(e) => setTargetWorkspaceId(e.target.value)}
                      className="bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] focus:border-[color:var(--ink)] focus:outline-none transition-colors"
                    >
                      {workspaces.map((ws) => (
                        <option key={ws._id} value={ws._id}>
                          {ws.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : workspaces[0] ? (
                  <p className="font-sans text-[14px] text-[color:var(--ink-2)]">
                    Installing into{' '}
                    <span className="font-medium text-[color:var(--ink)]">{workspaces[0].name}</span>
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  disabled={installing || !targetWorkspaceId}
                  className="inline-flex items-center justify-center bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {installing ? 'Installing…' : 'Install into my workspace'}
                </button>
                {installError ? (
                  <p className="font-sans text-[13px] text-[color:var(--warn)]">{installError}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center font-sans text-[12px] text-[color:var(--ink-3)]">
          Installing creates an independent copy in your workspace. Future edits by the
          author do not propagate.
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
        {label}
      </div>
      <div className="mt-1 font-sans text-[14px] text-[color:var(--ink)]">{value}</div>
    </div>
  );
}
