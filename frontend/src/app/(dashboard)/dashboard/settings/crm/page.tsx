'use client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { HubSpotConnect } from '@/components/crm/HubSpotConnect';
import { SyncLogTable } from '@/components/crm/SyncLogTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function CrmSettingsPage() {
  const { workspaceId, isLoading } = useWorkspace();

  if (isLoading || !workspaceId) return <div className="p-6 animate-pulse">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">CRM Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your CRM to sync leads and contacts automatically.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">HubSpot</CardTitle>
          <CardDescription>Sync companies and contacts to your HubSpot CRM.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <HubSpotConnect workspaceId={workspaceId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sync History</CardTitle>
          <CardDescription>Last 50 sync operations.</CardDescription>
        </CardHeader>
        <CardContent>
          <SyncLogTable workspaceId={workspaceId} />
        </CardContent>
      </Card>
    </div>
  );
}
