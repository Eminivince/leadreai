'use client';

import { useState, useEffect, useRef } from 'react';
import AltNav from '@/components/marketing/AltNav';
import AltFooter from '@/components/marketing/AltFooter';

/* ─────────────────────────────────────────────────────────────────
 * /docs — The Field Manual
 *
 * Modern SaaS amber design for LeadreAI.
 * Written for Nigerian business owners and marketing managers —
 * plain language, local context, no assumed technical knowledge.
 *
 * Structure:
 *   AltNav → Hero → [Sticky Sidebar | 9 Content Sections] → AltFooter
 * ───────────────────────────────────────────────────────────────── */

/* ── Section data ────────────────────────────────────────────── */
const SECTIONS = [
  { id: 'overview',        label: '01 · Overview' },
  { id: 'getting-started', label: '02 · Getting Started' },
  { id: 'running-jobs',    label: '03 · Running a Job' },
  { id: 'reading-results', label: '04 · Reading Results' },
  { id: 'exporting',       label: '05 · Exporting' },
  { id: 'outreach',        label: '06 · Reaching Out' },
  { id: 'templates',       label: '07 · Saved Workflows' },
  { id: 'credits',         label: '08 · Credits & Billing' },
  { id: 'faq',             label: '09 · Common Questions' },
];

/* ── Hero ───────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="border-b border-[color:var(--alt-rule)]">
      <div className="max-w-[1200px] mx-auto px-6 md:px-10 pt-14 md:pt-20 pb-12 md:pb-16">
        <span className="inline-block text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--alt-amber-dark)] bg-[color:var(--alt-amber-light)] border border-[color:var(--alt-amber-border)] px-3 py-1 rounded-full mb-6">
          The Field Manual
        </span>
        <h1 className="text-[40px] md:text-[60px] lg:text-[72px] font-extrabold leading-[1.05] tracking-tight text-[color:var(--alt-ink)] max-w-[820px]">
          Everything you need to know
        </h1>
      </div>
    </section>
  );
}

/* ── Sidebar ────────────────────────────────────────────────── */
function Sidebar({ activeSection }: { activeSection: string }) {
  return (
    <aside className="hidden lg:block w-[220px] shrink-0">
      <nav className="sticky top-24">
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--alt-ink-4)] block mb-4">
          In this guide
        </span>
        <ul className="space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={`text-[13px] leading-[1.5] block py-1 transition-colors ${
                  activeSection === s.id
                    ? 'text-[color:var(--alt-amber-dark)] font-semibold'
                    : 'text-[color:var(--alt-ink-3)] hover:text-[color:var(--alt-ink-2)]'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-8 pt-6 border-t border-[color:var(--alt-rule)]">
          <p className="text-[12.5px] leading-[1.6] text-[color:var(--alt-ink-3)]">
            Questions? Email us at{' '}
            <a
              href="mailto:hello@leadreai.com"
              className="text-[color:var(--alt-ink-2)] underline underline-offset-[3px] decoration-[color:var(--alt-rule)] hover:decoration-[color:var(--alt-ink-2)]"
            >
              hello@leadreai.com
            </a>
          </p>
        </div>
      </nav>
    </aside>
  );
}

/* ── Callout ────────────────────────────────────────────────── */
function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-[color:var(--alt-amber)] bg-[color:var(--alt-amber-light)] pl-4 py-3 my-6 rounded-r-sm">
      <p className="text-[14px] leading-[1.6] text-[color:var(--alt-ink-2)]">
        {children}
      </p>
    </div>
  );
}

