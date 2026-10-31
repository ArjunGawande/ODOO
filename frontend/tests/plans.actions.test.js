import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';

import { resetTables } from '../../backend/tests/helpers/db';
import { createAdmin, createCustomer, createSessionFor, createStaff } from '../../backend/tests/helpers/factories';

// Only the Next runtime is faked: the guards, session lookup and service are real.
const cookieJar = vi.hoisted(() => new Map());
const revalidated = vi.hoisted(() => []);

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (path) => revalidated.push(path),
}));

const { archivePlanAction, createPlanAction, restorePlanAction, updatePlanAction } = await import(
  '@/actions/plans'
);
const { db } = await import('@backend/lib/db');
const { archivePlan, createPlan, getPlan } = await import('@backend/services/plans');

const cloudCrm = {
  name: 'CloudCRM Monthly',
  price: '1000.00',
  billing_period: 'monthly',
  min_quantity: '5',
  start_date: '2026-11-01',
  end_date: '2027-12-31',
  auto_close: 'on',
  can_pause: 'on',
};

const serviceValues = {
  name: 'CloudCRM Monthly',
  price: '1000.00',
  billing_period: 'monthly',
  min_quantity: 5,
  start_date: '2026-11-01',
  end_date: '2027-12-31',
  auto_close: true,
  can_pause: true,
};

function toFormData(fields) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

async function planCount() {
  return (await db('plans').count({ total: '*' }).first()).total;
}

beforeEach(async () => {
  cookieJar.clear();
  revalidated.length = 0;
  await resetTables();
});

describe('write permission on every action', () => {
  const actions = [
    ['createPlanAction', createPlanAction],
    ['updatePlanAction', updatePlanAction],
    ['archivePlanAction', archivePlanAction],
    ['restorePlanAction', restorePlanAction],
  ];

  it.each(actions)('%s sends a logged-out visitor to /login', async (_name, action) => {
    const plan = await createPlan(serviceValues);
    const form = toFormData({ ...cloudCrm, id: String(plan.id), name: 'Hacked' });

    await expect(action(null, form)).rejects.toThrow('REDIRECT:/login');
    expect((await getPlan(plan.id)).name).toBe('CloudCRM Monthly');
  });

  it.each(actions)('%s refuses staff and changes nothing', async (_name, action) => {
    const plan = await createPlan(serviceValues);
    await logIn(await createStaff());
    const form = toFormData({ ...cloudCrm, id: String(plan.id), name: 'Hacked' });

    await expect(action(null, form)).rejects.toThrow('REDIRECT:/forbidden');

    const after = await getPlan(plan.id);
    expect(after.name).toBe('CloudCRM Monthly');
    expect(after.is_active).toBe(true);
    expect(await planCount()).toBe(1);
    expect(revalidated).toEqual([]);
  });

  it.each(actions)('%s refuses a customer', async (_name, action) => {
    await logIn(await createCustomer());
    await expect(action(null, toFormData(cloudCrm))).rejects.toThrow('REDIRECT:/forbidden');
    expect(await planCount()).toBe(0);
  });

  it('checks permission before validating, so staff learn nothing from field errors', async () => {
    await logIn(await createStaff());
    await expect(createPlanAction(null, toFormData({}))).rejects.toThrow('REDIRECT:/forbidden');
  });
});

describe('as admin', () => {
  beforeEach(async () => {
    await logIn(await createAdmin());
  });

  it('creates the brief example and goes to its page', async () => {
    await expect(createPlanAction(null, toFormData(cloudCrm))).rejects.toThrow('REDIRECT:/plans/1');

    expect(await getPlan(1)).toMatchObject({
      name: 'CloudCRM Monthly',
      billing_period: 'monthly',
      min_quantity: 5,
      start_date: '2026-11-01',
      end_date: '2027-12-31',
      auto_close: true,
      can_close_early: false,
      can_pause: true,
      can_renew: false,
    });
    expect(revalidated).toContain('/plans');
    expect(revalidated).toContain('/dashboard');
  });

  it('returns field errors and saves nothing for invalid input', async () => {
    const result = await createPlanAction(
      null,
      toFormData({ ...cloudCrm, min_quantity: '0', end_date: '2026-10-01' }),
    );

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.min_quantity).toBeTruthy();
    expect(result.fieldErrors.end_date).toBeTruthy();
    expect(await planCount()).toBe(0);
  });

  it('returns a field error for a duplicate name', async () => {
    await createPlan(serviceValues);
    const result = await createPlanAction(null, toFormData({ ...cloudCrm, name: 'CLOUDCRM monthly' }));

    expect(result.ok).toBe(false);
    expect(result.fieldErrors.name).toMatch(/already called/);
  });

  it('saves unchecked boxes as false through the update action', async () => {
    const plan = await createPlan(serviceValues);
    const { auto_close, can_pause, ...unchecked } = cloudCrm;

    await expect(
      updatePlanAction(null, toFormData({ ...unchecked, id: String(plan.id) })),
    ).rejects.toThrow(`REDIRECT:/plans/${plan.id}`);

    expect(await getPlan(plan.id)).toMatchObject({ auto_close: false, can_pause: false });
    expect(revalidated).toContain(`/plans/${plan.id}`);
  });

  it.each(['abc', '', '0', '99999999999999'])('update refuses the bad id %j', async (id) => {
    const result = await updatePlanAction(null, toFormData({ ...cloudCrm, id }));
    expect(result).toEqual({ ok: false, message: 'This plan no longer exists.' });
  });

  it('update reports a plan that has gone', async () => {
    const result = await updatePlanAction(null, toFormData({ ...cloudCrm, id: '999' }));
    expect(result).toEqual({ ok: false, message: 'This plan no longer exists.' });
  });

  it('update refuses an archived plan', async () => {
    const plan = await createPlan(serviceValues);
    await archivePlan(plan.id);

    const result = await updatePlanAction(null, toFormData({ ...cloudCrm, id: String(plan.id) }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Restore it before editing/);
  });

  it('archives and restores', async () => {
    const plan = await createPlan(serviceValues);
    const form = toFormData({ id: String(plan.id) });

    expect(await archivePlanAction(null, form)).toEqual({ ok: true, message: 'Plan archived.' });
    expect((await getPlan(plan.id)).is_active).toBe(false);

    expect(await restorePlanAction(null, form)).toEqual({ ok: true, message: 'Plan restored.' });
    expect((await getPlan(plan.id)).is_active).toBe(true);
  });

  it('restore clash returns a friendly message instead of throwing', async () => {
    const old = await createPlan(serviceValues);
    await archivePlan(old.id);
    await createPlan({ ...serviceValues, name: 'cloudcrm monthly' });

    const result = await restorePlanAction(null, toFormData({ id: String(old.id) }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already called "CloudCRM Monthly"/);
    expect((await getPlan(old.id)).is_active).toBe(false);
  });

  it.each([
    ['archivePlanAction', archivePlanAction],
    ['restorePlanAction', restorePlanAction],
  ])('%s refuses a bad id', async (_name, action) => {
    const result = await action(null, toFormData({ id: 'abc' }));
    expect(result).toEqual({ ok: false, message: 'This plan no longer exists.' });
  });
});
