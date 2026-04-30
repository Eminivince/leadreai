'use client';

import { useState } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────
 * AuthShell — sign in / sign up
 * ─────────────────────────────────────────────────────────────────
 * Modern SaaS amber design: clean split-panel layout, amber accent
 * via var(--forest), standard font-sans / font-mono, no editorial
 * broadsheet copy or custom font variables.
 *
 * Layout on desktop: 5/7 split — left brand panel (light amber bg),
 * right form on the paper bg. Mobile stacks: amber logo → form.
 *
 * The auth routes live under a Next.js route group `(auth)`, so the
 * URLs are /login and /register (not /auth/*).
 * ───────────────────────────────────────────────────────────────── */

/* ── Glyphs ─────────────────────────────────────────────────── */
const Svg = ({
  className = 'w-4 h-4',
  sw = 1.5,
  children,
}: {
  className?: string;
  sw?: number;
  children: React.ReactNode;
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

const EyeIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);
const EyeOffIcon = (p: { className?: string }) => (
  <Svg {...p}>
    <path d="M10.7 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3 3.8" />
    <path d="M6.1 6.1C3.3 8 2 12 2 12s3.5 7 10 7a10.8 10.8 0 0 0 5.9-1.7" />
    <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
    <path d="m3 3 18 18" />
  </Svg>
);
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

function ArrowWest({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M14 8H2M6 4 2 8l4 4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function GoogleButton({ isSignup }: { isSignup: boolean }) {
  // Full redirect — the backend handles the entire OAuth dance and
  // lands the user on /auth/oauth/complete with a refresh cookie set.
  const href = `${API_BASE}/api/v1/auth/google?returnTo=${encodeURIComponent('/dashboard')}`;
  return (
    <a
      href={href}
      className="group w-full inline-flex items-center justify-center gap-3 h-[46px] border border-[color:var(--rule)] bg-[color:var(--paper-3)] hover:border-[color:var(--ink)] hover:bg-[color:var(--paper-2)] transition-colors rounded-full font-sans text-[13.5px] font-medium text-[color:var(--ink)]"
    >
      <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
        <path
          d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.23c1.89-1.74 2.983-4.305 2.983-7.35Z"
          fill="#4285F4"
        />
        <path
          d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.23-2.51c-.896.6-2.042.955-3.388.955-2.605 0-4.811-1.76-5.598-4.125H3.064v2.59A10 10 0 0 0 12 22Z"
          fill="#34A853"
        />
        <path
          d="M6.402 13.898A6 6 0 0 1 6.09 12c0-.659.114-1.3.313-1.898V7.512H3.064A10 10 0 0 0 2 12a10 10 0 0 0 1.064 4.488l3.338-2.59Z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.866-2.866C16.96 2.99 14.695 2 12 2 8.09 2 4.71 4.24 3.064 7.512l3.338 2.59C7.19 7.737 9.395 5.977 12 5.977Z"
          fill="#EA4335"
        />
      </svg>
      <span>
        {isSignup ? 'Sign up with ' : 'Continue with '}
        <span className="font-semibold">Google</span>
      </span>
    </a>
  );
}

/* ── Magic-link action ──────────────────────────────────────
 * Starts inline as a plain underline link ("Email me a magic link").
 * Clicking it reveals an inline email input + send button. On
 * successful request we swap to a "Check your inbox" confirmation.
 * In dev mode the API returns the link itself — we render it as a
 * one-click button so local testing doesn't need Resend configured.
 * ────────────────────────────────────────────────────────────── */
function MagicLinkAction({ prefillEmail }: { prefillEmail: string }) {
  const [stage, setStage] = useState<'link' | 'form' | 'sent' | 'error'>('link');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Keep the inline input in sync with the main form's email — if the
  // user already typed their address above, don't make them retype it.
  if (stage === 'link' && prefillEmail && prefillEmail !== email) {
    // deferred set — avoids render-time writes
    setTimeout(() => setEmail(prefillEmail), 0);
  }

  async function send() {
    if (!email.trim() || sending) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/magic-link/request`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Could not send the link.');
      }
      const json = (await res.json()) as {
        data?: { status?: string; devUrl?: string };
      };
      setDevUrl(json.data?.devUrl ?? null);
      setStage('sent');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send the link.');
      setStage('error');
    } finally {
      setSending(false);
    }
  }

  if (stage === 'sent') {
    return (
      <div className="flex-1 min-w-[240px]">
        <span className="text-[12px] font-semibold text-[color:var(--forest)]">
          Check your inbox
        </span>
        <p className="mt-1 text-[12.5px] text-[color:var(--ink-2)] leading-[1.5]">
          A one-time sign-in link is on its way to <b>{email}</b>. Valid for 15 minutes.
        </p>
        {devUrl && (
          <a
            href={devUrl}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-[color:var(--rust)] hover:text-[color:var(--ink)]"
          >
            Dev — open link now →
          </a>
        )}
        <button
          type="button"
          onClick={() => {
            setStage('link');
            setDevUrl(null);
          }}
          className="mt-2 block text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)]"
        >
          Use a different email
        </button>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="flex-1 min-w-[240px]">
        <span className="text-[12px] font-semibold text-[color:var(--warn)]">
          Couldn&rsquo;t send
        </span>
        <p className="mt-1 text-[12.5px] text-[color:var(--ink-2)] leading-[1.5]">
          {message ?? 'Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => setStage('form')}
          className="mt-2 text-[12px] text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)]"
        >
          Try again
        </button>
      </div>
    );
  }

  if (stage === 'form') {
    // NOTE: this control lives *inside* the outer auth <form>, so it
    // can't itself be a <form>. A div with an onKeyDown Enter handler
    // gives us the same UX without nesting forms.
    return (
      <div className="flex items-center gap-2 flex-1 min-w-[280px]">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="you@work.com"
          autoFocus
          className="flex-1 bg-transparent border-b border-[color:var(--rule)] focus:border-[color:var(--ink)] outline-none py-1.5 text-[13px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !email.trim()}
          className="text-[12px] font-semibold text-[color:var(--forest)] hover:text-[color:var(--ink)] disabled:opacity-60 shrink-0"
        >
          {sending ? 'Sending…' : 'Send link'}
        </button>
        <button
          type="button"
          onClick={() => setStage('link')}
          className="text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] shrink-0"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setStage('form')}
      className="text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
    >
      Email me a magic link
    </button>
  );
}

/* ── Password strength ──────────────────────────────────────── */
function strengthOf(pw: string): number {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

function Strength({ pw }: { pw: string }) {
  const s = strengthOf(pw);
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 grid grid-cols-4 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-[2px] rounded-full transition-colors ${
              i < s ? 'bg-[color:var(--forest)]' : 'bg-[color:var(--rule)]/50'
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] text-[color:var(--ink-3)] min-w-[42px] text-right">
        {labels[s] || '—'}
      </span>
    </div>
  );
}

/* ── Input field ────────────────────────────────────────────── */
function Field({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  trailing,
  hint,
  error,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  trailing?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline justify-between mb-2">
        <span className="text-[12px] font-semibold text-[color:var(--ink-2)]">
          {label}
        </span>
        {hint}
      </label>
      <div
        className={`relative border-b transition-colors ${
          error
            ? 'border-[color:var(--warn)]'
            : 'border-[color:var(--rule)] focus-within:border-[color:var(--ink)]'
        }`}
      >
        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="block w-full bg-transparent py-2.5 pr-8 font-sans text-[15px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)] focus:outline-none"
        />
        {trailing && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
      {error && (
        <div className="text-[12px] text-[color:var(--warn)] mt-1.5">
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Left: brand panel ──────────────────────────────────────── */
function DeskPanel({ mode }: { mode: 'signin' | 'signup' }) {
  const isSignup = mode === 'signup';
  return (
    <aside className="hidden lg:flex flex-col justify-between bg-[color:var(--paper-2)] border-r border-[color:var(--rule)] p-12 xl:p-16">
      {/* Logo */}
      <Link href="/" className="flex items-baseline gap-px">
        <span className="font-extrabold text-[18px] tracking-tight text-[color:var(--ink)]">Leadre</span>
        <span className="font-extrabold text-[18px] text-[color:var(--forest)]">.</span>
        <span className="font-extrabold text-[18px] tracking-tight text-[color:var(--ink)]">AI</span>
      </Link>

      {/* Brand message */}
      <div className="flex flex-col gap-6">
        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-amber-800 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--forest)] shrink-0" aria-hidden />
          Built for Nigerian &amp; African markets
        </div>
        <h1 className="font-extrabold text-[42px] xl:text-[52px] tracking-[-0.04em] leading-[1.05] text-[color:var(--ink)]">
          {isSignup ? (
            <>Find leads.<br /><span className="text-[color:var(--forest)]">Close deals.</span></>
          ) : (
            <>Welcome<br /><span className="text-[color:var(--forest)]">back.</span></>
          )}
        </h1>
        <p className="text-[15px] text-[color:var(--ink-2)] leading-relaxed max-w-[360px]">
          {isSignup
            ? 'Describe who you want to reach. Get a verified lead list — with emails, phones, and sources — in minutes.'
            : 'Your searches, lead lists, and exports are waiting for you.'}
        </p>

        {/* Testimonial */}
        <div className="mt-2 border-l-2 border-[color:var(--forest)] pl-4">
          <p className="text-[14px] italic text-[color:var(--ink-2)] leading-relaxed">
            &ldquo;I used to spend a full day assembling a list of fifty companies in Lagos. LeadreAI returned them in eight minutes.&rdquo;
          </p>
          <div className="mt-3 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[color:var(--forest)] flex items-center justify-center text-white text-[11px] font-bold shrink-0">A</div>
            <div>
              <div className="text-[12px] font-semibold text-[color:var(--ink)]">Adaeze Okonkwo</div>
              <div className="text-[11px] text-[color:var(--ink-3)]">Head of Growth · Arlo Logistics, Lagos</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 text-[11px] text-[color:var(--ink-3)]">
        <span>© 2026 LeadreAI</span>
        <span aria-hidden>·</span>
        <a href="#" className="hover:text-[color:var(--ink)]">Privacy</a>
        <span aria-hidden>·</span>
        <a href="#" className="hover:text-[color:var(--ink)]">Terms</a>
      </div>
    </aside>
  );
}

/* ── Tab pill ───────────────────────────────────────────────── */
function TabToggle({ mode }: { mode: 'signin' | 'signup' }) {
  const isSignup = mode === 'signup';
  return (
    <div className="inline-flex items-center rounded-full border border-[color:var(--rule)] bg-[color:var(--paper)] p-1">
      <Link
        href="/login"
        className={`px-4 py-1.5 rounded-full text-[13px] transition-colors ${
          !isSignup
            ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
            : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
        }`}
      >
        Sign in
      </Link>
      <Link
        href="/register"
        className={`px-4 py-1.5 rounded-full text-[13px] transition-colors ${
          isSignup
            ? 'bg-[color:var(--ink)] text-[color:var(--paper)]'
            : 'text-[color:var(--ink-2)] hover:text-[color:var(--ink)]'
        }`}
      >
        Sign up
      </Link>
    </div>
  );
}

/* ── Form card ──────────────────────────────────────────────── */
interface AuthShellProps {
  mode: 'signin' | 'signup';
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => Promise<void> | void;
  isSubmitting?: boolean;
  submitError?: string | null;
  firstName?: string;
  onFirstNameChange?: (v: string) => void;
  lastName?: string;
  onLastNameChange?: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  errors?: Record<string, string | undefined>;
}

export function AuthShell({
  mode,
  onSubmit,
  isSubmitting = false,
  submitError,
  firstName = '',
  onFirstNameChange,
  lastName = '',
  onLastNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  errors = {},
}: AuthShellProps) {
  const isSignup = mode === 'signup';
  const [showPw, setShowPw] = useState(false);
  const [accept, setAccept] = useState(true);

  return (
    <main
      className="relative min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] selection:bg-[color:var(--forest)] selection:text-[color:var(--paper)]"
    >
      <DeskPanel mode={mode} />

      {/* Right: form */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-12 md:px-10 md:py-14 lg:px-20">
        {/* Back-to-site link, top-right */}
        <Link
          href="/"
          className="absolute top-6 right-6 md:top-8 md:right-10 inline-flex items-center gap-2 text-[12.5px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition"
        >
          <ArrowWest className="w-3 h-3" />
          Back to site
        </Link>

        <div className="w-full max-w-[460px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-baseline justify-between mb-10">
            <Link href="/" className="flex items-baseline gap-px">
              <span className="font-extrabold text-[18px] tracking-tight text-[color:var(--ink)]">Leadre</span>
              <span className="font-extrabold text-[18px] text-[color:var(--forest)]">.</span>
              <span className="font-extrabold text-[18px] tracking-tight text-[color:var(--ink)]">AI</span>
            </Link>
          </div>

          {/* Tab toggle */}
          <div className="mb-8 flex justify-start">
            <TabToggle mode={mode} />
          </div>

          {/* Heading block */}
          <div className="mb-8">
            <h2 className="font-extrabold text-[36px] md:text-[42px] leading-[1.05] tracking-[-0.03em] text-[color:var(--ink)]">
              {isSignup ? 'Create your account' : 'Sign in to LeadreAI'}
            </h2>
            <p className="mt-3 text-[14px] text-[color:var(--ink-3)]">
              {isSignup ? (
                <>No credit card. Three free searches to start.{' '}
                <Link href="/login" className="text-[color:var(--ink)] underline underline-offset-4">Sign in instead →</Link></>
              ) : (
                <>New here?{' '}
                <Link href="/register" className="text-[color:var(--ink)] underline underline-offset-4">Create an account →</Link></>
              )}
            </p>
          </div>

          {/* Error banner */}
          {submitError && (
            <div className="mb-6 border-l-2 border-[color:var(--warn)] bg-[color:var(--paper-3)] px-4 py-3 text-[13px] text-[color:var(--ink)]">
              {submitError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} className="flex flex-col gap-6">
            {isSignup && (
              <div className="grid grid-cols-2 gap-6">
                <Field
                  id="firstName"
                  label="First name"
                  value={firstName}
                  onChange={(e) => onFirstNameChange?.(e.target.value)}
                  placeholder="Amara"
                  autoComplete="given-name"
                  error={errors.firstName}
                />
                <Field
                  id="lastName"
                  label="Last name"
                  value={lastName}
                  onChange={(e) => onLastNameChange?.(e.target.value)}
                  placeholder="Okafor"
                  autoComplete="family-name"
                  error={errors.lastName}
                />
              </div>
            )}

            <Field
              id="email"
              label="Work email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="amara@company.com"
              autoComplete="email"
              error={errors.email}
            />

            <div>
              <Field
                id="password"
                label="Password"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                error={errors.password}
                hint={
                  !isSignup ? (
                    <a
                      href="#"
                      className="text-[12px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
                    >
                      Forgot?
                    </a>
                  ) : undefined
                }
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="p-1.5 text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition"
                    title={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? (
                      <EyeOffIcon className="w-4 h-4" />
                    ) : (
                      <EyeIcon className="w-4 h-4" />
                    )}
                  </button>
                }
              />
              {isSignup && password.length > 0 && <Strength pw={password} />}
            </div>

            {isSignup && (
              <label className="flex items-start gap-3 cursor-pointer select-none mt-1">
                <span className="relative mt-[2px] shrink-0">
                  <input
                    type="checkbox"
                    checked={accept}
                    onChange={(e) => setAccept(e.target.checked)}
                    className="peer sr-only"
                  />
                  <span
                    className={`block w-4 h-4 border transition-colors ${
                      accept
                        ? 'bg-[color:var(--ink)] border-[color:var(--ink)]'
                        : 'bg-transparent border-[color:var(--rule)]'
                    }`}
                  />
                  {accept && (
                    <svg
                      className="absolute top-0 left-0 w-4 h-4 p-[2px]"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="m3 8 3.5 3.5L13 5"
                        stroke="#F2EADD"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-[12.5px] leading-[1.5] text-[color:var(--ink-2)]">
                  I agree to LeadreAI&rsquo;s{' '}
                  <a
                    href="#"
                    className="text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
                  >
                    Terms
                  </a>{' '}
                  and{' '}
                  <a
                    href="#"
                    className="text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
                  >
                    Privacy Policy
                  </a>
                  . We will never sell your data.
                </span>
              </label>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || (isSignup && !accept)}
                className="group inline-flex items-center justify-between gap-3 w-full bg-[color:var(--forest)] text-white px-6 py-3.5 rounded-full hover:bg-[color:var(--ink)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="font-sans text-[14px] font-medium">
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                        <circle
                          cx="12"
                          cy="12"
                          r="9"
                          stroke="currentColor"
                          strokeOpacity="0.3"
                          strokeWidth="2"
                        />
                        <path
                          d="M21 12a9 9 0 0 1-9 9"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                      Working&hellip;
                    </span>
                  ) : isSignup ? (
                    'Create account'
                  ) : (
                    'Sign in'
                  )}
                </span>
                {!isSubmitting && (
                  <ArrowEast className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center my-1">
              <span className="flex-1 h-px bg-[color:var(--rule)]" />
              <span className="px-3 text-[11px] text-[color:var(--ink-3)]">or</span>
              <span className="flex-1 h-px bg-[color:var(--rule)]" />
            </div>

            {/* Social */}
            <GoogleButton isSignup={isSignup} />

            {/* Secondary paths */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
              <MagicLinkAction prefillEmail={email} />
              <a
                href="#"
                className="text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink-2)] inline-flex items-center gap-1.5"
              >
                SSO / SAML <ArrowEast className="w-2.5 h-2.5" />
              </a>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-4 text-[11px] text-[color:var(--ink-3)]">
          <span>© 2026 LeadreAI</span>
          <span aria-hidden>·</span>
          <a href="#" className="hover:text-[color:var(--ink)]">Privacy</a>
          <span aria-hidden>·</span>
          <a href="#" className="hover:text-[color:var(--ink)]">Terms</a>
          <span aria-hidden>·</span>
          <a href="#" className="hover:text-[color:var(--ink)]">Status</a>
        </div>
      </section>
    </main>
  );
}