/* ── Section wrapper ────────────────────────────────────────── */
function DocSection({
  id,
  kicker,
  heading,
  children,
  alt = false,
}: {
  id: string;
  kicker: string;
  heading: string;
  children: React.ReactNode;
  alt?: boolean;
}) {
  return (
    <section
      id={id}
      className={`py-12 md:py-16 border-b border-[color:var(--alt-rule)] ${alt ? 'bg-[color:var(--alt-paper-3)] -mx-6 md:-mx-10 px-6 md:px-10' : ''}`}
    >
      <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--alt-ink-4)] block mb-3">
        {kicker}
      </span>
      <h2 className="text-[28px] md:text-[36px] font-extrabold leading-[1.1] tracking-tight text-[color:var(--alt-ink)] mb-6">
        {heading}
      </h2>
      <div className="text-[15px] leading-relaxed text-[color:var(--alt-ink-2)] space-y-4">
        {children}
      </div>
    </section>
  );
}

/* ── Section content components ─────────────────────────────── */
function BodyP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-[1.7] text-[color:var(--alt-ink-2)]">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.6] text-[color:var(--alt-ink-2)]">
          <span className="mt-[10px] block w-3 h-px shrink-0 bg-[color:var(--alt-amber)]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3 mt-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-[15px] leading-[1.6] text-[color:var(--alt-ink-2)]">
          <span className="font-mono text-[11px] font-bold text-[color:var(--alt-amber-dark)] shrink-0 w-5 mt-[3px]">
            {String(i + 1).padStart(2, '0')}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[18px] font-bold leading-[1.25] text-[color:var(--alt-ink)] mt-6 mb-3">
      {children}
    </h3>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[13px] bg-[color:var(--alt-paper-2)] text-[color:var(--alt-amber-dark)] px-1.5 py-0.5 rounded border border-[color:var(--alt-rule)]">
      {children}
    </code>
  );
}

