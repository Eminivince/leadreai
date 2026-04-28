'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

/* ─────────────────────────────────────────────────────────────────
 * LeadreAI — Landing
 * ─────────────────────────────────────────────────────────────────
 * Editorial broadsheet aesthetic.
 *
 * Palette lives in CSS variables on the outer <main>:
 *   --paper       F2EADD    main ivory background
 *   --paper-2     E9DFCB    dossier card, slightly deeper
 *   --paper-3     F7F1E5    subtle tint cards
 *   --ink         15130F    near-black, warm
 *   --ink-2       5A5346    mid-gray with brown warmth
 *   --ink-3       8A8170    softer gray
 *   --rule        B5AB95    hairline / divider
 *   --forest      2D4634    deep forest green (primary accent)
 *   --forest-2    4C6A54    lighter forest
 *   --rust        B84F2B    terracotta (very sparing accent)
 *
 * Fonts — imported in app/layout.tsx via next/font:
 *   --font-instrument-serif   Instrument Serif   display/italic accents
 *   --font-barlow             Barlow             body sans
 *   --font-jetbrains-mono     JetBrains Mono     technical / data labels
 *
 * The page is self-contained; subsections are local components. Animation
 * is used only once — the hero entrance — to stay out of the way of
 * typography doing the heavy lifting.
 * ───────────────────────────────────────────────────────────────── */

