# Marketing Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the editorial broadsheet aesthetic across all marketing pages (`/`, `/althome`, `/pricing`, `/docs`) with the Modern SaaS design — white background, amber accent (#f59e0b), search-first hero with inline email gate.

**Architecture:** Shared marketing components (AltNav, AltFooter, EmailGate, design tokens) live in `frontend/src/components/marketing/`. Page-specific sections (Hero, HowItWorks, etc.) are defined locally in each page file. The `/althome` page is built first and verified in isolation, then its design is promoted to replace `/`. `/pricing` and `/docs` adopt the shared chrome (nav/footer/tokens) while preserving their existing content sections.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Framer Motion (already installed as `framer-motion`), React `useState` / `useRouter` from `next/navigation`.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/marketing/alt-tokens.ts` | Create | CSS custom property values exported as a typed constant |
| `frontend/src/components/marketing/AltNav.tsx` | Create | Sticky top nav — logo, links, sign-in, CTA |
| `frontend/src/components/marketing/AltFooter.tsx` | Create | Minimal dark footer — logo, links, copyright |
| `frontend/src/components/marketing/EmailGate.tsx` | Create | `'use client'` inline email-capture form with framer-motion fade |
| `frontend/src/app/althome/layout.tsx` | Create | Server component; exports `noindex` robots metadata |
| `frontend/src/app/althome/page.tsx` | Create | Full new landing page — all section components local to file |
| `frontend/src/app/page.tsx` | Modify | Replace broadsheet with new design (shares marketing components) |
| `frontend/src/app/pricing/page.tsx` | Modify | Replace Masthead/footer; keep comparison table and FAQ content |
| `frontend/src/app/docs/page.tsx` | Modify | Replace Masthead/footer; keep all 9 content sections intact |

---

### Task 1: Create shared marketing components

**Files:**

- Create: `frontend/src/components/marketing/alt-tokens.ts`
- Create: `frontend/src/components/marketing/AltNav.tsx`
- Create: `frontend/src/components/marketing/AltFooter.tsx`
- Create: `frontend/src/components/marketing/EmailGate.tsx`

- [ ] **Step 1: Create design token module**

```ts
// frontend/src/components/marketing/alt-tokens.ts
import type { CSSProperties } from 'react';

export const altTokens = {
  '--alt-amber':        '#f59e0b',
  '--alt-amber-light':  '#fef3c7',
  '--alt-amber-border': '#fde68a',
  '--alt-amber-dark':   '#92400e',
  '--alt-ink':          '#111827',
  '--alt-ink-2':        '#374151',
  '--alt-ink-3':        '#6b7280',
  '--alt-ink-4':        '#9ca3af',
  '--alt-rule':         '#e5e7eb',
  '--alt-paper-2':      '#f9fafb',
  '--alt-paper-3':      '#f3f4f6',
  '--alt-green-bg':     '#dcfce7',
  '--alt-green-text':   '#166534',
} as CSSProperties;
```

- [ ] **Step 2: Create AltNav**

```tsx
// frontend/src/components/marketing/AltNav.tsx
import Link from 'next/link';

export default function AltNav() {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[color:var(--alt-rule)]">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-baseline gap-px shrink-0">
          <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--alt-ink)]">Leadre</span>
          <span className="font-extrabold text-[16px] text-[color:var(--alt-amber)]">.</span>
          <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--alt-ink)]">AI</span>
        </Link>
        <nav className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-6">
            <a href="#how" className="text-[13px] text-[color:var(--alt-ink-3)] hover:text-[color:var(--alt-ink)] transition-colors">How it works</a>
            <a href="#pricing" className="text-[13px] text-[color:var(--alt-ink-3)] hover:text-[color:var(--alt-ink)] transition-colors">Pricing</a>
            <div className="w-px h-4 bg-[color:var(--alt-rule)]" aria-hidden />
          </div>
          <Link href="/login" className="hidden md:inline text-[13px] text-[color:var(--alt-ink-2)] hover:text-[color:var(--alt-ink)] transition-colors">
            Sign in
          </Link>
          <Link
            href="/auth/register"
            className="text-[13px] font-semibold bg-[color:var(--alt-ink)] text-white px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
          >
            Get started free
          </Link>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create AltFooter**

