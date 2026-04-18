'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { clearTokens } from '../../lib/auth';
import { apiFetch } from '../../lib/api';

export function Topbar() {
  const { user, reset } = useAppStore();
  const router = useRouter();

  async function handleLogout() {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    clearTokens();
    reset();
    router.push('/login');
  }

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6">
      <div className="text-sm font-medium text-gray-700">
        {user ? `${user.firstName} ${user.lastName}` : ''}
      </div>
      <button
        onClick={() => { void handleLogout(); }}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        aria-label="Log out"
      >
        <LogOut size={16} />
        Log out
      </button>
    </header>
  );
}
