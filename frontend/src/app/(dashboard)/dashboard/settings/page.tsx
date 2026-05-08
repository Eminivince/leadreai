'use client';

import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────
 * Settings index — the table of contents.
 * ───────────────────────────────────────────────────────────────── */

function UserIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function WorkspaceIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M9 22V12h6v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function TeamIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function KnowledgeIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function SuppressionIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function KeyIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <circle cx="7.5" cy="15.5" r="4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M21 2l-9.6 9.6M15.5 7.5 19 11l2.5-2.5L18 5l3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function BillingIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <rect x="1" y="4" width="22" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M1 10h22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

function EmailIcon({ className = 'w-4.5 h-4.5' }: { className?: string }) {
 return (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
   <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
   <path d="M22 6l-10 7L2 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

type EntryIcon = 'account' | 'workspace' | 'team' | 'knowledge' | 'suppression' | 'api-keys' | 'billing' | 'email';

function EntryIconComponent({ icon, className }: { icon: EntryIcon; className?: string }) {
 switch (icon) {
  case 'account':     return <UserIcon className={className} />;
  case 'workspace':   return <WorkspaceIcon className={className} />;
  case 'team':        return <TeamIcon className={className} />;
  case 'knowledge':   return <KnowledgeIcon className={className} />;
  case 'suppression': return <SuppressionIcon className={className} />;
  case 'api-keys':    return <KeyIcon className={className} />;
  case 'billing':     return <BillingIcon className={className} />;
  case 'email':       return <EmailIcon className={className} />;
 }
}

const ENTRIES: Array<{ href: string; label: string; description: string; icon: EntryIcon }> = [
 {
  href: '/dashboard/settings/account',
  label: 'Account',
  description: 'Your profile — name shown on searches and outreach drafts. Password and session controls.',
  icon: 'account',
 },
 {
  href: '/dashboard/settings/workspace',
  label: 'Workspace',
  description: 'Rename the workspace. Toggle defaults: notification on complete, export format, thrift mode.',
  icon: 'workspace',
 },
 {
  href: '/dashboard/settings/team',
  label: 'Team',
  description: 'Who sits on this desk. Roles and seats. Invitations forthcoming.',
  icon: 'team',
 },
 {
  href: '/dashboard/settings/knowledge-base',
  label: 'Knowledge base',
  description: 'Teach the agent about your company, value proposition, tone — it writes better drafts.',
  icon: 'knowledge',
 },
 {
  href: '/dashboard/settings/suppression',
  label: 'Suppression list',
  description: 'Emails and domains the engine must never contact. Add competitors, unsubscribes, and sensitive accounts.',
  icon: 'suppression',
 },
 {
  href: '/dashboard/settings/api-keys',
  label: 'API keys',
  description: 'Credentials for programmatic access. Generate, copy once, revoke any time.',
  icon: 'api-keys',
 },
 {
  href: '/dashboard/settings/billing',
  label: 'Billing & usage',
  description: 'Plan, credits balance, and the ledger. Manage subscription and seat count.',
  icon: 'billing',
 },
 {
  href: '/dashboard/settings/email',
  label: 'Email & replies',
  description: 'Connect your sending domain so prospect replies land in the campaign dashboard automatically.',
  icon: 'email',
 },
];

function ChevronRight() {
 return (
  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-[color:var(--ink-3)]">
   <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
 );
}

export default function SettingsIndexPage() {
 return (
  <div className="flex flex-col gap-3">
   {ENTRIES.map((e) => (
    <Link
     key={e.href}
     href={e.href}
     className="group bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-xl p-4 flex items-center gap-4 hover:border-[color:var(--forest)]/40 hover:shadow-sm transition-all"
    >
     <div className="w-10 h-10 rounded-xl bg-[color:var(--paper-3)] border border-[color:var(--rule)] flex items-center justify-center shrink-0 text-[color:var(--ink-2)] group-hover:text-[color:var(--ink)] transition-colors">
      <EntryIconComponent icon={e.icon} className="w-[18px] h-[18px]" />
     </div>
     <div className="flex-1 min-w-0">
      <div className="text-[14px] font-semibold text-[color:var(--ink)]">{e.label}</div>
      <div className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5 truncate">{e.description}</div>
     </div>
     <ChevronRight />
    </Link>
   ))}

   <p className="mt-4 text-[12.5px] text-[color:var(--ink-3)]">
    Looking for provider connections? HubSpot, email senders, and webhooks live on{' '}
    <Link
     href="/dashboard/integrations"
     className="text-[color:var(--forest)] underline underline-offset-2"
    >
     the Integrations page
    </Link>
    .
   </p>
  </div>
 );
}
