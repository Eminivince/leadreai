'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useGmailStatus, useDisconnectGmail } from '@/hooks/useGmail';
import { EmailPanel } from '@/components/integrations/panels/EmailPanel';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/* ── OAuth callback handler ─────────────────────────────────────────────────
 * Reads ?gmail=connected|error from the URL (set by the backend after
 * the OAuth exchange), fires a toast, then clears the param.
 * Wrapped in Suspense because useSearchParams suspends.
 */
function GmailCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const status = searchParams.get('gmail');
    if (status === 'connected') {
      toast.success('Gmail connected. Emails will send directly from your inbox.');
      router.replace('/dashboard/settings/email');
    } else if (status === 'error') {
      toast.error('Gmail connection failed — please try again.');
      router.replace('/dashboard/settings/email');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/* ── Gmail OAuth card ───────────────────────────────────────────────────────
 * Shows connection state; "Connect Gmail" initiates the OAuth flow.
 * The backend connect route does a server-side redirect, so we use
 * window.location.href rather than a client-side router push.
 */
function GmailCard({ workspaceId }: { workspaceId: string }) {
  const { data: status, isLoading } = useGmailStatus(workspaceId);
  const disconnect = useDisconnectGmail(workspaceId);

  function handleConnect() {
    window.location.href = `${API_BASE}/api/v1/workspaces/${workspaceId}/email-sender/gmail/connect`;
  }

  if (isLoading) {
    return (
      <div className="border border-[color:var(--rule)] rounded-md p-5 h-[72px] animate-pulse bg-[color:var(--paper-2)]" />
    );
  }

  return (
    <div
      className={`border rounded-md p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 transition-colors ${
        status?.connected
          ? 'border-[color:var(--success)] bg-[color:var(--success)]/5'
          : 'border-[color:var(--rule)]'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Google G mark */}
        <div className="w-9 h-9 rounded-full border border-[color:var(--rule)] bg-[color:var(--paper-3)] flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium text-[color:var(--ink)]">Gmail</span>
            {status?.connected && (
              <span className="font-mono text-[9px] tracking-[0.06em] text-[color:var(--success)] bg-[color:var(--success)]/10 px-2 py-0.5 rounded-md whitespace-nowrap">
                Active sender
              </span>
            )}
          </div>
          {status?.connected ? (
            <span className="text-[12.5px] text-[color:var(--ink-2)] truncate block">
              Sending as{' '}
              <span className="text-[color:var(--ink)]">{status.email}</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-[color:var(--ink-3)]">
              OAuth — send from your own inbox, no SMTP passwords
            </span>
          )}
        </div>
      </div>

      {status?.connected ? (
        <button
          onClick={() => disconnect.mutate()}
          disabled={disconnect.isPending}
          className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-[color:var(--ink-3)] hover:text-red-500 border border-[color:var(--rule)] hover:border-red-400 px-3 py-1.5 rounded-md transition-colors disabled:opacity-40"
        >
          {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      ) : (
        <button
          onClick={handleConnect}
          className="shrink-0 inline-flex items-center gap-2 bg-[color:var(--ink)] text-[color:var(--paper)] px-4 py-2 rounded-md text-[13px] font-medium hover:opacity-85 transition-opacity"
        >
          Connect Gmail
        </button>
      )}
    </div>
  );
}

/* ── Inbound webhook components (unchanged) ─────────────────────────────────
 */
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
      className="font-mono text-[10px] tracking-[0.06em] px-3 py-1 border border-[color:var(--rule)] rounded-md text-[color:var(--ink-2)] hover:text-[color:var(--ink)] hover:border-[color:var(--ink)] transition-colors"
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
    <section className="border border-[color:var(--rule)] rounded-md p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <span className="text-[18px] text-[color:var(--ink)]">{provider}</span>
      </div>

      <div>
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-2">
          Webhook URL
        </span>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border border-[color:var(--rule)] rounded-md px-3 py-2.5 bg-[color:var(--paper-3)]/60">
          <code className="flex-1 min-w-0 font-mono text-[12px] text-[color:var(--ink)] break-all">
            {webhookUrl}
          </code>
          <div className="self-start sm:self-auto">
            <CopyButton text={webhookUrl} />
          </div>
        </div>
      </div>

      <div>
        <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-3">
          Setup
        </span>
        <ol className="flex flex-col gap-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 items-baseline">
              <span className="italic text-[18px] text-[color:var(--ember)] tabular-nums w-5 shrink-0">
                {i + 1}
              </span>
              <span className="text-[13.5px] leading-[1.55] text-[color:var(--ink-2)]">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────
 */
export default function EmailSettingsPage() {
  const { workspaceId } = useWorkspace();
  const resendUrl = `${API_BASE}/webhooks/inbound/resend`;
  const sendgridUrl = `${API_BASE}/webhooks/inbound/sendgrid`;

  return (
    <div className="flex flex-col gap-12">
      <Suspense fallback={null}>
        <GmailCallbackHandler />
      </Suspense>

      {/* ── Section 1: Sender setup ────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <div>
          <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            Sender
          </span>
          <h2 className="text-[16px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
            Outbound sender
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[color:var(--ink-2)] max-w-[540px]">
            Gmail OAuth is the fastest path — one click, no credentials. Or configure
            Resend, SendGrid, or SMTP below.
          </p>
        </div>

        {workspaceId && <GmailCard workspaceId={workspaceId} />}

        <div className="flex items-center gap-3">
          <span className="flex-1 h-px bg-[color:var(--rule)]" />
          <span className="font-mono text-[9px] tracking-[0.06em] text-[color:var(--ink-3)]">
            or API provider
          </span>
          <span className="flex-1 h-px bg-[color:var(--rule)]" />
        </div>

        {workspaceId && <EmailPanel workspaceId={workspaceId} />}
      </section>

      {/* ── Section 2: Inbound reply routing ──────────────────────── */}
      <section className="flex flex-col gap-6 pt-6 border-t border-[color:var(--rule)]">
        <div>
          <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)] block mb-1.5">
            Inbound replies
          </span>
          <h2 className="text-[16px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
            Inbound routing
          </h2>
          <p className="mt-2 text-[13.5px] leading-[1.6] text-[color:var(--ink-2)] max-w-[560px]">
            Configure your provider to forward inbound email here. When a prospect replies,
            the sequence pauses and the reply surfaces in the campaign dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <ProviderBlock
            provider="Resend"
            webhookUrl={resendUrl}
            steps={[
              'In your Resend dashboard, go to Webhooks → Add webhook.',
              'Paste the URL above. Select event type "email.received" (inbound).',
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

        <p className="text-[12.5px] text-[color:var(--ink-3)]">
          Reply tracking requires DNS access to your sending domain. MX record changes can
          take up to 48 hours to propagate.
        </p>
      </section>
    </div>
  );
}
