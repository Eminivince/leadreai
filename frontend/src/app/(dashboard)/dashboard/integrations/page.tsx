'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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

/* ─────────────────────────────────────────────────────────────────
 * The Wire — `/dashboard/integrations`.
 *
 * Editorial directory of every integration surface LeadreAI offers
 * (or plans to). Live integrations open their panel in a right-side
 * drawer; forthcoming ones are muted cards with no action.
 *
 * OAuth return handling: HubSpot's callback route redirects back here
 * with ?crm=connected or ?crm=error. We toast + auto-open the HubSpot
 * drawer on success so the user sees the new state immediately.
 * ───────────────────────────────────────────────────────────────── */

function truncateUrl(u: string, max = 42): string {
  if (u.length <= max) return u;
  return u.slice(0, max - 1) + '…';
}

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

/* ── Section header ─────────────────────────────────────────── */
function SectionHead({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="block w-8 h-px bg-[color:var(--ink)]" />
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          {kicker}
        </span>
      </div>
      <h2 className="font-[family-name:var(--font-instrument-serif)] text-[28px] md:text-[34px] leading-[1.05] tracking-[-0.015em] text-[color:var(--ink)]">
        {title}
      </h2>
      {note && (
        <p className="mt-2 font-[family-name:var(--font-barlow)] text-[14px] leading-[1.55] text-[color:var(--ink-2)] max-w-[620px]">
          {note}
        </p>
      )}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
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
      toast.success('HubSpot connected — welcome to the wire.');
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
                label: 'Last dispatched',
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

  // Count live "On the wire" for the hero meta
  const liveConnected = Array.from(cardStatus.values()).filter((v) => v.status === 'on-the-wire').length;
  const totalLive = CATALOG.filter((c) => c.status === 'live').length;

  return (
    <div className="max-w-[1480px] mx-auto px-6 md:px-8 lg:px-10 py-10 md:py-14">
      {/* Hero */}
      <section className="mb-14">
        <div className="flex items-center gap-3 mb-5">
          <Link
            href="/dashboard"
            className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
          >
            Dispatches
          </Link>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[color:var(--ink-3)]">/</span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            The Wire
          </span>
        </div>
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="max-w-[720px]">
            <h1 className="font-[family-name:var(--font-instrument-serif)] text-[48px] md:text-[72px] leading-[0.94] tracking-[-0.015em] text-[color:var(--ink)]">
              The <em className="italic text-[color:var(--forest)]">Wire</em>.
            </h1>
            <p className="mt-5 font-[family-name:var(--font-barlow)] text-[16px] md:text-[18px] leading-[1.5] text-[color:var(--ink-2)]">
              Every desk LeadreAI speaks to — your CRM, your sender, your webhook. Three are filed;
              the rest are on the docket. Connect anything; honesty about everything.
            </p>
          </div>
          <div className="flex items-baseline gap-8 pt-2">
            <div>
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                On the wire
              </span>
              <div className="mt-1 font-[family-name:var(--font-instrument-serif)] text-[40px] leading-none tabular-nums text-[color:var(--ink)]">
                {liveConnected}
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] text-[color:var(--ink-3)] ml-1">
                  / {totalLive}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sections */}
      <div className="flex flex-col gap-16">
        {sections.map((s) => (
          <section key={s.key}>
            <SectionHead kicker={s.kicker} title={s.title} note={s.note} />
            <div
              className={`grid gap-5 ${
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
      </div>

      {/* Trust footer */}
      <div className="mt-20 pt-6 border-t border-[color:var(--rule)] flex items-center justify-between gap-4 flex-wrap">
        <p className="font-[family-name:var(--font-barlow)] italic text-[12.5px] text-[color:var(--ink-2)] max-w-[540px]">
          A note on forthcoming partners: we show them because they&rsquo;re on the roadmap. We
          don&rsquo;t pretend they work.{' '}
          <Link
            href="mailto:support@leadreai.com"
            className="text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
          >
            Request a priority
          </Link>
          {' '}if one of them is blocking you.
        </p>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
          Vol I · Issue 07 · The Wire
          <span className="inline-flex items-baseline gap-1 ml-2">
            <ArrowEast className="w-2.5 h-2.5 relative top-[1px]" />
          </span>
        </span>
      </div>

      {/* Drawer */}
      <IntegrationDrawer meta={openMeta} open={!!openMeta} onClose={handleClose}>
        {openMeta?.panel === 'hubspot' && workspaceId && <HubSpotPanel workspaceId={workspaceId} />}
        {openMeta?.panel === 'email' && workspaceId && <EmailPanel workspaceId={workspaceId} />}
        {openMeta?.panel === 'webhook' && workspaceId && <WebhookPanel workspaceId={workspaceId} />}
      </IntegrationDrawer>
    </div>
  );
}
