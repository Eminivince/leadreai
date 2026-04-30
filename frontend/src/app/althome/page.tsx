'use client'

import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { CSSProperties } from 'react'
import AltNav from '@/components/marketing/AltNav'
import AltFooter from '@/components/marketing/AltFooter'
import EmailGate from '@/components/marketing/EmailGate'
import { altTokens } from '@/components/marketing/alt-tokens'

const CHIPS = [
  'Fintech CEOs · Lagos',
  'Law firms · Nairobi',
  'Series B startups · Accra',
  'FMCG distributors · Kano',
  'Insurtech CTOs · Nigeria',
]

export default function AlthomePage() {
  const [query, setQuery] = useState('')
  const showGate = query.length > 3

  return (
    <main style={altTokens as CSSProperties}>
      <AltNav />
      <HeroSection query={query} setQuery={setQuery} showGate={showGate} />
      {/* later sections */}
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
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 15,
              color: 'var(--alt-ink)', background: 'transparent',
            }}
          />
          <button
            style={{
              background: 'var(--alt-amber)', color: '#fff',
              border: 'none', borderRadius: 7, padding: '8px 20px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            }}
            onClick={() => { if (!showGate) setQuery(query + ' ') }}
          >
            Search
          </button>
        </div>

        {/* Email gate — inline below search */}
        <AnimatePresence>
          {showGate && <EmailGate query={query} />}
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
