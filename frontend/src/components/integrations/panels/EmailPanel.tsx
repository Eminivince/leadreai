'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';

/* ─────────────────────────────────────────────────────────────────
 * EmailPanel — drawer body for the Email Sender card.
 *
 * Ports the email-config form that used to live inside the Settings
 * page (see settings/page.tsx:392-554 of the pre-refactor version) into
 * the editorial shell. Same endpoint surface:
 *  GET /api/v1/workspaces/:id/email-config
 *  PUT /api/v1/workspaces/:id/email-config
 * Only the presentation changes — hairline inputs, mono kickers, italic
 * hints. "Saved" affordance surfaces via hasApiKey / hasSmtpPass flags.
 * ───────────────────────────────────────────────────────────────── */

type EmailProvider = 'resend' | 'sendgrid' | 'smtp';

interface EmailConfig {
 provider: EmailProvider;
 fromEmail: string;
 fromName: string;
 replyTo?: string;
 apiKey?: string;
 smtpHost?: string;
 smtpPort?: number;
 smtpSecure?: boolean;
 smtpUser?: string;
 smtpPass?: string;
 hasApiKey?: boolean;
 hasSmtpPass?: boolean;
 verifiedAt?: string;
}

const EMPTY_FORM: EmailConfig = {
 provider: 'resend',
 fromEmail: '',
 fromName: '',
 replyTo: '',
 apiKey: '',
 smtpHost: '',
 smtpPort: 587,
 smtpSecure: false,
 smtpUser: '',
 smtpPass: '',
};

function Label({ children }: { children: React.ReactNode }) {
 return (
  <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[color:var(--ink-2)] block mb-2">
   {children}
  </span>
 );
}

function HairlineInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
 return (
  <div className="border-b border-[color:var(--rule)] focus-within:border-[color:var(--ink)] transition-colors">
   <input
    {...props}
    className="block w-full bg-transparent py-2 outline-none text-[14px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-3)]"
   />
  </div>
 );
}

function HairlineSelect({
 value,
 onChange,
 children,
}: {
 value: string;
 onChange: (v: string) => void;
 children: React.ReactNode;
}) {
 return (
  <div className="border-b border-[color:var(--rule)]">
   <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="block w-full bg-transparent py-2 outline-none text-[14px] text-[color:var(--ink)] appearance-none cursor-pointer"
   >
    {children}
   </select>
  </div>
 );
}

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

