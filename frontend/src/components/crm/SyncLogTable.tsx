'use client';
import { useHubSpotSyncLog } from '@/hooks/useHubSpot';

export function SyncLogTable({ workspaceId }: { workspaceId: string }) {
  const { data: log, isLoading } = useHubSpotSyncLog(workspaceId);

  if (isLoading) return <div className="h-40 animate-pulse bg-muted rounded" />;
  if (!log || log.length === 0) return <div className="text-sm text-muted-foreground py-4 text-center">No sync history yet.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left pb-2 pr-4">Date</th>
            <th className="text-left pb-2 pr-4">Direction</th>
            <th className="text-right pb-2 pr-4">Companies</th>
            <th className="text-right pb-2 pr-4">Contacts</th>
            <th className="text-right pb-2">Errors</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-2 pr-4">{new Date(entry.syncedAt).toLocaleString()}</td>
              <td className="py-2 pr-4 capitalize">{entry.direction}</td>
              <td className="py-2 pr-4 text-right">{entry.companiesSynced}</td>
              <td className="py-2 pr-4 text-right">{entry.contactsSynced}</td>
              <td className={`py-2 text-right ${entry.errors > 0 ? 'text-red-500' : ''}`}>{entry.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
