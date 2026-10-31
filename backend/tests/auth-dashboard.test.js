import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@backend/lib/db';
import { getDashboardCounts } from '@backend/services/dashboard';
import { listSellablePlans } from '@backend/services/plans';

import { resetTables } from './helpers/db';
import { createAdmin, createCustomer, createStaff } from './helpers/factories';

function product(overrides = {}) {
  return { name: 'CloudCRM', type: 'service', sales_price: '1000.00', ...overrides };
}

function plan(overrides = {}) {
  return {
    name: 'CloudCRM Monthly',
    price: '1000.00',
    billing_period: 'monthly',
    start_date: '2026-11-01',
    end_date: '2027-12-31',
    ...overrides,
  };
}

beforeEach(resetTables);

describe('getDashboardCounts', () => {
  it('is all zeros on an empty database', async () => {
    expect(await getDashboardCounts('2026-11-01')).toEqual({
      activeProducts: 0,
      activePlans: 0,
      plansOnSale: 0,
      customers: 0,
    });
  });

  it('counts plain numbers and leaves out archived rows', async () => {
    await db('products').insert([
      product(),
      product({ name: 'Backup' }),
      product({ name: 'Old', is_active: false }),
    ]);
    await db('plans').insert([
      plan(),
      plan({ name: 'Yearly', billing_period: 'yearly' }),
      plan({ name: 'Archived', is_active: false }),
    ]);

    const counts = await getDashboardCounts('2026-11-15');

    expect(counts).toMatchObject({ activeProducts: 2, activePlans: 2, plansOnSale: 2 });
    expect(typeof counts.activeProducts).toBe('number');
  });

  it('applies the sale window, inclusive of both ends', async () => {
    await db('plans').insert(plan());

    expect((await getDashboardCounts('2026-10-31')).plansOnSale).toBe(0);
    expect((await getDashboardCounts('2026-11-01')).plansOnSale).toBe(1);
    expect((await getDashboardCounts('2027-12-31')).plansOnSale).toBe(1);
    expect((await getDashboardCounts('2028-01-01')).plansOnSale).toBe(0);
  });

  it('agrees with listSellablePlans on every side of the sale window', async () => {
    await db('plans').insert([
      plan(),
      plan({ name: 'Started', start_date: '2026-01-01', end_date: '2026-11-01' }),
      plan({ name: 'Over', start_date: '2025-01-01', end_date: '2025-12-31' }),
      plan({ name: 'Single day', start_date: '2026-11-01', end_date: '2026-11-01' }),
      plan({ name: 'Archived now', start_date: '2026-01-01', is_active: false }),
    ]);

    for (const day of ['2025-06-01', '2026-10-31', '2026-11-01', '2026-11-02', '2028-01-01']) {
      const { plansOnSale } = await getDashboardCounts(day);
      expect(plansOnSale).toBe((await listSellablePlans(day)).length);
    }
  });

  it('refuses an invalid date, as listSellablePlans does', async () => {
    await expect(getDashboardCounts('2026-02-30')).rejects.toThrow(TypeError);
  });

  it('runs one query', async () => {
    const queries = [];
    const record = (query) => queries.push(query.sql);
    db.on('query', record);
    try {
      await getDashboardCounts('2026-11-01');
    } finally {
      db.removeListener('query', record);
    }
    expect(queries).toHaveLength(1);
  });

  it('counts active customers only', async () => {
    await createAdmin();
    await createStaff();
    await createCustomer();
    await createCustomer();
    await createCustomer({ is_active: false });

    expect((await getDashboardCounts('2026-11-01')).customers).toBe(2);
  });
});
