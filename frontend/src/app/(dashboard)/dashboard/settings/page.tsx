import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and workspace.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Account Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Settings options coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
