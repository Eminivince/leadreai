'use client';

import { useState } from 'react';
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
 *
 * Mobile: sidebar is a drawer overlay toggled by the Topbar
 * hamburger. Desktop (≥ md): sidebar renders inline as before
 * and supports Cmd+\ collapse.
 * ───────────────────────────────────────────────────────────────── */

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
 const { isLoading } = useAuth(true);
 const [mobileOpen, setMobileOpen] = useState(false);

 if (isLoading) {
  return (
   <div className="min-h-screen flex items-center justify-center bg-[color:var(--paper)]">
    <LoadingSpinner size={28} />
   </div>
  );
 }

 return (
  <div className="flex min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] selection:bg-[color:var(--ember)] selection:text-white flex-col overflow-x-hidden">
   <ImpersonationBanner />
   <div className="flex flex-1 min-h-0 w-full">
   <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
   <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
    <div className="sticky top-0 z-20 bg-[color:var(--paper)]/95 backdrop-blur-sm border-b border-[color:var(--rule)]">
     <Topbar onOpenMobileSidebar={() => setMobileOpen(true)} />
    </div>
    <div className="flex-1 relative bg-[color:var(--paper-2)] min-w-0">{children}</div>
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