```tsx
// frontend/src/components/marketing/AltFooter.tsx
const FOOTER_LINKS = ['How it works', 'Pricing', 'Docs', 'Privacy', 'Terms'] as const;

export default function AltFooter() {
  return (
    <footer className="bg-[color:var(--alt-ink)] px-6 md:px-10 py-8">
      <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-baseline gap-px">
          <span className="font-extrabold text-[15px] text-white tracking-tight">Leadre</span>
          <span className="font-extrabold text-[15px] text-[color:var(--alt-amber)]">.</span>
          <span className="font-extrabold text-[15px] text-white tracking-tight">AI</span>
        </div>
        <nav className="flex flex-wrap gap-5" aria-label="Footer">
          {FOOTER_LINKS.map(link => (
            <a key={link} href="#" className="text-[12px] text-white/40 hover:text-white/70 transition-colors">
              {link}
            </a>
          ))}
        </nav>
        <span className="text-[11px] text-white/25">&copy; 2026 LeadreAI</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Create EmailGate**

```tsx
// frontend/src/components/marketing/EmailGate.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function EmailGate({ query }: { query: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    router.push(
      `/auth/register?q=${encodeURIComponent(query)}&email=${encodeURIComponent(email)}`
    );
  }

  return (
    <motion.form
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="w-full bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] rounded-xl p-3.5 flex flex-wrap items-center gap-3"
    >
      <span className="text-lg shrink-0" aria-hidden>🔒</span>
      <div className="flex-1 min-w-[160px]">
        <p className="text-[13px] font-semibold text-[color:var(--alt-ink)] leading-snug">
          Enter your work email to run this search
        </p>
        <p className="text-[11px] text-[color:var(--alt-ink-3)]">
          Free. No credit card. Results in ~8 minutes.
        </p>
      </div>
      <div className="flex gap-2 shrink-0 flex-wrap">
        <input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="text-[12px] border border-[color:var(--alt-rule)] rounded-lg px-3 py-2 w-44 bg-white focus:outline-none focus:border-[color:var(--alt-amber)] transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="text-[12px] font-semibold bg-[color:var(--alt-ink)] text-white rounded-lg px-4 py-2 whitespace-nowrap hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Get results →'}
        </button>
      </div>
    </motion.form>
  );
}
```

- [ ] **Step 5: Verify TypeScript across new files**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/marketing/
git commit -m "feat(marketing): shared AltNav, AltFooter, EmailGate, altTokens"
```

---

### Task 2: Create /althome layout + page scaffold

**Files:**

- Create: `frontend/src/app/althome/layout.tsx`
- Create: `frontend/src/app/althome/page.tsx`

- [ ] **Step 1: Create layout with noindex metadata**

```tsx
// frontend/src/app/althome/layout.tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeadreAI — Find your next customer',
  description: 'AI-powered lead research for Nigerian and African markets.',
  robots: { index: false, follow: false },
};

export default function AlthomeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Create page scaffold**

```tsx
// frontend/src/app/althome/page.tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import AltNav from '@/components/marketing/AltNav';
import AltFooter from '@/components/marketing/AltFooter';
import EmailGate from '@/components/marketing/EmailGate';
import { altTokens } from '@/components/marketing/alt-tokens';

