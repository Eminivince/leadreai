'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse, Workspace } from '@leadreai/shared';
import { ForthcomingPanel } from '@/components/settings/primitives';

/**
 * Team — read-only for now.
 *
 * No backend endpoints exist for inviting, changing roles, or removing
 * members. We render the existing workspace.members[] collection so the
 * user can see who is on the desk, and surface invites + role changes
 * as "Forthcoming" honest placeholders.
 */

function roleBadge(role: string): { label: string; cls: string } {
 if (role === 'owner') return { label: 'Owner', cls: 'bg-[color:var(--ember)]/10 text-[color:var(--ember)] border-[color:var(--ember)]/30' };
 if (role === 'admin') return { label: 'Admin', cls: 'bg-[color:var(--paper-3)] text-[color:var(--ink)] border-[color:var(--rule)]' };
 return            { label: 'Member', cls: 'bg-[color:var(--paper-3)] text-[color:var(--ink-3)] border-[color:var(--rule)]' };
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
   <div className="py-8 text-[14px] text-[color:var(--ink-3)]">Loading team…</div>
  );
 }

 const members = ws.members ?? [];
 const currentUserId = user?._id;

 return (
  <div className="flex flex-col gap-5">
   {/* Members card */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
    <div className="px-4 sm:px-6 py-5 border-b border-[color:var(--rule)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
     <div>
      <h2 className="text-[16px] font-bold text-[color:var(--ink)]">Team members</h2>
      <p className="text-[13px] text-[color:var(--ink-3)] mt-0.5">
       {members.length} {members.length === 1 ? 'seat' : 'seats'} on this workspace.
      </p>
     </div>
    </div>

    {members.length === 0 ? (
     <div className="p-4 sm:p-6 text-[13.5px] text-[color:var(--ink-3)]">No members found.</div>
    ) : (
     <div className="divide-y divide-[color:var(--rule)]">
      {members.map((m) => {
       const isSelf = m.userId === currentUserId;
       const name = isSelf && user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || 'You'
        : `Member ${m.userId.slice(-6)}`;
       const subtitle = isSelf
        ? user?.email ?? 'you@workspace'
        : 'Member details load after a future users/read endpoint ships.';
       const badge = roleBadge(m.role);

       return (
        <div
         key={m.userId}
         className="px-4 sm:px-6 py-4 flex items-center gap-3 sm:gap-4 flex-wrap"
        >
         <div className="w-9 h-9 rounded-full bg-[color:var(--ink)] text-white flex items-center justify-center shrink-0 text-[13px] font-semibold">
          {initials(name)}
         </div>
         <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
           <span className="text-[13.5px] font-semibold text-[color:var(--ink)] truncate">
            {name}
           </span>
           {isSelf && (
            <span className="text-[11px] font-medium text-[color:var(--ember)] bg-[color:var(--ember)]/10 px-1.5 py-0.5 rounded">
             You
            </span>
           )}
          </div>
          <div className="text-[12.5px] text-[color:var(--ink-3)] truncate">{subtitle}</div>
         </div>
         <span
          className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-md border ${badge.cls}`}
         >
          {badge.label}
         </span>
         <span className="text-[12px] text-[color:var(--ink-3)] hidden md:inline whitespace-nowrap">
          Joined {new Date(m.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
         </span>
        </div>
       );
      })}
     </div>
    )}
   </div>

   {/* Invitations card */}
   <div className="bg-white border border-[color:var(--rule)] rounded-xl overflow-hidden">
    <div className="px-4 sm:px-6 py-5 border-b border-[color:var(--rule)]">
     <h2 className="text-[16px] font-bold text-[color:var(--ink)]">Invitations</h2>
     <p className="text-[13px] text-[color:var(--ink-3)] mt-0.5">Invite colleagues to join this workspace.</p>
    </div>
    <div className="p-4 sm:p-6">
     <ForthcomingPanel title="Invite a team member.">
      Invitations, role changes, and seat removal are coming in a later release. For now we
      seat the workspace owner automatically. Reach out if you need a colleague added today
      and we&rsquo;ll provision them by hand.
     </ForthcomingPanel>
    </div>
   </div>
  </div>
 );
}
