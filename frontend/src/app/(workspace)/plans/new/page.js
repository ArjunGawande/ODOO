import { createPlanAction } from '@/actions/plans';
import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';

import { PlanForm } from '../PlanForm';

export const metadata = { title: 'New plan' };

export default async function NewPlanPage() {
  await requirePermission('plans.write');

  return (
    <>
      <PageHeader title="New plan" backHref="/plans" backLabel="Plans" />
      <PlanForm action={createPlanAction} submitLabel="Create plan" cancelHref="/plans" />
    </>
  );
}
