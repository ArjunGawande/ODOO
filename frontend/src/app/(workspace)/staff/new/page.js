import { Card, PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';

import { InviteStaffForm } from './InviteStaffForm';

export const metadata = { title: 'Invite staff' };

export default async function NewStaffPage() {
  await requirePermission('staff.manage');

  return (
    <>
      <PageHeader
        title="Invite staff"
        description="They will get an email with a link to set their password."
        backHref="/staff"
        backLabel="Staff"
      />
      <Card className="max-w-xl">
        <InviteStaffForm />
      </Card>
    </>
  );
}
