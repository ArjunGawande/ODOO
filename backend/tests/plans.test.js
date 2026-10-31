import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fromZodError } from '@backend/lib/action-result';
import { db } from '@backend/lib/db';
import { isCheckViolation } from '@backend/lib/errors';
import {
  BILLING_PERIODS,
  parsePlanForm,
  parsePlanId,
  parsePlanStatus,
  planFormValues,
  planSchema,
} from '@backend/lib/validation/plans';
import {
  archivePlan,
  createPlan,
  getPlan,
  listPlans,
  listSellablePlans,
  PlanError,
  planAvailability,
  restorePlan,
  updatePlan,
} from '@backend/services/plans';

import { resetTables } from './helpers/db';

// The form as a browser sends it for the brief's example.
const cloudCrmForm = {
  name: 'CloudCRM Monthly',
  price: '1000.00',
  billing_period: 'monthly',
  min_quantity: '5',
  start_date: '2026-11-01',
  end_date: '2027-12-31',
  auto_close: 'on',
  can_pause: 'on',
};

function toFormData(fields) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function validated(overrides = {}) {
  return planSchema.parse({ ...planFormValues(toFormData(cloudCrmForm)), ...overrides });
}

function fieldError(overrides, field) {
  const result = planSchema.safeParse({ ...planFormValues(toFormData(cloudCrmForm)), ...overrides });
  expect(result.success).toBe(false);
  return fromZodError(result.error).fieldErrors[field];
}

function rawPlan(overrides = {}) {
  return {
    name: 'Raw plan',
    price: '10.00',
    billing_period: 'monthly',
    min_quantity: 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    ...overrides,
  };
}

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the call to fail');
}