/* ── FAQ item ────────────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = `faq-${q.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)}`;
  return (
    <div className="border-b border-[color:var(--alt-rule)] py-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-4 text-left group"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="text-[17px] font-semibold leading-[1.3] text-[color:var(--alt-ink)] group-hover:text-[color:var(--alt-amber-dark)] transition-colors">
          {q}
        </span>
        <span
          className={`text-[18px] font-bold text-[color:var(--alt-ink-3)] shrink-0 mt-0.5 transition-transform ${
            open ? 'rotate-45' : ''
          }`}
        >
          +
        </span>
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="mt-3 text-[14.5px] leading-[1.65] text-[color:var(--alt-ink-2)] pr-8"
      >
        {a}
      </div>
    </div>
  );
}

/* ── Credits table ──────────────────────────────────────────── */
function CreditsTable() {
  const rows = [
    { plan: 'Reader (Free)', credits: '5', price: '₦0' },
    { plan: 'Correspondent', credits: '200', price: '~₦80,000/mo' },
    { plan: 'Bureau', credits: '2,000', price: 'Custom' },
  ];
  return (
    <div className="border border-[color:var(--alt-rule)] rounded-lg overflow-hidden my-6">
      <div className="grid grid-cols-3 bg-[color:var(--alt-paper-2)] border-b border-[color:var(--alt-rule)]">
        {['Plan', 'Monthly Credits', 'Price'].map((h) => (
          <div
            key={h}
            className="px-4 py-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--alt-ink-3)]"
          >
            {h}
          </div>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.plan}
          className="grid grid-cols-3 border-b border-[color:var(--alt-rule)]/70 last:border-b-0"
        >
          <div className="px-4 py-3 text-[14px] font-medium text-[color:var(--alt-ink)]">
            {r.plan}
          </div>
          <div className="px-4 py-3 font-mono text-[13px] tabular-nums text-[color:var(--alt-ink-2)]">
            {r.credits}
          </div>
          <div className="px-4 py-3 font-mono text-[13px] text-[color:var(--alt-ink-2)]">
            {r.price}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Results table example ──────────────────────────────────── */
function ResultsColumnTable() {
  const cols = [
    {
      col: 'Company',
      desc: 'The business name',
    },
    {
      col: 'Contact Name',
      desc: 'The person found — owner, CEO, purchasing manager, or whoever you asked for',
    },
    {
      col: 'Email',
      desc: 'The email address. Shows a confidence badge: High, Medium, or Unverified',
    },
    {
      col: 'Source',
      desc: 'A link to the exact web page where Leadre AI found this information',
    },
    {
      col: 'Score',
      desc: 'An AI-generated relevance score (0–100) showing how well this company matches your brief',
    },
  ];
  return (
    <div className="border border-[color:var(--alt-rule)] rounded-lg overflow-hidden my-6">
      <div className="grid grid-cols-[140px_1fr] bg-[color:var(--alt-paper-2)] border-b border-[color:var(--alt-rule)]">
        <div className="px-4 py-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--alt-ink-3)]">
          Column
        </div>
        <div className="px-4 py-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--alt-ink-3)]">
          What it means
        </div>
      </div>
      {cols.map((c) => (
        <div
          key={c.col}
          className="grid grid-cols-[140px_1fr] border-b border-[color:var(--alt-rule)]/70 last:border-b-0 items-start"
        >
          <div className="px-4 py-3 font-mono text-[12.5px] font-semibold text-[color:var(--alt-amber-dark)]">
            {c.col}
          </div>
          <div className="px-4 py-3 text-[13.5px] leading-[1.55] text-[color:var(--alt-ink-2)]">
            {c.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main scroll-spy body ───────────────────────────────────── */
function DocBody() {
  const [activeSection, setActiveSection] = useState<string>('overview');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('section[id]');

    // Initialise from current scroll position (handles deep-link entry)
    const pickInitial = () => {
      const viewMid = window.innerHeight * 0.4;
      let best: HTMLElement | null = null;
      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        if (rect.top <= viewMid && (best === null || rect.top > best.getBoundingClientRect().top)) {
          best = s;
        }
      });
      if (best) setActiveSection((best as HTMLElement).id);
    };
    pickInitial();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Collect all currently-intersecting section ids
        const intersecting = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target.id);

        if (intersecting.length === 0) return;

        // Pick the one that appears earliest in the document order
        const sectionIds = SECTIONS.map((s) => s.id);
        const first = sectionIds.find((id) => intersecting.includes(id));
        if (first) setActiveSection(first);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );

    sections.forEach((s) => observerRef.current?.observe(s));

    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-12 md:py-16 flex gap-16">
      <Sidebar activeSection={activeSection} />

      <div className="flex-1 min-w-0">

        {/* Mobile table of contents — hidden on lg+ where sidebar is visible */}
        <details className="lg:hidden mb-8 border border-[color:var(--alt-rule)] rounded-lg">
          <summary className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--alt-ink-2)] px-4 py-3 cursor-pointer select-none">
            In this guide
          </summary>
          <nav className="px-4 pb-4 flex flex-col gap-2">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-[13px] text-[color:var(--alt-ink-2)] hover:text-[color:var(--alt-ink)] transition"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </details>

        {/* ── Section 1: Overview ─────────────────────────── */}
        <DocSection id="overview" kicker="01 · Overview" heading="What Is Leadre AI?">
          <BodyP>
            Leadre AI is a research assistant that finds business contacts on your behalf —
            companies, decision-makers, and email addresses — and hands them to you in a
            clean spreadsheet with source links so you can verify everything yourself.
          </BodyP>
          <BodyP>
            Think of it like hiring a sharp junior researcher who works through the night.
            You describe who you want to reach — &ldquo;FMCG distributors in Kano, I need
            the purchasing manager&rdquo; — and Leadre AI searches the web, trade
            directories, company registries, and public business listings, then comes back
            to you with a list of contacts that match your brief.
          </BodyP>
          <BodyP>
            The difference between Leadre AI and a regular Google search is that we do the
            digging for you. We find the business name, the right person inside that
            business, their email address, and we tell you exactly where we found it.
            No guessing. No fabrications. If we cannot confirm something, we leave it blank
            and tell you why.
          </BodyP>
          <Callout>
            <strong className="text-[color:var(--alt-ink)]">Who is this for?</strong> Nigerian business owners,
            sales managers, marketing teams, and agencies who need to reach other
            businesses. If you sell to companies — manufacturers, distributors, service
            firms, professional practices — Leadre AI is built for you.
          </Callout>
          <BodyP>
            You do not need to know how to code or use complicated software. If you can
            send a WhatsApp message, you can use Leadre AI.
          </BodyP>
        </DocSection>

        {/* ── Section 2: Getting Started ──────────────────── */}
        <DocSection id="getting-started" kicker="02 · Getting Started" heading="Your First Five Minutes" alt>
          <BodyP>
            Getting your first research job running takes less than five minutes. Here is
            exactly what to do.
          </BodyP>
          <NumberedList
            items={[
              <>
                <strong className="text-[color:var(--alt-ink)]">Create your free account</strong> at leadreai.com — no
                credit card needed. You can be up and running in under a minute.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">You start with 5 free credits.</strong> Each credit is
                roughly one research job. Use them to explore before you commit to a plan.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Click &ldquo;New Job&rdquo;</strong> on your dashboard.
                You will see a single text box — that is all you need.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Type what you are looking for in plain English.</strong>{' '}
                For example:
                <ul className="mt-2 space-y-1.5 ml-1">
                  {[
                    '"Find FMCG distributors in Kano and their purchasing managers"',
                    '"Get me mid-size logistics companies in Lagos Island with owner contact"',
                    '"Pharmaceutical wholesalers in Abuja — I need names and emails"',
                    '"Building materials suppliers in Port Harcourt, managing director or owner"',
                  ].map((ex) => (
                    <li key={ex} className="flex items-start gap-2">
                      <span className="text-[color:var(--alt-amber)] shrink-0 mt-0.5">›</span>
                      <span className="italic text-[14.5px] text-[color:var(--alt-ink)]">
                        {ex}
                      </span>
                    </li>
                  ))}
                </ul>
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Leadre AI may ask one or two quick follow-up
                questions</strong> to make sure it finds the right people. Answer naturally — no
                special format required.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Click &ldquo;Run&rdquo;</strong> — the research starts.
                Most jobs finish in 5–15 minutes. You can close the browser and come back;
                results will be waiting for you.
              </>,
            ]}
          />
          <Callout>
            Your first job is the most important. Be specific about the{' '}
            <strong className="text-[color:var(--alt-ink)]">industry</strong>, the{' '}
            <strong className="text-[color:var(--alt-ink)]">city</strong>, and the{' '}
            <strong className="text-[color:var(--alt-ink)]">type of person</strong> you want to reach (owner,
            purchasing manager, CEO). The more detail you give, the better your results.
          </Callout>
        </DocSection>

        {/* ── Section 3: Running Jobs ─────────────────────── */}
        <DocSection id="running-jobs" kicker="03 · Running a Research Job" heading="Describing What You Need">
          <BodyP>
            The job description box is where everything starts. There is no dropdown menu
            to navigate, no taxonomy to learn. You describe what you need in plain English
            and Leadre AI works out the rest.
          </BodyP>

          <SubHeading>What makes a good job description</SubHeading>
          <BulletList
            items={[
              <>
                <strong className="text-[color:var(--alt-ink)]">Name the industry</strong> — be specific.
                &ldquo;Building materials&rdquo; is better than &ldquo;construction&rdquo;.
                &ldquo;Agro-processing&rdquo; is better than &ldquo;agriculture&rdquo;.
                &ldquo;Insurance brokerage&rdquo; is better than &ldquo;financial
                services&rdquo;.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Name the city or region</strong> — &ldquo;Lagos
                Mainland&rdquo;, &ldquo;Port Harcourt&rdquo;, &ldquo;Northern Nigeria&rdquo;,
                &ldquo;South-West states&rdquo;. The more precise, the more relevant your
                results.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Name the role you need</strong> — &ldquo;the
                owner&rdquo;, &ldquo;the head of procurement&rdquo;, &ldquo;the marketing
                manager&rdquo;, &ldquo;managing director&rdquo;. Leadre AI will look for
                that person specifically.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Optional: add size hints</strong> — &ldquo;companies
                with more than 50 staff&rdquo;, &ldquo;businesses that have a website&rdquo;,
                &ldquo;companies that have been around for at least 5 years&rdquo;. These help
                filter out micro-enterprises if that is not your market.
              </>,
            ]}
          />

          <SubHeading>A real example</SubHeading>
          <div className="border-l-2 border-[color:var(--alt-amber-border)] bg-[color:var(--alt-amber-light)] pl-4 py-3 my-4 rounded-r-sm">
            <p className="italic text-[17px] leading-[1.5] text-[color:var(--alt-ink)]">
              &ldquo;Find building materials suppliers in Abuja — I need the owner or
              managing director. Companies that have been around for at least 5 years.&rdquo;
            </p>
          </div>
          <BodyP>
            This description tells Leadre AI: the industry (building materials), the city
            (Abuja), the seniority level (owner or MD), and a quality filter (5+ years in
            business). That combination produces a tight, relevant result set.
          </BodyP>

          <SubHeading>The clarification step</SubHeading>
          <BodyP>
            After you submit your description, Leadre AI may ask a follow-up question —
            something like: &ldquo;Do you want only companies with verified email addresses,
            or is a company name and phone number also useful?&rdquo; Just answer naturally.
            These questions help Leadre AI understand exactly what success looks like for you.
          </BodyP>

          <SubHeading>Credits and cost estimates</SubHeading>
          <BodyP>
            Each job consumes 1–5 credits depending on how many contacts are found. Before
            a job runs, you will see a credit estimate on screen. A typical job searching
            for 20–50 contacts uses 1–2 credits. You can cancel before running if the
            estimate looks too high.
          </BodyP>
        </DocSection>

        {/* ── Section 4: Reading Results ──────────────────── */}
        <DocSection id="reading-results" kicker="04 · Reading Your Results" heading="What You Get Back" alt>
          <BodyP>
            When a job finishes, your results appear in a table. Each row is one contact —
            a person at a company who matches your brief. Here is what each column means.
          </BodyP>

          <ResultsColumnTable />

          <SubHeading>What the confidence levels mean</SubHeading>
          <BulletList
            items={[
              <>
                <InlineCode>High</InlineCode> — the email address was found directly on the
                company&rsquo;s own website or an official business directory. We also
                confirmed it with a mail-server check. This is the most reliable.
              </>,
              <>
                <InlineCode>Medium</InlineCode> — we found the email in a public source
                (a contact page, registry, or directory). It has not been technically
                verified by a mail-server handshake. Most are reachable, but send a test
                message before a large campaign.
              </>,
              <>
                <InlineCode>Inferred</InlineCode> — we did not find this address in
                public — we guessed it from the company&rsquo;s likely email pattern (for
                example, <InlineCode>firstname.lastname@company.com</InlineCode>). Treat
                inferred addresses as a best guess; they are hidden by default and
                should be verified before use.
              </>,
            ]}
          />

          <SubHeading>About the Source link</SubHeading>
          <BodyP>
            Leadre AI does not make up contacts. Every row in your results table comes from
            a public source — a company website, a trade directory, a LinkedIn page, or a
            business registry. The Source column shows you exactly where the information
            was found. Click any Source link to open the original page and verify it
            yourself before you reach out.
          </BodyP>
          <BodyP>
            If Leadre AI cannot find a public source for a piece of information, that field
            is left blank. We would rather show you an empty cell than fill it with
            something we are not sure about.
          </BodyP>
        </DocSection>

        {/* ── Section 5: Exporting ────────────────────────── */}
        <DocSection id="exporting" kicker="05 · Exporting Your Data" heading="Taking Your Contacts Elsewhere">
          <BodyP>
            Once a job is complete, you can export your results to use in other tools —
            your email platform, your CRM, or a spreadsheet you manage yourself.
          </BodyP>

          <SubHeading>Export formats</SubHeading>
          <BulletList
            items={[
              <>
                <strong className="text-[color:var(--alt-ink)]">CSV</strong> — the most useful
                format for most people. Opens in Microsoft Excel, Google Sheets, or any
                spreadsheet. One click from the job results page. Every column, every source
                URL, and every confidence score is included.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">JSON</strong> — for developers
                and technical teams who want to pipe data directly into another system (a
                CRM, a marketing automation tool, a custom database). If you do not know
                what JSON is, you do not need it — CSV will serve you well.
              </>,
            ]}
          />

          <Callout>
            <strong className="text-[color:var(--alt-ink)]">Export before the job expires.</strong> Jobs and their results
            are stored on your account for 30 days. After that, you would need to re-run
            the job to get fresh data. Always export when the results look good.
          </Callout>

          <BodyP>
            Every exported file includes the source URL for every contact. This is
            important if a client, manager, or compliance team ever asks &ldquo;where did
            this list come from?&rdquo; — the answer is in the file.
          </BodyP>
        </DocSection>

        {/* ── Section 6: Outreach ─────────────────────────── */}
        <DocSection id="outreach" kicker="06 · Reaching Out" heading="After You Have the Contacts">
          <BodyP>
            Leadre AI gives you the contacts. The actual outreach — sending emails, making
            calls — happens outside the platform using your own tools. Here is a
            straightforward workflow that works well for most businesses.
          </BodyP>

          <NumberedList
            items={[
              <>
                <strong className="text-[color:var(--alt-ink)]">Export to CSV</strong> from the
                results page. This is your master list.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Import into your email tool.</strong>{' '}
                Gmail mail merge, Mailchimp, Zoho CRM, Brevo (formerly Sendinblue), or even
                a simple mail merge in Google Sheets using a free add-on. All of these
                accept CSV files.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Personalise your message
                before sending.</strong> Mention the company by name. Reference what they
                do. A message that looks like it was written for that person specifically
                gets far more replies than a mass blast. The Contact Name and Company
                columns in your CSV make this straightforward.
              </>,
            ]}
          />

          <SubHeading>A note on responsible outreach</SubHeading>
          <BodyP>
            Only contact businesses that may genuinely benefit from your offer. Nigeria&rsquo;s
            data protection framework — the <strong className="text-[color:var(--alt-ink)]">NDPR
            (Nigeria Data Protection Regulation)</strong> — requires you to have a lawful basis for
            contacting people. For most B2B outreach, a legitimate business interest is
            sufficient, but you must be transparent about who you are and give recipients
            an easy way to opt out.
          </BodyP>
          <BodyP>
            Leadre AI provides research. You are responsible for how you use it. Sending
            spam, impersonating companies, or using these contacts for anything unlawful is
            a violation of our terms of service.
          </BodyP>
        </DocSection>

        {/* ── Section 7: Templates / Workflows ────────────── */}
        <DocSection id="templates" kicker="07 · Saving a Template" heading="Run the Same Search Next Month" alt>
          <BodyP>
            If you run the same type of research regularly — every month, every quarter —
            Saved Workflows save you from retyping your brief each time.
          </BodyP>

          <SubHeading>How to save a workflow</SubHeading>
          <BodyP>
            After a job finishes and you are happy with the results, click{' '}
            <strong className="text-[color:var(--alt-ink)]">&ldquo;Save as Workflow&rdquo;</strong> at the top
            of the results page. Give it a clear name, something you will recognise
            next month — for example:{' '}
            <InlineCode>Monthly Kano FMCG sweep</InlineCode> or{' '}
            <InlineCode>Quarterly Abuja logistics update</InlineCode>.
          </BodyP>
          <BodyP>
            Next time, open the Workflows tab on your dashboard, find the saved workflow,
            and click <strong className="text-[color:var(--alt-ink)]">Run</strong>. Leadre AI
            repeats the same search with fresh data from the web.
          </BodyP>

          <SubHeading>Who uses this most</SubHeading>
          <BodyP>
            Agencies and marketing consultants running monthly lead-gen for clients find
            Saved Workflows most useful. You set up the brief once per client — industry,
            city, role — and then run it every quarter to deliver fresh contacts.
            Each run produces new results without repeating contacts you have already seen.
          </BodyP>

          <Callout>
            Saved workflows keep your original search brief but always fetch new data.
            You will not receive the same contacts twice — Leadre AI automatically filters
            out duplicates from previous runs on the same workflow.
          </Callout>
        </DocSection>

        {/* ── Section 8: Credits & Billing ────────────────── */}
        <DocSection id="credits" kicker="08 · Credits & Billing" heading="How the Credit System Works">
          <BodyP>
            Credits are the currency of Leadre AI. Every research job you run costs a
            small number of credits, depending on how many contacts are found.
          </BodyP>

          <SubHeading>The basics</SubHeading>
          <BulletList
            items={[
              <>
                <strong className="text-[color:var(--alt-ink)]">1 credit</strong> = roughly one
                research job that finds up to 20 contacts.
              </>,
              <>
                Credits that come with your monthly plan{' '}
                <strong className="text-[color:var(--alt-ink)]">reset at the start of each
                billing month</strong>. If you are on Reader or Correspondent, unused
                monthly credits expire at the end of each period — use them or lose them.
              </>,
              <>
                <strong className="text-[color:var(--alt-ink)]">Top-up credits</strong> (extra
                credits you purchase separately) do not expire. They roll over month to
                month until you use them.
              </>,
            ]}
          />

          <SubHeading>Plan summary</SubHeading>
          <CreditsTable />

          <SubHeading>Top-up packages</SubHeading>
          <BodyP>
            If you need more research capacity without upgrading your plan, you can
            purchase top-up credit packs at any time:
          </BodyP>
          <BulletList
            items={[
              <><strong className="text-[color:var(--alt-ink)]">Trial Pack</strong> — 20 credits — ~₦31,000</>,
              <><strong className="text-[color:var(--alt-ink)]">Desk Pack</strong> — 50 credits — ~₦74,000</>,
              <><strong className="text-[color:var(--alt-ink)]">Bureau Pack</strong> — 200 credits — ~₦270,000</>,
              <><strong className="text-[color:var(--alt-ink)]">Annual Bundle</strong> — 1,000 credits — ~₦1,230,000</>,
            ]}
          />

          <Callout>
            Prices shown in Naira are approximate and based on the current $/₦ exchange
            rate at the time of billing. Billing is coming soon — contact{' '}
            <strong className="text-[color:var(--alt-ink)]">hello@leadreai.com</strong> for
            early access and custom pricing.
          </Callout>
        </DocSection>

        {/* ── Section 9: FAQ ──────────────────────────────── */}
        <DocSection id="faq" kicker="09 · Common Questions" heading="Questions We Hear Often">
          <BodyP>
            Here are the questions that come up most often from Nigerian business owners
            using Leadre AI for the first time.
          </BodyP>

          <div className="mt-6 border-t border-[color:var(--alt-rule)]">
            <FAQItem
              q="Does Leadre AI work for Nigerian businesses specifically?"
              a={
                <>
                  Yes. The platform was built with West African markets as the primary
                  focus. It searches Nigerian-specific sources including{' '}
                  <strong>CAC (Corporate Affairs Commission)</strong> filings, SMEDAN
                  directories, trade associations, and local industry publications — sources
                  that general-purpose databases simply do not cover.
                </>
              }
            />
            <FAQItem
              q="How accurate are the email addresses?"
              a={
                <>
                  We verify email addresses using a mail-server handshake before showing
                  them to you. High-confidence emails have a delivery rate above 85% in
                  our testing. No tool guarantees 100% deliverability — email addresses
                  change, inboxes get deactivated — but we work hard to make sure what
                  you see is what you get.
                </>
              }
            />
            <FAQItem
              q="Can I use Leadre AI for personal contacts, not businesses?"
              a={
                <>
                  No. The platform is designed for B2B (business-to-business) research
                  only — finding companies and their business representatives. It does not
                  work for locating private individuals, and attempting to use it that way
                  violates our terms of service.
                </>
              }
            />
            <FAQItem
              q="My job ran but returned very few results. What happened?"
              a={
                <>
                  Some industries or cities have thin public data — especially
                  smaller cities outside Lagos and Abuja. Try{' '}
                  <strong>broadening the geography</strong> (for example, &ldquo;all
                  South-West Nigeria&rdquo; instead of &ldquo;Lagos Island only&rdquo;) or
                  removing size constraints. Credits are only charged for contacts actually
                  found — if a job returns fewer results than expected, you are not charged
                  the full estimate.
                </>
              }
            />
            <FAQItem
              q="How do I know the data is not made up?"
              a={
                <>
                  Every contact in your results has a Source link. Click any Source link
                  to open the original web page where Leadre AI found that information.
                  If there is no verifiable public source, we will not include the contact.
                  The em-dash you sometimes see in a results table is not an error — it
                  means we could not confirm that field, and we chose honesty over a
                  plausible guess.
                </>
              }
            />
            <FAQItem
              q="Is my data safe?"
              a={
                <>
                  Yes. Your jobs, contacts, and exported files are stored on encrypted
                  cloud servers and never shared with third parties. We comply with the{' '}
                  <strong>Nigeria Data Protection Regulation (NDPR)</strong> and apply
                  industry-standard security practices to everything we store on your behalf.
                </>
              }
            />
            <FAQItem
              q="Can I cancel my subscription at any time?"
              a={
                <>
                  Yes. Go to <strong>Settings → Billing</strong> on your dashboard and
                  click Cancel Subscription. Your plan stays active until the end of the
                  current billing period — you keep access and your remaining credits until
                  then. There are no cancellation fees.
                </>
              }
            />
            <FAQItem
              q="I need more than 2,000 contacts a month. Can you help?"
              a={
                <>
                  Yes. The Bureau plan is designed for high-volume research teams. Contact
                  us at{' '}
                  <a
                    href="mailto:hello@leadreai.com"
                    className="text-[color:var(--alt-ink)] underline underline-offset-[3px] decoration-[color:var(--alt-rule)] hover:decoration-[color:var(--alt-ink)]"
                  >
                    hello@leadreai.com
                  </a>{' '}
                  to discuss a custom plan with pricing and support that fits your scale.
                </>
              }
            />
          </div>

          <div className="mt-10 p-6 bg-[color:var(--alt-paper-2)] border border-[color:var(--alt-rule)] rounded-lg">
            <p className="text-[15px] leading-[1.6] text-[color:var(--alt-ink-2)]">
              Did not find what you were looking for?{' '}
              <a
                href="mailto:hello@leadreai.com"
                className="text-[color:var(--alt-ink)] underline underline-offset-[3px] decoration-[color:var(--alt-rule)] hover:decoration-[color:var(--alt-ink)]"
              >
                Email us
              </a>{' '}
              and we will answer within one business day.
            </p>
          </div>
        </DocSection>

      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function DocsPage() {
  return (
    <main
      className="alt-tokens bg-[color:var(--paper)] text-[color:var(--alt-ink)] min-h-screen selection:bg-[color:var(--alt-amber-light)] selection:text-[color:var(--alt-amber-dark)]"
    >
      <AltNav />
      <Hero />
      <DocBody />
      <AltFooter />
    </main>
  );
}
