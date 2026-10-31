import { Card, EmptyState, PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';

export const metadata = { title: 'My account' };

export default async function PortalPage() {
  const user = await requirePermission('portal.view');

  return (
    <>
      <PageHeader title={`Welcome, ${user.name}`} description="Your account at a glance." />
      <div className="space-y-4">
        <Card title="My subscriptions" flush>
          <EmptyState
            title="No subscriptions yet"
            description="Your subscriptions will appear here once Brightloop sets them up."
          />
        </Card>
        <Card title="My invoices" flush>
          <EmptyState
            title="No invoices yet"
            description="Your invoices will appear here when they are issued."
          />
        </Card>
      </div>
    </>
  );
}
