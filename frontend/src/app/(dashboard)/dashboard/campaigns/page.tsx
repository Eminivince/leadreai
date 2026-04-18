import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Campaigns</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your outreach campaigns.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to start automating your outreach."
          />
        </CardContent>
      </Card>
    </div>
  );
}
