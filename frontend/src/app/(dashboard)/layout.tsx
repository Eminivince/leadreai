'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '../../components/layout/Sidebar.js';
import { Topbar } from '../../components/layout/Topbar.js';
import { useAuth } from '../../hooks/useAuth.js';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth(true); // redirects to /login if unauthenticated
  const router = useRouter();

  useEffect(() => {
    // If user is null and we're not loading, redirect is handled by useAuth
    if (!user) return;
  }, [user, router]);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
