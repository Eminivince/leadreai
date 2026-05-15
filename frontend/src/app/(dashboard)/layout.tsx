'use client';

import { Sidebar } from '../../components/layout/Sidebar';
import { Topbar } from '../../components/layout/Topbar';
import { ImpersonationBanner } from '../../components/layout/ImpersonationBanner';
import { TopUpModal } from '../../components/credits/TopUpModal';
import { ChangePlanModal } from '../../components/credits/ChangePlanModal';
import { CommandPalette } from '../../components/search/CommandPalette';
import { PatraChat } from '../../components/chat/PatraChat';
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard';
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
  <div className="flex min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] selection:bg-[color:var(--ember)] selection:text-white flex-col">
   <ImpersonationBanner />
   <div className="flex flex-1 min-h-0 w-full">
   <Sidebar />
   <main className="flex-1 min-w-0 flex flex-col">
    <div className="sticky top-0 z-20 bg-[color:var(--paper)]/95 backdrop-blur-sm border-b border-[color:var(--rule)]">
     <Topbar />
    </div>
    <div className="flex-1 relative bg-[color:var(--paper-2)]">{children}</div>
   </main>
   </div>
   <TopUpModal />
   <ChangePlanModal />
   <CommandPalette />
   <PatraChat />
   <OnboardingWizard />
  </div>
 );
}
