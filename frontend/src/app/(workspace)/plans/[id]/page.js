import { notFound } from 'next/navigation';

import { archivePlanAction, restorePlanAction } from '@/actions/plans';
import { Alert, Badge, Card, LinkButton, Money, PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@backend/lib/auth/permissions';
import { formatDate, todayInBusinessTz } from '@backend/lib/dates';
import { BILLING_PERIOD_LABELS, parsePlanId, PLAN_OPTIONS } from '@backend/lib/validation/plans';
import { getPlan } from '@backend/services/plans';

import { PlanAvailabilityBadge } from '../PlanAvailabilityBadge';
import { PlanStatusCard } from '../PlanStatusCard';

export const metadata = { title: 'Plan' };

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

export default async function PlanPage({ params }) {
  const user = await requirePermission('plans.read');
  const { id: rawId } = await params;
  const id = parsePlanId(rawId);
  if (id === null) notFound();
  const plan = await getPlan(id);
  if (!plan) notFound();

  const canWrite = can(user, 'plans.write');

  return (
    <>
      <PageHeader
        title={plan.name}
        backHref="/plans"
        backLabel="Plans"
        actions={
          canWrite && plan.is_active ? (
            <LinkButton href={`/plans/${plan.id}/edit`} variant="secondary">
              Edit plan
            </LinkButton>
          ) : null
        }
      />

      <div className="max-w-3xl space-y-6">
        {plan.is_active ? null : (
          <Alert tone="warning">This plan is archived. It can&apos;t be sold or edited.</Alert>
        )}

        <Card title="Plan details">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Availability">
              <PlanAvailabilityBadge plan={plan} today={todayInBusinessTz()} />
            </Detail>
            <Detail label="Price">
              <Money value={plan.price} />
            </Detail>
            <Detail label="Billing period">{BILLING_PERIOD_LABELS[plan.billing_period]}</Detail>
            <Detail label="Minimum quantity">{plan.min_quantity}</Detail>
            <Detail label="Sale window">
              {formatDate(plan.start_date)} to {formatDate(plan.end_date)}
            </Detail>
          </dl>
        </Card>

        <Card title="Options" description="What is allowed on this plan.">
          <ul className="divide-y divide-line">
            {PLAN_OPTIONS.map((option) => (
              <li
                key={option.key}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 text-ink">{option.label}</span>
                {plan[option.key] ? (
                  <Badge tone="success">Allowed</Badge>
                ) : (
                  <Badge>Not allowed</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {canWrite ? (
          <PlanStatusCard
            planId={plan.id}
            isActive={plan.is_active}
            archiveAction={archivePlanAction}
            restoreAction={restorePlanAction}
          />
        ) : null}
      </div>
    </>
  );
}
