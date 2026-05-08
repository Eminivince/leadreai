'use client'

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import AltNav from '@/components/marketing/AltNav'
import AltFooter from '@/components/marketing/AltFooter'
import EmailGate from '@/components/marketing/EmailGate'

const GATE_THRESHOLD = 3

const CHIPS = [
  'Fintech CEOs · Lagos',
  'Law firms · Nairobi',
  'Series B startups · Accra',
  'FMCG distributors · Kano',
  'Insurtech CTOs · Nigeria',
]

const HOW_STEPS = [
  {
    num: '01',
    title: 'Describe',
    body: 'Type a plain-English sentence — no dropdowns, no filters. "Series B fintechs in Lagos with a CTO who went to UniLag" works.',
  },
  {
    num: '02',
    title: 'Discover & Enrich',
    body: 'Our agent reads registries, company websites, and the open web. Where the source supports it, emails are MX + SMTP checked. Every contact ships with source links so you can verify what we found.',
  },
  {
    num: '03',
    title: 'Export & Act',
    body: 'Download CSV, push directly to HubSpot, or copy individual contacts. Your CRM, your workflow.',
  },
]

const TESTIMONIALS = [
  {
    quote: "We closed three enterprise deals in our first month. The email accuracy alone saves us hours every week.",
    name: 'Adaeze Okonkwo',
    role: 'Head of Sales',
    city: 'Lagos',
    initial: 'A',
  },
  {
    quote: "Finally a tool that understands African markets. The data quality on Nairobi contacts is unlike anything we've seen.",
    name: 'Mwangi Njoroge',
    role: 'Founder',
    city: 'Nairobi',
    initial: 'M',
  },
  {
    quote: "We replaced three manual research tools with Leadre. Our SDRs now spend time selling, not searching.",
    name: 'Kofi Mensah',
    role: 'VP Growth',
    city: 'Accra',
    initial: 'K',
  },
]

const PRICING_TIERS = [
  {
    name: 'Reader',
    price: '$29',
    period: '/month',
    tagline: 'For solo prospectors getting started.',
    features: ['Up to 50 contacts/month', 'Email + phone enrichment', 'CSV export', 'Email support'],
    cta: 'Get started free',
    ctaHref: '/auth/register',
    highlighted: false,
  },
  {
    name: 'Correspondent',
    price: '$99',
    period: '/month',
    tagline: 'For growing sales teams.',
    features: ['Up to 500 contacts/month', 'CRM sync (HubSpot)', 'Priority enrichment queue', 'Outbound webhooks', 'Live chat support'],
    cta: 'Start free trial',
    ctaHref: '/auth/register',
    highlighted: true,
  },
  {
    name: 'Bureau',
    price: '$299',
    period: '/month',
    tagline: 'For agencies and enterprise teams.',
    features: ['Unlimited contacts', 'Custom pipeline integrations', 'Dedicated account manager', 'SLA guarantee', 'Custom data sources'],
    cta: 'Contact sales',
    // TODO: replace with dedicated sales/demo booking page when available
    ctaHref: '/contact',
    highlighted: false,
  },
]

const DEMO_ROWS = [
  { company: 'Paystack', contact: 'Shola Akinlade', email: 'shola@paystack.com', raised: '$8M', status: 'Verified' },
  { company: 'Moniepoint', contact: 'Felix Ike', email: 'felix@moniepoint.com', raised: '$15M', status: 'Verified' },
  { company: 'Flutterwave', contact: 'Olugbenga Agboola', email: 'gbenga@flutterwave.com', raised: '$170M', status: 'Verified' },
]

export default function AlthomePage() {
  const [query, setQuery] = useState('')
  const showGate = query.length > GATE_THRESHOLD

  return (
    <main className="alt-tokens bg-[color:var(--paper)] text-[color:var(--alt-ink)]">
      <AltNav />
      <HeroSection query={query} setQuery={setQuery} showGate={showGate} />
      <HowItWorksSection />
      <ResultsDemoSection query={query} />
      <TestimonialsSection />
      <PricingSection />
      <FinalCTASection query={query} setQuery={setQuery} showGate={showGate} />
      <AltFooter />
    </main>
  )
}

