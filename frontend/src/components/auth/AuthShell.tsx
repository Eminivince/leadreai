'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────
 * AuthShell — sign in / sign up
 * ─────────────────────────────────────────────────────────────────
 * Centered card on warm-cream paper. White card with hairline rule,
 * Instrument Serif heading, ink/paper primary button, single ember
 * accent. Mobile collapses to the same single column.
 * ───────────────────────────────────────────────────────────────── */

/* ── Style constants (kept local so the file stays self-contained) ── */
const INPUT_CLASS =
 'w-full bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] focus:border-[color:var(--ink)] focus:outline-none transition-colors';

const INPUT_CLASS_ERROR =
 'w-full bg-white border border-[color:var(--warn)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)] focus:outline-none transition-colors';

const PRIMARY_BTN =
 'w-full bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

const OUTLINE_BTN =
 'w-full inline-flex items-center justify-center gap-3 border border-[color:var(--rule)] bg-transparent text-[color:var(--ink-2)] font-sans font-medium text-[13px] px-5 py-2.5 rounded-lg hover:border-[color:var(--ink)] hover:text-[color:var(--ink)] transition-colors';

const LABEL_CLASS = 'font-sans font-medium text-[12.5px] text-[color:var(--ink-2)]';

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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ── Wordmark logo ──────────────────────────────────────────── */
function Wordmark() {
 return (
  <Link href="/" className="inline-flex items-baseline gap-0">
   <span className="font-sans font-bold text-[17px] text-[color:var(--ink)] tracking-[-0.02em]">
    Leadre
   </span>
   <span className="font-sans font-bold text-[17px] text-[color:var(--ember)]">.</span>
   <span className="font-sans font-bold text-[17px] text-[color:var(--ink)] tracking-[-0.02em]">
    AI
   </span>
  </Link>
 );
}

function GoogleButton({ isSignup }: { isSignup: boolean }) {
 const href = `${API_BASE}/api/v1/auth/google?returnTo=${encodeURIComponent('/dashboard')}`;
 return (
  <a href={href} className={OUTLINE_BTN}>
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
    <span className="font-semibold text-[color:var(--ink)]">Google</span>
   </span>
  </a>
 );
}