export default function AlthomePage() {
  return (
    <main className="min-h-screen bg-white text-[color:var(--alt-ink)]" style={altTokens}>
      <AltNav />
      {/* sections added in Tasks 3–5 */}
      <AltFooter />
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Start dev server and confirm /althome loads**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/althome`. Confirm: nav and footer render, page is otherwise empty.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/althome/
git commit -m "feat(althome): scaffold page + noindex layout"
```

---

### Task 3: Hero section

**Files:**

- Modify: `frontend/src/app/althome/page.tsx`

- [ ] **Step 1: Add Hero component above `AlthomePage` export**

```tsx
const QUERY_CHIPS = [
  'Fintech CEOs · Lagos',
  'Law firms · Nairobi',
  'Manufacturers · Accra',
  'Logistics directors · Nigeria',
  'Series B founders',
] as const;

const TRUST_LOGOS = [
  'Arlo Logistics',
  'Ardent Insurance',
  'Meridian Compliance',
  'Volta Capital',
] as const;

function Hero() {
  const [query, setQuery] = useState('');
  const [showGate, setShowGate] = useState(false);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (val.length > 3) setShowGate(true);
  }

  function pickChip(chip: string) {
    setQuery(chip);
    setShowGate(true);
  }

  return (
    <section className="border-b border-[color:var(--alt-rule)] bg-gradient-to-b from-[#fffbeb] to-white px-6 md:px-10 pt-16 pb-14 flex flex-col items-center text-center">
      {/* Badge */}
      <div className="inline-flex items-center gap-2 bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] rounded-full px-3.5 py-1.5 text-[11px] font-medium text-[color:var(--alt-amber-dark)] mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--alt-amber)] shrink-0" aria-hidden />
        Built for Nigerian &amp; African markets
      </div>

      {/* Headline */}
      <h1 className="font-extrabold text-[44px] md:text-[58px] tracking-[-0.04em] leading-[1.04] text-[color:var(--alt-ink)] max-w-[640px] mb-4">
        Find your next customer.<br />
        <span className="text-[color:var(--alt-amber)]">Before your competitors do.</span>
      </h1>

      {/* Subline */}
      <p className="text-[16px] text-[color:var(--alt-ink-3)] max-w-[440px] leading-relaxed mb-8">
        Type who you&rsquo;re selling to. Get a verified lead list &mdash; with emails, phones, and sources &mdash; in minutes.
      </p>

      {/* Search box */}
      <div className="w-full max-w-[580px] mb-3">
        <div
          className={[
            'flex items-center gap-2.5 bg-white border-2 rounded-[14px] pl-4 pr-3 py-3 shadow-sm transition-all duration-200',
            showGate || query.length > 0
              ? 'border-[color:var(--alt-amber)] shadow-[0_0_0_4px_#f59e0b18]'
              : 'border-[color:var(--alt-rule)]',
          ].join(' ')}
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 shrink-0 text-[color:var(--alt-ink-4)]" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Series B fintechs in Lagos with a CTO…"
            value={query}
            onChange={handleInput}
            className="flex-1 text-[14px] text-[color:var(--alt-ink)] placeholder:text-[color:var(--alt-ink-4)] focus:outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={() => { if (query.length > 0) setShowGate(true); }}
            className="text-[13px] font-semibold bg-[color:var(--alt-amber)] text-white rounded-[10px] px-5 py-2.5 shrink-0 hover:bg-amber-600 transition-colors"
          >
            Search &rarr;
          </button>
        </div>
      </div>

      {/* Email gate */}
      <div className="w-full max-w-[580px] mb-5">
        <AnimatePresence>
          {showGate && <EmailGate key="hero-gate" query={query} />}
        </AnimatePresence>
      </div>

      {/* Suggestion chips */}
      <div className="flex flex-wrap gap-2 justify-center max-w-[580px] mb-9">
        {QUERY_CHIPS.map(chip => (
          <button
            key={chip}
            type="button"
            onClick={() => pickChip(chip)}
            className="text-[11px] bg-white border border-[color:var(--alt-rule)] rounded-full px-3.5 py-1.5 text-[color:var(--alt-ink-3)] hover:border-[color:var(--alt-amber)] hover:text-[color:var(--alt-amber-dark)] transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Trust strip */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-[11px] text-[color:var(--alt-ink-4)] mr-1">Trusted by teams at</span>
        {TRUST_LOGOS.map(name => (
          <span
            key={name}
            className="text-[11px] font-semibold text-[color:var(--alt-ink-4)] bg-[color:var(--alt-paper-2)] border border-[color:var(--alt-rule)] rounded-full px-3 py-1"
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add `<Hero />` to the page (between `<AltNav />` and `<AltFooter />`)**

```tsx
export default function AlthomePage() {
  return (
    <main className="min-h-screen bg-white text-[color:var(--alt-ink)]" style={altTokens}>
      <AltNav />
      <Hero />
      <AltFooter />
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Open `/althome` in browser and verify**

Confirm:
- Amber gradient fades from `#fffbeb` at top to white
- Search box renders with placeholder text
- Typing more than 3 characters shows the EmailGate with a fade-in animation
- Clicking a chip populates the search box and shows the gate immediately
- Gate "Get results →" redirects to `/auth/register?q=…&email=…`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/althome/page.tsx
git commit -m "feat(althome): Hero section with EmailGate"
```

---

### Task 4: HowItWorks + ResultsDemo sections

**Files:**

- Modify: `frontend/src/app/althome/page.tsx`

- [ ] **Step 1: Add HowItWorks component (above `Hero`)**

```tsx
const HOW_STEPS = [
  {
    no: '01',
    title: 'Describe',
    body: 'Type a plain-English sentence: "Top 50 fintechs in Nigeria with recent funding." No filters to click. No taxonomies to learn.',
  },
  {
    no: '02',
    title: 'Discover & Enrich',
    body: 'Our agent reads registries, company websites, and the open web. Names, emails, and phones are verified — not guessed. Every field gets a source URL.',
  },
  {
    no: '03',
    title: 'Export & Act',
    body: 'Download as CSV, push to HubSpot or Salesforce, or copy individual contacts. Every result tells you exactly where the data came from.',
  },
] as const;

function HowItWorks() {
  return (
    <section id="how" className="border-b border-[color:var(--alt-rule)] px-6 md:px-10 py-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-6 h-0.5 rounded-full bg-[color:var(--alt-amber)]" aria-hidden />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--alt-amber-dark)]">
            How it works
          </span>
        </div>
        <h2 className="font-extrabold text-[34px] md:text-[42px] tracking-[-0.03em] leading-[1.08] text-[color:var(--alt-ink)] mb-12 md:mb-16">
          From a sentence to a list.<br />
          <span className="text-[color:var(--alt-amber)]">Three steps.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[color:var(--alt-rule)]">
          {HOW_STEPS.map((step, i) => (
            <div key={step.no} className="py-8 md:py-0 md:px-10 first:md:pl-0 last:md:pr-0 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] flex items-center justify-center text-[11px] font-bold text-[color:var(--alt-amber-dark)] shrink-0">
                  {step.no}
                </span>
                {i < HOW_STEPS.length - 1 && (
                  <span className="flex-1 h-px bg-[color:var(--alt-rule)]" aria-hidden />
                )}
              </div>
              <h3 className="font-bold text-[20px] tracking-[-0.02em] text-[color:var(--alt-ink)]">{step.title}</h3>
              <p className="text-[13px] text-[color:var(--alt-ink-3)] leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add ResultsDemo component (above `Hero`)**

```tsx
const DEMO_QUERY = 'Top Nigerian fintechs, Series-B+, CEO name + email';

type DemoRow = {
  company: string;
  contact: string;
  email: string;
  raised: string;
  status: 'verified' | 'enriching';
  blurred?: boolean;
};

const DEMO_ROWS: DemoRow[] = [
  { company: 'Paystack',    contact: 'Shola Akinlade',    email: 'shola@paystack.com',   raised: '$8M',   status: 'verified' },
  { company: 'Moniepoint',  contact: 'Tosin Eniolorunda', email: 'tosin@moniepoint.com', raised: '$110M', status: 'verified' },
  { company: 'Flutterwave', contact: 'Olugbenga Agboola', email: 'gb@flutterwave.com',   raised: '$250M', status: 'verified' },
  { company: 'Kuda Bank',   contact: 'Babs Ogundeyi',     email: 'babs@kuda.com',        raised: '$91M',  status: 'verified',  blurred: true },
  { company: 'FairMoney',   contact: 'Laurin Hainy',      email: 'lh@fairmoney.io',      raised: '$55M',  status: 'enriching', blurred: true },
];

const DEMO_STATS: Array<{ num: string; suffix: string; label: string }> = [
  { num: '50k', suffix: '+',   label: 'Leads delivered' },
  { num: '94',  suffix: '%',   label: 'Email accuracy' },
  { num: '8',   suffix: 'min', label: 'Average delivery' },
  { num: '3',   suffix: '×',   label: 'Sources cross-checked' },
];

function ResultsDemo() {
  return (
    <section className="border-b border-[color:var(--alt-rule)] bg-[color:var(--alt-paper-2)] px-6 md:px-10 py-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-6 h-0.5 rounded-full bg-[color:var(--alt-amber)]" aria-hidden />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--alt-amber-dark)]">
            See it in action
          </span>
        </div>
        <h2 className="font-extrabold text-[34px] md:text-[42px] tracking-[-0.03em] leading-[1.08] text-[color:var(--alt-ink)] mb-10">
          Real results.<br />
          <span className="text-[color:var(--alt-amber)]">Real sources.</span>
        </h2>

        {/* Table */}
        <div className="rounded-xl border border-[color:var(--alt-rule)] overflow-hidden bg-white shadow-sm mb-8">
          {/* Header bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-[color:var(--alt-paper-2)] border-b border-[color:var(--alt-rule)]">
            <span className="text-[12px] font-semibold text-[color:var(--alt-ink-2)]">Results</span>
            <span className="text-[11px] italic text-[color:var(--alt-ink-4)] bg-white border border-[color:var(--alt-rule)] rounded-full px-3 py-1 hidden md:block">
              &ldquo;{DEMO_QUERY}&rdquo;
            </span>
            <div className="flex gap-2">
              <button type="button" className="text-[11px] border border-[color:var(--alt-rule)] rounded-lg px-3 py-1.5 text-[color:var(--alt-ink-3)] bg-white hover:bg-[color:var(--alt-paper-2)] transition-colors">
                Export CSV
              </button>
              <button type="button" className="text-[11px] border border-[color:var(--alt-rule)] rounded-lg px-3 py-1.5 text-[color:var(--alt-ink-3)] bg-white hover:bg-[color:var(--alt-paper-2)] transition-colors">
                CRM sync
              </button>
            </div>
          </div>

          {/* Column headings */}
          <div className="grid grid-cols-[2fr_1.5fr_2fr_0.8fr_1fr] gap-3 px-5 py-2.5 bg-[color:var(--alt-paper-3)] border-b border-[color:var(--alt-rule)]">
            {(['Company', 'Contact', 'Email', 'Raised', 'Status'] as const).map(h => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--alt-ink-4)]">{h}</span>
            ))}
          </div>

          {/* Data rows */}
          {DEMO_ROWS.map(row => (
            <div
              key={row.company}
              className={[
                'grid grid-cols-[2fr_1.5fr_2fr_0.8fr_1fr] gap-3 px-5 py-3 border-b border-[color:var(--alt-rule)] last:border-b-0 items-center',
                row.blurred ? 'blur-[3px] opacity-40 select-none pointer-events-none' : '',
              ].join(' ')}
              aria-hidden={row.blurred}
            >
              <span className="text-[12px] font-semibold text-[color:var(--alt-ink)]">{row.company}</span>
              <span className="text-[12px] text-[color:var(--alt-ink-2)]">{row.contact}</span>
              <span className="text-[11px] font-mono text-[color:var(--alt-ink-3)] truncate">{row.email}</span>
              <span className="text-[12px] font-semibold font-mono text-[color:var(--alt-ink)]">{row.raised}</span>
              <span
                className={[
                  'text-[10px] font-medium rounded-md px-2 py-1 inline-block w-fit',
                  row.status === 'verified'
                    ? 'bg-[color:var(--alt-green-bg)] text-[color:var(--alt-green-text)]'
                    : 'bg-[color:var(--alt-paper-3)] text-[color:var(--alt-ink-4)]',
                ].join(' ')}
              >
                {row.status === 'verified' ? 'Verified' : 'Enriching'}
              </span>
            </div>
          ))}

          {/* Gate row */}
          <div className="px-5 py-6 bg-gradient-to-b from-transparent to-[color:var(--alt-paper-2)] text-center">
            <p className="text-[13px] text-[color:var(--alt-ink-3)] mb-4">
              <strong className="text-[color:var(--alt-ink)]">9 more results available.</strong>{' '}
              Enter your email to unlock the full list.
            </p>
            <div className="max-w-[480px] mx-auto">
              <EmailGate query={DEMO_QUERY} />
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-0 md:divide-x divide-[color:var(--alt-rule)]">
          {DEMO_STATS.map(s => (
            <div key={s.label} className="text-center md:px-8">
              <div className="font-extrabold text-[28px] tracking-[-0.03em] text-[color:var(--alt-ink)]">
                {s.num}<span className="text-[color:var(--alt-amber)]">{s.suffix}</span>
              </div>
              <div className="text-[11px] text-[color:var(--alt-ink-4)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add both sections to the page**

```tsx
export default function AlthomePage() {
  return (
    <main className="min-h-screen bg-white text-[color:var(--alt-ink)]" style={altTokens}>
      <AltNav />
      <Hero />
      <HowItWorks />
      <ResultsDemo />
      <AltFooter />
    </main>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/althome/page.tsx
git commit -m "feat(althome): HowItWorks + ResultsDemo sections"
```

---

### Task 5: Testimonials + Pricing sections

**Files:**

- Modify: `frontend/src/app/althome/page.tsx`

- [ ] **Step 1: Add Testimonials component (above `Hero`)**

```tsx
const TESTIMONIALS = [
  {
    quote: "I used to spend a full day assembling a list of fifty companies in Lagos. LeadreAI returned them in eight minutes, with named founders and emails that actually worked.",
    name: 'Adaeze Okonkwo',
    role: 'Head of Growth, Arlo Logistics · Lagos',
    initials: 'A',
    gradient: 'from-amber-400 to-red-400',
  },
  {
    quote: "The source-on-every-field thing sounds small until you've had a deal die because your data vendor lied about a title. We stopped arguing with sales about list quality.",
    name: 'Mwangi Njoroge',
    role: 'VP Revenue, Ardent Insurance · Nairobi',
    initials: 'M',
    gradient: 'from-blue-400 to-violet-500',
  },
  {
    quote: "We sell compliance software to mid-tier manufacturers. No one covers those accounts. LeadreAI found us buyers nobody else could name.",
    name: 'Kofi Mensah',
    role: 'Founder, Meridian Compliance · Accra',
    initials: 'K',
    gradient: 'from-emerald-400 to-blue-400',
  },
] as const;

function Testimonials() {
  return (
    <section className="border-b border-[color:var(--alt-rule)] px-6 md:px-10 py-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-6 h-0.5 rounded-full bg-[color:var(--alt-amber)]" aria-hidden />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--alt-amber-dark)]">
            What operators say
          </span>
        </div>
        <h2 className="font-extrabold text-[34px] md:text-[42px] tracking-[-0.03em] leading-[1.08] text-[color:var(--alt-ink)] mb-12">
          Teams already winning<br />
          <span className="text-[color:var(--alt-amber)]">with LeadreAI.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map(t => (
            <figure
              key={t.name}
              className="bg-[color:var(--alt-paper-2)] border border-[color:var(--alt-rule)] rounded-2xl p-6 flex flex-col gap-4"
            >
              <div className="flex gap-0.5" aria-label="5 stars">
                {Array.from({ length: 5 }).map((_, i) => (
                  <svg key={i} viewBox="0 0 12 12" className="w-3 h-3 fill-[color:var(--alt-amber)]" aria-hidden>
                    <path d="M6 1l1.2 3.6H11L8.1 6.9l1.2 3.6L6 8.2 2.7 10.5l1.2-3.6L1 4.6h3.8z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-[13px] text-[color:var(--alt-ink-2)] leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="flex items-center gap-3 pt-4 border-t border-[color:var(--alt-rule)]">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-[12px] font-bold text-white shrink-0`}>
                  {t.initials}
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-[color:var(--alt-ink)]">{t.name}</div>
                  <div className="text-[11px] text-[color:var(--alt-ink-4)]">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add Pricing component (above `Hero`)**

```tsx
type Tier = {
  name: string;
  price: string;
  period: string;
  pitch: string;
  features: readonly string[];
  cta: string;
  href: string;
  highlight: boolean;
};

const TIERS: Tier[] = [
  {
    name: 'Reader',
    price: 'Free',
    period: 'Forever, with limits',
    pitch: 'For operators running a list a week.',
    features: ['3 searches / month', 'Up to 25 leads per search', 'Email + phone verification', 'CSV export'],
    cta: 'Start free →',
    href: '/auth/register',
    highlight: false,
  },
  {
    name: 'Correspondent',
    price: '$49',
    period: 'per seat · monthly',
    pitch: 'For teams prospecting every day.',
    features: ['60 searches / month', 'Up to 200 leads per search', 'Dynamic output columns', 'Provenance exports', 'CRM sync (HubSpot, Salesforce)'],
    cta: 'Start trial →',
    href: '/auth/register',
    highlight: true,
  },
  {
    name: 'Bureau',
    price: 'Custom',
    period: 'Annual · contact us',
    pitch: 'For teams with a research budget.',
    features: ['Unlimited searches', '1,000+ leads per search', 'Private seed lists', 'Managed data sources', 'Named account support'],
    cta: 'Request a call →',
    href: '/auth/register',
    highlight: false,
  },
];

function Pricing() {
  return (
    <section id="pricing" className="border-b border-[color:var(--alt-rule)] bg-[color:var(--alt-paper-2)] px-6 md:px-10 py-20">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="w-6 h-0.5 rounded-full bg-[color:var(--alt-amber)]" aria-hidden />
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--alt-amber-dark)]">Pricing</span>
        </div>
        <h2 className="font-extrabold text-[34px] md:text-[42px] tracking-[-0.03em] leading-[1.08] text-[color:var(--alt-ink)] mb-12">
          Simple, transparent<br />
          <span className="text-[color:var(--alt-amber)]">pricing.</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map(tier => (
            <div
              key={tier.name}
              className={[
                'rounded-2xl p-7 flex flex-col',
                tier.highlight ? 'bg-[color:var(--alt-ink)] text-white' : 'bg-white border border-[color:var(--alt-rule)]',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-4">
                <span className={`text-[11px] font-semibold tracking-[0.1em] uppercase ${tier.highlight ? 'text-white/50' : 'text-[color:var(--alt-ink-4)]'}`}>
                  {tier.name}
                </span>
                {tier.highlight && (
                  <span className="text-[10px] font-semibold bg-[color:var(--alt-amber)] text-white rounded-full px-2.5 py-0.5">
                    Most popular
                  </span>
                )}
              </div>
              <div className={`font-extrabold text-[44px] tracking-[-0.04em] leading-none mb-1 ${tier.highlight ? 'text-white' : 'text-[color:var(--alt-ink)]'}`}>
                {tier.price}
              </div>
              <div className={`text-[12px] mb-5 ${tier.highlight ? 'text-white/40' : 'text-[color:var(--alt-ink-4)]'}`}>
                {tier.period}
              </div>
              <div className={`h-px mb-5 ${tier.highlight ? 'bg-white/10' : 'bg-[color:var(--alt-rule)]'}`} />
              <p className={`text-[13px] leading-snug mb-5 ${tier.highlight ? 'text-white/60' : 'text-[color:var(--alt-ink-3)]'}`}>
                {tier.pitch}
              </p>
              <ul className="flex flex-col gap-2.5 flex-1">
                {tier.features.map(f => (
                  <li key={f} className={`flex items-start gap-2.5 text-[12px] leading-snug ${tier.highlight ? 'text-white/70' : 'text-[color:var(--alt-ink-3)]'}`}>
                    <span className={`mt-0.5 w-4 h-4 rounded-[4px] flex items-center justify-center text-[10px] font-bold shrink-0 ${tier.highlight ? 'bg-emerald-400/20 text-emerald-300' : 'bg-[color:var(--alt-green-bg)] text-[color:var(--alt-green-text)]'}`}>
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={[
                  'mt-6 block text-center text-[13px] font-semibold rounded-xl py-3 transition-opacity hover:opacity-90',
                  tier.highlight ? 'bg-white text-[color:var(--alt-ink)]' : 'bg-[color:var(--alt-ink)] text-white',
                ].join(' ')}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add both sections to page**

```tsx
export default function AlthomePage() {
  return (
    <main className="min-h-screen bg-white text-[color:var(--alt-ink)]" style={altTokens}>
      <AltNav />
      <Hero />
      <HowItWorks />
      <ResultsDemo />
      <Testimonials />
      <Pricing />
      <AltFooter />
    </main>
  );
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/althome/page.tsx
git commit -m "feat(althome): Testimonials + Pricing sections"
```

---

### Task 6: FinalCTA + full assembly + visual check

**Files:**

- Modify: `frontend/src/app/althome/page.tsx`

- [ ] **Step 1: Add FinalCTA component (above `Hero`)**

```tsx
function FinalCTA() {
  const [query, setQuery] = useState('');
  const [showGate, setShowGate] = useState(false);

  return (
    <section className="border-b border-[color:var(--alt-amber-border)] bg-[color:var(--alt-amber-light)] px-6 md:px-10 py-20 text-center">
      <div className="max-w-[640px] mx-auto">
        <h2 className="font-extrabold text-[36px] md:text-[48px] tracking-[-0.04em] leading-[1.04] text-[color:var(--alt-ink)] mb-4">
          Your next 50 customers<br />are waiting.{' '}
          <span className="text-[color:var(--alt-amber-dark)]">Find them now.</span>
        </h2>
        <p className="text-[15px] text-[color:var(--alt-amber-dark)] opacity-70 mb-8">
          Free to start. No credit card. No sales call.
        </p>
        <div
          className={[
            'flex items-center gap-2.5 bg-white border-2 rounded-[14px] pl-4 pr-3 py-3 shadow-[0_4px_24px_#f59e0b18] mb-3 transition-all duration-200',
            showGate || query.length > 0
              ? 'border-[color:var(--alt-amber)]'
              : 'border-[color:var(--alt-amber-border)]',
          ].join(' ')}
        >
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 shrink-0 text-[color:var(--alt-ink-4)]" aria-hidden>
            <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Describe who you're selling to…"
            value={query}
            onChange={e => { setQuery(e.target.value); if (e.target.value.length > 3) setShowGate(true); }}
            className="flex-1 text-[14px] text-[color:var(--alt-ink)] placeholder:text-[color:var(--alt-ink-4)] focus:outline-none bg-transparent"
          />
          <button
            type="button"
            onClick={() => { if (query.length > 0) setShowGate(true); }}
            className="text-[13px] font-semibold bg-[color:var(--alt-amber)] text-white rounded-[10px] px-5 py-2.5 shrink-0 hover:bg-amber-600 transition-colors"
          >
            Search free &rarr;
          </button>
        </div>
        <AnimatePresence>
          {showGate && <EmailGate key="cta-gate" query={query} />}
        </AnimatePresence>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Assemble the complete page**

```tsx
export default function AlthomePage() {
  return (
    <main className="min-h-screen bg-white text-[color:var(--alt-ink)]" style={altTokens}>
      <AltNav />
      <Hero />
      <HowItWorks />
      <ResultsDemo />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <AltFooter />
    </main>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Open `/althome` and scroll through all sections**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/althome`. Verify each section:

- **Nav:** Sticky, amber dot logo, links, CTA
- **Hero:** Gradient, search box amber ring on focus, gate animates in, chips work, trust logos render
- **How it works:** 3 columns separated by a vertical rule on md+
- **Results demo:** 3 visible rows, 2 blurred, gate row, stats strip with amber suffixes
- **Testimonials:** 3 cards with gradient avatar circles and star ratings
- **Pricing:** Middle card dark with amber "Most popular" badge, check marks green
- **Final CTA:** Amber background, independent search + gate
- **Footer:** Dark background, amber dot logo

- [ ] **Step 5: Run production build**

```bash
cd frontend && npm run build
```

Expected: exits 0, no TypeScript or build errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/althome/page.tsx
git commit -m "feat(althome): FinalCTA + complete page assembly"
```

---

### Task 7: Promote design to / (replace main landing page)

**Files:**

- Modify: `frontend/src/app/page.tsx`

The new `/` is identical to `/althome` minus the `noindex` constraint. Replace the entire file.

- [ ] **Step 1: Replace `frontend/src/app/page.tsx` with the new design**

Copy the complete contents of `frontend/src/app/althome/page.tsx` into `frontend/src/app/page.tsx`, then rename the export function from `AlthomePage` to `LandingPage`:

```tsx
// At the bottom of frontend/src/app/page.tsx — only this line changes:
export default function LandingPage() {
```

Everything else (imports, all component definitions, `altTokens` spread, section order) is identical.

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Open `/` and confirm the new design appears**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000`. Confirm the Modern SaaS design renders (not the broadsheet). Confirm `http://localhost:3000/althome` also still works and looks identical.

- [ ] **Step 4: Run production build**

```bash
cd frontend && npm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat(landing): replace broadsheet with Modern SaaS design"
```

---

### Task 8: Restyle /pricing/page.tsx

**Files:**

- Modify: `frontend/src/app/pricing/page.tsx`

The existing pricing page has: `Masthead` → editorial hero → `PricingCards` → `ComparisonTable` → `FAQ` → `FinalCTA` → `Colophon`. Keep `PricingCards`, `ComparisonTable`, and `FAQ` content. Replace `Masthead`, `Colophon`, and the editorial hero with the new chrome.

- [ ] **Step 1: Replace the top of `pricing/page.tsx`**

Replace the import block and all component definitions before the first content component with:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import AltNav from '@/components/marketing/AltNav';
import AltFooter from '@/components/marketing/AltFooter';
import EmailGate from '@/components/marketing/EmailGate';
import { altTokens } from '@/components/marketing/alt-tokens';
```

Delete the `ArrowEast`, `CheckMark`, and `Masthead` component definitions. Delete the `Colophon` component definition. Keep all other existing component definitions (`PricingCards`, `ComparisonTable`, `FAQ`, etc.) intact — only update their color references from `var(--forest)` / `var(--ink)` / `var(--paper)` to their new equivalents:

| Old token | New token |
|-----------|-----------|
| `var(--forest)` | `var(--alt-amber)` |
| `var(--ink)` | `var(--alt-ink)` |
| `var(--ink-2)` | `var(--alt-ink-2)` |
| `var(--ink-3)` | `var(--alt-ink-3)` |
| `var(--paper)` | `white` |
| `var(--paper-2)` | `var(--alt-paper-2)` |
| `var(--rule)` | `var(--alt-rule)` |

- [ ] **Step 2: Replace the page export**

Find and replace the current `PricingPage` export with:

```tsx
export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white" style={altTokens}>
      <AltNav />
      {/* Pricing hero */}
      <section className="border-b border-[color:var(--alt-rule)] bg-gradient-to-b from-[#fffbeb] to-white px-6 md:px-10 py-16 text-center">
        <div className="max-w-[1200px] mx-auto">
          <div className="inline-flex items-center gap-2 bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] rounded-full px-3.5 py-1.5 text-[11px] font-medium text-[color:var(--alt-amber-dark)] mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--alt-amber)] shrink-0" aria-hidden />
            Simple, transparent pricing
          </div>
          <h1 className="font-extrabold text-[44px] md:text-[56px] tracking-[-0.04em] leading-[1.04] text-[color:var(--alt-ink)] mb-4">
            Pricing that scales<br />
            <span className="text-[color:var(--alt-amber)]">with your pipeline.</span>
          </h1>
          <p className="text-[16px] text-[color:var(--alt-ink-3)] max-w-[420px] mx-auto">
            Monthly, no annual commitment. Upgrade or cancel from the dashboard.
          </p>
        </div>
      </section>
      {/* Keep existing content sections */}
      <PricingCards />
      <ComparisonTable />
      <FAQ />
      <AltFooter />
    </main>
  );
}
```

Replace `PricingCards`, `ComparisonTable`, `FAQ` with whatever the actual component names are in the existing file — read the file first to confirm the exact names.

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Open `/pricing` and verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/pricing`. Confirm: new AltNav + amber hero, existing pricing content (cards, comparison table, FAQ) renders correctly with updated colors, AltFooter at bottom.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/pricing/page.tsx
git commit -m "feat(pricing): restyle to Modern SaaS design"
```

---

### Task 9: Restyle /docs/page.tsx

**Files:**

- Modify: `frontend/src/app/docs/page.tsx`

The docs page has: `Masthead` → editorial hero → sticky sidebar + 9 content sections → footer. Keep all content. Replace `Masthead`, the editorial hero, and footer with AltNav / a simple page header / AltFooter.

- [ ] **Step 1: Update imports at the top of `docs/page.tsx`**

Add:

```tsx
import AltNav from '@/components/marketing/AltNav';
import AltFooter from '@/components/marketing/AltFooter';
import { altTokens } from '@/components/marketing/alt-tokens';
```

Keep existing imports (`useState`, `useEffect`, `useRef`, `Link`) — they are used by the sidebar scroll-spy logic.

- [ ] **Step 2: Delete the `Masthead` component definition**

Remove the entire `function Masthead() { ... }` block. It will be replaced by the imported `<AltNav />`.

- [ ] **Step 3: Replace the page export wrapper**

Find the existing page export (likely `export default function DocsPage()`) and update its return to:

```tsx
export default function DocsPage() {
  // keep all existing state (activeSection, sectionRefs, etc.) unchanged

  return (
    <main className="min-h-screen bg-white" style={altTokens}>
      <AltNav />
      {/* Docs hero */}
      <section className="border-b border-[color:var(--alt-rule)] bg-gradient-to-b from-[#fffbeb] to-white px-6 md:px-10 py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-6 h-0.5 rounded-full bg-[color:var(--alt-amber)]" aria-hidden />
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[color:var(--alt-amber-dark)]">Field Manual</span>
          </div>
          <h1 className="font-extrabold text-[36px] md:text-[48px] tracking-[-0.04em] leading-[1.04] text-[color:var(--alt-ink)] mb-3">
            Everything you need<br />
            <span className="text-[color:var(--alt-amber)]">to use LeadreAI.</span>
          </h1>
          <p className="text-[15px] text-[color:var(--alt-ink-3)] max-w-[480px]">
            Plain-language guide for Nigerian business owners and marketing managers. No technical knowledge assumed.
          </p>
        </div>
      </section>
      {/* Keep existing sidebar + content sections exactly as-is */}
      {/* paste the existing <div className="max-w-[1320px]..."> content block here */}
      <AltFooter />
    </main>
  );
}
```

Replace color tokens in the existing content sections using the same mapping as Task 8:

| Old token | New token |
|-----------|-----------|
| `var(--forest)` | `var(--alt-amber)` |
| `var(--ink)` | `var(--alt-ink)` |
| `var(--ink-2)` | `var(--alt-ink-2)` |
| `var(--ink-3)` | `var(--alt-ink-3)` |
| `var(--paper)` | `white` |
| `var(--paper-2)` | `var(--alt-paper-2)` |
| `var(--rule)` | `var(--alt-rule)` |
| `var(--rust)` | `var(--alt-amber)` |

- [ ] **Step 4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Open `/docs` and verify**

```bash
cd frontend && npm run dev
```

Open `http://localhost:3000/docs`. Confirm: AltNav appears, amber docs hero renders, all 9 content sections render correctly, sidebar scroll-spy still works, AltFooter at bottom.

- [ ] **Step 6: Run final production build**

```bash
cd frontend && npm run build
```

Expected: exits 0 with no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/docs/page.tsx
git commit -m "feat(docs): restyle to Modern SaaS design"
```

---

## Self-Review

**Spec coverage:**

- ✅ `/althome` standalone page with all sections — Tasks 2–6
- ✅ `noindex` meta tag on `/althome` — Task 2 (`layout.tsx`)
- ✅ Email gate appears inline (no modal) when input > 3 chars — Task 3
- ✅ Chip clicks pre-fill query and immediately show gate — Task 3
- ✅ Gate redirects to `/auth/register?q=…&email=…` — Task 1 (`EmailGate.tsx`)
- ✅ Demo table gate + Final CTA both reuse `EmailGate` — Tasks 4, 6
- ✅ Stats strip numbers noted as marketing claims requiring verification — `DEMO_STATS` in Task 4
- ✅ Promote to `/` — Task 7
- ✅ Restyle `/pricing` — Task 8
- ✅ Restyle `/docs` — Task 9
- ✅ Shared components extracted (not duplicated per page) — Task 1

**Placeholder scan:** No TBD/TODO/fill-in-later patterns. Tasks 8 and 9 reference existing component names and instruct the implementer to read the file first — this is intentional because the existing component names are defined in those files, not duplicated here.

**Type consistency:**

- `EmailGate` takes `{ query: string }` — defined in Task 1, used identically in Tasks 3, 4, 6
- `altTokens` is `CSSProperties` — defined in Task 1, spread via `style={altTokens}` in Tasks 2, 7, 8, 9
- `AltNav`, `AltFooter` are default exports — imported the same way in all page tasks
- `TIERS` typed as `Tier[]` — defined and consumed only in Task 5
- `DEMO_ROWS` typed as `DemoRow[]` — defined and consumed only in Task 4
