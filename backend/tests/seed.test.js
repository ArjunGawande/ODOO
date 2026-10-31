import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@backend/lib/db';

import { seed } from '../db/seeds/01_demo_data.js';

import { resetTables } from './helpers/db';

const ADMIN = { email: 'owner@realcompany.example', password: 'Real!Admin2026' };

function useProduction() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SEED_ADMIN_EMAIL', ADMIN.email);
  vi.stubEnv('SEED_ADMIN_PASSWORD', ADMIN.password);
}

async function counts() {
  const [users, products, variants, plans] = await Promise.all(
    ['users', 'products', 'product_variants', 'plans'].map((table) => db(table)),
  );
  return {
    users: users.length,
    products: products.length,
    variants: variants.length,
    plans: plans.length,
  };
}

beforeEach(resetTables);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('seed outside production', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('creates the admin, the demo logins and the demo catalogue', async () => {
    await seed(db);

    const emails = (await db('users').orderBy('role').select('email', 'role')).map((row) => row.role);
    expect(emails).toEqual(['admin', 'customer', 'staff']);
    expect(await db('users').where('email', 'staff@brightloop.in').first()).toBeTruthy();
    expect(await db('users').where('email', 'owner@sharma.in').first()).toBeTruthy();
    expect(await counts()).toEqual({ users: 3, products: 1, variants: 1, plans: 1 });
  });

  it('adds nothing when run again', async () => {
    await seed(db);
    await seed(db);
    expect(await counts()).toEqual({ users: 3, products: 1, variants: 1, plans: 1 });
  });

  it('falls back to the default admin without the env vars', async () => {
    vi.stubEnv('SEED_ADMIN_EMAIL', '');
    vi.stubEnv('SEED_ADMIN_PASSWORD', '');

    await seed(db);

    expect(await db('users').where('role', 'admin').first('email')).toEqual({
      email: 'admin@brightloop.in',
    });
  });
});

describe('seed in production', () => {
  it('creates only the admin', async () => {
    useProduction();

    await seed(db);

    const users = await db('users').select('email', 'role');
    expect(users).toEqual([{ email: ADMIN.email, role: 'admin' }]);
    expect(await counts()).toEqual({ users: 1, products: 0, variants: 0, plans: 0 });
  });

  it('never creates the public demo accounts, even on a re-run', async () => {
    useProduction();

    await seed(db);
    await seed(db);

    const demo = await db('users').whereIn('email', ['staff@brightloop.in', 'owner@sharma.in']);
    expect(demo).toEqual([]);
    expect((await counts()).users).toBe(1);
  });

  it.each([
    ['the email', 'SEED_ADMIN_EMAIL'],
    ['the password', 'SEED_ADMIN_PASSWORD'],
  ])('refuses to run without %s', async (_label, variable) => {
    useProduction();
    vi.stubEnv(variable, '');

    await expect(seed(db)).rejects.toThrow('must both be set in production');

    expect(await counts()).toEqual({ users: 0, products: 0, variants: 0, plans: 0 });
  });

  it('refuses a blank email', async () => {
    useProduction();
    vi.stubEnv('SEED_ADMIN_EMAIL', '   ');

    await expect(seed(db)).rejects.toThrow('must both be set in production');
  });
});
