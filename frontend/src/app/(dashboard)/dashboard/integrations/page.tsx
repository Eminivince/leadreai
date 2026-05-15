'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useHubSpotStatus } from '@/hooks/useHubSpot';
import { apiFetch } from '@/lib/api';
import type { ApiResponse, Workspace } from '@leadreai/shared';
import { CATALOG, SECTIONS, type IntegrationMeta } from '@/components/integrations/catalog';
import { IntegrationCard, type CardMetaEntry, type CardStatus } from '@/components/integrations/IntegrationCard';
import { IntegrationDrawer } from '@/components/integrations/IntegrationDrawer';
import { HubSpotPanel } from '@/components/integrations/panels/HubSpotPanel';
import { EmailPanel } from '@/components/integrations/panels/EmailPanel';
import { WebhookPanel } from '@/components/integrations/panels/WebhookPanel';
import { PageHelp } from '@/components/ui/PageHelp';

/* ─────────────────────────────────────────────────────────────────
 * Integrations — `/dashboard/integrations`.
 *
 * Grid of integration cards (HubSpot, Salesforce, email senders, etc.)
 * Live integrations open their panel in a right-side drawer; forthcoming
 * ones are muted cards with no action.
 *
 * OAuth return handling: HubSpot's callback route redirects back here
 * with ?crm=connected or ?crm=error. We toast + auto-open the HubSpot
 * drawer on success so the user sees the new state immediately.
 * ───────────────────────────────────────────────────────────────── */

function truncateUrl(u: string, max = 42): string {
 if (u.length <= max) return u;
 return u.slice(0, max - 1) + '…';
}

