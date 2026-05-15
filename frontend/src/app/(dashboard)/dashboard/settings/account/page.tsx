'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import type { ApiResponse, User } from '@leadreai/shared';
import {
  Label,
  HairlineInput,
  SectionHead,
  PrimaryButton,
  ForthcomingPanel,
} from '@/components/settings/primitives';

/**
 * Account — your byline.
 * Profile edit via PATCH /auth/me. Password + 2FA forthcoming.
 */
export default function AccountSettingsPage() {
  const { user, setUser } = useAppStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (user && !dirty) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setAvatarUrl(user.avatarUrl ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { firstName: string; lastName: string; avatarUrl?: string }) => {
      const res = await apiFetch<ApiResponse<User>>('/api/v1/auth/me', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return res.data;
    },
    onSuccess: (u) => {
      setUser(u);
      setDirty(false);
      toast.success('Profile saved.');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save.'),
  });

  if (!user) {
    return (
      <div className="py-8  text-[14px] text-[color:var(--ink-2)]">
        Loading account…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      {/* Your byline */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            avatarUrl: avatarUrl.trim() || undefined,
          });
        }}
      >
        <section>
          <SectionHead n="01" title="Your profile" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 ">
            <div>
              <Label>First name</Label>
              <HairlineInput
                value={firstName}
                onChange={(e) => { setDirty(true); setFirstName(e.target.value); }}
                maxLength={80}
                required
              />
            </div>
            <div>
              <Label>Last name</Label>
              <HairlineInput
                value={lastName}
                onChange={(e) => { setDirty(true); setLastName(e.target.value); }}
                maxLength={80}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label>Avatar URL (optional)</Label>
              <HairlineInput
                type="url"
                placeholder="https://…/avatar.jpg"
                value={avatarUrl}
                onChange={(e) => { setDirty(true); setAvatarUrl(e.target.value); }}
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-end pt-2">
              <PrimaryButton type="submit" disabled={saveMutation.isPending || !dirty}>
                {saveMutation.isPending ? 'Saving…' : 'Save profile'}
              </PrimaryButton>
            </div>
          </div>
        </section>
      </form>

      {/* Contact (read-only) */}
      <section>
        <SectionHead n="02" title="Contact" />
        <div className=" grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>Email</Label>
            <div className="flex items-baseline gap-3 border-b border-[color:var(--rule)] py-2">
              <span className="font-mono text-[13px] text-[color:var(--ink)] flex-1 truncate">
                {user.email}
              </span>
              {user.isEmailVerified ? (
                <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--success)]">
                  Verified
                </span>
              ) : (
                <span className="font-mono text-[9.5px] tracking-[0.06em] text-[color:var(--ink-3)]">
                  Unverified
                </span>
              )}
            </div>
            <p className="mt-2  text-[12px] text-[color:var(--ink-2)]">
              Email changes are forthcoming. Reach out if you need one moved today.
            </p>
          </div>
          <div>
            <Label>Last signed in</Label>
            <div className="border-b border-[color:var(--rule)] py-2 font-mono text-[13px] text-[color:var(--ink)]">
              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '—'}
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section>
        <SectionHead n="03" title="Security" />
        <div className="">
          <ForthcomingPanel title="Password change and two-factor authentication.">
            For now, auth uses your initial credentials. If you need a password reset,
            sign out and use the forgotten-password flow on the sign-in page.
          </ForthcomingPanel>
        </div>
      </section>
    </div>
  );
}
