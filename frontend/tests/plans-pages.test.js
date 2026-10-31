import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';

import { resetTables } from '../../backend/tests/helpers/db';
import { createAdmin, createSessionFor, createStaff } from '../../backend/tests/helpers/factories';

const cookieJar = vi.hoisted(() => new Map());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/form', async () => {
  const { createElement: h } = await import('react');
  return { default: (props) => h('form', props) };
});

const { default: PlansPage } = await import('@/app/(workspace)/plans/page');
const { default: NewPlanPage } = await import('@/app/(workspace)/plans/new/page');
const { default: PlanPage } = await import('@/app/(workspace)/plans/[id]/page');
const { default: EditPlanPage } = await import('@/app/(workspace)/plans/[id]/edit/page');
const { archivePlan, createPlan } = await import('@backend/services/plans');

const CLOUD_CRM_MONTHLY = {
  name: 'CloudCRM Monthly',
  price: '1000.00',
  billing_period: 'monthly',
  min_quantity: 5,
  start_date: '2026-11-01',
  end_date: '2027-12-31',
  auto_close: true,
  can_pause: true,
};

function html(element) {
  return renderToStaticMarkup(createElement(() => element));
}
const list = async (searchParams = {}) =>
  html(await PlansPage({ searchParams: Promise.resolve(searchParams) }));
const detail = async (id) => html(await PlanPage({ params: Promise.resolve({ id }) }));
const edit = async (id) => html(await EditPlanPage({ params: Promise.resolve({ id }) }));
const inputNamed = (page, name) => new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(page)[0];

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

/** Fixes today for the badges. Call it after logging in: sessions use the real clock in SQL. */
function freezeTodayAt2026_10_31() {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T06:00:00Z') });
}

