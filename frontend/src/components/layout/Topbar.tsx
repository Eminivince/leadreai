'use client';

import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/useAppStore';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/leads': 'Leads',
  '/dashboard/campaigns': 'Campaigns',
  '/dashboard/settings': 'Settings',
};

function getInitials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export function Topbar() {
  const pathname = usePathname();
  const { user } = useAppStore();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-card/80 px-6 backdrop-blur">
      <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {user?.plan && (
          <Badge variant="indigo" className="capitalize">
            {user.plan}
          </Badge>
        )}
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">
            {getInitials(user?.firstName, user?.lastName)}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