/* ── Glyphs ─────────────────────────────────────────────────── */
function ArrowEast({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M2 8h12M10 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Asterism({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-hidden>
      <span className="block w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
      <span className="block w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
      <span className="block w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
    </span>
  );
}

/* ── Masthead ───────────────────────────────────────────────── */
function Masthead() {
  return (
    <header className="relative z-40 border-b border-[color:var(--rule)]/70">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 pt-5 pb-4 flex items-end justify-between gap-6">
        {/* Left: issue + dateline */}
        <div className="hidden md:flex flex-col gap-0.5 min-w-[200px]">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-2)]">
            Vol I · Issue 07
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]">
            Lagos · Nairobi · Accra
          </span>
        </div>

        {/* Center: wordmark */}
        <Link href="/" className="flex items-baseline gap-2 shrink-0 group">
          <span className="font-[family-name:var(--font-instrument-serif)] italic text-2xl md:text-[28px] leading-none text-[color:var(--ink)] tracking-tight">
            Leadre
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] translate-y-[-1px]">
            AI
          </span>
        </Link>

        {/* Right: nav */}
        <nav className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-5">
            {[
              { label: 'Method', href: '#method' },
              { label: 'Capabilities', href: '#capabilities' },
              { label: 'Accounts', href: '#accounts' },
              { label: 'Pricing', href: '#pricing' },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/docs"
              className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
            >
              Docs
            </Link>
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

/* ── Dossier Card (hero visual) ────────────────────────────── */
function DossierCard() {
  const rows: Array<[string, string, string, string, string, string]> = [
    ['01', 'Paystack',     'Shola Akinlade',    'shola@paystack.com',     '$8M',    '¹'],
    ['02', 'Moniepoint',   'Tosin Eniolorunda', 'tosin@moniepoint.com',   '$110M',  '¹'],
    ['03', 'Flutterwave',  'Olugbenga Agboola', 'gb@flutterwave.com',     '$250M',  '²'],
    ['04', 'FairMoney',    'Laurin Hainy',      'lh@fairmoney.io',        '$55M',   '¹'],
    ['05', 'Interswitch',  'Mitchell Elegbe',   'm.elegbe@interswitch…',  '$200M',  '¹'],
    ['06', 'Kuda Bank',    'Babs Ogundeyi',     'babs@kuda.com',          '$91M',   '²'],
    ['07', 'Carbon',       'Chijioke Dozie',    'c.dozie@getcarbon.co',   '$15M',   '¹'],
    ['08', 'Cowrywise',    'Razaq Ahmed',       '—',                      '$3M',    '³'],
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* paper shadow — two layers, subtle */}
      <div
        className="absolute inset-0 translate-x-1 translate-y-1 bg-[color:var(--rule)]/25 rounded-sm"
        aria-hidden
      />
      <div
        className="absolute inset-0 translate-x-2 translate-y-2 bg-[color:var(--rule)]/15 rounded-sm"
        aria-hidden
      />

      {/* card body */}
      <div className="relative bg-[color:var(--paper-2)] border border-[color:var(--rule)] p-6 md:p-8 rounded-sm">
        {/* header row */}
        <div className="flex items-center justify-between pb-3 border-b border-dashed border-[color:var(--rule)]">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)]">
            Dossier №.&nbsp;2406 · Compiled Lagos
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-3)]">
            2026.04.19 · 14:22 GMT
          </span>
        </div>

        {/* subject */}
        <div className="pt-4 pb-5">
          <div className="flex gap-4 md:gap-5">
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)] pt-[5px] shrink-0 w-14">
              Subject
            </span>
            <p className="font-[family-name:var(--font-instrument-serif)] italic text-[18px] md:text-[21px] leading-[1.28] text-[color:var(--ink)]">
              &ldquo;Top 12 Nigerian fintechs with Series-B or later funding in the
              last 24 months. Give me the CEO&rsquo;s name and a phone number I can
              call.&rdquo;
            </p>
          </div>
          <div className="flex gap-4 md:gap-5 mt-4">
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.16em] uppercase text-[color:var(--ink-2)] shrink-0 w-14">
              Status
            </span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[color:var(--forest)]">
              Complete · 12 of 12 resolved · 3 sources · 4m 11s
            </span>
          </div>
        </div>

        {/* divider ornament */}
        <div className="flex items-center gap-3 my-3">
          <div className="h-px flex-1 bg-[color:var(--rule)]" />
          <Asterism />
          <div className="h-px flex-1 bg-[color:var(--rule)]" />
        </div>

        {/* table */}
        <div className="pt-3">
          {/* header */}
          <div className="grid grid-cols-[24px_1.2fr_1.2fr_1.6fr_0.6fr] gap-3 pb-2 border-b border-[color:var(--rule)]">
            {['', 'Company', 'Contact', 'Email', 'Raised'].map((h, i) => (
              <span
                key={i}
                className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-3)]"
              >
                {h}
              </span>
            ))}
          </div>
          {/* rows */}
          <div className="divide-y divide-[color:var(--rule)]/60">
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[24px_1.2fr_1.2fr_1.6fr_0.6fr] gap-3 py-[9px] items-baseline"
              >
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tabular-nums text-[color:var(--ink-3)]">
                  {r[0]}
                </span>
                <span className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink)] font-medium">
                  {r[1]}
                </span>
                <span className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)]">
                  {r[2]}
                </span>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[color:var(--ink-2)] truncate flex items-baseline gap-0.5">
                  <span className="truncate">{r[3]}</span>
                  <sup className="text-[8px] text-[color:var(--forest)] leading-none">{r[5]}</sup>
                </span>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[12px] tabular-nums text-[color:var(--ink)] font-medium">
                  {r[4]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* footnotes */}
        <div className="mt-5 pt-4 border-t border-dashed border-[color:var(--rule)]">
          <div className="space-y-1.5">
            <p className="font-[family-name:var(--font-barlow)] text-[11px] leading-[1.55] text-[color:var(--ink-2)]">
              <sup className="text-[color:var(--forest)] mr-1">¹</sup>
              Verified via MX + SMTP probe on 2026.04.19.
            </p>
            <p className="font-[family-name:var(--font-barlow)] text-[11px] leading-[1.55] text-[color:var(--ink-2)]">
              <sup className="text-[color:var(--forest)] mr-1">²</sup>
              Extracted from /team page; verified via direct-reply test.
            </p>
            <p className="font-[family-name:var(--font-barlow)] text-[11px] leading-[1.55] text-[color:var(--ink-2)]">
              <sup className="text-[color:var(--forest)] mr-1">³</sup>
              Cowrywise contact withheld by request. Marked &ldquo;not available&rdquo;
              <span className="italic"> per the honesty principle.</span>
            </p>
          </div>
          <p className="mt-4 font-[family-name:var(--font-jetbrains-mono)] text-[9px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] text-right">
            Compiled by LeadreAI
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Hero ───────────────────────────────────────────────────── */
function Hero() {
  const headlineV = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  };
  const wordV = {
    hidden: { y: 12, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  };

  return (
    <section className="relative">
      {/* faint grid of broadsheet rules on the far right */}
      <div
        className="pointer-events-none absolute top-0 right-0 bottom-0 w-[18%] hidden xl:block opacity-[0.35]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0 31px, var(--rule) 31px 31.5px)',
        }}
        aria-hidden
      />

      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 pt-14 md:pt-20 pb-16 md:pb-24 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
        {/* Left column — the lede */}
        <div className="lg:col-span-7 flex flex-col">
          {/* Section kicker */}
          <div className="flex items-center gap-3 mb-8">
            <span className="block w-8 h-px bg-[color:var(--ink)]" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
              A research desk for emerging markets
            </span>
          </div>

          {/* Headline */}
          <motion.h1
            variants={headlineV}
            initial="hidden"
            animate="show"
            className="font-[family-name:var(--font-instrument-serif)] text-[52px] md:text-[78px] lg:text-[96px] leading-[0.92] tracking-[-0.02em] text-[color:var(--ink)]"
          >
            <motion.span variants={wordV} className="inline-block">Lead</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">research</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">for</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">the</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">markets</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">the</motion.span>{' '}
            <motion.span variants={wordV} className="inline-block italic text-[color:var(--forest)]">
              databases
            </motion.span>{' '}
            <motion.span variants={wordV} className="inline-block">forgot.</motion.span>
          </motion.h1>

          {/* Standfirst */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.0 }}
            className="mt-8 max-w-[580px] font-[family-name:var(--font-barlow)] text-[17px] md:text-[19px] leading-[1.5] text-[color:var(--ink-2)]"
          >
            Type an ideal-customer sentence. Our agent reads registries,
            directories, and the open web &mdash; then delivers a qualified list
            with <span className="italic text-[color:var(--ink)]">a source footnote on every field</span>.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4"
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] font-[family-name:var(--font-barlow)] text-[14px] font-medium px-5 py-3 rounded-full hover:bg-[color:var(--forest)] transition-colors"
            >
              Start for free
              <ArrowEast className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#sample-dossier"
              className="group inline-flex items-center gap-2.5 font-[family-name:var(--font-barlow)] text-[14px] text-[color:var(--ink)] underline-offset-[6px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)] underline decoration-1"
            >
              Read a sample dossier
              <ArrowEast className="w-3 h-3 text-[color:var(--ink-2)] group-hover:translate-x-0.5 transition-transform" />
            </a>
          </motion.div>

          {/* Footer line: credits */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.4 }}
            className="mt-14 pt-5 border-t border-[color:var(--rule)] max-w-[580px] flex flex-wrap items-center gap-x-6 gap-y-2 text-[color:var(--ink-3)]"
          >
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
              No credit card
            </span>
            <span className="w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
              No sales call
            </span>
            <span className="w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase">
              Export any time
            </span>
          </motion.div>
        </div>

        {/* Right column — Dossier */}
        <div id="sample-dossier" className="lg:col-span-5 lg:pt-2">
          <DossierCard />
        </div>
      </div>
    </section>
  );
}

