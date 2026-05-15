'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useWorkspace } from '@/hooks/useWorkspace';
import {
  SectionHead,
  Label,
  HairlineInput,
  HairlineTextarea,
  PrimaryButton,
} from '@/components/settings/primitives';
import { ApiError } from '@/lib/api';

interface SsoConfig {
  enabled: boolean;
  entryPoint?: string;
  issuer?: string;
  domain?: string;
  acsUrl: string;
}

/**
 * SAML SSO configuration (Task #24 frontend).
 *
 * Enterprise-plan gated — the GET endpoint returns 403 for any other
 * plan, which we surface as a sales-y upgrade prompt rather than a
 * generic error. The IdP team needs the ACS URL (always shown) +
 * entryPoint + issuer + an x509 cert (paste-as-PEM).
 */
export default function SsoSettingsPage() {
  const { workspaceId } = useWorkspace();
  const qc = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: ['sso-config', workspaceId],
    queryFn: () => apiFetch<{ success: true; data: SsoConfig }>(`/api/v1/workspaces/${workspaceId}/sso`),
    enabled: Boolean(workspaceId),
    retry: false,
  });

  const cfg = data?.data;
  const [enabled, setEnabled] = useState(false);
  const [entryPoint, setEntryPoint] = useState('');
  const [issuer, setIssuer] = useState('');
  const [cert, setCert] = useState('');
  const [domain, setDomain] = useState('');

  useEffect(() => {
    if (cfg) {
      setEnabled(cfg.enabled);
      setEntryPoint(cfg.entryPoint ?? '');
      setIssuer(cfg.issuer ?? '');
      setDomain(cfg.domain ?? '');
    }
  }, [cfg]);

  const save = useMutation({
    mutationFn: (payload: { enabled: boolean; entryPoint?: string; issuer?: string; cert?: string; domain?: string }) =>
      apiFetch(`/api/v1/workspaces/${workspaceId}/sso`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      toast.success('SSO config saved.');
      setCert(''); // never re-populate cert (select:false on the model)
      qc.invalidateQueries({ queryKey: ['sso-config', workspaceId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed.'),
  });

  // Plan-gate the page: 403 from the GET = upgrade copy.
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="flex flex-col gap-6">
        <SectionHead n="01" title="Single sign-on (SAML)" />
        <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-2)] p-6 max-w-xl">
          <p className="text-[14px] text-[color:var(--ink)] font-medium">
            SSO is available on the Enterprise plan.
          </p>
          <p className="mt-2 text-[13px] text-[color:var(--ink-2)] leading-[1.55]">
            SAML 2.0 SP-initiated flow with Okta / Auth0 / Azure AD.
            Domain-allowlisted, just-in-time user provisioning. Contact us
            to upgrade.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHead n="01" title="Single sign-on (SAML)" />
        <p className="text-[13px] text-[color:var(--ink-2)] max-w-[600px] leading-[1.55]">
          SP-initiated SAML 2.0. Your IdP signs assertions; we map
          NameID → email and provision the user on first login if their
          domain matches.
        </p>
      </div>

      <div className="flex flex-col gap-5 max-w-xl">
        <div className="rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] p-4">
          <Label>ACS URL (give this to your IdP)</Label>
          <code className="block mt-1 font-mono text-[12px] text-[color:var(--ink)] break-all">
            {cfg?.acsUrl ?? '…'}
          </code>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-[color:var(--ink)]">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="accent-[color:var(--ember)]"
            disabled={isLoading}
          />
          Enable SSO for this workspace
          {cfg?.enabled && (
            <span className="ml-2 inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--success)]">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connected
            </span>
          )}
        </label>

        <div>
          <Label>IdP entry point (SSO URL)</Label>
          <HairlineInput
            value={entryPoint}
            onChange={(e) => setEntryPoint(e.target.value)}
            placeholder="https://login.example.com/saml/sso"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label>IdP issuer / entity ID</Label>
          <HairlineInput
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="https://login.example.com/saml/metadata"
            disabled={isLoading}
          />
        </div>

        <div>
          <Label>x509 signing certificate (PEM)</Label>
          <HairlineTextarea
            rows={8}
            value={cert}
            onChange={(e) => setCert(e.target.value)}
            placeholder={'-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----'}
            spellCheck={false}
            className="font-mono text-[11.5px]"
          />
          <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
            Stored encrypted, never re-displayed. Re-paste to rotate.
          </p>
        </div>

        <div>
          <Label>Email domain allow-list</Label>
          <HairlineInput
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            disabled={isLoading}
          />
          <p className="mt-1.5 text-[11px] text-[color:var(--ink-3)]">
            Only emails ending @acme.com will be accepted via this IdP.
          </p>
        </div>

        <div className="flex items-center justify-end pt-2">
          <PrimaryButton
            onClick={() =>
              save.mutate({
                enabled,
                entryPoint: entryPoint.trim() || undefined,
                issuer: issuer.trim() || undefined,
                cert: cert.trim() || undefined,
                domain: domain.trim() || undefined,
              })
            }
            disabled={save.isPending || isLoading}
          >
            {save.isPending ? 'Saving…' : 'Save SSO config'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
