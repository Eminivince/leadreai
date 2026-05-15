import Link from 'next/link';

import SiteNav from '@/components/marketing/SiteNav';

/**
 * Landing page — warm-cream / Instrument Serif design language.
 * Source of truth: .superpowers/brainstorm/19882-1778781621/content/authentic.html
 *
 * Server component for everything except SiteNav, which is a client component
 * because it owns the mobile hamburger menu state.
 */

const TRUST_STATS = [
  { num: '50', accent: 'k+', label: 'Leads delivered' },
  { num: '8', accent: 'm', label: 'Avg research run' },
  { num: '3', accent: '×', label: 'Sources per cell' },
  { num: '100', accent: '%', label: 'Evidence-backed' },
];

const DEMO_ROWS_VISIBLE = [
  { company: 'Paystack', domain: 'paystack.com', contact: 'Shola Akinlade', sources: '3 sources' },
  { company: 'Moniepoint', domain: 'moniepoint.com', contact: 'Tosin Eniolorunda', sources: '2 sources' },
];

const DEMO_ROWS_BLURRED = [
  { company: 'Flutterwave', domain: 'flutterwave.com', contact: 'Olugbenga Agboola', sources: '4 sources' },
  { company: 'Cowrywise', domain: 'cowrywise.com', contact: 'Razaq Ahmed', sources: '2 sources' },
];

const PILLARS = [
  {
    num: '01',
    title: 'Live research, not stale rows',
    body: 'Every job reads live sources. Results are fresh from the moment you run.',
  },
  {
    num: '02',
    title: 'Every cell has a receipt',
    body: 'Source URL, confidence score, and timestamp on every piece of data.',
  },
  {
    num: '03',
    title: 'Built for African markets',
    body: 'Coverage where Apollo is thin — Nigeria, Kenya, Ghana, and beyond.',
  },
];

const TESTIMONIALS = [
  {
    initial: 'T',
    name: 'Tunde Adeyemi',
    role: 'Outbound Agency, Lagos',
    quote:
      'We ran 3 client briefs in one week. Every table came back with verified emails and source links attached. My clients stopped asking "how do you know this?"',
  },
  {
    initial: 'A',
    name: 'Amara Okonkwo',
    role: 'Research Lead, Nairobi',
    quote:
      'Apollo has zero real coverage on the markets I work in. Leadre found 60 verified contacts in one run that would have taken me three days manually.',
  },
  {
    initial: 'K',
    name: 'Kofi Mensah',
    role: 'B2B Research, Accra',
    quote:
      "The evidence trail is the thing. I can show a client exactly where any piece of data came from. That's not a feature I had before. It changes conversations.",
  },
];

export default function LandingPage() {
  return (
    <main className="bg-[color:var(--paper)] text-[color:var(--ink)]">
      <SiteNav />
      <HeroSection />
      <WhatItIsSection />
      <TestimonialsSection />
      <SiteFooter />
    </main>
  );
}

