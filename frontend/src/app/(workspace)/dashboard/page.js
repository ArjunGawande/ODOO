import Link from 'next/link';

import { PageHeader } from '@/components/ui';
import { requirePermission } from '@/lib/auth/guards';
import { can } from '@backend/lib/auth/permissions';
import { formatDate, todayInBusinessTz } from '@backend/lib/dates';
import { getDashboardCounts } from '@backend/services/dashboard';

export const metadata = { title: 'Dashboard' };

function StatCard({ label, value, hint, href }) {
  const body = (
    <>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink tabular-nums">
        {value.toLocaleString('en-IN')}
      </p>
      {hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </>
  );
  const classes = 'block rounded-lg border border-line bg-surface px-4 py-4 sm:px-5';
  return href ? (
    <Link href={href} className={`${classes} hover:border-line-strong`}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

export default async function DashboardPage() {
  const user = await requirePermission('workspace.view');
  const today = todayInBusinessTz();
  const counts = await getDashboardCounts(today);
  const productsHref = can(user, 'products.read') ? '/products' : undefined;
  const plansHref = can(user, 'plans.read') ? '/plans' : undefined;

  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome back, ${user.name}.`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active products" value={counts.activeProducts} href={productsHref} />
        <StatCard label="Active plans" value={counts.activePlans} href={plansHref} />
        <StatCard
          label="Plans on sale today"
          value={counts.plansOnSale}
          hint={formatDate(today)}
          href={plansHref}
        />
        <StatCard label="Customers" value={counts.customers} />
      </div>
    </>
  );
}
