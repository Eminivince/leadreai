'use client';
import { CheckCircle2, Link2, Unlink, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useHubSpotStatus, useTriggerHubSpotSync, useDisconnectHubSpot } from '@/hooks/useHubSpot';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function HubSpotConnect({ workspaceId }: { workspaceId: string }) {
  const { data: status, isLoading } = useHubSpotStatus(workspaceId);
  const syncMutation = useTriggerHubSpotSync(workspaceId);
  const disconnectMutation = useDisconnectHubSpot(workspaceId);

  if (isLoading) return <div className="h-20 animate-pulse bg-muted rounded-lg" />;

  const handleConnect = () => {
    window.location.href = `${API_BASE}/api/v1/workspaces/${workspaceId}/crm/hubspot/connect`;
  };

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync();
      toast.success('Sync started');
    } catch { toast.error('Sync failed'); }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectMutation.mutateAsync();
      toast.success('HubSpot disconnected');
    } catch { toast.error('Failed to disconnect'); }
  };

  if (!status?.connected) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded text-white flex items-center justify-center font-bold text-xs">HS</div>
          <div>
            <div className="font-medium text-sm">HubSpot</div>
            <div className="text-xs text-muted-foreground">Not connected</div>
          </div>
        </div>
        <Button size="sm" onClick={handleConnect}><Link2 className="w-4 h-4 mr-2" />Connect</Button>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded text-white flex items-center justify-center font-bold text-xs">HS</div>
          <div>
            <div className="font-medium text-sm flex items-center gap-2">
              HubSpot <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-xs text-muted-foreground">Portal {status.portalId}</div>
          </div>
        </div>
        <Badge variant="secondary" className="text-green-700 bg-green-50">Connected</Badge>
      </div>
      {status.lastSyncAt && (
        <div className="text-xs text-muted-foreground">Last synced: {new Date(status.lastSyncAt).toLocaleString()}</div>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handleSync} disabled={syncMutation.isPending}>
          {syncMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Sync Now
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDisconnect} disabled={disconnectMutation.isPending}>
          <Unlink className="w-4 h-4 mr-2" />Disconnect
        </Button>
      </div>
    </div>
  );
}