export default function IntegrationsPage() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const { workspaceId } = useWorkspace();
 const [openId, setOpenId] = useState<string | null>(null);

 // Live-state queries (these also drive card metadata)
 const { data: hubspotStatus } = useHubSpotStatus(workspaceId);

 const { data: workspaceData } = useQuery({
  queryKey: ['workspace', workspaceId],
  queryFn: () => apiFetch<ApiResponse<Workspace>>(`/api/v1/workspaces/${workspaceId}`),
  enabled: !!workspaceId,
 });

 const { data: emailConfig } = useQuery({
  queryKey: ['email-config', workspaceId],
  queryFn: () =>
   apiFetch<{
    success: true;
    data: {
     provider: string;
     fromEmail: string;
     verifiedAt?: string;
    } | null;
   }>(`/api/v1/workspaces/${workspaceId}/email-config`),
  enabled: !!workspaceId,
  select: (r) => r.data,
 });

 const webhookUrl = workspaceData?.data?.settings?.webhookUrl ?? '';

 // Auto-open HubSpot drawer on OAuth return
 useEffect(() => {
  const crm = searchParams.get('crm');
  if (crm === 'connected') {
   toast.success('HubSpot connected — Connected successfully.');
   setOpenId('hubspot');
   router.replace('/dashboard/integrations');
  } else if (crm === 'error') {
   toast.error('HubSpot connection failed. Please try again.');
   setOpenId('hubspot');
   router.replace('/dashboard/integrations');
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [searchParams]);

 // Derive card state per integration from live queries
 const cardStatus = useMemo(() => {
  const map = new Map<string, { status: CardStatus; meta?: CardMetaEntry[] }>();

  for (const item of CATALOG) {
   if (item.status === 'forthcoming') {
    map.set(item.id, { status: 'forthcoming' });
    continue;
   }

   if (item.id === 'hubspot') {
    if (hubspotStatus?.connected) {
     map.set(item.id, {
      status: 'on-the-wire',
      meta: [
       { label: 'Portal', value: hubspotStatus.portalId ?? '—', mono: true },
       {
        label: 'Last synced',
        value: hubspotStatus.lastSyncAt
         ? new Date(hubspotStatus.lastSyncAt).toLocaleDateString('en-US', {
           month: 'short',
           day: 'numeric',
          })
         : '—',
       },
      ],
     });
    } else {
     map.set(item.id, { status: 'not-filed' });
    }
    continue;
   }

   if (item.id === 'email') {
    if (emailConfig?.verifiedAt) {
     map.set(item.id, {
      status: 'on-the-wire',
      meta: [
       { label: 'Provider', value: emailConfig.provider },
       { label: 'From', value: emailConfig.fromEmail, mono: true },
      ],
     });
    } else {
     map.set(item.id, { status: 'not-filed' });
    }
    continue;
   }

   if (item.id === 'webhook') {
    if (webhookUrl) {
     map.set(item.id, {
      status: 'on-the-wire',
      meta: [{ label: 'Endpoint', value: truncateUrl(webhookUrl), mono: true }],
     });
    } else {
     map.set(item.id, { status: 'not-filed' });
    }
    continue;
   }

   map.set(item.id, { status: 'not-filed' });
  }

  return map;
 }, [hubspotStatus, emailConfig, webhookUrl]);

 const openMeta: IntegrationMeta | null = useMemo(
  () => (openId ? CATALOG.find((c) => c.id === openId) ?? null : null),
  [openId],
 );

 const handleOpen = (item: IntegrationMeta) => {
  if (item.status === 'forthcoming') return;
  setOpenId(item.id);
 };

 const handleClose = () => setOpenId(null);

 // Group catalog by section
 const sections = SECTIONS.map((s) => ({
  ...s,
  items: CATALOG.filter((c) => c.section === s.key),
 }));

 // Count live "On the wire" for the summary
 const liveConnected = Array.from(cardStatus.values()).filter((v) => v.status === 'on-the-wire').length;
 const totalLive = CATALOG.filter((c) => c.status === 'live').length;

 return (
  <motion.div
   initial={{ opacity: 0, y: 10 }}
   animate={{ opacity: 1, y: 0 }}
   transition={{ duration: 0.28 }}
  >
   {/* Page header — framed as a Settings sub-page */}
   <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
    <div className="max-w-[1280px] mx-auto">
     <div className="flex items-center gap-1.5 mb-3 font-mono text-[10.5px] text-[color:var(--ink-3)]">
      <Link
       href="/dashboard/settings"
       className="hover:text-[color:var(--ink)] transition-colors"
      >
       Settings
      </Link>
      <span className="text-[color:var(--ink-3)]/60">/</span>
      <span className="text-[color:var(--ink-2)]">Integrations</span>
     </div>
     <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-6 flex-wrap">
     <div>
      <h1 className="font-display text-[24px] sm:text-[28px] md:text-[32px] tracking-[-0.01em] text-[color:var(--ink)]">
       Integrations
      </h1>
      <p className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5">
       Connect your CRM, email sender, and webhooks.
      </p>
     </div>
     <div className="flex items-center gap-3 flex-wrap">
      <PageHelp
       title="Integrations"
       body="Connect external tools — CRM, email sender, and outbound webhooks. Live integrations push or pull data automatically."
       tips={[
        'HubSpot sync exports enriched leads directly to your CRM.',
        'Outbound webhooks fire on new leads or campaign replies — connect Zapier, Make, or any HTTP endpoint.',
        'Gmail sender lets you send campaigns from your own Google account.',
       ]}
      />
      <span className="text-[13px] text-[color:var(--ink-3)]">Connected:</span>
      <span className="font-bold text-[color:var(--ember)] text-[15px]">
       {liveConnected}
       <span className="font-normal text-[color:var(--ink-3)] ml-1">/ {totalLive}</span>
      </span>
     </div>
     </div>
    </div>
   </div>

   {/* Sections */}
   <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col gap-6 sm:gap-8">
    {sections.map((s) => (
     <section key={s.key}>
      {/* Section label */}
      <div className="mb-4">
       <h2 className="text-[13px] font-semibold text-[color:var(--ink)] uppercase tracking-wide">
        {s.title}
       </h2>
       {s.note && (
        <p className="text-[12.5px] text-[color:var(--ink-3)] mt-0.5">{s.note}</p>
       )}
      </div>

      <div
       className={`grid gap-4 ${
        s.key === 'dispatch' || s.key === 'outbound'
         ? 'grid-cols-1 md:grid-cols-2'
         : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
       }`}
      >
       {s.items.map((item) => {
        const st = cardStatus.get(item.id) ?? { status: 'not-filed' as CardStatus };
        return (
         <IntegrationCard
          key={item.id}
          meta={item}
          status={st.status}
          {...(st.meta ? { metaEntries: st.meta } : {})}
          onOpen={() => handleOpen(item)}
         />
        );
       })}
      </div>
     </section>
    ))}

    {/* Footer note */}
    <p className="text-[12.5px] text-[color:var(--ink-3)] pt-2 border-t border-[color:var(--rule)]">
     Forthcoming integrations are shown because they&rsquo;re on the roadmap — they are not yet active.{' '}
     <a
      href="mailto:support@leadreai.com"
      className="text-[color:var(--ink)] underline underline-offset-2"
     >
      Request a priority
     </a>{' '}
     if one is blocking you.
    </p>
   </div>

   {/* Drawer */}
   <IntegrationDrawer meta={openMeta} open={!!openMeta} onClose={handleClose}>
    {openMeta?.panel === 'hubspot' && workspaceId && <HubSpotPanel workspaceId={workspaceId} />}
    {openMeta?.panel === 'email' && workspaceId && <EmailPanel workspaceId={workspaceId} />}
    {openMeta?.panel === 'webhook' && workspaceId && <WebhookPanel workspaceId={workspaceId} />}
   </IntegrationDrawer>
  </motion.div>
 );
}
