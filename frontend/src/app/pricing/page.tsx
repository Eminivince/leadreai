import AltNav from '@/components/marketing/AltNav'
import AltFooter from '@/components/marketing/AltFooter'

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

const FAQS = [
  {
    q: 'How accurate are the email addresses?',
    a: 'Where the source supports it, we run MX record validation and SMTP handshake checks. Each email is delivered with a confidence badge so you can see how it was sourced and how strongly it was checked.',
  },
  {
    q: 'How long does a search take?',
    a: 'Most searches complete in 8–15 minutes. Complex multi-country searches may take up to 25 minutes.',
  },
  {
    q: 'Can I try before I subscribe?',
    a: 'Yes — start free with 5 research credits, no credit card required. Each credit covers one search job.',
  },
  {
    q: 'Do you cover markets outside Nigeria?',
    a: 'Nigeria is our primary focus and where data density is highest. Other African markets are supported on a best-effort basis — quality varies by country.',
  },
]

export default function PricingPage() {
  return (
    <main className="alt-tokens bg-[color:var(--paper)] text-[color:var(--alt-ink)]">
      <AltNav />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(to bottom, #fffbeb 0%, #ffffff 55%)',
        padding: '72px 24px 56px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--alt-amber)', textTransform: 'uppercase', marginBottom: 12 }}>
          Pricing
        </p>
        <h1 style={{
          fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800,
          letterSpacing: '-0.04em', color: 'var(--alt-ink)',
          lineHeight: 1.1, maxWidth: 560, margin: '0 auto 16px',
        }}>
          Simple, honest pricing
        </h1>
        <p style={{ fontSize: 16, color: 'var(--alt-ink-3)', maxWidth: 420, margin: '0 auto' }}>
          Start free. Upgrade when you need more. No hidden fees.
        </p>
      </section>

      {/* Pricing grid */}
      <section style={{ background: '#fff', padding: '40px 24px 72px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 24, maxWidth: 900, margin: '0 auto', alignItems: 'stretch',
        }}>
          {PRICING_TIERS.map(tier => (
            <div key={tier.name} style={{
              background: tier.highlighted ? 'var(--alt-ink)' : '#fff',
              border: tier.highlighted ? 'none' : '1px solid var(--alt-rule)',
              borderRadius: 14, padding: '28px',
              display: 'flex', flexDirection: 'column',
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--alt-amber)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
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

      {/* FAQ */}
      <section style={{ background: 'var(--alt-paper-2)', padding: '64px 24px 80px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 style={{
            fontSize: 'clamp(24px, 2.5vw, 32px)', fontWeight: 800,
            letterSpacing: '-0.03em', color: 'var(--alt-ink)',
            marginBottom: 40, textAlign: 'center',
          }}>
            Frequently asked questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {FAQS.map(faq => (
              <div key={faq.q}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--alt-ink)', marginBottom: 8 }}>
                  {faq.q}
                </h3>
                <p style={{ fontSize: 14, color: 'var(--alt-ink-3)', lineHeight: 1.65 }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AltFooter />
    </main>
  )
}
