/* ─────────────────────────────────────────────────────────────────
 * Canonical settings registry.
 *
 * Single source of truth for both the settings layout sidebar and
 * the settings index overview. Each section belongs to a group; the
 * groups define the visual + semantic ordering of every settings
 * surface.
 *
 * Adding a new settings page: add a row here, set the group, and it
 * appears in both the sidebar and the index automatically.
 * ───────────────────────────────────────────────────────────────── */

import type { ReactElement } from 'react';

export type SettingsGroupKey =
 | 'you'
 | 'workspace'
 | 'outreach'
 | 'billing'
 | 'security';

export interface SettingsGroup {
 key: SettingsGroupKey;
 label: string;
 lede: string;
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
 { key: 'you', label: 'You', lede: 'Your personal profile.' },
 { key: 'workspace', label: 'Workspace', lede: 'How this desk is set up.' },
 {
  key: 'outreach',
  label: 'Outreach',
  lede: 'Knowledge, sender, and what the engine must avoid.',
 },
 { key: 'billing', label: 'Billing', lede: 'Plan, credits, and budget caps.' },
 {
  key: 'security',
  label: 'Security',
  lede: 'Credentials, SSO, and audit history.',
 },
];

/* ── Icon set ──────────────────────────────────────────────────── */
type IconProps = { className?: string };
const Icon = ({
 children,
 className = 'w-4 h-4',
}: IconProps & { children: React.ReactNode }) => (
 <svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.6"
  strokeLinecap="round"
  strokeLinejoin="round"
  className={className}
 >
  {children}
 </svg>
);

export const IconAccount = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <circle cx="12" cy="8" r="4" />
  <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
 </Icon>
);
export const IconWorkspace = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  <path d="M9 22V12h6v10" />
 </Icon>
);
export const IconBranding = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.3l-5.2 2.7 1-5.8L3.6 9.1l5.8-.8L12 3z" />
 </Icon>
);
export const IconTeam = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
  <circle cx="9" cy="7" r="4" />
  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
 </Icon>
);
export const IconClients = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <path d="M3 10h18M9 4v16" />
 </Icon>
);
export const IconKnowledge = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
 </Icon>
);
export const IconEmail = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
  <path d="M22 6l-10 7L2 6" />
 </Icon>
);
export const IconSuppression = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <circle cx="12" cy="12" r="9" />
  <path d="M5.5 5.5l13 13" />
 </Icon>
);
export const IconDataSources = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <ellipse cx="12" cy="5" rx="8" ry="3" />
  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
  <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
 </Icon>
);
export const IconBilling = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <rect x="1" y="4" width="22" height="16" rx="2" />
  <path d="M1 10h22" />
 </Icon>
);
export const IconKey = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <circle cx="7.5" cy="15.5" r="4.5" />
  <path d="M21 2l-9.6 9.6M15.5 7.5 19 11l2.5-2.5L18 5l3-3" />
 </Icon>
);
export const IconShieldLock = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" />
  <rect x="9.5" y="11" width="5" height="4" rx="0.5" />
  <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
 </Icon>
);
export const IconAudit = (p: IconProps): ReactElement => (
 <Icon {...p}>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" />
 </Icon>
);

export type SectionIcon = (props: IconProps) => ReactElement;

/* ── Section registry ──────────────────────────────────────────── */

export type PlanBadge = 'enterprise' | 'agency' | null;

export interface SettingsSection {
 href: string;
 label: string;
 lede: string;
 group: SettingsGroupKey;
 icon: SectionIcon;
 badge?: PlanBadge;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
 /* You */
 {
  href: '/dashboard/settings/account',
  label: 'Account',
  lede: 'Profile, password, and the name on your outreach drafts.',
  group: 'you',
  icon: IconAccount,
 },

 /* Workspace */
 {
  href: '/dashboard/settings/workspace',
  label: 'General',
  lede: 'The desk name, defaults, and notification preferences.',
  group: 'workspace',
  icon: IconWorkspace,
 },
 {
  href: '/dashboard/settings/branding',
  label: 'Branding',
  lede: 'Logo and report titling — applied to CSV / XLSX / proof exports.',
  group: 'workspace',
  icon: IconBranding,
 },
 {
  href: '/dashboard/settings/team',
  label: 'Team',
  lede: 'Members, roles, and invitations.',
  group: 'workspace',
  icon: IconTeam,
 },
 {
  href: '/dashboard/settings/clients',
  label: 'Client workspaces',
  lede: 'Sub-workspaces for agency clients — parent admins inherit access.',
  group: 'workspace',
  icon: IconClients,
  badge: 'agency',
 },

 /* Outreach */
 {
  href: '/dashboard/settings/knowledge-base',
  label: 'Knowledge base',
  lede: 'What the agent should know about your company before writing drafts.',
  group: 'outreach',
  icon: IconKnowledge,
 },
 {
  href: '/dashboard/settings/email',
  label: 'Email & replies',
  lede: 'Sending account and where replies route back to the campaign.',
  group: 'outreach',
  icon: IconEmail,
 },
 {
  href: '/dashboard/settings/suppression',
  label: 'Suppression list',
  lede: 'Emails and domains the engine must never contact.',
  group: 'outreach',
  icon: IconSuppression,
 },
 {
  href: '/dashboard/settings/data-sources',
  label: 'Data sources',
  lede: 'Built-in providers, Apollo API keys, and custom uploads.',
  group: 'outreach',
  icon: IconDataSources,
 },

 /* Billing */
 {
  href: '/dashboard/settings/billing',
  label: 'Plan & credits',
  lede: 'Subscription, ledger, and the monthly budget cap.',
  group: 'billing',
  icon: IconBilling,
 },

 /* Security */
 {
  href: '/dashboard/settings/api-keys',
  label: 'API keys',
  lede: 'Credentials for programmatic access. Shown once on create.',
  group: 'security',
  icon: IconKey,
 },
 {
  href: '/dashboard/settings/security/sso',
  label: 'Single sign-on',
  lede: 'SAML 2.0 with Okta, Auth0, or Azure AD.',
  group: 'security',
  icon: IconShieldLock,
  badge: 'enterprise',
 },
 {
  href: '/dashboard/settings/security/audit',
  label: 'Audit retention',
  lede: 'How long audit-log rows survive. Default 90 days.',
  group: 'security',
  icon: IconAudit,
 },
];

/* ── Helpers ───────────────────────────────────────────────────── */

export function findActiveSection(pathname: string): SettingsSection | undefined {
 return SETTINGS_SECTIONS.find(
  (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
 );
}

export function sectionsByGroup(): Map<SettingsGroupKey, SettingsSection[]> {
 const map = new Map<SettingsGroupKey, SettingsSection[]>();
 for (const g of SETTINGS_GROUPS) map.set(g.key, []);
 for (const s of SETTINGS_SECTIONS) {
  const arr = map.get(s.group);
  if (arr) arr.push(s);
 }
 return map;
}

export function planBadgeStyle(b: PlanBadge): { label: string; cls: string } | null {
 if (b === 'enterprise') {
  return {
   label: 'Enterprise',
   cls: 'border-transparent text-[color:var(--ember)] bg-[color:var(--ember-bg)] font-mono text-[9.5px] tracking-[0.16em] uppercase',
  };
 }
 if (b === 'agency') {
  return {
   label: 'Agency',
   cls: 'border-transparent text-[color:var(--ember)] bg-[color:var(--ember-bg)] font-mono text-[9.5px] tracking-[0.16em] uppercase',
  };
 }
 return null;
}
