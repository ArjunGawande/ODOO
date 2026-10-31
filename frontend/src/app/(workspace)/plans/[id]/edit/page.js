import { notFound, redirect } from 'next/navigation';

import { updatePlanAction } from '@/actions/plans';
import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { parsePlanId } from '@backend/lib/validation/plans';
import { getPlan } from '@backend/services/plans';

import { PlanForm } from '../../PlanForm';

export const metadata = { title: 'Edit plan' };

export default async function EditPlanPage({ params }) {
  await requirePermission('plans.write');
  const { id: rawId } = await params;
  const id = parsePlanId(rawId);
  if (id === null) notFound();
  const plan = await getPlan(id);
  if (!plan) notFound();
  // Archived plans are read-only. The detail page offers Restore.
  if (!plan.is_active) redirect(`/plans/${plan.id}`);

  const { created_at: _createdAt, updated_at: _updatedAt, ...formPlan } = plan;

  return (
    <>
      <PageHeader title={`Edit ${plan.name}`} backHref={`/plans/${plan.id}`} backLabel="Plan" />
      <PlanForm
        action={updatePlanAction}
        plan={formPlan}
        submitLabel="Save changes"
        cancelHref={`/plans/${plan.id}`}
      />
    </>
  );
}
