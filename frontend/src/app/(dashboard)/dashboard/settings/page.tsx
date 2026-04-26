'use client';

import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────
 * Settings index — the table of contents.
 *
 * Editorial map of every settings section with a one-line description.
 * Each entry is a full clickable block (larger hit area than a link)
 * with hover revealing the directional arrow, matching the pattern on
 * the leads table + integrations cards.
 * ───────────────────────────────────────────────────────────────── */

function ArrowEast({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M2 8h12M10 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const ENTRIES: Array<{ href: string; number: string; label: string; description: string; tag?: string }> = [
  {
    href: '/dashboard/settings/account',
    number: '01',
    label: 'Account',
    description: 'Your byline — name shown on dispatches and outreach drafts. Password and session controls.',
  },
  {
    href: '/dashboard/settings/workspace',
    number: '02',
    label: 'Workspace',
    description: 'Rename the desk. Toggle defaults: notification on complete, export format, thrift mode for quick cheap runs.',
  },
  {
    href: '/dashboard/settings/team',
    number: '03',
    label: 'Team',
    description: 'Who sits on this desk. Roles and seats. Invitations forthcoming.',
  },
  {
    href: '/dashboard/settings/knowledge-base',
    number: '04',
    label: 'Knowledge base',
    description: 'House style. Teach the agent about your company, value proposition, tone — it writes better drafts.',
  },
  {
    href: '/dashboard/settings/suppression',
    number: '05',
    label: 'Suppression list',
    description: 'Emails and domains the engine must never contact. Add competitors, unsubscribes, and sensitive accounts.',
  },
  {
    href: '/dashboard/settings/api-keys',
    number: '06',
    label: 'API keys',
    description: 'Press credentials for programmatic access. Generate, copy once, revoke any time.',
  },
  {
    href: '/dashboard/settings/billing',
    number: '07',
    label: 'Billing & usage',
    description: 'Plan, credits balance, and the ledger. Manage subscription and seat count.',
  },
];

export default function SettingsIndexPage() {
  return (
    <div className="flex flex-col">
      <ol>
        {ENTRIES.map((e) => (
          <li key={e.href}>
            <Link
              href={e.href}
              className="group grid grid-cols-[48px_1fr_auto] gap-4 md:gap-6 items-baseline py-6 border-t border-[color:var(--rule)] last:border-b hover:bg-[color:var(--paper-3)]/60 transition-colors"
            >
              <span className="font-[family-name:var(--font-instrument-serif)] italic text-[28px] leading-none text-[color:var(--forest)] tabular-nums">
                {e.number}
              </span>
              <div className="min-w-0">
                <h3 className="font-[family-name:var(--font-instrument-serif)] text-[22px] md:text-[26px] leading-[1.15] text-[color:var(--ink)]">
                  {e.label}
                </h3>
                <p className="mt-1.5 font-[family-name:var(--font-barlow)] text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[560px]">
                  {e.description}
                </p>
              </div>
              <ArrowEast className="w-3.5 h-3.5 text-[color:var(--ink-3)] group-hover:text-[color:var(--ink)] group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </li>
        ))}
      </ol>

      <p className="mt-12 pt-6 border-t border-[color:var(--rule)] font-[family-name:var(--font-barlow)] italic text-[12.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[620px]">
        Looking for provider connections? HubSpot, email senders, and outbound webhooks live on{' '}
        <Link
          href="/dashboard/integrations"
          className="text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
        >
          The Wire
        </Link>
        .
      </p>
    </div>
  );
}
