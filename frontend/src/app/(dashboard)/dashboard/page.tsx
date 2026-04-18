import { BriefcaseBusiness, Users, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';

const statCards = [
  {
    title: 'Prospecting Jobs',
    value: '0',
    description: 'Total jobs submitted',
    icon: BriefcaseBusiness,
  },
  {
    title: 'Leads Found',
    value: '—',
    description: 'Across all campaigns',
    icon: Users,
  },
  {
    title: 'Credits Remaining',
    value: '0',
    description: 'Free tier',
    icon: Coins,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Submit a prospecting query to start generating leads.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map(({ title, value, description, icon: Icon }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600/15">
                <Icon size={16} className="text-indigo-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent jobs */}
      <div>
        <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Jobs</h3>
        <Card>
          <CardContent className="p-0">
            <EmptyState
              title="No prospecting jobs yet"
              description="Submit a query to find your next customers using natural language."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