export function EmailPanel({ workspaceId }: { workspaceId: string }) {
 const qc = useQueryClient();

 const { data: existing, isLoading } = useQuery({
  queryKey: ['email-config', workspaceId],
  queryFn: () =>
   apiFetch<{ success: true; data: EmailConfig | null }>(`/api/v1/workspaces/${workspaceId}/email-config`),
  enabled: !!workspaceId,
  select: (r) => r.data,
 });

 const [form, setForm] = useState<EmailConfig>(EMPTY_FORM);
 const [dirty, setDirty] = useState(false);

 useEffect(() => {
  if (existing && !dirty) {
   setForm({
    provider: existing.provider,
    fromEmail: existing.fromEmail,
    fromName: existing.fromName ?? '',
    replyTo: existing.replyTo ?? '',
    smtpHost: existing.smtpHost ?? '',
    smtpPort: existing.smtpPort ?? 587,
    smtpSecure: existing.smtpSecure ?? false,
    smtpUser: existing.smtpUser ?? '',
    apiKey: '',
    smtpPass: '',
   });
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [existing]);

 const saveMutation = useMutation({
  mutationFn: (payload: EmailConfig) => {
   const body: Record<string, unknown> = {
    provider: payload.provider,
    fromEmail: payload.fromEmail,
    fromName: payload.fromName,
    replyTo: payload.replyTo || undefined,
   };
   if (payload.provider !== 'smtp' && payload.apiKey) body['apiKey'] = payload.apiKey;
   if (payload.provider === 'smtp') {
    body['smtpHost'] = payload.smtpHost;
    body['smtpPort'] = payload.smtpPort;
    body['smtpSecure'] = payload.smtpSecure;
    if (payload.smtpUser) body['smtpUser'] = payload.smtpUser;
    if (payload.smtpPass) body['smtpPass'] = payload.smtpPass;
   }
   return apiFetch(`/api/v1/workspaces/${workspaceId}/email-config`, {
    method: 'PUT',
    body: JSON.stringify(body),
   });
  },
  onSuccess: () => {
   toast.success('Sender saved.');
   setDirty(false);
   qc.invalidateQueries({ queryKey: ['email-config', workspaceId] });
  },
  onError: (err) => {
   toast.error(err instanceof Error ? err.message : 'Failed to save sender.');
  },
 });

 if (isLoading) {
  return (
   <div className="h-24 bg-[color:var(--paper-2)] border border-dashed border-[color:var(--rule)] rounded-sm flex items-center justify-center">
    <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[color:var(--ink-3)]">
     Loading sender…
    </span>
   </div>
  );
 }

 const verified = !!existing?.verifiedAt;
 const isApiKeyProvider = form.provider === 'resend' || form.provider === 'sendgrid';
 const isSmtp = form.provider === 'smtp';

 return (
  <form
   onSubmit={(e) => {
    e.preventDefault();
    saveMutation.mutate(form);
   }}
   className="flex flex-col gap-7"
  >
   {/* Status line */}
   <div>
    <span
     className={`font-mono text-[9.5px] tracking-[0.22em] uppercase ${
      verified ? 'text-[color:var(--ember)]' : 'text-[color:var(--ink-3)]'
     }`}
    >
     {verified ? 'On the wire' : 'Not filed'}
    </span>
    <h3 className="mt-2 text-[22px] leading-[1.2] text-[color:var(--ink)]">
     {verified ? (
      <>
       Sending from{' '}
       <em className="italic text-[color:var(--ember)]">{existing?.fromEmail}</em>
      </>
     ) : (
      <>
       Choose a <em className="italic text-[color:var(--ember)]">sender</em> for outreach.
      </>
     )}
    </h3>
   </div>

   {/* Provider */}
   <div>
    <Label>Provider</Label>
    <HairlineSelect
     value={form.provider}
     onChange={(v) => {
      setDirty(true);
      setForm((f) => ({ ...f, provider: v as EmailProvider }));
     }}
    >
     <option value="resend">Resend</option>
     <option value="sendgrid">SendGrid</option>
     <option value="smtp">SMTP (custom / Outlook)</option>
    </HairlineSelect>
   </div>

   {/* From name + from email */}
   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
     <Label>From name</Label>
     <HairlineInput
      placeholder="Amara at Paystack"
      value={form.fromName}
      onChange={(e) => {
       setDirty(true);
       setForm((f) => ({ ...f, fromName: e.target.value }));
      }}
      required
     />
    </div>
    <div>
     <Label>From email</Label>
     <HairlineInput
      type="email"
      placeholder="amara@paystack.com"
      value={form.fromEmail}
      onChange={(e) => {
       setDirty(true);
       setForm((f) => ({ ...f, fromEmail: e.target.value }));
      }}
      required
     />
    </div>
   </div>

   <div>
    <Label>
     Reply-to{' '}
     <span className="normal-case tracking-normal text-[color:var(--ink-3)]">(optional)</span>
    </Label>
    <HairlineInput
     type="email"
     placeholder="Same as From email"
     value={form.replyTo ?? ''}
     onChange={(e) => {
      setDirty(true);
      setForm((f) => ({ ...f, replyTo: e.target.value }));
     }}
    />
   </div>

   {/* API key (Resend / SendGrid) */}
   {isApiKeyProvider && (
    <div>
     <div className="flex items-baseline justify-between mb-2">
      <Label>API key</Label>
      {existing?.hasApiKey && (
       <span className=" italic text-[11.5px] text-[color:var(--ember)]">
        · saved — leave blank to keep
       </span>
      )}
     </div>
     <HairlineInput
      type="password"
      placeholder={existing?.hasApiKey ? '••••••••••••••••' : 'sk_live_…'}
      value={form.apiKey ?? ''}
      onChange={(e) => {
       setDirty(true);
       setForm((f) => ({ ...f, apiKey: e.target.value }));
      }}
      required={!existing?.hasApiKey}
     />
    </div>
   )}

   {/* SMTP credentials */}
   {isSmtp && (
    <div className="flex flex-col gap-5">
     <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5">
      <div>
       <Label>SMTP host</Label>
       <HairlineInput
        placeholder="smtp.gmail.com"
        value={form.smtpHost ?? ''}
        onChange={(e) => {
         setDirty(true);
         setForm((f) => ({ ...f, smtpHost: e.target.value }));
        }}
        required
       />
      </div>
      <div>
       <Label>Port</Label>
       <HairlineInput
        type="number"
        value={form.smtpPort ?? 587}
        onChange={(e) => {
         setDirty(true);
         setForm((f) => ({ ...f, smtpPort: Number(e.target.value) }));
        }}
       />
      </div>
     </div>
     <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
       <Label>Username</Label>
       <HairlineInput
        placeholder="you@gmail.com"
        value={form.smtpUser ?? ''}
        onChange={(e) => {
         setDirty(true);
         setForm((f) => ({ ...f, smtpUser: e.target.value }));
        }}
       />
      </div>
      <div>
       <div className="flex items-baseline justify-between mb-2">
        <Label>App password</Label>
        {existing?.hasSmtpPass && (
         <span className=" italic text-[11.5px] text-[color:var(--ember)]">
          · saved
         </span>
        )}
       </div>
       <HairlineInput
        type="password"
        placeholder={existing?.hasSmtpPass ? '••••••••' : 'App password'}
        value={form.smtpPass ?? ''}
        onChange={(e) => {
         setDirty(true);
         setForm((f) => ({ ...f, smtpPass: e.target.value }));
        }}
       />
      </div>
     </div>
    </div>
   )}

   <p className=" italic text-[12.5px] leading-[1.55] text-[color:var(--ink-2)] pt-1">
    Secrets are encrypted at rest and never returned to the browser. Saving will not change the
    stored secret unless you type a new one.
   </p>

   {/* Submit */}
   <div className="pt-5 border-t border-[color:var(--rule)] flex items-center justify-end gap-4">
    <button
     type="submit"
     disabled={saveMutation.isPending}
     className="group inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-5 py-3 rounded-full text-[13px] font-medium hover:bg-[color:var(--ember)] transition-colors disabled:opacity-60"
    >
     {saveMutation.isPending ? 'Saving…' : verified ? 'Save changes' : 'File this sender'}
     <ArrowEast className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
    </button>
   </div>
  </form>
 );
}
