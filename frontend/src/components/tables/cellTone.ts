/**
 * Cell tone classifier — maps a cell's value + its column context to a
 * visual tone. Used by the grid's EditableCell to color-code enrichment
 * results at a glance.
 *
 * Design: a small set of known column keys get specific classifiers
 * (e.g. `email_status` knows about ZeroBounce's value space), while
 * general value types get generic rules (booleans, yes/no). Unknown
 * columns return 'neutral' — no color. Fail-quiet is the right default;
 * we shouldn't paint a cell based on coincidental string match.
 */

export type CellTone = 'positive' | 'negative' | 'warning' | 'neutral';

interface ClassifyContext {
  columnKey: string;
  value: unknown;
}

export function classifyCell({ columnKey, value }: ClassifyContext): CellTone {
  if (value === null || value === undefined || value === '') return 'neutral';

  // ── Known column-key classifiers ──────────────────────────────
  if (KNOWN_EMAIL_STATUS_KEYS.has(columnKey) || /email_status|verification_status/i.test(columnKey)) {
    return classifyEmailStatus(value);
  }

  if (/^(hasEmail|has_email|hasVerifiedEmail|has_verified_email|verified)$/i.test(columnKey)) {
    return classifyBoolean(value);
  }

  // rank / score columns — higher is better
  if (/score|rank/i.test(columnKey) && typeof value === 'number') {
    if (value >= 80) return 'positive';
    if (value >= 50) return 'neutral';
    if (value > 0) return 'warning';
    return 'neutral';
  }

  // ── Generic value-shape classifiers ──────────────────────────
  if (typeof value === 'boolean') return classifyBoolean(value);

  // Common "yes/no/valid/invalid" string idioms
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (POSITIVE_WORDS.has(v)) return 'positive';
    if (NEGATIVE_WORDS.has(v)) return 'negative';
    if (WARNING_WORDS.has(v)) return 'warning';
  }

  return 'neutral';
}

// ── ZeroBounce email-status value space ──────────────────────────
//
// See zerobounce-verify.ts — `.status` can be: valid | invalid |
// catch-all | unknown | spamtrap | abuse | do_not_mail.
const KNOWN_EMAIL_STATUS_KEYS = new Set(['email_status']);

function classifyEmailStatus(value: unknown): CellTone {
  if (typeof value !== 'string') return 'neutral';
  const v = value.trim().toLowerCase();
  if (v === 'valid') return 'positive';
  if (v === 'invalid' || v === 'spamtrap' || v === 'abuse' || v === 'do_not_mail') return 'negative';
  if (v === 'catch-all' || v === 'catch_all' || v === 'catchall' || v === 'unknown') return 'warning';
  return 'neutral';
}

// ── Generic boolean classifier ──────────────────────────────────

function classifyBoolean(value: unknown): CellTone {
  if (value === true || value === 'true' || value === 'yes' || value === 1 || value === '1') {
    return 'positive';
  }
  if (value === false || value === 'false' || value === 'no' || value === 0 || value === '0') {
    return 'neutral'; // "no" isn't bad, it's just absent — don't paint red
  }
  return 'neutral';
}

// ── Generic keyword tables ──────────────────────────────────────
//
// Deliberately narrow. Broadening these produces false positives
// (e.g. "stale" isn't always negative). We paint only on tokens that
// are unambiguously valence-bearing in a B2B data context.

const POSITIVE_WORDS = new Set([
  'valid', 'verified', 'deliverable', 'active', 'connected', 'success',
  'complete', 'completed', 'passed', 'pass',
]);

const NEGATIVE_WORDS = new Set([
  'invalid', 'undeliverable', 'bounced', 'bounce', 'failed', 'failure',
  'error', 'spamtrap', 'spam_trap', 'spam-trap', 'abuse', 'do_not_mail',
  'disposable', 'unsubscribed',
]);

const WARNING_WORDS = new Set([
  'catch-all', 'catch_all', 'catchall', 'unknown', 'pending', 'paused',
  'rate_limited', 'rate-limited', 'role_based', 'role-based', 'greylisted',
]);

// ── Tailwind class helpers — match the editorial shell's palette ────

/**
 * Returns Tailwind class strings for the given tone. Each tone shares
 * the same text/bg pattern: light tint behind text, solid text.
 * Neutral returns empty — no styling applied, inherits default.
 */
export function toneClasses(tone: CellTone): {
  text: string;
  badge: string;
} {
  switch (tone) {
    case 'positive':
      return {
        text: 'text-[color:var(--ember)]',
        badge: 'bg-[color:var(--ember)]/10 text-[color:var(--ember)] border-[color:var(--ember)]/30',
      };
    case 'negative':
      return {
        text: 'text-[color:var(--warn)]',
        badge: 'bg-[color:var(--warn)]/10 text-[color:var(--warn)] border-[color:var(--warn)]/30',
      };
    case 'warning':
      // Amber-ish — using --warn but at lower intensity (text stays ink).
      return {
        text: 'text-[color:var(--ink)]',
        badge: 'bg-[color:var(--warn)]/5 text-[color:var(--ink-2)] border-[color:var(--warn)]/25',
      };
    case 'neutral':
    default:
      return {
        text: 'text-[color:var(--ink)]',
        badge: '',
      };
  }
}
