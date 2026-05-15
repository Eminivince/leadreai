'use client';

import { useEffect, useState } from 'react';

/**
 * Impersonation banner (Task #28 frontend).
 *
 * Shows a fixed yellow strip across the top whenever the current
 * session was minted via the admin impersonation flow (token stashed
 * in sessionStorage). Operators can return to their own account with
 * one click — clearing the impersonation token + reloading.
 *
 * The detection is deliberately client-side only — server doesn't
 * embed an "impersonator" claim in the JWT (would leak to the
 * impersonated user). We rely on the operator's tab having the
 * sessionStorage marker; opening the impersonated view in a fresh
 * tab without that marker will simply look like a regular login.
 */
export function ImpersonationBanner() {
  const [active, setActive] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = sessionStorage.getItem('impersonation-token');
    const user = sessionStorage.getItem('impersonation-user');
    setActive(Boolean(token));
    setUserId(user);
  }, []);

  if (!active) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-[color:var(--ember-bg)] border-b border-[color:var(--ember)]/30 px-6 py-2 font-sans font-medium text-[12.5px] text-[color:var(--ember-2)]"
    >
      <span>
        You are impersonating <code className="font-mono">{userId ?? 'a user'}</code>.
        All actions are logged.
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.removeItem('impersonation-token');
          sessionStorage.removeItem('impersonation-user');
          window.location.href = '/dashboard';
        }}
        className="font-sans font-semibold text-[12.5px] text-[color:var(--ember)] hover:text-[color:var(--ember-2)] hover:underline transition-colors"
      >
        Return to your account
      </button>
    </div>
  );
}
