/**
 * Integration catalogue — static metadata for every card on The Wire.
 *
 * `status: 'live'` integrations render an interactive card with connect /
 * configure actions. `status: 'forthcoming'` items render as dimmer cards
 * with a "— forthcoming" badge and no action. That honesty is the point.
 *
 * Section is the visual grouping on the page:
 *   crm        → Wire services
 *   dispatch   → Dispatch channels (email senders)
 *   outbound   → Outbound cables (webhooks, notifications)
 *   docket     → On the docket (distant roadmap, billing / automation)
 *
 * `panel` is the drawer body key — only meaningful for live integrations.
 */

export type IntegrationSection = 'crm' | 'dispatch' | 'outbound' | 'docket';
export type IntegrationStatus = 'live' | 'forthcoming';
export type IntegrationPanel = 'hubspot' | 'email' | 'webhook';

export interface IntegrationMeta {
  id: string;
  name: string;
  tagline: string;
  section: IntegrationSection;
  status: IntegrationStatus;
  panel?: IntegrationPanel;
}

export const SECTIONS: Array<{ key: IntegrationSection; kicker: string; title: string; note?: string }> = [
  { key: 'crm',      kicker: 'Wire services',     title: 'Customer record desks',  note: 'Push verified leads and contacts to your CRM of record.' },
  { key: 'dispatch', kicker: 'Dispatch channels', title: 'Sending your outreach',  note: 'One active provider per workspace. Secrets stay encrypted.' },
  { key: 'outbound', kicker: 'Outbound cables',   title: 'Alerts and webhooks',    note: 'Get notified when a dispatch lands or a reply comes in.' },
  { key: 'docket',   kicker: 'On the docket',     title: 'Forthcoming partners',   note: 'We show the roadmap so there are no surprises.' },
];

export const CATALOG: IntegrationMeta[] = [
  // CRM
  { id: 'hubspot',    name: 'HubSpot',    tagline: 'OAuth · two-way companies & contacts sync',   section: 'crm',      status: 'live',        panel: 'hubspot' },
  { id: 'salesforce', name: 'Salesforce', tagline: 'OAuth · lead and opportunity push',           section: 'crm',      status: 'forthcoming' },
  { id: 'pipedrive',  name: 'Pipedrive',  tagline: 'API key · deal and person sync',              section: 'crm',      status: 'forthcoming' },
  { id: 'close',      name: 'Close',      tagline: 'API key · lead sync',                         section: 'crm',      status: 'forthcoming' },

  // Dispatch (email)
  { id: 'email',      name: 'Email sender', tagline: 'Resend, SendGrid, or any SMTP server',      section: 'dispatch', status: 'live',        panel: 'email' },

  // Outbound
  { id: 'webhook',    name: 'Outbound webhook', tagline: 'HTTP POST on dispatch complete / failed', section: 'outbound', status: 'live',      panel: 'webhook' },
  { id: 'slack',      name: 'Slack',      tagline: 'Notify a channel when a reply arrives',       section: 'outbound', status: 'forthcoming' },

  // Docket
  { id: 'zapier',     name: 'Zapier',     tagline: 'Thousands of third-party triggers & actions', section: 'docket',   status: 'forthcoming' },
  { id: 'stripe',     name: 'Stripe',     tagline: 'Billing + subscription management',           section: 'docket',   status: 'forthcoming' },
];