function HeroSection({
  query,
  setQuery,
  showGate,
}: {
  query: string
  setQuery: (v: string) => void
  showGate: boolean
}) {
  return (
    <section
      style={{
        background: 'linear-gradient(to bottom, #fffbeb 0%, #ffffff 55%)',
        padding: '80px 24px 64px',
        textAlign: 'center',
      }}
    >
      {/* Badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'var(--alt-amber-light)', border: '1px solid var(--alt-amber-border)',
        borderRadius: 999, padding: '4px 14px', marginBottom: 24,
      }}>
        <span style={{ color: 'var(--alt-amber-dark)', fontSize: 13, fontWeight: 600 }}>
          Built for Nigerian &amp; African markets
        </span>
      </div>

      {/* Headline */}
      <h1 style={{
        fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800,
        letterSpacing: '-0.04em', color: 'var(--alt-ink)',
        lineHeight: 1.1, maxWidth: 700, margin: '0 auto 16px',
      }}>
        Find your next customer.{' '}
        <span style={{ color: 'var(--alt-amber)' }}>Before your competitors do.</span>
      </h1>

      {/* Subline */}
      <p style={{
        fontSize: 16, color: 'var(--alt-ink-3)', maxWidth: 440,
        margin: '0 auto 32px', lineHeight: 1.6,
      }}>
        Describe the companies or people you want to reach. Our agent finds, enriches, and verifies them — so you can sell instead of search.
      </p>

      {/* Search box */}
      <div style={{ maxWidth: 580, margin: '0 auto', position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', border: '2px solid var(--alt-rule)',
          borderRadius: 10, padding: '10px 10px 10px 16px',
          boxShadow: query.length > 0 ? '0 0 0 4px #f59e0b18' : 'none',
          transition: 'box-shadow 0.2s',
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--alt-ink-4)', flexShrink: 0 }}>
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Series B fintechs in Lagos with a CTO…"
            aria-label="Search for leads"
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              color: 'var(--alt-ink)', background: 'transparent',
            }}
          />
          <button
            disabled={query.length === 0}
            style={{
              background: query.length > 0 ? 'var(--alt-amber)' : 'var(--alt-rule)',
              color: query.length > 0 ? '#fff' : 'var(--alt-ink-4)',
              border: 'none', borderRadius: 7, padding: '8px 20px',
              fontSize: 14, fontWeight: 700,
              cursor: query.length > 0 ? 'pointer' : 'not-allowed',
              flexShrink: 0, transition: 'background 0.15s, color 0.15s',
            }}
            onClick={() => { if (!showGate) setQuery(query + ' ') }}
          >
            Search
          </button>
        </div>

        {/* Email gate — inline below search */}
        <AnimatePresence>
          {showGate && <EmailGate key="email-gate" query={query} />}
        </AnimatePresence>
      </div>

      {/* Suggestion chips */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
        marginTop: 20,
      }}>
        {CHIPS.map(chip => (
          <button
            key={chip}
            onClick={() => setQuery(chip)}
            style={{
              background: 'var(--alt-paper-2)', border: '1px solid var(--alt-rule)',
              borderRadius: 999, padding: '6px 14px', fontSize: 13,
              color: 'var(--alt-ink-2)', cursor: 'pointer',
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Trust strip */}
      <div style={{ marginTop: 32, color: 'var(--alt-ink-4)', fontSize: 13 }}>
        Trusted by teams at{' '}
        {['Arlo Logistics', 'Ardent Insurance', 'Meridian Compliance', 'Volta Capital'].map((name, i, arr) => (
          <span key={name}>
            <span style={{
              background: 'var(--alt-paper-2)', border: '1px solid var(--alt-rule)',
              borderRadius: 6, padding: '2px 8px', fontSize: 12,
              color: 'var(--alt-ink-3)', fontWeight: 500,
            }}>{name}</span>
            {i < arr.length - 1 && ' '}
          </span>
        ))}
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section
      id="how"
      style={{
        background: 'var(--alt-paper-2)',
        padding: '72px 24px',
        textAlign: 'center',
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--alt-amber)', textTransform: 'uppercase', marginBottom: 12 }}>
        How it works
      </p>
      <h2 style={{ fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 800, color: 'var(--alt-ink)', letterSpacing: '-0.03em', marginBottom: 48 }}>
        Three steps from idea to pipeline
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 32, maxWidth: 900, margin: '0 auto', textAlign: 'left',
      }}>
        {HOW_STEPS.map(step => (
          <div key={step.num}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 999,
              background: 'var(--alt-amber-light)', border: '1px solid var(--alt-amber-border)',
              color: 'var(--alt-amber-dark)', fontWeight: 800, fontSize: 14, marginBottom: 16,
            }}>
              {step.num}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--alt-ink)', marginBottom: 8 }}>
              {step.title}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--alt-ink-3)', lineHeight: 1.6 }}>
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ResultsDemoSection({ query }: { query: string }) {
  const displayQuery = query.trim() || 'Fintech CEOs · Lagos'
  return (
    <section style={{ padding: '72px 24px', background: '#fff' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          marginBottom: 16, flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--alt-ink)', fontSize: 15 }}>Results</span>
          <span style={{
            background: 'var(--alt-paper-2)', border: '1px solid var(--alt-rule)',
            borderRadius: 6, padding: '2px 10px', fontSize: 13,
            color: 'var(--alt-ink-3)', fontStyle: 'italic',
          }}>{displayQuery}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button style={{
              background: '#fff', border: '1px solid var(--alt-rule)',
              borderRadius: 7, padding: '6px 14px', fontSize: 13,
              color: 'var(--alt-ink-2)', cursor: 'pointer', fontWeight: 500,
            }}>Export CSV</button>
            <button style={{
              background: '#fff', border: '1px solid var(--alt-rule)',
              borderRadius: 7, padding: '6px 14px', fontSize: 13,
              color: 'var(--alt-ink-2)', cursor: 'pointer', fontWeight: 500,
            }}>CRM sync</button>
          </div>
        </div>

        {/* Table */}
        <div style={{
          border: '1px solid var(--alt-rule)', borderRadius: 10,
          overflow: 'hidden', fontSize: 14,
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1.5fr 2fr 1fr 1fr',
            background: 'var(--alt-paper-2)', padding: '10px 16px',
            borderBottom: '1px solid var(--alt-rule)',
            color: 'var(--alt-ink-3)', fontWeight: 600, fontSize: 12,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <span>Company</span><span>Contact</span><span>Email</span>
            <span>Raised</span><span>Status</span>
          </div>

          {/* Visible rows */}
          {DEMO_ROWS.map((row, i) => (
            <div
              key={row.company}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.5fr 2fr 1fr 1fr',
                padding: '12px 16px',
                borderBottom: '1px solid var(--alt-rule)',
                background: i % 2 === 0 ? '#fff' : 'var(--alt-paper-2)',
                color: 'var(--alt-ink-2)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--alt-ink)' }}>{row.company}</span>
              <span>{row.contact}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{row.email}</span>
              <span>{row.raised}</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'var(--alt-green-bg)', color: 'var(--alt-green-text)',
                borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600,
              }}>{row.status}</span>
            </div>
          ))}

          {/* Blurred rows */}
          {[0, 1].map(i => (
            <div
              key={`blur-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.5fr 2fr 1fr 1fr',
                padding: '12px 16px',
                borderBottom: '1px solid var(--alt-rule)',
                background: i % 2 === 0 ? '#fff' : 'var(--alt-paper-2)',
                filter: 'blur(4px)',
                userSelect: 'none',
                pointerEvents: 'none',
                color: 'var(--alt-ink-2)',
              }}
            >
              <span style={{ fontWeight: 600, color: 'var(--alt-ink)' }}>Company Name</span>
              <span>Contact Person</span>
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>email@company.com</span>
              <span>$00M</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'var(--alt-green-bg)', color: 'var(--alt-green-text)',
                borderRadius: 999, padding: '2px 8px', fontSize: 12, fontWeight: 600,
              }}>Verified</span>
            </div>
          ))}

          {/* Gate row */}
          <div style={{
            padding: '20px 24px', background: 'var(--alt-paper-2)',
            borderTop: '1px solid var(--alt-rule)', textAlign: 'center',
          }}>
            <p style={{ marginBottom: 12, color: 'var(--alt-ink-2)', fontSize: 14 }}>
              9 more results available. Enter your email to unlock the full list.
            </p>
            <EmailGate query={displayQuery} />
          </div>
        </div>

        {/* Stats strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16, marginTop: 24, textAlign: 'center',
        }}>
          {[
            { num: '50k+', label: 'leads delivered' },
            { num: 'MX+SMTP', label: 'email verified' },
            { num: '8 min', label: 'avg delivery' },
            { num: '3×', label: 'sources cross-checked' },
          ].map(stat => (
            <div key={stat.label}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--alt-ink)' }}>{stat.num}</div>
              <div style={{ fontSize: 13, color: 'var(--alt-ink-3)' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  return (
    <section style={{ background: 'var(--alt-paper-2)', padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--alt-amber)', textTransform: 'uppercase', marginBottom: 12 }}>
        What our users say
      </p>
      <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, color: 'var(--alt-ink)', letterSpacing: '-0.03em', marginBottom: 40 }}>
        Teams across Africa trust Leadre
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 24, maxWidth: 900, margin: '0 auto', textAlign: 'left',
      }}>
        {TESTIMONIALS.map(t => (
          <div key={t.name} style={{
            background: '#fff', border: '1px solid var(--alt-rule)',
            borderRadius: 12, padding: '24px', display: 'flex',
            flexDirection: 'column', gap: 16,
          }}>
            {/* Stars */}
            <div style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} style={{ color: 'var(--alt-amber)', fontSize: 16 }} aria-hidden={true}>★</span>
              ))}
            </div>
            <p style={{ fontSize: 14, color: 'var(--alt-ink-2)', lineHeight: 1.65, flex: 1 }}>
              &ldquo;{t.quote}&rdquo;
            </p>
            <hr style={{ border: 'none', borderTop: '1px solid var(--alt-rule)', margin: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--alt-amber-light)', border: '1px solid var(--alt-amber-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, color: 'var(--alt-amber-dark)',
                flexShrink: 0,
              }}>
                {t.initial}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--alt-ink)' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--alt-ink-3)' }}>{t.role} · {t.city}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinalCTASection({
  query,
  setQuery,
  showGate,
}: {
  query: string
  setQuery: (v: string) => void
  showGate: boolean
}) {
  return (
    <section
      style={{
        background: 'var(--alt-amber-light)',
        borderTop: '1px solid var(--alt-amber-border)',
        padding: '80px 24px',
        textAlign: 'center',
      }}
    >
      <h2 style={{
        fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800,
        letterSpacing: '-0.04em', color: 'var(--alt-ink)',
        lineHeight: 1.15, maxWidth: 600, margin: '0 auto 12px',
      }}>
        Start finding your next customer today.
      </h2>
      <p style={{
        fontSize: 16, color: 'var(--alt-amber-dark)', maxWidth: 380,
        margin: '0 auto 32px', lineHeight: 1.5,
      }}>
        Free to start. No credit card. No sales call.
      </p>

      {/* Search bar — same treatment as hero */}
      <div style={{ maxWidth: 580, margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', border: '2px solid var(--alt-amber-border)',
          borderRadius: 10, padding: '10px 10px 10px 16px',
          boxShadow: query.length > 0 ? '0 0 0 4px #f59e0b18' : 'none',
          transition: 'box-shadow 0.2s',
        }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ color: 'var(--alt-ink-4)', flexShrink: 0 }}>
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Describe who you're looking for…"
            aria-label="Search for leads"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--alt-ink)', background: 'transparent',
            }}
          />
          <button
            disabled={query.length === 0}
            style={{
              background: query.length > 0 ? 'var(--alt-amber)' : 'var(--alt-rule)',
              color: query.length > 0 ? '#fff' : 'var(--alt-ink-4)',
              border: 'none', borderRadius: 7, padding: '8px 20px',
              fontSize: 14, fontWeight: 700,
              cursor: query.length > 0 ? 'pointer' : 'not-allowed',
              flexShrink: 0, transition: 'background 0.15s, color 0.15s',
            }}
            onClick={() => { if (!showGate) setQuery(query + ' ') }}
          >
            Search
          </button>
        </div>
        <AnimatePresence>
          {showGate && <EmailGate key="final-email-gate" query={query} />}
        </AnimatePresence>
      </div>
    </section>
  )
}

function PricingSection() {
  return (
    <section id="pricing" style={{ background: '#fff', padding: '72px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--alt-amber)', textTransform: 'uppercase', marginBottom: 12 }}>
        Pricing
      </p>
      <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, color: 'var(--alt-ink)', letterSpacing: '-0.03em', marginBottom: 40 }}>
        Simple, honest pricing
      </h2>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 24, maxWidth: 900, margin: '0 auto', textAlign: 'left',
        alignItems: 'stretch',
      }}>
        {PRICING_TIERS.map(tier => (
          <div key={tier.name} style={{
            background: tier.highlighted ? 'var(--alt-ink)' : '#fff',
            border: tier.highlighted ? 'none' : '1px solid var(--alt-rule)',
            borderRadius: 14, padding: '28px',
            display: 'flex', flexDirection: 'column', gap: 0,
            position: 'relative',
          }}>
            {tier.highlighted && (
              <div style={{
                position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                background: 'var(--alt-amber)', color: '#fff',
                borderRadius: 999, padding: '4px 14px', fontSize: 12, fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                Most popular
              </div>
            )}
            <div style={{ marginBottom: 4, fontSize: 13, fontWeight: 700, color: 'var(--alt-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {tier.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: tier.highlighted ? '#fff' : 'var(--alt-ink)' }}>{tier.price}</span>
              <span style={{ fontSize: 14, color: tier.highlighted ? 'var(--alt-ink-4)' : 'var(--alt-ink-3)' }}>{tier.period}</span>
            </div>
            <p style={{ fontSize: 13, color: tier.highlighted ? 'var(--alt-ink-4)' : 'var(--alt-ink-3)', marginBottom: 20 }}>{tier.tagline}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tier.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: tier.highlighted ? 'var(--alt-rule)' : 'var(--alt-ink-2)' }}>
                  <span style={{ color: 'var(--alt-amber)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={tier.ctaHref}
              aria-label={`${tier.cta} — ${tier.name} plan`}
              style={{
                display: 'block', textAlign: 'center',
                background: tier.highlighted ? 'var(--alt-amber)' : 'var(--alt-ink)',
                color: '#fff',
                borderRadius: 8, padding: '10px 20px',
                fontSize: 14, fontWeight: 700,
                textDecoration: 'none', marginTop: 'auto',
              }}
            >
              {tier.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  )
}