/* ── Section Header (reusable kicker) ──────────────────────── */
function SectionHead({
  eyebrow,
  title,
  lead,
  accent = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 md:gap-5 max-w-[840px]">
      <div className="flex items-center gap-3">
        <span
          className={`block w-8 h-px ${accent ? 'bg-[color:var(--forest)]' : 'bg-[color:var(--ink)]'}`}
        />
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)]">
          {eyebrow}
        </span>
      </div>
      <h2 className="font-[family-name:var(--font-instrument-serif)] text-[36px] md:text-[54px] lg:text-[64px] leading-[0.95] tracking-[-0.015em] text-[color:var(--ink)]">
        {title}
      </h2>
      {lead && (
        <p className="mt-1 font-[family-name:var(--font-barlow)] text-[16px] md:text-[18px] leading-[1.55] text-[color:var(--ink-2)] max-w-[620px]">
          {lead}
        </p>
      )}
    </div>
  );
}

/* ── Method (How it works) ──────────────────────────────────── */
function Method() {
  const steps = [
    {
      no: '01',
      title: 'Describe',
      detail:
        'Type a sentence. "Top 50 fintechs in Nigeria with recent funding." "Managing partners at mid-tier Kenyan law firms." No filters to click.',
      span: 'md:col-span-4',
    },
    {
      no: '02',
      title: 'Discover',
      detail:
        'The agent starts with curated registries and Wikipedia categories, then extends via Brave, Serper, and the open web. Discovery is cheap; spraying SERPs is not.',
      span: 'md:col-span-8',
    },
    {
      no: '03',
      title: 'Enrich',
      detail:
        'Homepages and /team pages are read for named people. Patterns permute. Emails are MX-checked and SMTP-probed. Phones normalize through libphonenumber with a country hint.',
      span: 'md:col-span-8',
    },
    {
      no: '04',
      title: 'Deliver',
      detail:
        'Every field carries a source URL and a confidence score. Every column the query asked for appears as a typed column. Missing data shows as em-dash, not as lies.',
      span: 'md:col-span-4',
    },
  ];

  return (
    <section id="method" className="border-t border-[color:var(--rule)] bg-[color:var(--paper)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <SectionHead
          eyebrow="The Method"
          title={
            <>
              From a sentence <br className="hidden md:inline" />
              to a list, <em className="italic text-[color:var(--forest)]">with footnotes</em>.
            </>
          }
          lead="Four movements. No modals to click through, no taxonomies to learn. The agent does what a good junior analyst would do — at the speed of a spreadsheet."
        />

        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-14">
          {steps.map((s) => (
            <div key={s.no} className={`${s.span} flex flex-col gap-4`}>
              <div className="flex items-baseline gap-5">
                <span className="font-[family-name:var(--font-instrument-serif)] text-[56px] md:text-[72px] leading-none text-[color:var(--forest)]">
                  {s.no}
                </span>
                <div className="flex-1 border-t border-[color:var(--rule)] pb-2" />
                <span className="font-[family-name:var(--font-instrument-serif)] italic text-[22px] md:text-[28px] text-[color:var(--ink)] self-end pb-1">
                  {s.title}
                </span>
              </div>
              <p className="font-[family-name:var(--font-barlow)] text-[14.5px] leading-[1.6] text-[color:var(--ink-2)] max-w-[420px]">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Capabilities ───────────────────────────────────────────── */
function Capabilities() {
  const caps = [
    {
      tag: 'Natural-language queries',
      body: 'The parser recognizes personas, geography, industry, exclusion constraints, and user-specified output columns. It does not force you into a taxonomy that was designed for Silicon Valley.',
    },
    {
      tag: 'Dynamic output columns',
      body: 'Ask for amount raised, funding round, tech stack, hiring signal, or license filing. Every requested field appears as a typed column on the result — currency formats, date localization, hoverable provenance.',
    },
    {
      tag: 'Named-contact discovery',
      body: 'Team pages, leadership sections, attorneys-at-firms, officer registries, and LinkedIn public profiles. Names are paired with titles, not guessed. Chrome text ("Our History," "Related Pages") is filtered out.',
    },
    {
      tag: 'Provenance on every field',
      body: 'Each value carries a source URL, an extraction method, a confidence score, and a verification timestamp. You can always trace why the engine believes what it believes.',
    },
    {
      tag: 'Multi-source search',
      body: 'Brave, Serper, and SerpAPI behind a router with a 24-hour query cache. When one provider rate-limits, the next takes over. You are never a single-provider failure away from a blank page.',
    },
    {
      tag: 'Emerging-markets coverage',
      body: 'Curated seed lists for Nigerian, Kenyan, Ghanaian, and South African verticals — fintech, law, manufacturing, logistics. Wikipedia categories as a deterministic baseline. The long tail, by design.',
    },
  ];

  return (
    <section id="capabilities" className="border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <SectionHead
          eyebrow="Capabilities"
          title={
            <>
              What the desk <em className="italic text-[color:var(--forest)]">knows</em> how to do.
            </>
          }
        />

        <div className="mt-14 md:mt-16 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-10 md:gap-y-14">
          {caps.map((c, i) => (
            <div
              key={c.tag}
              className="flex flex-col gap-3 pt-6 border-t border-[color:var(--rule)]"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-[family-name:var(--font-instrument-serif)] text-[22px] md:text-[26px] leading-[1.15] text-[color:var(--ink)] tracking-[-0.01em]">
                  {c.tag}
                </h3>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.18em] uppercase text-[color:var(--ink-3)] shrink-0">
                  {String(i + 1).padStart(2, '0')} / {String(caps.length).padStart(2, '0')}
                </span>
              </div>
              <p className="font-[family-name:var(--font-barlow)] text-[14.5px] leading-[1.6] text-[color:var(--ink-2)]">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Honesty principle ─────────────────────────────────────── */
function HonestyPrinciple() {
  return (
    <section className="relative border-t border-[color:var(--rule)] bg-[color:var(--forest)] text-[color:var(--paper)] overflow-hidden">
      {/* faint hairline grid for texture */}
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0 31px, white 31px 31.5px)',
        }}
        aria-hidden
      />
      <div className="relative max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-24 md:py-32">
        <div className="flex items-center gap-3 mb-8 md:mb-10">
          <span className="block w-8 h-px bg-[color:var(--paper)]" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--paper)]/70">
            The Principle
          </span>
        </div>

        <figure className="max-w-[1020px]">
          <span
            className="font-[family-name:var(--font-instrument-serif)] italic text-[140px] md:text-[220px] leading-none block text-[color:var(--paper)]/20 select-none"
            aria-hidden
          >
            &ldquo;
          </span>
          <blockquote className="-mt-16 md:-mt-32 font-[family-name:var(--font-instrument-serif)] text-[36px] md:text-[56px] lg:text-[68px] leading-[1.05] tracking-[-0.015em]">
            The engine is allowed to say{' '}
            <span className="italic">I don&rsquo;t know.</span>{' '}
            It is <em className="italic">not</em> allowed to say{' '}
            <span className="italic">maybe</span>.
          </blockquote>
          <figcaption className="mt-10 flex items-center gap-4">
            <span className="block w-12 h-px bg-[color:var(--paper)]/50" />
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] tracking-[0.18em] uppercase text-[color:var(--paper)]/70">
              From the LeadreAI design notes
            </span>
          </figcaption>

          <p className="mt-10 md:mt-14 max-w-[620px] font-[family-name:var(--font-barlow)] text-[15.5px] md:text-[17px] leading-[1.6] text-[color:var(--paper)]/85">
            ZoomInfo has guessed your prospect&rsquo;s email. Apollo has
            inferred their title. We&rsquo;d rather return an em-dash and a
            note than a fabricated record you can&rsquo;t trust.{' '}
            <span className="italic">Every field either has a source or is marked missing.</span>
          </p>
        </figure>
      </div>
    </section>
  );
}

/* ── Correspondents (testimonials) ─────────────────────────── */
function Correspondents() {
  const quotes = [
    {
      quote:
        'I used to spend a full day assembling a list of fifty companies in Lagos. The desk returned them in eight minutes, with named founders and emails that actually bounced back.',
      name: 'Adaeze Okonkwo',
      role: 'Head of Growth, Arlo Logistics',
      city: 'Lagos',
    },
    {
      quote:
        'The footnote-per-field thing sounds quaint until you\u2019ve had a deal die because your data vendor lied about a title. We stopped arguing with sales about list quality.',
      name: 'Mwangi Njoroge',
      role: 'VP Revenue, Ardent Insurance',
      city: 'Nairobi',
    },
    {
      quote:
        'We sell compliance software to mid-tier manufacturers. No one covers those accounts. LeadreAI\u2019s seed lists plus the live scraping found us buyers no one else could name.',
      name: 'Kofi Mensah',
      role: 'Founder, Meridian Compliance',
      city: 'Accra',
    },
  ];

  return (
    <section id="accounts" className="border-t border-[color:var(--rule)] bg-[color:var(--paper)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <SectionHead
          eyebrow="Correspondents"
          title={
            <>
              Three accounts <br className="hidden md:inline" />
              from operators already on <em className="italic text-[color:var(--forest)]">the desk</em>.
            </>
          }
        />

        <div className="mt-14 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
          {quotes.map((q) => (
            <figure
              key={q.name}
              className="flex flex-col gap-6 pt-8 border-t border-[color:var(--ink)]"
            >
              <blockquote className="font-[family-name:var(--font-instrument-serif)] text-[22px] md:text-[25px] leading-[1.3] text-[color:var(--ink)]">
                <span
                  className="font-[family-name:var(--font-instrument-serif)] text-[40px] leading-none align-[-0.1em] mr-1 text-[color:var(--forest)]"
                  aria-hidden
                >
                  &ldquo;
                </span>
                {q.quote}
              </blockquote>

              <figcaption className="mt-auto flex flex-col gap-0.5">
                <span className="font-[family-name:var(--font-barlow)] font-medium text-[14px] text-[color:var(--ink)]">
                  {q.name}
                </span>
                <span className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)]">
                  {q.role}
                </span>
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)] mt-1">
                  {q.city}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ────────────────────────────────────────────────── */
function Pricing() {
  const tiers = [
    {
      name: 'Reader',
      price: 'Free',
      priceSub: 'Forever, with limits',
      pitch: 'For operators running a list a week.',
      features: [
        '3 dossiers / month',
        'Up to 25 leads per query',
        'Email + phone verification',
        'CSV export',
      ],
      cta: 'Start for free',
      href: '/auth/register',
      highlight: false,
    },
    {
      name: 'Correspondent',
      price: '$49',
      priceSub: 'per seat · monthly',
      pitch: 'For teams prospecting every day.',
      features: [
        '60 dossiers / month',
        'Up to 200 leads per query',
        'Dynamic output columns',
        'Provenance exports',
        'CRM sync (HubSpot, Salesforce)',
      ],
      cta: 'Start a trial',
      href: '/auth/register',
      highlight: true,
    },
    {
      name: 'Bureau',
      price: 'Contact',
      priceSub: 'Annual · custom',
      pitch: 'For teams with a research budget.',
      features: [
        'Unlimited dossiers',
        '1,000+ leads per query',
        'Private seed lists',
        'Managed data sources',
        'Named account support',
      ],
      cta: 'Request a conversation',
      href: '/auth/register',
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="border-t border-[color:var(--rule)] bg-[color:var(--paper-3)]">
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-20 md:py-28">
        <SectionHead
          eyebrow="Subscriptions"
          title={
            <>
              Three ways to <em className="italic text-[color:var(--forest)]">subscribe</em>.
            </>
          }
          lead="Monthly, no annual commitment. Upgrade or cancel from the dashboard. Every tier includes provenance on every field."
        />

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col ${
                t.highlight
                  ? 'bg-[color:var(--ink)] text-[color:var(--paper)] border-[color:var(--ink)]'
                  : 'bg-[color:var(--paper)] text-[color:var(--ink)] border-[color:var(--rule)]'
              } border rounded-sm p-8`}
            >
              <div className="flex items-baseline justify-between mb-6">
                <span
                  className={`font-[family-name:var(--font-jetbrains-mono)] text-[11px] tracking-[0.2em] uppercase ${
                    t.highlight ? 'text-[color:var(--paper)]/70' : 'text-[color:var(--ink-2)]'
                  }`}
                >
                  {t.name}
                </span>
                {t.highlight && (
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] tracking-[0.2em] uppercase bg-[color:var(--rust)] text-[color:var(--paper)] px-2 py-0.5 rounded-full">
                    Most popular
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-[family-name:var(--font-instrument-serif)] text-[52px] leading-none tracking-[-0.015em]">
                  {t.price}
                </span>
              </div>
              <span
                className={`font-[family-name:var(--font-barlow)] text-[12px] ${
                  t.highlight ? 'text-[color:var(--paper)]/65' : 'text-[color:var(--ink-3)]'
                }`}
              >
                {t.priceSub}
              </span>

              <p
                className={`mt-6 pb-6 border-b ${
                  t.highlight ? 'border-[color:var(--paper)]/15' : 'border-[color:var(--rule)]'
                } font-[family-name:var(--font-instrument-serif)] italic text-[18px] leading-[1.3]`}
              >
                {t.pitch}
              </p>

              <ul className="mt-6 space-y-3 flex-1">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 font-[family-name:var(--font-barlow)] text-[13.5px] leading-[1.5]"
                  >
                    <span
                      className={`mt-[7px] block w-3 h-px shrink-0 ${
                        t.highlight ? 'bg-[color:var(--paper)]' : 'bg-[color:var(--ink)]'
                      }`}
                    />
                    <span className={t.highlight ? 'text-[color:var(--paper)]/90' : 'text-[color:var(--ink-2)]'}>
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={t.href}
                className={`mt-8 inline-flex items-center justify-between gap-2 px-5 py-3 rounded-full font-[family-name:var(--font-barlow)] text-[13.5px] font-medium transition-colors ${
                  t.highlight
                    ? 'bg-[color:var(--paper)] text-[color:var(--ink)] hover:bg-[color:var(--paper-2)]'
                    : 'bg-[color:var(--ink)] text-[color:var(--paper)] hover:bg-[color:var(--forest)]'
                }`}
              >
                {t.cta} <ArrowEast className="w-3.5 h-3.5" />
              </Link>
            </div>
          ))}
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
                The invitation
              </span>
            </div>
            <h2 className="font-[family-name:var(--font-instrument-serif)] text-[56px] md:text-[96px] lg:text-[128px] leading-[0.9] tracking-[-0.02em] text-[color:var(--ink)]">
              Describe who <br />
              you need. <em className="italic text-[color:var(--forest)]">We&rsquo;ll read</em> <br />
              the rest.
            </h2>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-6 lg:pl-8 lg:border-l lg:border-[color:var(--rule)]">
            <p className="font-[family-name:var(--font-barlow)] text-[15.5px] leading-[1.6] text-[color:var(--ink-2)]">
              Three dossiers are free, forever. No card. No pitch call. If the
              desk saves you an afternoon, you&rsquo;ll know.
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
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
                Ready in 30 seconds
              </span>
              <span className="w-1 h-1 rounded-full bg-[color:var(--ink-3)]" />
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
                Ship today
              </span>
            </div>
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
      <div className="max-w-[1320px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        {/* Big wordmark */}
        <div className="flex items-baseline justify-between gap-8 pb-10 border-b border-[color:var(--rule)]">
          <span className="font-[family-name:var(--font-instrument-serif)] italic text-[72px] md:text-[128px] lg:text-[164px] leading-[0.82] tracking-[-0.02em] text-[color:var(--ink)]">
            LeadreAI
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] md:text-[11px] tracking-[0.2em] uppercase text-[color:var(--ink-2)] text-right">
            A research desk <br />
            est. MMXXVI
          </span>
        </div>

        {/* Footer columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 md:gap-8 mt-10">
          <div className="col-span-2 md:col-span-1">
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
              Colophon
            </span>
            <p className="mt-3 font-[family-name:var(--font-barlow)] text-[13px] leading-[1.6] text-[color:var(--ink-2)] max-w-[280px]">
              Set in <span className="font-[family-name:var(--font-instrument-serif)] italic">Instrument Serif</span>, <span className="font-[family-name:var(--font-barlow)]">Barlow</span>, and{' '}
              <span className="font-[family-name:var(--font-jetbrains-mono)]">JetBrains Mono</span>.
              Printed on ivory <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px]">#F2EADD</span>.
            </p>
          </div>

          {[
            { title: 'Product', links: ['Method', 'Capabilities', 'Pricing', 'Changelog'] },
            { title: 'Resources', links: ['Documentation', 'API', 'Status', 'Sample dossiers'] },
            { title: 'Company', links: ['About', 'Contact', 'Privacy', 'Terms'] },
          ].map((col) => (
            <div key={col.title}>
              <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-3)]">
                {col.title}
              </span>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="font-[family-name:var(--font-barlow)] text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:underline underline-offset-[4px] decoration-[color:var(--rule)]"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom rule */}
        <div className="mt-14 pt-6 border-t border-[color:var(--rule)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
            © MMXXVI LeadreAI · All dispatches reserved
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
            Compiled in Lagos · Served from the edge
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <main
      className="bg-[color:var(--paper)] text-[color:var(--ink)] min-h-screen selection:bg-[color:var(--forest)] selection:text-[color:var(--paper)]"
    >
      <Masthead />
      <Hero />
      <Method />
      <Capabilities />
      <HonestyPrinciple />
      <Correspondents />
      <Pricing />
      <FinalCTA />
      <Colophon />
    </main>
  );
}
