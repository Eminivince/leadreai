'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { useAppStore } from '@/store/useAppStore';
import { AuthShell } from '@/components/auth/AuthShell';
import type { ApiResponse, User } from '@leadreai/shared';

interface RegisterResponseData {
  accessToken: string;
  user: User;
}

function validateFields(firstName: string, lastName: string, email: string, password: string) {
  const errs: Record<string, string> = {};
  if (!firstName.trim()) errs.firstName = 'Required';
  if (!lastName.trim()) errs.lastName = 'Required';
  if (!email.includes('@')) errs.email = 'Valid email required';
  if (password.length < 8) errs.password = 'At least 8 characters';
  return errs;
}

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAppStore();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fieldErrors = validateFields(firstName, lastName, email, password);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await apiFetch<ApiResponse<RegisterResponseData>>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      setAccessToken(res.data.accessToken);
      setUser(res.data.user);
      router.push('/dashboard');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      mode="signup"
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
      submitError={submitError}
      errors={errors}
      firstName={firstName}
      onFirstNameChange={setFirstName}
      lastName={lastName}
      onLastNameChange={setLastName}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
    />
  );
}
