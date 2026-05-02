'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse, Workspace } from '@leadreai/shared';
import { SectionHead, ForthcomingPanel } from '@/components/settings/primitives';

/**
 * Team — read-only for now.
 *
 * No backend endpoints exist for inviting, changing roles, or removing
 * members. We render the existing workspace.members[] collection so the
 * user can see who is on the desk, and surface invites + role changes
 * as "Forthcoming" honest placeholders.
 *
 * The only enriched info we have is the current user (useAppStore) — so
 * we can tell "you" from other members. Other members show a userId
 * stub until we ship a members/read endpoint that joins User data.
 */

function roleBadge(role: string): { label: string; tone: string } {
  if (role === 'owner') return { label: 'Owner',  tone: 'text-[color:var(--forest)] border-[color:var(--forest)]/40' };
  if (role === 'admin') return { label: 'Admin',  tone: 'text-[color:var(--ink)] border-[color:var(--rule)]' };
  return                       { label: 'Member', tone: 'text-[color:var(--ink-2)] border-[color:var(--rule)]' };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '·';
}

export default function TeamSettingsPage() {
  const { workspaceId } = useWorkspace();
  const { user } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<ApiResponse<Workspace>>(`/api/v1/workspaces/${workspaceId}`),
    enabled: !!workspaceId,
  });
  const ws = data?.data;

  if (isLoading || !ws) {
    return (
      <div className="py-8  italic text-[14px] text-[color:var(--ink-2)]">
        Loading team…
      </div>
    );
  }

  const members = ws.members ?? [];
  const currentUserId = user?._id;

  return (
    <div className="flex flex-col gap-14">
      {/* Team */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead
          n="01"
          title={
            <>
              Team{' '}
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] not-italic ml-3">
                {members.length} {members.length === 1 ? 'seat' : 'seats'}
              </span>
            </>
          }
        />
        <div className="md:pl-[54px]">
          <ol className="border-t border-[color:var(--rule)]">
            {members.map((m, i) => {
              const isSelf = m.userId === currentUserId;
              const name = isSelf && user
                ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'You'
                : `Member ${m.userId.slice(-6)}`;
              const subtitle = isSelf
                ? user?.email ?? 'you@workspace'
                : 'Member details load after a future users/read endpoint ships.';
              const badge = roleBadge(m.role);

              return (
                <li
                  key={m.userId}
                  className="grid grid-cols-[40px_1fr_auto_auto] gap-4 items-center py-4 border-b border-[color:var(--rule)]/70"
                >
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[color:var(--ink)] text-[color:var(--paper)] flex items-center justify-center shrink-0  italic text-[12px]">
                      {initials(name)}
                    </div>
                    <div className="min-w-0">
                      <div className=" font-medium text-[13.5px] text-[color:var(--ink)] truncate">
                        {name}
                        {isSelf && (
                          <span className="ml-2 font-mono italic text-[10px] tracking-[0.16em] uppercase text-[color:var(--forest)] not-italic">
                            you
                          </span>
                        )}
                      </div>
                      <div className=" italic text-[12px] text-[color:var(--ink-2)] truncate">
                        {subtitle}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center font-mono text-[9.5px] tracking-[0.18em] uppercase px-2 py-0.5 border bg-[color:var(--paper-3)] ${badge.tone}`}
                  >
                    {badge.label}
                  </span>
                  <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)] hidden md:inline">
                    joined{' '}
                    {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Invite */}
      <section className="border-t border-[color:var(--rule)] pt-8">
        <SectionHead n="02" title="Invitations" />
        <div className="md:pl-[54px]">
          <ForthcomingPanel title="Invite a team member.">
            Invitations, role changes, and seat removal are coming in a later release. For now we
            seat the workspace owner automatically. Reach out if you need a colleague added today
            and we&rsquo;ll provision them by hand.
          </ForthcomingPanel>
        </div>
      </section>
    </div>
  );
}
