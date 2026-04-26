'use client';

import { Sidebar } from '../../components/layout/Sidebar';
import { Topbar } from '../../components/layout/Topbar';
import { TopUpModal } from '../../components/credits/TopUpModal';
import { ChangePlanModal } from '../../components/credits/ChangePlanModal';
import { CommandPalette } from '../../components/search/CommandPalette';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/shared/LoadingSpinner';

/* ─────────────────────────────────────────────────────────────────
 * Dashboard shell — editorial broadsheet.
 * The palette lives in globals.css (:root + html.dark), so this
 * shell only composes the Sidebar/Topbar and chrome.
 * ───────────────────────────────────────────────────────────────── */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth(true);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--paper)]">
        <LoadingSpinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] selection:bg-[color:var(--forest)] selection:text-[color:var(--paper)]">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col border-l border-[color:var(--rule)]">
        <div className="sticky top-0 z-20 bg-[color:var(--paper)]/95 backdrop-blur-sm border-b border-[color:var(--rule)]">
          <Topbar />
        </div>
        <div className="flex-1 relative">{children}</div>
      </main>
      <TopUpModal />
      <ChangePlanModal />
      <CommandPalette />
    </div>
  );
}
