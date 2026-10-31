import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@backend/lib/db';
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from '@backend/lib/errors';

import { resetTables } from './helpers/db';
import { createUser } from './helpers/factories';

const product = { name: 'CloudCRM', type: 'service', sales_price: '1000.00' };
const plan = {
  name: 'CloudCRM Monthly',
  price: '1000.00',
  billing_period: 'monthly',
  start_date: '2026-11-01',
  end_date: '2027-12-31',
};

async function failure(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('Expected the query to fail');
}

beforeEach(resetTables);

describe('type parsers', () => {
  it('keeps money as strings', async () => {
    await db('products').insert(product);
    const row = await db('products').first();
    expect(row.sales_price).toBe('1000.00');
    expect(row.cost_price).toBe('0.00');
  });

  it('keeps date columns as YYYY-MM-DD strings', async () => {
    await db('plans').insert(plan);
    const row = await db('plans').first();
    expect(row.start_date).toBe('2026-11-01');
    expect(row.end_date).toBe('2027-12-31');
  });

  it('keeps timestamps as Date objects', async () => {
    await db('products').insert(product);
    expect((await db('products').first()).created_at).toBeInstanceOf(Date);
  });

  it('returns count(*) as a number', async () => {
    await db('products').insert(product);
    const { count } = await db('products').count('* as count').first();
    expect(count).toBe(1);
  });

  it('computes the final price in SQL as an exact string', async () => {
    const [{ id }] = await db('products').insert(product).returning('id');
    await db('product_variants').insert({
      product_id: id,
      attribute: 'Brand',
      value: 'Odoo',
      extra_price: '560.00',
    });
    const row = await db('product_variants as v')
      .join('products as p', 'p.id', 'v.product_id')
      .select(db.raw('p.sales_price + v.extra_price AS final_price'))
      .first();
    expect(row.final_price).toBe('1560.00');
  });
});

describe('updated_at trigger', () => {
  it.each([
    ['users', { name: 'A', email: 'a@example.test' }, { name: 'B' }],
    ['products', product, { name: 'Renamed' }],
    ['plans', plan, { name: 'Renamed' }],
  ])('maintains %s.updated_at', async (table, row, change) => {
    const [before] = await db(table).insert(row).returning('*');
    await db.raw('SELECT pg_sleep(0.01)');
    const [after] = await db(table).where('id', before.id).update(change).returning('*');
    expect(after.updated_at.getTime()).toBeGreaterThan(before.updated_at.getTime());
    expect(after.created_at.getTime()).toBe(before.created_at.getTime());
  });
});

describe('users', () => {
  it('rejects a duplicate email in any case', async () => {
    await createUser({ email: 'owner@sharma.in' });
    const err = await failure(createUser({ email: 'OWNER@sharma.in' }));
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(err, 'users_email_lower_unique')).toBe(true);
    expect(isUniqueViolation(err, 'other_constraint')).toBe(false);
  });

  it('checks the role and defaults to customer', async () => {
    const err = await failure(createUser({ role: 'root' }));
    expect(isCheckViolation(err, 'users_role_check')).toBe(true);
    const [row] = await db('users').insert({ name: 'A', email: 'a@example.test' }).returning('*');
    expect(row).toMatchObject({ role: 'customer', is_active: true, password_hash: null });
  });
});

describe('password_reset_tokens', () => {
  it('checks the purpose and cascades with the user', async () => {
    const user = await createUser();
    const token = {
      user_id: user.id,
      token_hash: 'a'.repeat(64),
      expires_at: new Date(Date.now() + 1000),
    };
    const err = await failure(db('password_reset_tokens').insert({ ...token, purpose: 'other' }));
    expect(isCheckViolation(err, 'password_reset_tokens_purpose_check')).toBe(true);

    await db('password_reset_tokens').insert({ ...token, purpose: 'invite' });
    const duplicate = await failure(db('password_reset_tokens').insert({ ...token, purpose: 'reset' }));
    expect(isUniqueViolation(duplicate, 'password_reset_tokens_token_hash_unique')).toBe(true);

    await db('users').where('id', user.id).del();
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });
});

describe('products', () => {
  it('allows one active row per name, ignoring case', async () => {
    await db('products').insert(product);
    const err = await failure(db('products').insert({ ...product, name: 'CLOUDCRM' }));
    expect(isUniqueViolation(err, 'products_name_active_unique')).toBe(true);
  });

  it('frees the name on archive and blocks a clashing restore', async () => {
    await db('products').insert({ ...product, is_active: false });
    await db('products').insert(product);
    const err = await failure(db('products').where('is_active', false).update({ is_active: true }));
    expect(isUniqueViolation(err, 'products_name_active_unique')).toBe(true);
  });

  it.each([
    ['products_type_check', { type: 'other' }],
    ['products_sales_price_check', { sales_price: '-1.00' }],
    ['products_cost_price_check', { cost_price: '-1.00' }],
  ])('enforces %s', async (constraint, change) => {
    const err = await failure(db('products').insert({ ...product, ...change }));
    expect(isCheckViolation(err, constraint)).toBe(true);
  });
});

describe('product_variants', () => {
  it('enforces active uniqueness, the extra check and the restricted delete', async () => {
    const [{ id }] = await db('products').insert(product).returning('id');
    const variant = { product_id: id, attribute: 'Brand', value: 'Odoo', extra_price: '560.00' };
    await db('product_variants').insert(variant);

    const duplicate = await failure(
      db('product_variants').insert({ ...variant, attribute: 'BRAND', value: 'ODOO' }),
    );
    expect(isUniqueViolation(duplicate, 'product_variants_active_unique')).toBe(true);

    const negative = await failure(
      db('product_variants').insert({ ...variant, value: 'SAP', extra_price: '-1.00' }),
    );
    expect(isCheckViolation(negative, 'product_variants_extra_price_check')).toBe(true);

    const restricted = await failure(db('products').where('id', id).del());
    expect(isForeignKeyViolation(restricted, 'product_variants_product_id_fkey')).toBe(true);

    await db('product_variants').update({ is_active: false });
    await expect(db('product_variants').insert(variant)).resolves.toBeDefined();
  });
});

describe('plans', () => {
  it('allows one active row per name, ignoring case', async () => {
    await db('plans').insert(plan);
    const err = await failure(db('plans').insert({ ...plan, name: 'cloudcrm monthly' }));
    expect(isUniqueViolation(err, 'plans_name_active_unique')).toBe(true);
  });

  it('allows a single-day plan', async () => {
    await expect(
      db('plans').insert({ ...plan, start_date: '2026-11-01', end_date: '2026-11-01' }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['plans_price_check', { price: '-1.00' }],
    ['plans_billing_period_check', { billing_period: 'hourly' }],
    ['plans_min_quantity_check', { min_quantity: 0 }],
    ['plans_dates_check', { start_date: '2027-01-02', end_date: '2027-01-01' }],
  ])('enforces %s', async (constraint, change) => {
    const err = await failure(db('plans').insert({ ...plan, ...change }));
    expect(isCheckViolation(err, constraint)).toBe(true);
  });
});

describe('error helpers', () => {
  it('reject unrelated errors', () => {
    expect(isUniqueViolation(new Error('x'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isCheckViolation(undefined)).toBe(false);
    expect(isForeignKeyViolation({ code: '23505' })).toBe(false);
  });
});
