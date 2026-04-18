import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Leads</h2>
        <p className="mt-1 text-sm text-muted-foreground">All enriched leads across your jobs.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <EmptyState
            title="No leads yet"
            description="Leads will appear here once you run a prospecting job."
          />
        </CardContent>
      </Card>
    </div>
  );
}
