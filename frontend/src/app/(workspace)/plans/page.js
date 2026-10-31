import Link from 'next/link';

import {
  Card,
  EmptyState,
  LinkButton,
  Money,
  PageHeader,
  Pagination,
  SearchBox,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@backend/lib/auth/permissions';
import { formatDate, todayInBusinessTz } from '@backend/lib/dates';
import { buildPageHref, parsePagination } from '@backend/lib/pagination';
import { BILLING_PERIOD_LABELS, parsePlanStatus } from '@backend/lib/validation/plans';
import { listPlans } from '@backend/services/plans';

import { PlanAvailabilityBadge } from './PlanAvailabilityBadge';

export const metadata = { title: 'Plans' };

const BASE_PATH = '/plans';
const STATUS_FILTERS = [
  { status: 'active', label: 'Active' },
  { status: 'archived', label: 'Archived' },
];

function emptyMessage({ q, status, total }) {
  if (total > 0) return { title: 'Nothing on this page', description: 'The list is shorter now.' };
  if (q) return { title: 'No plans found', description: `Nothing matches "${q}".` };
  if (status === 'archived') {
    return { title: 'No archived plans', description: 'Archived plans will appear here.' };
  }
  return { title: 'No plans yet', description: 'Plans set how a product is priced and billed.' };
}

export default async function PlansPage({ searchParams }) {
  const user = await requirePermission('plans.read');
  const params = await searchParams;
  const { page, pageSize, offset, q } = parsePagination(params);
  const status = parsePlanStatus(params.status);
  const today = todayInBusinessTz();

  const { rows, total } = await listPlans({ q, status, pageSize, offset });
  const canWrite = can(user, 'plans.write');
  const newPlanLink = canWrite ? <LinkButton href="/plans/new">New plan</LinkButton> : null;
  const empty = emptyMessage({ q, status, total });

  return (
    <>
      <PageHeader
        title="Plans"
        description="What can be sold, at what price, and when."
        actions={newPlanLink}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          basePath={BASE_PATH}
          params={params}
          value={q}
          label="Search plans by name"
          placeholder="Search plans"
        />
        <nav aria-label="Filter plans by status" className="flex items-center gap-2">
          {STATUS_FILTERS.map((filter) => (
            <LinkButton
              key={filter.status}
              href={buildPageHref(
                BASE_PATH,
                { ...params, status: filter.status === 'active' ? undefined : filter.status },
                1,
              )}
              variant={filter.status === status ? 'primary' : 'secondary'}
              size="sm"
              aria-current={filter.status === status ? 'true' : undefined}
            >
              {filter.label}
            </LinkButton>
          ))}
        </nav>
      </div>

      <Card flush>
        {rows.length > 0 ? (
          <Table caption={status === 'archived' ? 'Archived plans' : 'Active plans'}>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH numeric>Price</TH>
                <TH>Billing period</TH>
                <TH numeric>Min. quantity</TH>
                <TH>Sale window</TH>
                <TH>Availability</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((plan) => (
                <TR key={plan.id}>
                  <TD>
                    <Link
                      href={`/plans/${plan.id}`}
                      className="font-medium text-accent-strong hover:underline"
                    >
                      {plan.name}
                    </Link>
                  </TD>
                  <TD numeric>
                    <Money value={plan.price} />
                  </TD>
                  <TD>{BILLING_PERIOD_LABELS[plan.billing_period]}</TD>
                  <TD numeric>{plan.min_quantity}</TD>
                  <TD className="whitespace-nowrap">
                    {formatDate(plan.start_date)} to {formatDate(plan.end_date)}
                  </TD>
                  <TD>
                    <PlanAvailabilityBadge plan={plan} today={today} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState
            title={empty.title}
            description={empty.description}
            action={!q && total === 0 && status === 'active' ? newPlanLink : null}
          />
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={pageSize}
          basePath={BASE_PATH}
          params={params}
        />
      </Card>
    </>
  );
}