async function waitForBlockedQuery() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await db.raw(
      `SELECT count(*) AS blocked FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].blocked > 0) return;
  }
  throw new Error('The racing query never blocked on the unique index');
}

/**
 * Forces the race deterministically. `claim` takes the name in a transaction that
 * stays uncommitted, so the service's pre-check can't see it and its write has to
 * wait on the unique index. Committing then makes that write fail with 23505.
 */
async function raceAgainstClaim(claim, racingWrite) {
  const holder = await db.transaction();
  await claim(holder);
  const outcome = failure(racingWrite());
  await waitForBlockedQuery();
  await holder.commit();
  return outcome;
}

beforeEach(resetTables);

describe('CloudCRM Monthly worked example', () => {
  it('saves the brief example from the submitted form', async () => {
    const parsed = parsePlanForm(toFormData(cloudCrmForm));
    expect(parsed.success).toBe(true);

    const { id } = await createPlan(parsed.data);
    const plan = await getPlan(id);

    expect(plan).toMatchObject({
      name: 'CloudCRM Monthly',
      price: '1000.00',
      billing_period: 'monthly',
      min_quantity: 5,
      start_date: '2026-11-01',
      end_date: '2027-12-31',
      auto_close: true,
      can_pause: true,
      can_close_early: false,
      can_renew: false,
      is_active: true,
    });
  });

  it.each([
    ['2026-10-31', 'scheduled'],
    ['2026-11-01', 'on_sale'],
    ['2027-12-31', 'on_sale'],
    ['2028-01-01', 'ended'],
  ])('planAvailability on %s is %s', (today, expected) => {
    const plan = { start_date: '2026-11-01', end_date: '2027-12-31' };
    expect(planAvailability(plan, today)).toBe(expected);
  });
});

describe('planAvailability', () => {
  it('treats a single-day plan as on sale for that day only', () => {
    const plan = { start_date: '2026-11-01', end_date: '2026-11-01' };
    expect(planAvailability(plan, '2026-10-31')).toBe('scheduled');
    expect(planAvailability(plan, '2026-11-01')).toBe('on_sale');
    expect(planAvailability(plan, '2026-11-02')).toBe('ended');
  });

  it('compares across a year change in calendar order', () => {
    const plan = { start_date: '2026-12-31', end_date: '2027-01-01' };
    expect(planAvailability(plan, '2026-12-31')).toBe('on_sale');
    expect(planAvailability(plan, '2027-01-01')).toBe('on_sale');
    expect(planAvailability(plan, '2027-01-02')).toBe('ended');
  });

  it('refuses a today that is not a date string, instead of comparing nonsense', () => {
    const plan = { start_date: '2026-11-01', end_date: '2027-12-31' };
    expect(() => planAvailability(plan, new Date())).toThrow(TypeError);
  });
});

describe('date rules', () => {
  it('accepts a single-day plan through zod and the database', async () => {
    const values = validated({ start_date: '2026-11-01', end_date: '2026-11-01' });
    const plan = await createPlan(values);
    expect(plan.start_date).toBe('2026-11-01');
    expect(plan.end_date).toBe('2026-11-01');
  });

  it('rejects an end before the start in zod, on end_date', () => {
    const message = fieldError({ start_date: '2026-11-02', end_date: '2026-11-01' }, 'end_date');
    expect(message).toMatch(/before the start date/);
  });

  it('rejects an end before the start in the database when zod is bypassed', async () => {
    const err = await failure(
      createPlan({ ...validated(), start_date: '2026-11-02', end_date: '2026-11-01' }),
    );
    expect(isCheckViolation(err, 'plans_dates_check')).toBe(true);
    expect(await db('plans').count({ total: '*' }).first()).toEqual({ total: 0 });
  });

  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-04-31', '2026-00-10', '01/11/2026', '2026-1-1', 'soon'])(
    'rejects %s instead of rolling it over',
    (date) => {
      expect(fieldError({ start_date: date, end_date: '2027-12-31' }, 'start_date')).toMatch(/real calendar date/);
      expect(fieldError({ start_date: '2020-01-01', end_date: date }, 'end_date')).toMatch(/real calendar date/);
    },
  );

  it('accepts 29 February in a leap year', () => {
    expect(validated({ start_date: '2028-02-29', end_date: '2028-02-29' }).start_date).toBe('2028-02-29');
  });

  it('requires both dates', () => {
    expect(fieldError({ start_date: '' }, 'start_date')).toBe('Enter a start date.');
    expect(fieldError({ end_date: '' }, 'end_date')).toBe('Enter an end date.');
  });

  it.each([
    ['2026-11-01', '2027-12-31'],
    ['2028-02-29', '2028-02-29'],
    ['2026-12-31', '2027-01-01'],
    ['2026-03-29', '2026-10-25'],
  ])('round-trips %s to %s as identical strings', async (start_date, end_date) => {
    const { id, ...returned } = await createPlan(validated({ start_date, end_date }));
    expect([returned.start_date, returned.end_date]).toEqual([start_date, end_date]);

    const read = await getPlan(id);
    expect([read.start_date, read.end_date]).toEqual([start_date, end_date]);

    const { rows } = await listPlans();
    expect([rows[0].start_date, rows[0].end_date]).toEqual([start_date, end_date]);
  });

  it('does not blame a valid end date for an invalid start date', () => {
    const result = planSchema.safeParse({
      ...planFormValues(toFormData(cloudCrmForm)),
      start_date: '2026-13-01',
      end_date: '2026-12-31',
    });
    expect(Object.keys(fromZodError(result.error).fieldErrors)).toEqual(['start_date']);
  });

  it.each([[null], [undefined], ['text'], [{}]])('fails cleanly for the input %j', (input) => {
    expect(planSchema.safeParse(input).success).toBe(false);
  });

  it('reports a bad quantity and reversed dates in the same submit', () => {
    const result = planSchema.safeParse({
      ...planFormValues(toFormData(cloudCrmForm)),
      name: '',
      min_quantity: '0',
      start_date: '2026-11-02',
      end_date: '2026-11-01',
    });
    expect(result.success).toBe(false);
    expect(Object.keys(fromZodError(result.error).fieldErrors).sort()).toEqual([
      'end_date',
      'min_quantity',
      'name',
    ]);
  });
});

describe('billing period', () => {
  it.each(BILLING_PERIODS)('accepts and saves %s', async (billing_period) => {
    const plan = await createPlan(validated({ billing_period }));
    expect(plan.billing_period).toBe(billing_period);
  });

  it('offers exactly the four periods in the brief', () => {
    expect(BILLING_PERIODS).toEqual(['daily', 'weekly', 'monthly', 'yearly']);
  });

  it.each(['quarterly', 'Monthly', ''])('rejects %j', (billing_period) => {
    expect(fieldError({ billing_period }, 'billing_period')).toBe('Choose a billing period.');
  });

  it('is rejected by the database when zod is bypassed', async () => {
    const err = await failure(createPlan({ ...validated(), billing_period: 'quarterly' }));
    expect(isCheckViolation(err, 'plans_billing_period_check')).toBe(true);
  });
});

describe('minimum quantity', () => {
  it.each(['0', '-1', '1.5', '5.0', 'five', '', ' ', '1e3', '+5', '0x10', '2147483648', '9'.repeat(400)])(
    'rejects %j',
    (min_quantity) => {
      expect(fieldError({ min_quantity }, 'min_quantity')).toBe('Enter a whole number of 1 or more.');
    },
  );

  it.each([
    ['1', 1],
    ['5', 5],
    [' 7 ', 7],
    ['2147483647', 2147483647],
  ])('accepts %j as %i', (min_quantity, expected) => {
    expect(validated({ min_quantity }).min_quantity).toBe(expected);
  });

  it('is rejected by the database when zod is bypassed', async () => {
    const err = await failure(createPlan({ ...validated(), min_quantity: 0 }));
    expect(isCheckViolation(err, 'plans_min_quantity_check')).toBe(true);
  });
});

describe('price and name', () => {
  it.each(['-1', '1.999', 'abc', '', '1,000', '12345678901', 'NaN'])('rejects the price %j', (price) => {
    expect(fieldError({ price }, 'price')).toBeTruthy();
  });

  it.each([
    ['0', '0.00'],
    ['1000', '1000.00'],
    ['1000.5', '1000.50'],
    [' 1560.00 ', '1560.00'],
    ['9999999999.99', '9999999999.99'],
  ])('stores the price %j exactly as %s', async (price, stored) => {
    const plan = await createPlan(validated({ price }));
    expect(plan.price).toBe(stored);
  });

  it('trims the name and requires one', () => {
    expect(validated({ name: '  Pro  ' }).name).toBe('Pro');
    expect(fieldError({ name: '   ' }, 'name')).toBe('Enter a plan name.');
  });

  it('limits the name to the column size', async () => {
    expect(fieldError({ name: 'x'.repeat(161) }, 'name')).toMatch(/160/);
    const plan = await createPlan(validated({ name: 'x'.repeat(160) }));
    expect(plan.name).toHaveLength(160);
  });

  it('rejects a NUL byte, which Postgres would refuse', () => {
    expect(fieldError({ name: 'bad\0name' }, 'name')).toMatch(/invalid character/);
  });
});

describe('options', () => {
  const allOn = { auto_close: 'on', can_close_early: 'on', can_pause: 'on', can_renew: 'on' };

  it('reads unchecked boxes, which FormData leaves out, as false', () => {
    const values = planFormValues(toFormData({ name: 'Bare' }));
    expect(values).toMatchObject({
      auto_close: false,
      can_close_early: false,
      can_pause: false,
      can_renew: false,
    });
  });

  it('does not treat a forged value as checked', () => {
    expect(planFormValues(toFormData({ can_renew: 'false' })).can_renew).toBe(false);
  });

  it('saves every option as false when all are unchecked on update', async () => {
    const created = await createPlan(parsePlanForm(toFormData({ ...cloudCrmForm, ...allOn })).data);
    expect(created).toMatchObject({
      auto_close: true,
      can_close_early: true,
      can_pause: true,
      can_renew: true,
    });

    const { auto_close, can_pause, ...unchecked } = cloudCrmForm;
    await updatePlan(created.id, parsePlanForm(toFormData(unchecked)).data);

    expect(await getPlan(created.id)).toMatchObject({
      auto_close: false,
      can_close_early: false,
      can_pause: false,
      can_renew: false,
    });
  });

  it('flips only the boxes that changed on update', async () => {
    const created = await createPlan(validated());
    const { auto_close, ...form } = { ...cloudCrmForm, can_renew: 'on' };
    await updatePlan(created.id, parsePlanForm(toFormData(form)).data);

    expect(await getPlan(created.id)).toMatchObject({
      auto_close: false,
      can_close_early: false,
      can_pause: true,
      can_renew: true,
    });
  });

  it('writes false even if the service is given no option keys at all', async () => {
    const created = await createPlan(validated());
    const { auto_close, can_close_early, can_pause, can_renew, ...withoutOptions } = validated();
    const updated = await updatePlan(created.id, withoutOptions);
    expect(updated.auto_close).toBe(false);
    expect(updated.can_pause).toBe(false);
  });
});

describe('listSellablePlans', () => {
  let queries;
  const record = (query) => queries.push(query);

  beforeEach(() => {
    queries = [];
    db.on('query', record);
  });
  afterEach(() => {
    db.removeListener('query', record);
  });

  async function names(onDate) {
    return (await listSellablePlans(onDate)).map((plan) => plan.name);
  }

  it('includes both boundary days and excludes the days either side', async () => {
    await createPlan(validated());
    expect(await names('2026-10-31')).toEqual([]);
    expect(await names('2026-11-01')).toEqual(['CloudCRM Monthly']);
    expect(await names('2027-12-31')).toEqual(['CloudCRM Monthly']);
    expect(await names('2028-01-01')).toEqual([]);
  });

  it('sells a single-day plan on that day only', async () => {
    await createPlan(validated({ start_date: '2026-11-01', end_date: '2026-11-01' }));
    expect(await names('2026-10-31')).toEqual([]);
    expect(await names('2026-11-01')).toEqual(['CloudCRM Monthly']);
    expect(await names('2026-11-02')).toEqual([]);
  });

  it('excludes archived plans even inside their window', async () => {
    const plan = await createPlan(validated());
    await archivePlan(plan.id);
    expect(await names('2026-11-01')).toEqual([]);
  });

  it('filters in SQL, with the date bound as a parameter', async () => {
    await createPlan(validated());
    queries.length = 0;
    await listSellablePlans('2026-11-01');

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/"is_active" = \$1/);
    expect(queries[0].sql).toMatch(/"start_date" <= \$2/);
    expect(queries[0].sql).toMatch(/"end_date" >= \$3/);
    expect(queries[0].bindings).toEqual([true, '2026-11-01', '2026-11-01']);
  });

  it('orders by name and returns only plans on sale', async () => {
    await createPlan(validated({ name: 'zeta' }));
    await createPlan(validated({ name: 'Alpha' }));
    await createPlan(validated({ name: 'Later', start_date: '2027-01-01' }));
    expect(await names('2026-12-01')).toEqual(['Alpha', 'zeta']);
  });

  it('refuses a bad date rather than sending it to Postgres', async () => {
    await expect(listSellablePlans('2026-02-30')).rejects.toThrow(TypeError);
  });
});

describe('listPlans', () => {
  it('pages in SQL with a database total', async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      rawPlan({ name: `Plan ${String(i + 1).padStart(2, '0')}` }),
    );
    await db('plans').insert(rows);

    const first = await listPlans({ pageSize: 20, offset: 0 });
    expect(first.total).toBe(25);
    expect(first.rows).toHaveLength(20);
    expect(first.rows[0].name).toBe('Plan 01');

    const second = await listPlans({ pageSize: 20, offset: 20 });
    expect(second.total).toBe(25);
    expect(second.rows.map((plan) => plan.name)).toEqual([
      'Plan 21',
      'Plan 22',
      'Plan 23',
      'Plan 24',
      'Plan 25',
    ]);
  });

  it('returns no rows but the real total for a page past the end', async () => {
    await db('plans').insert(rawPlan());
    expect(await listPlans({ pageSize: 20, offset: 40 })).toEqual({ rows: [], total: 1 });
  });

  it('searches case-insensitively and counts only the matches', async () => {
    await db('plans').insert([rawPlan({ name: 'CloudCRM Monthly' }), rawPlan({ name: 'Other' })]);
    const { rows, total } = await listPlans({ q: 'cloudcrm' });
    expect(total).toBe(1);
    expect(rows[0].name).toBe('CloudCRM Monthly');
  });

  it('treats % and _ in a search as literal text', async () => {
    await db('plans').insert([rawPlan({ name: '100% Off' }), rawPlan({ name: '100 Off' })]);
    expect((await listPlans({ q: '%' })).rows.map((plan) => plan.name)).toEqual(['100% Off']);
    expect((await listPlans({ q: '_' })).total).toBe(0);
  });

  it('shows active plans by default and archived ones on request', async () => {
    const kept = await createPlan(validated({ name: 'Kept' }));
    const gone = await createPlan(validated({ name: 'Gone' }));
    await archivePlan(gone.id);

    const active = await listPlans();
    expect(active.rows.map((plan) => plan.id)).toEqual([kept.id]);
    expect(active.total).toBe(1);

    const archived = await listPlans({ status: 'archived' });
    expect(archived.rows.map((plan) => plan.id)).toEqual([gone.id]);
    expect(archived.total).toBe(1);
  });

  it('keeps a stable order for archived plans that share a name', async () => {
    await db('plans').insert([
      rawPlan({ name: 'Same', is_active: false }),
      rawPlan({ name: 'same', is_active: false }),
    ]);
    const { rows } = await listPlans({ status: 'archived' });
    expect(rows.map((plan) => plan.id)).toEqual([1, 2]);
  });
});

describe('name uniqueness', () => {
  it('rejects a duplicate active name case-insensitively, on the name field', async () => {
    await createPlan(validated());
    const err = await failure(createPlan(validated({ name: 'cloudcrm MONTHLY' })));

    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('name_taken');
    expect(err.field).toBe('name');
    expect(await db('plans').count({ total: '*' }).first()).toEqual({ total: 1 });
  });

  it('turns a lost race on create into the same friendly error', async () => {
    const err = await raceAgainstClaim(
      (holder) => holder('plans').insert(rawPlan({ name: 'CloudCRM Monthly' })),
      () => createPlan(validated()),
    );

    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('name_taken');
    expect(err.field).toBe('name');
    expect(await db('plans').count({ total: '*' }).first()).toEqual({ total: 1 });
  });

  it('leaves a caller transaction usable after a name clash', async () => {
    await createPlan(validated());

    await db.transaction(async (trx) => {
      const err = await failure(createPlan(validated({ name: 'cloudcrm MONTHLY' }), trx));
      expect(err.code).toBe('name_taken');
      // A unique violation would have aborted the transaction, failing this insert.
      await createPlan(validated({ name: 'Other' }), trx);
    });

    expect((await listPlans()).total).toBe(2);
  });

  it('allows keeping the same name, or changing its case, on update', async () => {
    const plan = await createPlan(validated());
    const updated = await updatePlan(plan.id, validated({ name: 'CLOUDCRM MONTHLY', min_quantity: '6' }));
    expect(updated.name).toBe('CLOUDCRM MONTHLY');
    expect(updated.min_quantity).toBe(6);
  });

  it('rejects renaming onto another active plan', async () => {
    await createPlan(validated({ name: 'Taken' }));
    const plan = await createPlan(validated({ name: 'Free' }));

    const err = await failure(updatePlan(plan.id, validated({ name: 'taken' })));
    expect(err.code).toBe('name_taken');
    expect((await getPlan(plan.id)).name).toBe('Free');
  });

  it('turns a lost race on rename into the same friendly error', async () => {
    const first = await createPlan(validated({ name: 'First' }));
    const second = await createPlan(validated({ name: 'Second' }));

    const err = await raceAgainstClaim(
      (holder) => holder('plans').where('id', first.id).update({ name: 'Wanted' }),
      () => updatePlan(second.id, validated({ name: 'Wanted' })),
    );

    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('name_taken');
    expect((await getPlan(second.id)).name).toBe('Second');
  });

  it('allows reusing the name of an archived plan', async () => {
    const old = await createPlan(validated());
    await archivePlan(old.id);
    const fresh = await createPlan(validated());
    expect(fresh.id).not.toBe(old.id);
  });
});

describe('archive and restore', () => {
  it('archives and restores, keeping the row', async () => {
    const plan = await createPlan(validated());

    expect((await archivePlan(plan.id)).is_active).toBe(false);
    expect((await getPlan(plan.id)).is_active).toBe(false);

    const restored = await restorePlan(plan.id);
    expect(restored.is_active).toBe(true);
    expect(restored.name).toBe('CloudCRM Monthly');
  });

  it('is harmless when repeated', async () => {
    const plan = await createPlan(validated());
    await archivePlan(plan.id);
    expect((await archivePlan(plan.id)).is_active).toBe(false);
    await restorePlan(plan.id);
    expect((await restorePlan(plan.id)).is_active).toBe(true);
  });

  it('gives a friendly error when a restored name now clashes', async () => {
    const old = await createPlan(validated());
    await archivePlan(old.id);
    await createPlan(validated({ name: 'CLOUDCRM MONTHLY' }));

    const err = await failure(restorePlan(old.id));

    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('name_taken');
    expect(err.message).toMatch(/Rename or archive that plan/);
    expect((await getPlan(old.id)).is_active).toBe(false);
  });

  it('turns a lost race on restore into the same friendly error', async () => {
    const old = await createPlan(validated());
    await archivePlan(old.id);

    const err = await raceAgainstClaim(
      (holder) => holder('plans').insert(rawPlan({ name: 'CloudCRM Monthly' })),
      () => restorePlan(old.id),
    );

    expect(err).toBeInstanceOf(PlanError);
    expect(err.code).toBe('name_taken');
    expect(err.message).toMatch(/Rename or archive that plan/);
    expect((await getPlan(old.id)).is_active).toBe(false);
  });

  it('keeps archived plans read-only until restored', async () => {
    const plan = await createPlan(validated());
    await archivePlan(plan.id);

    const err = await failure(updatePlan(plan.id, validated({ min_quantity: '9' })));

    expect(err.code).toBe('archived');
    expect((await getPlan(plan.id)).min_quantity).toBe(5);
  });

  it('reports a missing plan as not_found', async () => {
    expect((await failure(updatePlan(999, validated()))).code).toBe('not_found');
    expect((await failure(archivePlan(999))).code).toBe('not_found');
    expect((await failure(restorePlan(999))).code).toBe('not_found');
  });
});

describe('plan lookups', () => {
  it('returns null for an unknown id', async () => {
    expect(await getPlan(12345)).toBeNull();
  });

  it('runs inside a caller transaction', async () => {
    await expect(
      db.transaction(async (trx) => {
        await createPlan(validated(), trx);
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect((await listPlans()).total).toBe(0);
  });

  it.each(['abc', '', '0', '-1', '1.5', '1e3', '007', ' 1', '2147483648', '99999999999999999999', '１'])(
    'parsePlanId refuses %j',
    (value) => {
      expect(parsePlanId(value)).toBeNull();
    },
  );

  it('parsePlanId refuses non-strings', () => {
    expect(parsePlanId(null)).toBeNull();
    expect(parsePlanId(undefined)).toBeNull();
    expect(parsePlanId(['1'])).toBeNull();
  });

  it('parsePlanId accepts the integer range', () => {
    expect(parsePlanId('1')).toBe(1);
    expect(parsePlanId('2147483647')).toBe(2147483647);
  });

  it('getPlan accepts the largest id parsePlanId allows', async () => {
    expect(await getPlan(parsePlanId('2147483647'))).toBeNull();
  });

  it('parsePlanStatus falls back to active', () => {
    expect(parsePlanStatus('archived')).toBe('archived');
    expect(parsePlanStatus('active')).toBe('active');
    expect(parsePlanStatus('junk')).toBe('active');
    expect(parsePlanStatus(undefined)).toBe('active');
    expect(parsePlanStatus(['archived'])).toBe('active');
  });
});
