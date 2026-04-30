'use client';

import { useState } from 'react';

/* ─────────────────────────────────────────────────────────────────
 * Email & replies settings page.
 *
 * Surfaces the inbound webhook URLs for Resend and SendGrid with
 * copy buttons and numbered setup instructions so users can route
 * prospect replies back into LeadreAI automatically.
 * ───────────────────────────────────────────────────────────────── */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable or denied — silently ignore
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
      className="font-mono text-[10px] tracking-[0.18em] uppercase px-3 py-1 border border-[color:var(--rule)] rounded-full text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink)] transition-colors"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

interface ProviderBlockProps {
  provider: 'Resend' | 'SendGrid';
  webhookUrl: string;
  steps: string[];
}

function ProviderBlock({ provider, webhookUrl, steps }: ProviderBlockProps) {
  return (
    <section className="border border-[color:var(--rule)] rounded-sm p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className=" text-[22px] text-[color:var(--ink)]">
          {provider}
        </span>
      </div>

      {/* Webhook URL */}
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-2">
          Webhook URL
        </span>
        <div className="flex items-center gap-3 border border-[color:var(--rule)] rounded-sm px-3 py-2.5 bg-[color:var(--paper-3)]/60">
          <code className="flex-1 font-mono text-[12px] text-[color:var(--ink)] break-all">
            {webhookUrl}
          </code>
          <CopyButton text={webhookUrl} />
        </div>
      </div>

      {/* Setup steps */}
      <div>
        <span className="font-mono text-[9.5px] tracking-[0.22em] uppercase text-[color:var(--ink-3)] block mb-3">
          Setup
        </span>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 items-baseline">
              <span className=" italic text-[18px] text-[color:var(--forest)] tabular-nums w-5 shrink-0">
                {i + 1}
              </span>
              <span className=" text-[13.5px] leading-[1.55] text-[color:var(--ink-2)]">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function EmailSettingsPage() {
  const resendUrl = `${BASE_URL}/webhooks/inbound/resend`;
  const sendgridUrl = `${BASE_URL}/webhooks/inbound/sendgrid`;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className=" text-[14.5px] leading-[1.6] text-[color:var(--ink-2)] max-w-[600px]">
          To track replies in-app, configure your email provider to forward inbound email to LeadreAI.
          When a prospect replies, the sequence pauses automatically and the reply appears in the campaign dashboard.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <ProviderBlock
          provider="Resend"
          webhookUrl={resendUrl}
          steps={[
            'In your Resend dashboard, go to Webhooks → Add webhook.',
            'Paste the URL above. Select the event type "email.received" (inbound).',
            "Set your sending domain's reply-to address to an inbound-enabled subdomain (e.g. reply@inbound.yourdomain.com) pointing to Resend's inbound MX records.",
            'Send a test reply to confirm the webhook fires.',
          ]}
        />

        <ProviderBlock
          provider="SendGrid"
          webhookUrl={sendgridUrl}
          steps={[
            'In your SendGrid dashboard, go to Settings → Inbound Parse.',
            'Add a new hostname — use a subdomain like reply.yourdomain.com.',
            "Point that subdomain's MX records to mx.sendgrid.net.",
            'Paste the webhook URL above into the "URL" field. Ensure "POST the raw, full MIME message" is OFF (default).',
            'Set your campaign reply-to address to an address on that subdomain (e.g. no-reply@reply.yourdomain.com).',
          ]}
        />
      </div>

      <p className=" text-[12.5px] italic text-[color:var(--ink-3)]">
        Reply tracking requires DNS access to your sending domain. Changes to MX records can take up to 48 hours to propagate.
      </p>
    </div>
  );
}