/* ────────────────────────────────────────────────────────── */
/* HERO                                                       */
/* ────────────────────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="flex flex-col md:grid md:grid-cols-[1fr_420px] px-4 sm:px-6 md:px-12 md:min-h-[calc(100vh-56px)] border-b border-[color:var(--rule)]">
      {/* LEFT */}
      <div className="flex flex-col justify-center py-10 md:py-[60px] md:pr-16 md:border-r border-[color:var(--rule)]">
        {/* Eyebrow */}
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ember)] mb-6 flex items-center gap-2.5">
          <span className="w-5 h-px bg-[color:var(--ember)] flex-shrink-0" aria-hidden="true" />
          B2B intelligence · African markets
        </div>

        {/* Headline */}
        <h1 className="font-display font-normal text-[clamp(34px,8vw,64px)] leading-[1.05] tracking-[-0.02em] text-[color:var(--ink)] mb-7">
          Your clients ask
          <br />
          where the data
          <br />
          <em className="italic text-[color:var(--ink-2)]">comes from.</em>
          <br />
          Now you can show them.
        </h1>

        {/* Body */}
        <p className="font-sans text-[15px] text-[color:var(--ink-3)] leading-[1.7] max-w-[420px] mb-10">
          LeadreAI runs a research agent against live registries, filings, and public sources — and
          gives you a table where every cell links back to its evidence. Built specifically for
          markets Apollo and ZoomInfo don&apos;t cover well.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/register"
            className="bg-[color:var(--ink)] text-[color:var(--paper)] font-sans text-[13.5px] font-semibold px-6 py-3 rounded-lg flex items-center gap-2 hover:opacity-85 transition-opacity"
          >
            Start researching
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3.5 h-3.5 opacity-70"
              aria-hidden="true"
            >
              <path d="M3 8h10M8 3l5 5-5 5" />
            </svg>
          </Link>
          <div className="font-sans text-[13.5px] font-medium text-[color:var(--ink-3)] flex items-center gap-1.5">
            See a live demo
            <span className="text-[11px] text-[color:var(--ink-4)]">→ 8 min research run</span>
          </div>
        </div>

        {/* Trust strip */}
        <div className="mt-12 pt-6 border-t border-[color:var(--rule)] grid grid-cols-2 sm:flex sm:items-center gap-4 sm:gap-7">
          {TRUST_STATS.map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-4 sm:gap-7">
              <div className="flex flex-col gap-0.5">
                <div className="font-display text-[22px] font-normal text-[color:var(--ink)] tracking-[-0.02em] leading-none">
                  {stat.num}
                  <em className="not-italic font-display italic text-[color:var(--ember)]">
                    {stat.accent}
                  </em>
                </div>
                <div className="font-mono text-[9.5px] text-[color:var(--ink-4)] tracking-[0.12em] uppercase">
                  {stat.label}
                </div>
              </div>
              {i < TRUST_STATS.length - 1 && (
                <span className="hidden sm:block w-px h-8 bg-[color:var(--rule)]" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex flex-col justify-center py-10 md:py-12 md:pl-[52px]">
        <div className="font-mono text-[9.5px] text-[color:var(--ink-4)] tracking-[0.18em] uppercase mb-3">
          Live result — Fintech Series A, Lagos
        </div>

        {/* Query bar */}
        <div className="flex items-center gap-2.5 bg-[color:var(--paper)] border-[1.5px] border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 mb-1.5">
          <span className="font-sans text-[13px] text-[color:var(--ink-2)] flex-1">
            Fintech founders Series A+, Lagos
          </span>
          <span className="font-mono text-[9px] bg-[color:var(--ember-bg)] text-[color:var(--ember)] border border-[color:var(--ember)]/20 px-2.5 py-[3px] rounded-[5px] tracking-[0.08em] whitespace-nowrap">
            ✓ completed in 8 min
          </span>
        </div>

        <div className="font-mono text-[10px] text-[color:var(--ink-4)] py-1.5 px-0.5 tracking-[0.04em] mb-1">
          <strong className="font-medium text-[color:var(--ink-2)]">47 leads found</strong> ·
          showing 2 of 47
        </div>

        {/* Demo table */}
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-[420px] border-collapse border-[1.5px] border-[color:var(--rule)] rounded-lg overflow-hidden bg-white">
          <thead>
            <tr className="bg-[color:var(--paper-2)] border-b-[1.5px] border-[color:var(--rule)]">
              <th className="text-left font-mono text-[8.5px] tracking-[0.16em] uppercase text-[color:var(--ink-4)] font-medium px-3.5 py-2.5">
                Company
              </th>
              <th className="text-left font-mono text-[8.5px] tracking-[0.16em] uppercase text-[color:var(--ink-4)] font-medium px-3.5 py-2.5">
                Contact
              </th>
              <th className="text-left font-mono text-[8.5px] tracking-[0.16em] uppercase text-[color:var(--ink-4)] font-medium px-3.5 py-2.5">
                Email
              </th>
              <th className="text-left font-mono text-[8.5px] tracking-[0.16em] uppercase text-[color:var(--ink-4)] font-medium px-3.5 py-2.5">
                Sources
              </th>
            </tr>
          </thead>
          <tbody>
            {DEMO_ROWS_VISIBLE.map((row) => (
              <tr key={row.company} className="border-b border-[color:var(--paper-2)]">
                <td className="px-3.5 py-2.5 align-middle">
                  <div className="font-sans text-[12.5px] font-semibold text-[color:var(--ink)]">
                    {row.company}
                  </div>
                  <div className="font-mono text-[10px] text-[color:var(--ink-4)] mt-px">
                    {row.domain}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 align-middle">
                  <div className="font-sans text-[12px] text-[color:var(--ink-2)]">
                    {row.contact}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 align-middle">
                  <div className="font-sans text-[11.5px] font-medium text-[color:var(--success)] flex items-center gap-1">
                    <span className="font-bold" aria-hidden="true">
                      ✓
                    </span>
                    verified
                  </div>
                </td>
                <td className="px-3.5 py-2.5 align-middle">
                  <div className="font-mono text-[10.5px] text-[color:var(--ink-4)]">
                    {row.sources}
                  </div>
                </td>
              </tr>
            ))}
            {DEMO_ROWS_BLURRED.map((row, i) => (
              <tr
                key={row.company}
                className={i === DEMO_ROWS_BLURRED.length - 1 ? '' : 'border-b border-[color:var(--paper-2)]'}
                aria-hidden="true"
              >
                <td className="px-3.5 py-2.5 align-middle select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
                  <div className="font-sans text-[12.5px] font-semibold text-[color:var(--ink)]">
                    {row.company}
                  </div>
                  <div className="font-mono text-[10px] text-[color:var(--ink-4)] mt-px">
                    {row.domain}
                  </div>
                </td>
                <td className="px-3.5 py-2.5 align-middle select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
                  <div className="font-sans text-[12px] text-[color:var(--ink-2)]">{row.contact}</div>
                </td>
                <td className="px-3.5 py-2.5 align-middle select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
                  <div className="font-sans text-[11.5px] font-medium text-[color:var(--success)] flex items-center gap-1">
                    <span className="font-bold">✓</span>
                    verified
                  </div>
                </td>
                <td className="px-3.5 py-2.5 align-middle select-none" style={{ filter: 'blur(4px)', opacity: 0.35 }}>
                  <div className="font-mono text-[10.5px] text-[color:var(--ink-4)]">{row.sources}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Unlock gate */}
        <div
          className="text-center relative pt-[22px] pb-1 -mt-7"
          style={{
            background:
              'linear-gradient(to bottom, rgba(246,242,234,0) 0%, var(--paper) 52%)',
          }}
        >
          <Link
            href="/register"
            className="inline-flex items-center gap-2 border-[1.5px] border-[color:var(--rule)] bg-white px-[22px] py-2.5 rounded-[7px] font-sans text-[12.5px] font-semibold text-[color:var(--ink)] hover:border-[color:var(--ink)] transition-colors mb-1.5"
          >
            Unlock all 47 results →
          </Link>
          <div className="font-sans text-[11px] text-[color:var(--ink-4)]">
            Free to start — no credit card
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* WHAT IT IS                                                 */
/* ────────────────────────────────────────────────────────── */

function WhatItIsSection() {
  return (
    <section
      id="what-it-is"
      className="px-4 sm:px-6 md:px-12 py-12 md:py-[72px] border-b border-[color:var(--rule)] flex flex-col gap-6 md:grid md:grid-cols-[280px_1fr] md:gap-20 md:items-start"
    >
      <div className="font-mono text-[10px] text-[color:var(--ink-4)] tracking-[0.18em] uppercase pt-1">
        What it is
      </div>

      <div>
        <h2 className="font-display text-[clamp(28px,5.5vw,34px)] font-normal text-[color:var(--ink)] tracking-[-0.02em] leading-[1.15] mb-5">
          Not a database.
          <br />A <em className="italic text-[color:var(--ink-2)]">research agent.</em>
        </h2>
        <p className="font-sans text-[14.5px] text-[color:var(--ink-3)] leading-[1.75] max-w-[540px] mb-4">
          Apollo sells you rows from a table they built once and maintain over time. LeadreAI runs a
          fresh research job every time — reading live registries, company filings, SERP results,
          and public directories — then writes only what it can{' '}
          <strong className="font-semibold text-[color:var(--ink-2)]">
            justify from what it found.
          </strong>
        </p>
        <p className="font-sans text-[14.5px] text-[color:var(--ink-3)] leading-[1.75] max-w-[540px] mb-4">
          That distinction matters most in the markets it was built for: Nigerian fintech, East
          African SMB, pan-African regulated industries. Markets where the big databases have thin
          coverage, stale emails, and no evidence trail.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 border-[1.5px] border-[color:var(--rule)] rounded-[10px] overflow-hidden">
          {PILLARS.map((pillar, i) => (
            <div
              key={pillar.num}
              className={`px-[22px] pt-[22px] pb-5 ${
                i < PILLARS.length - 1
                  ? 'border-b md:border-b-0 md:border-r border-[color:var(--rule)]'
                  : ''
              }`}
            >
              <div className="font-mono text-[10px] text-[color:var(--ember)] tracking-[0.1em] mb-2.5">
                {pillar.num}
              </div>
              <div className="font-sans text-[13.5px] font-semibold text-[color:var(--ink)] mb-1.5">
                {pillar.title}
              </div>
              <div className="font-sans text-[12px] text-[color:var(--ink-3)] leading-[1.6]">
                {pillar.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* TESTIMONIALS                                               */
/* ────────────────────────────────────────────────────────── */

function TestimonialsSection() {
  return (
    <section id="testimonials" className="px-4 sm:px-6 md:px-12 py-12 md:py-[72px] border-b border-[color:var(--rule)]">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 mb-10">
        <h2 className="font-display text-[clamp(26px,5vw,32px)] font-normal text-[color:var(--ink)] tracking-[-0.02em] leading-[1.15]">
          Agencies who
          <br />
          <em className="italic text-[color:var(--ink-3)]">actually use it.</em>
        </h2>
        <div className="font-mono text-[10px] text-[color:var(--ink-4)] tracking-[0.14em] uppercase">
          Lagos · Nairobi · Accra
        </div>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-3 border-[1.5px] border-[color:var(--rule)] rounded-xl overflow-hidden bg-[color:var(--rule)]"
        style={{ gap: '1.5px' }}
      >
        {TESTIMONIALS.map((t) => (
          <div
            key={t.name}
            className="px-6 py-7 bg-[color:var(--paper)] flex flex-col gap-5"
          >
            <div className="font-display italic font-normal text-[16px] text-[color:var(--ink-2)] leading-[1.55] flex-1">
              <span
                className="block text-[32px] text-[color:var(--rule)] leading-[0.8] mb-2 not-italic font-display"
                aria-hidden="true"
              >
                &ldquo;
              </span>
              {t.quote}
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[color:var(--paper-2)] border-[1.5px] border-[color:var(--rule)] flex items-center justify-center font-sans text-[12px] font-bold text-[color:var(--ink-3)] flex-shrink-0">
                {t.initial}
              </div>
              <div>
                <div className="font-sans text-[12.5px] font-semibold text-[color:var(--ink)]">
                  {t.name}
                </div>
                <div className="font-sans text-[11px] text-[color:var(--ink-4)] mt-px">
                  {t.role}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── */
/* FOOTER                                                     */
/* ────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="px-4 sm:px-6 md:px-12 py-10 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-[color:var(--ink)] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M3 13 L3 3 L6 3 L6 10 L13 10 L13 13 Z" fill="white" />
            <circle cx="12" cy="4" r="1.8" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
        <span className="font-sans font-bold text-[13px] text-[color:var(--ink)] tracking-[-0.02em]">
          LeadreAI
        </span>
        <span className="font-mono text-[9.5px] text-[color:var(--ink-4)] tracking-[0.18em] uppercase ml-3">
          © {new Date().getFullYear()} — built for thin markets
        </span>
      </div>

      <div className="flex items-center gap-6">
        <Link
          href="/pricing"
          className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
        >
          Pricing
        </Link>
        <Link
          href="/docs"
          className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
        >
          Docs
        </Link>
        <Link
          href="/login"
          className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="font-sans text-[12.5px] font-medium text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition-colors"
        >
          Start for free →
        </Link>
      </div>
    </footer>
  );
}
