import { EmptyState } from '../../components/shared/EmptyState';

export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>
      <EmptyState
        title="No prospecting jobs yet"
        description="Submit a query to start finding leads."
      />
    </div>
  );
}
