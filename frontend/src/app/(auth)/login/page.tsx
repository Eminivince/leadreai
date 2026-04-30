'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';
import { AuthShell } from '@/components/auth/AuthShell';
import type { ApiResponse, User } from '@leadreai/shared';

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "Google didn’t return a code. Please try again.",
  state_mismatch: 'Sign-in session expired. Please try again.',
  token_exchange_failed: 'Google rejected the sign-in. Please try again.',
  userinfo_failed: "Couldn’t read your Google profile. Please try again.",
  missing_email: 'Your Google account has no primary email. Use email + password instead.',
  user_create_failed: "We couldn’t create your account. Please try again.",
  no_user: 'Sign-in failed. Please try again.',
  oauth_bootstrap_failed: 'Session bootstrap failed. Please sign in again.',
  access_denied: 'You cancelled the Google sign-in.',
};

interface LoginResponseData {
  accessToken: string;
  user: User;
}

function LoginPageContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAppStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get('error');
    if (!err) return;
    const msg = OAUTH_ERROR_MESSAGES[err] ?? 'Sign-in failed. Please try again.';
    setSubmitError(msg);
    toast.error(msg);
    router.replace('/login');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch<ApiResponse<LoginResponseData>>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      mode="signin"
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitError={submitError}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
    />
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
