'use client';

import { Sidebar } from '../../components/layout/Sidebar.js';
import { Topbar } from '../../components/layout/Topbar.js';
import { useAuth } from '../../hooks/useAuth.js';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner.js';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth(true); // redirects to /login if unauthenticated

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner size={32} /></div>;

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