/* ── Magic-link action ────────────────────────────────────── */
function MagicLinkAction({ prefillEmail }: { prefillEmail: string }) {
 const [stage, setStage] = useState<'link' | 'form' | 'sent' | 'error'>('link');
 const [email, setEmail] = useState('');
 const [sending, setSending] = useState(false);
 const [devUrl, setDevUrl] = useState<string | null>(null);
 const [message, setMessage] = useState<string | null>(null);

 useEffect(() => {
  if (stage === 'link' && prefillEmail && prefillEmail !== email) {
   setEmail(prefillEmail);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [prefillEmail, stage]);

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
   <div className="w-full">
    <span className="font-sans font-semibold text-[12.5px] text-[color:var(--ember)]">
     Check your inbox
    </span>
    <p className="mt-1 font-sans text-[13px] text-[color:var(--ink-2)] leading-[1.5]">
     A one-time sign-in link is on its way to <b className="text-[color:var(--ink)]">{email}</b>. Valid for 15 minutes.
    </p>
    {devUrl && (
     <a
      href={devUrl}
      className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] tracking-[0.08em] text-[color:var(--ember)] hover:text-[color:var(--ember-2)]"
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
     className="mt-2 block font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] underline underline-offset-[4px]"
    >
     Use a different email
    </button>
   </div>
  );
 }

 if (stage === 'error') {
  return (
   <div className="w-full">
    <span className="font-sans font-semibold text-[12.5px] text-[color:var(--warn)]">
     Couldn&rsquo;t send
    </span>
    <p className="mt-1 font-sans text-[13px] text-[color:var(--ink-2)] leading-[1.5]">
     {message ?? 'Please try again.'}
    </p>
    <button
     type="button"
     onClick={() => setStage('form')}
     className="mt-2 font-sans text-[12.5px] text-[color:var(--ink)] underline underline-offset-[4px]"
    >
     Try again
    </button>
   </div>
  );
 }

 if (stage === 'form') {
  return (
   <div className="flex items-center gap-2 w-full">
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
     className={INPUT_CLASS + ' flex-1 py-1.5'}
    />
    <button
     type="button"
     onClick={() => void send()}
     disabled={sending || !email.trim()}
     className="font-sans text-[12.5px] font-semibold text-[color:var(--ember)] hover:text-[color:var(--ember-2)] disabled:opacity-60 shrink-0"
    >
     {sending ? 'Sending…' : 'Send link'}
    </button>
    <button
     type="button"
     onClick={() => setStage('link')}
     className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] shrink-0"
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
   className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] underline underline-offset-[4px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
  >
   Email me a magic link
  </button>
 );
}

/* ── SSO discovery action ─────────────────────────────────── */
function SsoAction({ prefillEmail }: { prefillEmail: string }) {
 const [stage, setStage] = useState<'link' | 'form' | 'redirecting' | 'error'>('link');
 const [email, setEmail] = useState('');
 const [working, setWorking] = useState(false);
 const [message, setMessage] = useState<string | null>(null);

 useEffect(() => {
  if (stage === 'link' && prefillEmail && prefillEmail !== email) {
   setEmail(prefillEmail);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [prefillEmail, stage]);

 async function discover() {
  if (!email.trim() || working) return;
  setWorking(true);
  setMessage(null);
  try {
   const url = `${API_BASE}/api/v1/auth/saml/discover?email=${encodeURIComponent(email.trim())}`;
   const res = await fetch(url, { credentials: 'include' });
   if (res.status === 404) {
    setMessage('No SSO is configured for this email. Try password or Google sign-in.');
    setStage('error');
    return;
   }
   if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
     | { error?: { message?: string } }
     | null;
    throw new Error(body?.error?.message ?? 'Could not start SSO.');
   }
   const json = (await res.json()) as { data?: { loginUrl?: string } };
   const loginUrl = json.data?.loginUrl;
   if (!loginUrl) throw new Error('Discovery returned no login URL.');
   setStage('redirecting');
   window.location.href = `${API_BASE}${loginUrl}`;
  } catch (err) {
   setMessage(err instanceof Error ? err.message : 'Could not start SSO.');
   setStage('error');
  } finally {
   setWorking(false);
  }
 }

 if (stage === 'redirecting') {
  return (
   <span className="font-sans text-[12.5px] text-[color:var(--ink-3)]">
    Redirecting to your IdP&hellip;
   </span>
  );
 }

 if (stage === 'error') {
  return (
   <div className="w-full text-right">
    <p className="font-sans text-[12.5px] text-[color:var(--warn)] leading-[1.5]">
     {message ?? 'Could not start SSO.'}
    </p>
    <button
     type="button"
     onClick={() => setStage('form')}
     className="mt-1 font-sans text-[12.5px] text-[color:var(--ink)] underline underline-offset-[4px]"
    >
     Try a different email
    </button>
   </div>
  );
 }

 if (stage === 'form') {
  return (
   <div className="flex items-center gap-2 w-full justify-end">
    <input
     type="email"
     value={email}
     onChange={(e) => setEmail(e.target.value)}
     onKeyDown={(e) => {
      if (e.key === 'Enter') {
       e.preventDefault();
       void discover();
      }
     }}
     placeholder="you@company.com"
     autoFocus
     className={INPUT_CLASS + ' flex-1 py-1.5'}
    />
    <button
     type="button"
     onClick={() => void discover()}
     disabled={working || !email.trim()}
     className="font-sans text-[12.5px] font-semibold text-[color:var(--ember)] hover:text-[color:var(--ember-2)] disabled:opacity-60 shrink-0"
    >
     {working ? 'Checking…' : 'Continue'}
    </button>
    <button
     type="button"
     onClick={() => setStage('link')}
     className="font-sans text-[12.5px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] shrink-0"
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
   className="font-sans text-[12.5px] text-[color:var(--ink-4)] hover:text-[color:var(--ink-2)] transition-colors"
  >
   SSO / SAML →
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
      className={`h-[3px] rounded-full transition-colors ${
       i < s
        ? s >= 4
         ? 'bg-[color:var(--success)]'
         : 'bg-[color:var(--ember)]'
        : 'bg-[color:var(--rule)]'
      }`}
     />
    ))}
   </div>
   <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[color:var(--ink-3)] min-w-[42px] text-right">
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
   <label htmlFor={id} className="flex items-baseline justify-between mb-1.5">
    <span className={LABEL_CLASS}>{label}</span>
    {hint}
   </label>
   <div className="relative">
    <input
     id={id}
     type={type}
     value={value}
     onChange={onChange}
     placeholder={placeholder}
     autoComplete={autoComplete}
     className={(error ? INPUT_CLASS_ERROR : INPUT_CLASS) + ' pr-10'}
    />
    {trailing && (
     <div className="absolute right-0 top-1/2 -translate-y-1/2 pr-2">{trailing}</div>
    )}
   </div>
   {error && (
    <div className="font-sans text-[12.5px] text-[color:var(--warn)] mt-1.5 flex items-center gap-1.5">
     <span className="w-1 h-1 rounded-full bg-[color:var(--warn)] shrink-0" />
     {error}
    </div>
   )}
  </div>
 );
}

/* ── Tab toggle ─────────────────────────────────────────────── */
function TabToggle({ mode }: { mode: 'signin' | 'signup' }) {
 const isSignup = mode === 'signup';
 return (
  <div className="inline-flex items-center rounded-lg border border-[color:var(--rule)] bg-[color:var(--paper-2)] p-1 gap-1">
   <Link
    href="/login"
    className={`px-4 py-1.5 rounded-md font-sans text-[12.5px] font-medium transition-colors ${
     !isSignup
      ? 'bg-white text-[color:var(--ink)] border border-[color:var(--rule)]'
      : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
    }`}
   >
    Sign in
   </Link>
   <Link
    href="/register"
    className={`px-4 py-1.5 rounded-md font-sans text-[12.5px] font-medium transition-colors ${
     isSignup
      ? 'bg-white text-[color:var(--ink)] border border-[color:var(--rule)]'
      : 'text-[color:var(--ink-3)] hover:text-[color:var(--ink)]'
    }`}
   >
    Sign up
   </Link>
  </div>
 );
}

