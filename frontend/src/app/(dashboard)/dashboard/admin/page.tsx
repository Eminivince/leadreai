'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * Operator admin console (Task #28 frontend).
 *
 * Three small forms gated by the same `ADMIN_SECRET` header the
 * BullBoard mount uses. The operator types the secret once per session
 * — it's stashed in sessionStorage (not localStorage — we don't want
 * it surviving a closed tab). All calls go directly to `/admin/...`
 * with the X-Admin-Secret header set.
 *
 * Deliberately unstyled vs. the rest of the app: a clean spartan look
 * keeps it visually distinct so an operator never confuses it with a
 * customer-facing surface.
 */
export default function AdminConsolePage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const stashed = typeof window !== 'undefined' ? sessionStorage.getItem('admin-secret') : null;
    if (stashed) {
      setSecret(stashed);
      setAuthed(true);
    }
  }, []);

  function saveSecret(): void {
    if (!secret.trim()) return;
    sessionStorage.setItem('admin-secret', secret.trim());
    setAuthed(true);
  }

  function clearSecret(): void {
    sessionStorage.removeItem('admin-secret');
    setSecret('');
    setAuthed(false);
  }

  if (!authed) {
    return (
      <main className="max-w-md mx-auto py-16 px-6">
        <h1 className="text-xl font-semibold text-[color:var(--ink)]">Operator console</h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-2)]">
          Enter the workspace admin secret. Stored in <code>sessionStorage</code> for this
          tab only.
        </p>
        <input
          type="password"
          autoFocus
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveSecret()}
          placeholder="ADMIN_SECRET"
          className="mt-4 w-full rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 font-mono text-[13px]"
        />
        <button
          type="button"
          onClick={saveSecret}
          disabled={!secret.trim()}
          className="mt-3 w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          Unlock console
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl py-10 px-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--ink)]">Operator console</h1>
          <p className="mt-1 text-[12.5px] text-[color:var(--ink-3)]">
            Support actions logged to AuditLog under the system-actor id.
          </p>
        </div>
        <button
          type="button"
          onClick={clearSecret}
          className="text-[12px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)]"
        >
          Sign out console
        </button>
      </header>

      <div className="flex flex-col gap-10">
        <CreditAdjustPanel secret={secret} />
        <JobInspectPanel secret={secret} />
        <ImpersonatePanel secret={secret} />
      </div>
    </main>
  );
}

function call(path: string, secret: string, init: RequestInit = {}): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': secret,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function CreditAdjustPanel({ secret }: { secret: string }) {
  const [userId, setUserId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [bucket, setBucket] = useState<'monthly' | 'topup'>('topup');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    const n = Number(delta);
    if (!Number.isFinite(n) || n === 0) {
      toast.error('Delta must be a non-zero number');
      return;
    }
    if (!reason.trim()) {
      toast.error('Reason required for the audit log');
      return;
    }
    setBusy(true);
    try {
      const res = await call(`/admin/support/users/${userId.trim()}/credits`, secret, {
        method: 'POST',
        body: JSON.stringify({ delta: n, reason: reason.trim(), bucket }),
      });
      if (!res.ok) {
        toast.error(`Failed: ${res.status}`);
      } else {
        toast.success(`Applied ${n > 0 ? '+' : ''}${n} credits.`);
        setDelta('');
        setReason('');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[color:var(--rule)] p-5">
      <h2 className="text-[14px] font-semibold mb-3">Adjust credits</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          placeholder="userId (24-char ObjectId)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 font-mono text-[12.5px]"
        />
        <input
          placeholder="delta (positive = grant, negative = charge)"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 font-mono text-[12.5px]"
        />
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value as 'monthly' | 'topup')}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 text-[13px]"
        >
          <option value="topup">topup bucket</option>
          <option value="monthly">monthly bucket</option>
        </select>
        <input
          placeholder="reason (audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 text-[13px]"
        />
      </div>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || !userId.trim()}
        className="mt-4 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? 'Applying…' : 'Apply'}
      </button>
    </section>
  );
}

function JobInspectPanel({ secret }: { secret: string }) {
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (!jobId.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await call(`/admin/support/jobs/${jobId.trim()}`, secret);
      const body = await res.json();
      if (!res.ok) {
        toast.error(`Failed: ${res.status}`);
      } else {
        setResult(body);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[color:var(--rule)] p-5">
      <h2 className="text-[14px] font-semibold mb-3">Inspect job</h2>
      <div className="flex gap-2">
        <input
          placeholder="jobId"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="flex-1 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 font-mono text-[12.5px]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
        >
          {busy ? '…' : 'Fetch'}
        </button>
      </div>
      {result ? (
        <pre className="mt-4 max-h-[400px] overflow-auto rounded-md bg-[color:var(--paper-1)] p-3 font-mono text-[11px] text-[color:var(--ink)]">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function ImpersonatePanel({ secret }: { secret: string }) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    if (!userId.trim() || !reason.trim()) {
      toast.error('userId and reason required');
      return;
    }
    setBusy(true);
    try {
      const res = await call(`/admin/support/users/${userId.trim()}/impersonate`, secret, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = (await res.json()) as { data?: { accessToken?: string } };
      if (!res.ok || !body.data?.accessToken) {
        toast.error('Failed');
        return;
      }
      // Stash the impersonation token in sessionStorage so the
      // ImpersonationBanner picks it up on next page load. We
      // explicitly DON'T set this as the active session via the auth
      // store — operator needs to navigate into the impersonated view
      // deliberately.
      sessionStorage.setItem('impersonation-token', body.data.accessToken);
      sessionStorage.setItem('impersonation-user', userId.trim());
      toast.success('Impersonation session ready. Open the impersonated view in a new tab.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-md border border-[color:var(--rule)] p-5">
      <h2 className="text-[14px] font-semibold mb-1">Impersonate user (15 min)</h2>
      <p className="text-[12px] text-[color:var(--ink-3)] mb-3">
        Issues a 15-minute access token. No refresh token — session dies on expiry.
        Audit row stamped under the operator id.
      </p>
      <div className="flex flex-col gap-2">
        <input
          placeholder="userId"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 font-mono text-[12.5px]"
        />
        <input
          placeholder="reason (e.g. ticket #1234)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 text-[13px]"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 self-start"
        >
          {busy ? '…' : 'Issue session'}
        </button>
      </div>
    </section>
  );
}
