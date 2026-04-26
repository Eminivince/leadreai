'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────
 * /pricing — dedicated editorial pricing page.
 *
 * Inherits the palette + typography from the landing page, but with
 * its own masthead + dateline so it reads as a standalone edition.
 * Three tiers (Reader / Correspondent / Bureau), a comparison table,
 * an editorial FAQ, and a final CTA.
 * ───────────────────────────────────────────────────────────────── */

/* ── Glyphs ─────────────────────────────────────────────────── */
function ArrowEast({ className = 'w-3.5 h-3.5' }: { className?: string }) {
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

function CheckMark({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="m3 8 3.5 3.5L13 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Masthead ───────────────────────────────────────────────── */
function Masthead() {
  return (
    <header className="relative z-40 border-b border-[color:var(--rule)]/70">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 pt-5 pb-4 flex items-end justify-between gap-6">
        <div className="hidden md:flex flex-col gap-0.5 min-w-[200px]">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)]">
            Vol I · Issue 07
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
            The Subscriptions Page
          </span>
        </div>

        <Link href="/" className="flex items-baseline gap-2 shrink-0">
          <span className="font-[family-name:var(--font-instrument-serif)] italic text-2xl md:text-[28px] leading-none text-[color:var(--ink)] tracking-tight">
            Leadre
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] translate-y-[-1px]">
            AI
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-5">
            {[
              { label: 'Method',       href: '/#method' },
              { label: 'Capabilities', href: '/#capabilities' },
              { label: 'Accounts',     href: '/#accounts' },
              { label: 'Pricing',      href: '/pricing' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`font-[family-name:var(--font-barlow)] text-[13px] transition ${
                  l.href === '/pricing'
                    ? 'text-[color:var(--ink)]'
                    : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <Link
            href="/login"
            className="hidden md:inline font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="font-[family-name:var(--font-barlow)] text-[13px] font-medium bg-[color:var(--ink)] text-[color:var(--paper)] px-3.5 py-2 rounded-full inline-flex items-center gap-1.5 hover:bg-[color:var(--forest)] transition-colors"
          >
            Start for free <ArrowEast className="w-3 h-3" />
          </Link>
        </nav>
      </div>
    </header>
  );
}

/* ── Hero ───────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 pt-14 md:pt-20 pb-10 md:pb-14">
        <div className="flex items-center gap-3 mb-8">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            Subscriptions
          </span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="font-[family-name:var(--font-instrument-serif)] text-[56px] md:text-[92px] lg:text-[112px] leading-[0.92] tracking-[-0.02em] text-[color:var(--ink)] max-w-[1080px]"
        >
          A <em className="italic text-[color:var(--forest)]">paper</em>, <br className="hidden md:inline" />
          not a <em className="italic text-[color:var(--forest)]">data&nbsp;tax</em>.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-8 max-w-[640px] font-[family-name:var(--font-barlow)] text-[17px] md:text-[19px] leading-[1.5] text-[color:var(--ink-2)]"
        >
          Three subscriptions. Monthly, no annual commitment. Every tier carries the same
          principle on every field — <span className="italic text-[color:var(--ink)]">a source or an em-dash; never a guess.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[color:var(--ink-3)]"
        >
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
            No credit card to start
          </span>
          <span className="w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
            Cancel from the dashboard
          </span>
          <span className="w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
            Provenance on every plan
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/* ── Tier card ──────────────────────────────────────────────── */
interface Tier {
  name: string;
  subtitle: string;
  price: string;
  priceSub: string;
  pitch: string;
  includes: string[];
  notIncluded?: string[];
  cta: string;
  href: string;
  highlight: boolean;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    name: 'Reader',
    subtitle: 'On the house',
    price: 'Free',
    priceSub: 'Forever, with limits',
    pitch: 'For operators running a list a week. Every feature honest, every field sourced — just smaller quotas.',
    includes: [
      '3 dossiers / month',
      'Up to 25 leads per query',
      'Dynamic output columns',
      'Email + phone verification',
      'Provenance per field',
      'CSV export',
      'Community support',
    ],
    notIncluded: ['CRM sync', 'Outbound webhook', 'Named account support'],
    cta: 'Start for free',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Correspondent',
    subtitle: 'Most of our customers',
    price: '$49',
    priceSub: 'per seat · monthly',
    pitch: 'For teams prospecting every day. All quotas lifted; all integrations live.',
    includes: [
      '60 dossiers / month',
      'Up to 200 leads per query',
      'Everything in Reader',
      'CRM sync (HubSpot)',
      'Email senders (Resend / SendGrid / SMTP)',
      'Outbound webhook',
      'Dispatch ledger + exports',
      'Priority support',
    ],
    cta: 'Start a trial',
    href: '/register',
    highlight: true,
    badge: 'Most chosen',
  },
  {
    name: 'Bureau',
    subtitle: 'For desks with a research budget',
    price: 'Custom',
    priceSub: 'Annual · by conversation',
    pitch: 'For teams that need scale, compliance, and a human on the other end of the wire.',
    includes: [
      'Unlimited dispatches',
      '1,000+ leads per query',
      'Everything in Correspondent',
      'Private seed lists',
      'Managed data sources',
      'SSO + audit export',
      'Custom data residency',
      'Named account support',
      'Annual SLA',
    ],
    cta: 'Request a conversation',
    href: '/register',
    highlight: false,
  },
];

function TierCard({ tier }: { tier: Tier }) {
  const isDark = tier.highlight;
  return (
    <div
      className={`flex flex-col h-full rounded-sm border p-8 relative ${
        isDark
          ? 'bg-[color:var(--ink)] text-[color:var(--paper)] border-[color:var(--ink)]'
          : 'bg-[color:var(--paper)] text-[color:var(--ink)] border-[color:var(--rule)]'
      }`}
    >
      {tier.badge && (
        <span className="absolute -top-3 left-6 font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase bg-[color:var(--rust)] text-[color:var(--paper)] px-3 py-1 rounded-full">
          {tier.badge}
        </span>
      )}

      <div className="mb-6">
        <span
          className={`font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase ${
            isDark ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-2)]'
          }`}
        >
          {tier.name}
        </span>
        <p
          className={`mt-1 font-[family-name:var(--font-barlow)] italic text-[13px] ${
            isDark ? 'text-[color:var(--paper)]/70' : 'text-[color:var(--ink-3)]'
          }`}
        >
          {tier.subtitle}
        </p>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-[family-name:var(--font-instrument-serif)] text-[64px] leading-none tracking-[-0.02em]">
          {tier.price}
        </span>
      </div>
      <span
        className={`font-[family-name:var(--font-barlow)] text-[12.5px] mt-1 ${
          isDark ? 'text-[color:var(--paper)]/60' : 'text-[color:var(--ink-3)]'
        }`}
      >
        {tier.priceSub}
      </span>

      <p
        className={`mt-6 pb-6 border-b font-[family-name:var(--font-instrument-serif)] italic text-[18px] leading-[1.35] ${
          isDark
            ? 'border-[color:var(--paper)]/15'
            : 'border-[color:var(--rule)]'
        }`}
      >
        {tier.pitch}
      </p>

      <ul className="mt-6 space-y-3 flex-1">
        {tier.includes.map((f) => (
          <li
            key={f}
            className="flex items-start gap-3 font-[family-name:var(--font-barlow)] text-[13.5px] leading-[1.5]"
          >
            <CheckMark
              className={`w-3 h-3 mt-[5px] shrink-0 ${
                isDark ? 'text-[color:var(--paper)]' : 'text-[color:var(--forest)]'
              }`}
            />
            <span className={isDark ? 'text-[color:var(--paper)]/90' : 'text-[color:var(--ink)]'}>
              {f}
            </span>
          </li>
        ))}
        {tier.notIncluded?.map((f) => (
          <li
            key={f}
            className="flex items-start gap-3 font-[family-name:var(--font-barlow)] text-[13px] leading-[1.5] opacity-60"
          >
            <span
              className={`inline-block w-3 h-px mt-[10px] shrink-0 ${
                isDark ? 'bg-[color:var(--paper)]/40' : 'bg-[color:var(--ink-3)]'
              }`}
            />
            <span
              className={`italic ${
                isDark ? 'text-[color:var(--paper)]/50' : 'text-[color:var(--ink-3)]'
              }`}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={tier.href}
        className={`group mt-8 inline-flex items-center justify-between gap-2 px-5 py-3 rounded-full font-[family-name:var(--font-barlow)] text-[13.5px] font-medium transition-colors ${
          isDark
            ? 'bg-[color:var(--paper)] text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
            : 'bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--forest)]'
        }`}
      >
        {tier.cta}
        <ArrowEast className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function Tiers() {
  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-16 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {TIERS.map((t) => (
            <TierCard key={t.name} tier={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Comparison table ───────────────────────────────────────── */
interface CompareRow {
  group: string;
  label: string;
  reader: React.ReactNode;
  corr: React.ReactNode;
  bureau: React.ReactNode;
}

const COMPARE: CompareRow[] = [
  { group: 'Research', label: 'Dispatches per month',       reader: '3',      corr: '60',     bureau: 'Unlimited' },
  { group: 'Research', label: 'Leads per query',            reader: '25',     corr: '200',    bureau: '1,000+' },
  { group: 'Research', label: 'Dynamic output columns',     reader: true,     corr: true,     bureau: true },
  { group: 'Research', label: 'Provenance per field',       reader: true,     corr: true,     bureau: true },
  { group: 'Research', label: 'Named-contact discovery',    reader: true,     corr: true,     bureau: true },
  { group: 'Research', label: 'Private seed lists',         reader: false,    corr: false,    bureau: true },

  { group: 'Verification', label: 'Email verification',     reader: true,     corr: true,     bureau: true },
  { group: 'Verification', label: 'Phone normalization',    reader: true,     corr: true,     bureau: true },
  { group: 'Verification', label: 'SMTP deep probe',        reader: false,    corr: true,     bureau: true },

  { group: 'Integrations', label: 'CSV / XLSX export',      reader: true,     corr: true,     bureau: true },
  { group: 'Integrations', label: 'HubSpot CRM sync',       reader: false,    corr: true,     bureau: true },
  { group: 'Integrations', label: 'Email senders',          reader: false,    corr: true,     bureau: true },
  { group: 'Integrations', label: 'Outbound webhook',       reader: false,    corr: true,     bureau: true },
  { group: 'Integrations', label: 'SSO / SAML',             reader: false,    corr: false,    bureau: true },

  { group: 'Support', label: 'Community support',           reader: true,     corr: true,     bureau: true },
  { group: 'Support', label: 'Priority support',            reader: false,    corr: true,     bureau: true },
  { group: 'Support', label: 'Named account manager',       reader: false,    corr: false,    bureau: true },
  { group: 'Support', label: 'Annual SLA + contract',       reader: false,    corr: false,    bureau: true },
];

function Cell({ v, dark = false }: { v: React.ReactNode; dark?: boolean }) {
  if (v === true)
    return <CheckMark className={`w-3.5 h-3.5 ${dark ? 'text-[color:var(--paper)]' : 'text-[color:var(--forest)]'}`} />;
  if (v === false)
    return (
      <span
        className={`inline-block w-3 h-px ${dark ? 'bg-[color:var(--paper)]/40' : 'bg-[color:var(--ink-3)]'}`}
      />
    );
  return (
    <span
      className={`font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums ${
        dark ? 'text-[color:var(--paper)]' : 'text-[color:var(--ink)]'
      }`}
    >
      {v}
    </span>
  );
}

function ComparisonTable() {
  // Group rows by category for visual breaks
  const grouped: Record<string, CompareRow[]> = {};
  for (const row of COMPARE) {
    const list = grouped[row.group] ?? [];
    list.push(row);
    grouped[row.group] = list;
  }

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--paper)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <div className="flex items-center gap-3 mb-6">
          <span className="block w-8 h-px bg-[color:var(--ink)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
            Compare the tiers
          </span>
        </div>
        <h2 className="font-[family-name:var(--font-instrument-serif)] text-[40px] md:text-[56px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)] mb-10 max-w-[720px]">
          The full <em className="italic text-[color:var(--forest)]">ledger</em>.
        </h2>

        <div className="border border-[color:var(--rule)] rounded-sm overflow-hidden">
          {/* Sticky header */}
          <div className="grid grid-cols-[minmax(220px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] bg-[color:var(--paper-2)] border-b border-[color:var(--rule)]">
            <div className="px-5 py-4 font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Feature
            </div>
            {['Reader', 'Correspondent', 'Bureau'].map((t, i) => (
              <div
                key={t}
                className={`px-5 py-4 text-center ${
                  i === 1 ? 'bg-[color:var(--ink)] text-[color:var(--paper)]' : ''
                }`}
              >
                <div
                  className={`font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase ${
                    i === 1 ? 'text-[color:var(--paper)]/80' : 'text-[color:var(--ink-2)]'
                  }`}
                >
                  {t}
                </div>
              </div>
            ))}
          </div>

          {/* Groups */}
          {Object.entries(grouped).map(([group, rows]) => (
            <div key={group}>
              <div className="grid grid-cols-[minmax(220px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] bg-[color:var(--paper-3)] border-b border-[color:var(--rule)]">
                <div className="px-5 py-2 font-[family-name:var(--font-jetbrains-mono)] text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
                  {group}
                </div>
                <div />
                <div className="bg-[color:var(--ink)]/90" />
                <div />
              </div>
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[minmax(220px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)] border-b border-[color:var(--rule)]/70 last:border-b-0 items-center"
                >
                  <div className="px-5 py-3.5 font-[family-name:var(--font-barlow)] text-[13.5px] text-[color:var(--ink)]">
                    {row.label}
                  </div>
                  <div className="px-5 py-3.5 text-center">
                    <Cell v={row.reader} />
                  </div>
                  <div className="px-5 py-3.5 text-center bg-[color:var(--ink)]/[0.97]">
                    <Cell v={row.corr} dark />
                  </div>
                  <div className="px-5 py-3.5 text-center">
                    <Cell v={row.bureau} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ────────────────────────────────────────────────────── */
const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'What counts as a dispatch?',
    a: (
      <>
        One dispatch is one query submitted to the desk — regardless of how many leads it returns.
        &ldquo;Top 20 Nigerian fintechs with funding&rdquo; is one dispatch, whether it surfaces 5 or 200 leads.
      </>
    ),
  },
  {
    q: 'Do unused dispatches roll over?',
    a: (
      <>
        No. Dispatches reset at the start of each billing period. Bureau customers have no cap,
        so the question doesn&rsquo;t apply.
      </>
    ),
  },
  {
    q: 'What happens if I exceed my plan?',
    a: (
      <>
        We don&rsquo;t surprise-bill. On Reader and Correspondent, further dispatches are paused
        until the next period or you upgrade. The dashboard shows your remaining balance at all times.
      </>
    ),
  },
  {
    q: 'Can I cancel anytime?',
    a: (
      <>
        Yes — monthly subscriptions can be cancelled from the dashboard and take effect at the end of
        the current period. Bureau subscriptions follow the terms on your contract.
      </>
    ),
  },
  {
    q: 'How do you price Bureau?',
    a: (
      <>
        Bureau is annual and priced by seat count, expected dispatch volume, and whether we&rsquo;re
        operating private seed lists on your behalf. Most desks land between $1,200 and $8,000 / month.
      </>
    ),
  },
  {
    q: 'Do you offer discounts for non-profits or journalism teams?',
    a: (
      <>
        Yes. Newsrooms, watchdog groups, and bona fide non-profits get Correspondent at 50% off;
        Bureau at cost. Reach out with a link to your mission and a work email.
      </>
    ),
  },
  {
    q: 'Where is my data stored?',
    a: (
      <>
        Primary region is Europe (EU-West). Bureau customers can request alternate regions or a
        dedicated instance as part of their contract.
      </>
    ),
  },
  {
    q: 'Is provenance really on every tier?',
    a: (
      <>
        Yes. The honesty principle isn&rsquo;t a paid feature — Reader gets source URLs and
        verification timestamps on every lead, same as Bureau. That&rsquo;s the product.
      </>
    ),
  },
];

function FAQSection() {
  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-12 lg:gap-20">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <span className="block w-8 h-px bg-[color:var(--ink)]" />
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
                From the letters page
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-instrument-serif)] text-[40px] md:text-[56px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
              Questions we get <em className="italic text-[color:var(--forest)]">a lot</em>.
            </h2>
            <p className="mt-5 font-[family-name:var(--font-barlow)] text-[14.5px] leading-[1.55] text-[color:var(--ink-2)] max-w-[360px]">
              If yours isn&rsquo;t here, reach the desk at{' '}
              <a
                href="mailto:support@leadreai.com"
                className="text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
              >
                support@leadreai.com
              </a>{' '}
              and we will write one back.
            </p>
          </div>

          <ol className="border-t border-[color:var(--rule)]">
            {FAQ.map((item, i) => (
              <li
                key={item.q}
                className="grid grid-cols-[48px_1fr] gap-6 py-6 border-b border-[color:var(--rule)]"
              >
                <span className="font-[family-name:var(--font-instrument-serif)] italic text-[22px] leading-none text-[color:var(--forest)] tabular-nums">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-instrument-serif)] text-[20px] md:text-[22px] leading-[1.2] tracking-[-0.01em] text-[color:var(--ink)]">
                    {item.q}
                  </h3>
                  <p className="mt-2 font-[family-name:var(--font-barlow)] text-[14.5px] leading-[1.6] text-[color:var(--ink-2)]">
                    {item.a}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ──────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--paper)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-28 md:py-40">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-8">
            <div className="flex items-center gap-3 mb-8">
              <span className="block w-8 h-px bg-[color:var(--ink)]" />
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
                Still deciding
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-instrument-serif)] text-[56px] md:text-[96px] lg:text-[128px] leading-[0.9] tracking-[-0.02em] text-[color:var(--ink)]">
              File three <br />
              <em className="italic text-[color:var(--forest)]">dispatches</em> for free.
            </h2>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-6 lg:pl-8 lg:border-l lg:border-[color:var(--rule)]">
            <p className="font-[family-name:var(--font-barlow)] text-[15.5px] leading-[1.6] text-[color:var(--ink-2)]">
              No card. No pitch call. If the desk saves you an afternoon, you&rsquo;ll know
              before the first bill lands.
            </p>
            <Link
              href="/register"
              className="group inline-flex items-center justify-between gap-4 w-full bg-[color:var(--ink)] text-[color:var(--paper)] px-6 py-4 rounded-full hover:bg-[color:var(--forest)] transition-colors"
            >
              <span className="font-[family-name:var(--font-barlow)] text-[15px] font-medium">
                Start for free
              </span>
              <ArrowEast className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 font-[family-name:var(--font-barlow)] italic text-[13.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[5px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
            >
              Already subscribing? Sign in
              <ArrowEast className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Colophon (footer) ──────────────────────────────────────── */
function Colophon() {
  return (
    <footer className="border-t border-[color:var(--rule)] bg-[color:var(--paper-2)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-16">
        <div className="flex items-center justify-between gap-8 pb-6 border-b border-[color:var(--rule)]">
          <Link
            href="/"
            className="font-[family-name:var(--font-instrument-serif)] italic text-[40px] md:text-[64px] leading-[0.82] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            LeadreAI
          </Link>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] text-right">
            Subscriptions page <br />
            est. MMXXVI
          </span>
        </div>
        <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
            © MMXXVI LeadreAI · All dispatches reserved
          </span>
          <div className="flex items-center gap-4">
            {[
              { label: 'Front page', href: '/' },
              { label: 'Sign in',    href: '/login' },
              { label: 'Sign up',    href: '/register' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)]"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function PricingPage() {
  return (
    <main
      className="bg-[color:var(--paper)] text-[color:var(--ink)] min-h-screen selection:bg-[color:var(--forest)] selection:text-[color:var(--paper)]"
    >
      <Masthead />
      <Hero />
      <Tiers />
      <ComparisonTable />
      <FAQSection />
      <FinalCTA />
      <Colophon />
    </main>
  );
}
