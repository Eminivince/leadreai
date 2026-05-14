'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────────
 * AuthShell — sign in / sign up
 * ─────────────────────────────────────────────────────────────────
 * B2B SaaS split-screen: dark left panel (60%) + white form right (40%).
 * Left: --ink (#111827) bg, large wordmark, amber bullet features,
 *    testimonial quote.
 * Right: white, clean card form with amber submit button.
 * Mobile: only the form (right side) is shown, single column.
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

const CheckIcon = () => (
 <svg
  viewBox="0 0 20 20"
  fill="none"
  className="w-4 h-4 shrink-0"
  aria-hidden
 >
  <circle cx="10" cy="10" r="10" fill="#f59e0b" />
  <path
   d="M6 10l2.5 2.5L14 7"
   stroke="#fff"
   strokeWidth="1.8"
   strokeLinecap="round"
   strokeLinejoin="round"
  />
 </svg>
);

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
 const href = `${API_BASE}/api/v1/auth/google?returnTo=${encodeURIComponent('/dashboard')}`;
 return (
  <a
   href={href}
   className="w-full inline-flex items-center justify-center gap-3 h-[46px] border border-[#e5e7eb] bg-[color:var(--paper)] hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-colors rounded-lg text-[14px] font-medium text-[#374151]"
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
   <div className="flex-1 min-w-[240px]">
    <span className="text-[12px] font-semibold text-[#f59e0b]">
     Check your inbox
    </span>
    <p className="mt-1 text-[12.5px] text-[#374151] leading-[1.5]">
     A one-time sign-in link is on its way to <b>{email}</b>. Valid for 15 minutes.
    </p>
    {devUrl && (
     <a
      href={devUrl}
      className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-[#92400e] hover:text-[#111827]"
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
     className="mt-2 block text-[12px] text-[#6b7280] hover:text-[#111827] underline underline-offset-[4px]"
    >
     Use a different email
    </button>
   </div>
  );
 }

 if (stage === 'error') {
  return (
   <div className="flex-1 min-w-[240px]">
    <span className="text-[12px] font-semibold text-[#dc2626]">
     Couldn&rsquo;t send
    </span>
    <p className="mt-1 text-[12.5px] text-[#374151] leading-[1.5]">
     {message ?? 'Please try again.'}
    </p>
    <button
     type="button"
     onClick={() => setStage('form')}
     className="mt-2 text-[12px] text-[#111827] underline underline-offset-[4px]"
    >
     Try again
    </button>
   </div>
  );
 }

 if (stage === 'form') {
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
     className="flex-1 bg-[color:var(--paper)] border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-[13px] text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/10 transition-all"
    />
    <button
     type="button"
     onClick={() => void send()}
     disabled={sending || !email.trim()}
     className="text-[12px] font-semibold text-[#f59e0b] hover:text-[#d97706] disabled:opacity-60 shrink-0"
    >
     {sending ? 'Sending…' : 'Send link'}
    </button>
    <button
     type="button"
     onClick={() => setStage('link')}
     className="text-[12px] text-[#6b7280] hover:text-[#111827] shrink-0"
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
   className="text-[13px] text-[#6b7280] hover:text-[#374151] underline underline-offset-[4px] decoration-[#e5e7eb] hover:decoration-[#9ca3af]"
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
 const barColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-amber-400', 'bg-green-500'];
 return (
  <div className="flex items-center gap-3 mt-2">
   <div className="flex-1 grid grid-cols-4 gap-1">
    {[0, 1, 2, 3].map((i) => (
     <span
      key={i}
      className={`h-[3px] rounded-full transition-colors ${
       i < s ? (barColors[s] ?? 'bg-[#f59e0b]') : 'bg-[#e5e7eb]'
      }`}
     />
    ))}
   </div>
   <span className="text-[11px] text-[#6b7280] min-w-[42px] text-right">
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
    <span className="text-[13px] font-medium text-[#374151]">
     {label}
    </span>
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
     className={`w-full bg-[color:var(--paper)] border rounded-lg px-4 py-2.5 text-[14px] text-[#111827] placeholder:text-[#9ca3af] outline-none transition-all pr-10 ${
      error
       ? 'border-[#dc2626] ring-2 ring-[#dc2626]/10'
       : 'border-[#e5e7eb] focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/10'
     }`}
    />
    {trailing && (
     <div className="absolute right-0 top-1/2 -translate-y-1/2 pr-2">{trailing}</div>
    )}
   </div>
   {error && (
    <div className="text-[12px] text-[#dc2626] mt-1.5 flex items-center gap-1">
     <span className="w-1 h-1 rounded-full bg-[#dc2626] shrink-0" />
     {error}
    </div>
   )}
  </div>
 );
}

/* ── Left: dark brand panel ─────────────────────────────────── */
const FEATURES = [
 'Verified leads with emails, phones & LinkedIn',
 'AI-powered outreach sequences that personalize at scale',
 'Built specifically for Nigerian & African markets',
];

function DeskPanel({ mode }: { mode: 'signin' | 'signup' }) {
 const isSignup = mode === 'signup';
 return (
  <aside className="hidden lg:flex flex-col justify-between bg-[#111827] px-12 xl:px-16 py-12 xl:py-16 overflow-hidden relative">
   {/* Subtle amber glow top-right */}
   <div
    aria-hidden
    className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full"
    style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)' }}
   />

   {/* Logo */}
   <Link href="/" className="relative z-10 flex items-baseline gap-0">
    <span className="font-extrabold text-[20px] tracking-tight text-white">Leadre</span>
    <span className="font-extrabold text-[20px] text-[#f59e0b]">.</span>
    <span className="font-extrabold text-[20px] tracking-tight text-white">AI</span>
   </Link>

   {/* Hero block */}
   <div className="relative z-10 flex flex-col gap-8">
    <div>
     <p className="text-[12px] font-semibold tracking-[0.12em] uppercase text-[#f59e0b] mb-3">
      B2B Lead Intelligence
     </p>
     <h1 className="font-extrabold text-[48px] xl:text-[56px] tracking-[-0.04em] leading-[1.05] text-white">
      {isSignup ? (
       <>Find leads.<br /><span className="text-[#f59e0b]">Close deals.</span></>
      ) : (
       <>Welcome<br /><span className="text-[#f59e0b]">back.</span></>
      )}
     </h1>
     <p className="mt-4 text-[15px] text-[#9ca3af] leading-relaxed max-w-[380px]">
      {isSignup
       ? 'Describe who you want to reach. Get a verified lead list in minutes.'
       : 'Your searches, lead lists, and outreach campaigns are waiting for you.'}
     </p>
    </div>

    {/* Feature bullets */}
    <ul className="flex flex-col gap-3">
     {FEATURES.map((f) => (
      <li key={f} className="flex items-start gap-3">
       <CheckIcon />
       <span className="text-[14px] text-[#d1d5db] leading-snug">{f}</span>
      </li>
     ))}
    </ul>

    {/* Testimonial */}
    <div className="border-l-2 border-[#f59e0b] pl-5 mt-2">
     <p className="text-[14px] italic text-[#9ca3af] leading-relaxed">
      &ldquo;I used to spend a full day assembling a list of fifty companies in Lagos. LeadreAI returned them in eight minutes.&rdquo;
     </p>
     <div className="mt-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-[#f59e0b] flex items-center justify-center text-[#111827] text-[12px] font-bold shrink-0">
       A
      </div>
      <div>
       <div className="text-[13px] font-semibold text-white">Adaeze Okonkwo</div>
       <div className="text-[12px] text-[#6b7280]">Head of Growth · Arlo Logistics, Lagos</div>
      </div>
     </div>
    </div>
   </div>

   {/* Footer */}
   <div className="relative z-10 flex items-center gap-4 text-[11px] text-[#4b5563]">
    <span>© 2026 LeadreAI</span>
    <span aria-hidden>·</span>
    <a href="#" className="hover:text-[#9ca3af] transition-colors">Privacy</a>
    <span aria-hidden>·</span>
    <a href="#" className="hover:text-[#9ca3af] transition-colors">Terms</a>
   </div>
  </aside>
 );
}

/* ── Tab toggle ─────────────────────────────────────────────── */
function TabToggle({ mode }: { mode: 'signin' | 'signup' }) {
 const isSignup = mode === 'signup';
 return (
  <div className="inline-flex items-center rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-1 gap-1">
   <Link
    href="/login"
    className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
     !isSignup
      ? 'bg-[color:var(--paper)] text-[#111827] shadow-sm border border-[#e5e7eb]'
      : 'text-[#6b7280] hover:text-[#374151]'
    }`}
   >
    Sign in
   </Link>
   <Link
    href="/register"
    className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${
     isSignup
      ? 'bg-[color:var(--paper)] text-[#111827] shadow-sm border border-[#e5e7eb]'
      : 'text-[#6b7280] hover:text-[#374151]'
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
 const [accept, setAccept] = useState(false);

 return (
  <main className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-[3fr_2fr] selection:bg-[#f59e0b] selection:text-white">
   {/* Left: dark brand panel — hidden on mobile */}
   <DeskPanel mode={mode} />

   {/* Right: white form panel */}
   <section className="relative min-h-screen flex items-center justify-center bg-[color:var(--paper)] px-6 py-12 md:px-10 md:py-14">
    {/* Back-to-site link */}
    <Link
     href="/"
     className="absolute top-6 right-6 md:top-8 md:right-8 inline-flex items-center gap-1.5 text-[12.5px] text-[#6b7280] hover:text-[#374151] transition-colors"
    >
     <ArrowWest className="w-3 h-3" />
     Back to site
    </Link>

    <div className="w-full max-w-[420px]">
     {/* Mobile logo */}
     <div className="lg:hidden flex items-baseline justify-start mb-8">
      <Link href="/" className="flex items-baseline gap-0">
       <span className="font-extrabold text-[20px] tracking-tight text-[#111827]">Leadre</span>
       <span className="font-extrabold text-[20px] text-[#f59e0b]">.</span>
       <span className="font-extrabold text-[20px] tracking-tight text-[#111827]">AI</span>
      </Link>
     </div>

     {/* Tab toggle */}
     <div className="mb-7">
      <TabToggle mode={mode} />
     </div>

     {/* Heading */}
     <div className="mb-7">
      <h2 className="font-bold text-[28px] leading-tight tracking-[-0.02em] text-[#111827]">
       {isSignup ? 'Create your account' : 'Sign in to Leadre.AI'}
      </h2>
      <p className="mt-2 text-[14px] text-[#6b7280]">
       {isSignup ? (
        <>
         No credit card. Three free searches to start.{' '}
         <Link href="/login" className="text-[#f59e0b] font-medium hover:text-[#d97706]">
          Sign in →
         </Link>
        </>
       ) : (
        <>
         New here?{' '}
         <Link href="/register" className="text-[#f59e0b] font-medium hover:text-[#d97706]">
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
       className="mb-5 flex items-start gap-2 border border-[#fca5a5] bg-[#fef2f2] rounded-lg px-4 py-3 text-[13px] text-[#dc2626]"
      >
       <span className="mt-px w-1.5 h-1.5 rounded-full bg-[#dc2626] shrink-0" />
       {submitError}
      </div>
     )}

     {/* Form */}
     <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {isSignup && (
       <div className="grid grid-cols-2 gap-4">
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
           className="text-[12px] text-[#6b7280] hover:text-[#374151] transition-colors"
          >
           Forgot password?
          </a>
         ) : undefined
        }
        trailing={
         <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          className="p-1.5 text-[#9ca3af] hover:text-[#6b7280] transition-colors"
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
          className={`block w-4 h-4 rounded border-2 transition-all ${
           accept
            ? 'bg-[#f59e0b] border-[#f59e0b]'
            : 'bg-[color:var(--paper)] border-[#d1d5db]'
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
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
           />
          </svg>
         )}
        </span>
        <span className="text-[13px] leading-[1.5] text-[#374151]">
         I agree to LeadreAI&rsquo;s{' '}
         <a
          href="#"
          className="text-[#111827] underline underline-offset-[3px] decoration-[#d1d5db] hover:decoration-[#111827]"
         >
          Terms
         </a>{' '}
         and{' '}
         <a
          href="#"
          className="text-[#111827] underline underline-offset-[3px] decoration-[#d1d5db] hover:decoration-[#111827]"
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
        className="w-full bg-[#f59e0b] text-white py-3 rounded-lg text-[14px] font-semibold hover:bg-[#d97706] active:bg-[#b45309] transition-colors disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
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
      <div className="relative flex items-center">
       <span className="flex-1 h-px bg-[#e5e7eb]" />
       <span className="px-3 text-[12px] text-[#9ca3af]">or</span>
       <span className="flex-1 h-px bg-[#e5e7eb]" />
      </div>

      {/* Social */}
      <GoogleButton isSignup={isSignup} />

      {/* Secondary paths */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
       <MagicLinkAction prefillEmail={email} />
       <a
        href="#"
        className="text-[12px] text-[#9ca3af] hover:text-[#6b7280] transition-colors"
       >
        SSO / SAML →
       </a>
      </div>
     </form>
    </div>

    {/* Footer */}
    <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-3 text-[11px] text-[#9ca3af]">
     <span>© 2026 LeadreAI</span>
     <span aria-hidden>·</span>
     <a href="#" className="hover:text-[#6b7280] transition-colors">Privacy</a>
     <span aria-hidden>·</span>
     <a href="#" className="hover:text-[#6b7280] transition-colors">Terms</a>
     <span aria-hidden>·</span>
     <a href="#" className="hover:text-[#6b7280] transition-colors">Status</a>
    </div>
   </section>
  </main>
 );
}
