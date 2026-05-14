'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import type { Workspace } from '@leadreai/shared';

/**
 * Workspace switcher (Task #25 frontend).
 *
 * Shown in the topbar. Always lists the user's own workspaces from
 * /api/v1/workspaces (this already returns sub-workspaces the user is
 * a member of via the new authorize-inheritance rule). When the active
 * workspace is itself a parent agency, also fans out into its clients
 * via /workspaces/:id/clients so the agency owner can hop between
 * their portfolio in one click.
 */
export function WorkspaceSwitcher() {
  const workspace = useAppStore((s) => s.workspace);
  const setWorkspace = useAppStore((s) => s.setWorkspace);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const { data: own } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => apiFetch<{ success: true; data: Workspace[] }>('/api/v1/workspaces'),
  });

  // Pull client sub-workspaces only when the active workspace is a
  // parent (i.e., not itself a client). Cheap because the endpoint
  // returns empty for non-agency workspaces.
  const { data: clients } = useQuery({
    queryKey: ['client-workspaces', workspace?._id],
    queryFn: () =>
      apiFetch<{ success: true; data: Workspace[] }>(`/api/v1/workspaces/${workspace?._id}/clients`),
    enabled: Boolean(workspace?._id) && !workspace?.isClient,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!workspace) return null;

  const ownWorkspaces = own?.data ?? [];
  const clientWorkspaces = clients?.data ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-2.5 h-7 text-[12px] font-medium text-[color:var(--ink)] hover:bg-[color:var(--paper-3)] transition"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch workspace"
      >
        <span className="truncate max-w-[160px]">{workspace.name}</span>
        {workspace.isClient ? (
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-[color:var(--ink-3)]">
            client
          </span>
        ) : null}
        <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-[color:var(--ink-3)]">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 mt-1.5 z-40 w-72 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-2)] shadow-lg py-1.5">
          <Section label="Your workspaces">
            {ownWorkspaces.map((w) => (
              <Row
                key={w._id}
                workspace={w}
                active={w._id === workspace._id}
                onPick={() => {
                  setWorkspace(w);
                  setOpen(false);
                }}
              />
            ))}
          </Section>

          {clientWorkspaces.length > 0 ? (
            <Section label={`Clients of ${workspace.name}`}>
              {clientWorkspaces.map((w) => (
                <Row
                  key={w._id}
                  workspace={w}
                  active={false}
                  onPick={() => {
                    setWorkspace(w);
                    setOpen(false);
                  }}
                />
              ))}
            </Section>
          ) : null}

          <div className="border-t border-[color:var(--rule)] mt-1 pt-1">
            <Link
              href="/dashboard/settings/clients"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:bg-[color:var(--paper-3)]"
            >
              Manage client workspaces →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pb-1 font-mono text-[9.5px] tracking-[0.14em] uppercase text-[color:var(--ink-3)]">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({
  workspace,
  active,
  onPick,
}: {
  workspace: Workspace;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`block w-full text-left px-3 py-1.5 text-[13px] hover:bg-[color:var(--paper-3)] ${
        active ? 'text-[color:var(--ink)] font-medium' : 'text-[color:var(--ink-2)]'
      }`}
    >
      <span className="truncate block">{workspace.name}</span>
      {workspace.clientLabel ? (
        <span className="text-[11px] text-[color:var(--ink-3)] truncate block">
          {workspace.clientLabel}
        </span>
      ) : null}
    </button>
  );
}