/* ── Form props ─────────────────────────────────────────────── */
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
 const [accept, setAccept] = useState(false);

 return (
  <main className="min-h-screen bg-[color:var(--paper)] flex items-center justify-center px-4 py-12">
   <div className="w-full max-w-md bg-white border border-[color:var(--rule)] rounded-2xl p-8">
    {/* Logo */}
    <div className="flex justify-center mb-7">
     <Wordmark />
    </div>

    {/* Tab toggle */}
    <div className="flex justify-center mb-6">
     <TabToggle mode={mode} />
    </div>

    {/* Heading */}
    <div className="mb-6 text-center">
     <h1 className="font-display font-normal text-[28px] leading-[1.15] tracking-[-0.01em] text-[color:var(--ink)]">
      {isSignup ? 'Create your account' : 'Welcome back'}
     </h1>
     <p className="mt-2 font-sans text-[13px] text-[color:var(--ink-3)]">
      {isSignup ? (
       <>
        No credit card. Three free searches to start.{' '}
        <Link
         href="/login"
         className="font-sans font-medium text-[color:var(--ember)] hover:text-[color:var(--ember-2)]"
        >
         Sign in →
        </Link>
       </>
      ) : (
       <>
        New here?{' '}
        <Link
         href="/register"
         className="font-sans font-medium text-[color:var(--ember)] hover:text-[color:var(--ember-2)]"
        >
         Create an account →
        </Link>
       </>
      )}
     </p>
    </div>

    {/* Error banner */}
    {submitError && (
     <div
      role="alert"
      aria-live="assertive"
      className="mb-5 flex items-start gap-2 border border-[color:var(--warn)]/40 bg-[color:var(--warn)]/[0.06] rounded-lg px-3.5 py-3 font-sans text-[13px] text-[color:var(--warn)]"
     >
      <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-[color:var(--warn)] shrink-0" />
      {submitError}
     </div>
    )}

    {/* Form */}
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
     {isSignup && (
      <div className="grid grid-cols-2 gap-3">
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
          className="font-sans font-medium text-[12px] text-[color:var(--ember)] hover:text-[color:var(--ember-2)] transition-colors"
         >
          Forgot password?
         </a>
        ) : undefined
       }
       trailing={
        <button
         type="button"
         onClick={() => setShowPw((v) => !v)}
         className="p-1.5 text-[color:var(--ink-4)] hover:text-[color:var(--ink-2)] transition-colors"
         title={showPw ? 'Hide password' : 'Show password'}
         aria-label={showPw ? 'Hide password' : 'Show password'}
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
         className={`block w-4 h-4 rounded border transition-colors ${
          accept
           ? 'bg-[color:var(--ink)] border-[color:var(--ink)]'
           : 'bg-white border-[color:var(--rule)]'
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
           stroke="var(--paper)"
           strokeWidth="2"
           strokeLinecap="round"
           strokeLinejoin="round"
          />
         </svg>
        )}
       </span>
       <span className="font-sans text-[12.5px] leading-[1.5] text-[color:var(--ink-2)]">
        I agree to LeadreAI&rsquo;s{' '}
        <a
         href="#"
         className="text-[color:var(--ink)] underline underline-offset-[3px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
        >
         Terms
        </a>{' '}
        and{' '}
        <a
         href="#"
         className="text-[color:var(--ink)] underline underline-offset-[3px] decoration-[color:var(--rule)] hover:decoration-[color:var(--ink)]"
        >
         Privacy Policy
        </a>
        .
       </span>
      </label>
     )}

     <div className="pt-1">
      <button
       type="submit"
       disabled={isSubmitting || (isSignup && !accept)}
       className={PRIMARY_BTN}
      >
       {isSubmitting ? (
        <>
         <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
        </>
       ) : isSignup ? (
        'Create account'
       ) : (
        'Sign in'
       )}
      </button>
     </div>

     {/* Divider */}
     <div className="relative flex items-center my-1">
      <span className="flex-1 h-px bg-[color:var(--rule)]" />
      <span className="px-3 font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]">
       or
      </span>
      <span className="flex-1 h-px bg-[color:var(--rule)]" />
     </div>

     {/* Social */}
     <GoogleButton isSignup={isSignup} />

     {/* Secondary paths */}
     <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <MagicLinkAction prefillEmail={email} />
      <SsoAction prefillEmail={email} />
     </div>
    </form>
   </div>

   {/* Footer */}
   <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--ink-4)]">
    <span>© 2026 LeadreAI</span>
    <span aria-hidden>·</span>
    <a href="#" className="hover:text-[color:var(--ink-2)] transition-colors">
     Privacy
    </a>
    <span aria-hidden>·</span>
    <a href="#" className="hover:text-[color:var(--ink-2)] transition-colors">
     Terms
    </a>
    <span aria-hidden>·</span>
    <a href="#" className="hover:text-[color:var(--ink-2)] transition-colors">
     Status
    </a>
   </div>
  </main>
 );
}