beforeEach(async () => {
  cookieJar.clear();
  await resetTables();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('plan pages as admin', () => {
  beforeEach(async () => logIn(await createAdmin()));

  it('lists every column, the write control and the scheduled badge', async () => {
    await createPlan(CLOUD_CRM_MONTHLY);
    freezeTodayAt2026_10_31();
    const page = await list();
    for (const text of [
      'New plan',
      'CloudCRM Monthly',
      '₹1,000.00',
      'Monthly',
      '>5<',
      '1 Nov 2026',
      '31 Dec 2027',
      'Scheduled',
      'Billing period',
      'Min. quantity',
      'Availability',
    ]) {
      expect(page).toContain(text);
    }
  });

  it('shows the on-sale and ended badges', async () => {
    await createPlan({ ...CLOUD_CRM_MONTHLY, name: 'Now', start_date: '2026-01-01' });
    await createPlan({
      ...CLOUD_CRM_MONTHLY,
      name: 'Past',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
    freezeTodayAt2026_10_31();
    const page = await list();
    expect(page).toContain('On sale');
    expect(page).toContain('Ended');
  });

  it('filters archived, never calling one on sale', async () => {
    const plan = await createPlan({ ...CLOUD_CRM_MONTHLY, start_date: '2026-01-01' });
    await archivePlan(plan.id);
    freezeTodayAt2026_10_31();

    expect(await list()).toContain('No plans yet');

    const page = await list({ status: 'archived' });
    expect(page).toContain('Archived');
    expect(page).toContain('CloudCRM Monthly');
    expect(page).not.toContain('On sale');
    expect(page).toContain('aria-current="true"');
  });

  it('copes with an empty search, a page past the end and bad params', async () => {
    await createPlan(CLOUD_CRM_MONTHLY);
    expect(await list({ q: 'zzz' })).toContain('Nothing matches');
    expect(await list({ page: '50' })).toContain('Nothing on this page');
    expect(
      await list({ page: 'abc', pageSize: '-3', status: ['x', 'y'], q: ['a', 'b'] }),
    ).toContain('Plans');
    expect(await list({ q: '%_\\' })).toContain('No plans found');
  });

  it('keeps the search when switching filter, and status in search and paging', async () => {
    await db('plans').insert(
      Array.from({ length: 21 }, (_, index) => ({
        name: `P${String(index).padStart(2, '0')}`,
        price: '1.00',
        billing_period: 'daily',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        is_active: false,
      })),
    );
    const page = await list({ q: 'P', status: 'archived' });
    expect(page).toContain('href="/plans?q=P"');
    expect(page).toContain('href="/plans?q=P&amp;status=archived&amp;page=2"');
    expect(page).toContain('name="status"');
  });

  it('renders the options as allowed and not allowed', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    const page = await detail(String(plan.id));
    expect(page.match(/>Allowed</g)).toHaveLength(2);
    expect(page.match(/>Not allowed</g)).toHaveLength(2);
    for (const text of [
      'Auto-close at the end',
      'Close early',
      'Pause',
      'Renew',
      'Edit plan',
      'Archive plan',
      '1 Nov 2026 to 31 Dec 2027',
      '₹1,000.00',
    ]) {
      expect(page).toContain(text);
    }
  });

  it('pre-fills the edit form', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    const page = await edit(String(plan.id));
    expect(page).toContain(`type="hidden" name="id" value="${plan.id}"`);
    for (const value of ['CloudCRM Monthly', '1000.00', '5', '2026-11-01', '2027-12-31']) {
      expect(page).toContain(`value="${value}"`);
    }
    expect(page).toMatch(/<option value="monthly" selected/);
    expect(inputNamed(page, 'auto_close')).toContain('checked');
    expect(inputNamed(page, 'can_pause')).toContain('checked');
    expect(inputNamed(page, 'can_close_early')).not.toContain('checked');
    expect(inputNamed(page, 'can_renew')).not.toContain('checked');
  });

  it('renders a blank new form', async () => {
    const page = html(await NewPlanPage());
    for (const text of [
      'Create plan',
      'Auto-close at the end',
      'Close early',
      'Pause',
      'Renew',
      'Minimum quantity',
      'type="date"',
    ]) {
      expect(page).toContain(text);
    }
    expect(page).toMatch(/<option value="monthly" selected/);
  });

  it('offers restore, not edit, on an archived plan and redirects its edit page', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    await archivePlan(plan.id);
    const page = await detail(String(plan.id));
    expect(page).toContain('Restore plan');
    expect(page).toContain('This plan is archived');
    expect(page).not.toContain('Edit plan');
    await expect(edit(String(plan.id))).rejects.toThrow(`REDIRECT:/plans/${plan.id}`);
  });

  it.each(['abc', '0', '-1', '1.5', '99999999999', '2147483648', '999', '007'])(
    'gives notFound for id %j',
    async (id) => {
      await createPlan(CLOUD_CRM_MONTHLY);
      await expect(detail(id)).rejects.toThrow('NOT_FOUND');
      await expect(edit(id)).rejects.toThrow('NOT_FOUND');
    },
  );
});

describe('plan pages as staff', () => {
  beforeEach(async () => logIn(await createStaff()));

  it('hides every write control', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    const listing = await list();
    expect(listing).toContain('CloudCRM Monthly');
    expect(listing).not.toContain('New plan');
    expect(listing).not.toContain('/plans/new');

    const page = await detail(String(plan.id));
    expect(page).toContain('Allowed');
    for (const text of ['Edit plan', 'Archive', 'Restore', '/edit']) {
      expect(page).not.toContain(text);
    }
    expect(page).not.toContain('<form');
  });

  it('hides restore on an archived plan and the empty-state link', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    await archivePlan(plan.id);
    expect(await detail(String(plan.id))).not.toContain('Restore plan');
    expect(await list()).not.toContain('New plan');
  });

  it('is sent to /forbidden by the write pages', async () => {
    const plan = await createPlan(CLOUD_CRM_MONTHLY);
    await expect(NewPlanPage()).rejects.toThrow('REDIRECT:/forbidden');
    await expect(edit(String(plan.id))).rejects.toThrow('REDIRECT:/forbidden');
  });
});

describe('plan pages logged out', () => {
  it('sends every page to /login', async () => {
    await expect(list()).rejects.toThrow('REDIRECT:/login');
    await expect(detail('1')).rejects.toThrow('REDIRECT:/login');
    await expect(edit('1')).rejects.toThrow('REDIRECT:/login');
    await expect(NewPlanPage()).rejects.toThrow('REDIRECT:/login');
  });
});
