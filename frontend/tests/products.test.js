import { beforeEach, describe, expect, it } from 'vitest';

import { previewFinalPrice, formatExtra } from '@/app/(workspace)/products/price-preview';
import { db } from '@backend/lib/db';
import { formatINR } from '@backend/lib/money';
import { parsePagination } from '@backend/lib/pagination';
import { parseId, parseStatus, productSchema, variantSchema } from '@backend/lib/validation/products';
import {
  addVariant,
  archiveProduct,
  archiveVariant,
  createProduct,
  getProduct,
  getVariant,
  getVariantPrice,
  listProducts,
  listProductsForSale,
  listVariants,
  restoreProduct,
  restoreVariant,
  updateProduct,
  updateVariant,
} from '@backend/services/products';

import { resetTables } from '../../backend/tests/helpers/db';

const CLOUD_CRM = {
  name: 'CloudCRM',
  type: 'service',
  sales_price: '1000.00',
  cost_price: '400.00',
  notes: null,
};
const ODOO = { attribute: 'Brand', value: 'Odoo', extra_price: '560.00' };

async function makeProduct(overrides = {}) {
  const result = await createProduct({ ...CLOUD_CRM, ...overrides });
  expect(result.ok).toBe(true);
  return result.product;
}

async function makeVariant(productId, overrides = {}) {
  const result = await addVariant(productId, { ...ODOO, ...overrides });
  expect(result.ok).toBe(true);
  return result.variant;
}

async function waitForLockWait() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await db.raw(`
      SELECT count(*) AS waiting FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
    `);
    if (rows[0].waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The competing write never blocked on the open transaction.');
}

/**
 * Forces a lost race: `hold` writes in an open transaction, `attempt` passes its
 * pre-check because that row isn't visible yet, blocks on the unique index, and
 * then hits a real 23505 when the transaction commits.
 */
async function loseRace(hold, attempt) {
  const trx = await db.transaction();
  try {
    await hold(trx);
    const pending = attempt();
    await waitForLockWait();
    await trx.commit();
    return await pending;
  } catch (err) {
    if (!trx.isCompleted()) await trx.rollback();
    throw err;
  }
}

beforeEach(resetTables);

describe('worked example from the brief', () => {
  it('prices CloudCRM with the Odoo variant at 1560.00 from SQL', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);

    expect(variant.final_price).toBe('1560.00');
    const { rows } = await listVariants(product.id);
    expect(rows[0].final_price).toBe('1560.00');
    expect((await getVariantPrice(variant.id)).final_price).toBe('1560.00');

    // No final price is stored anywhere.
    const columns = await db('product_variants').columnInfo();
    expect(columns).not.toHaveProperty('final_price');
  });

  it('shows the extra as +₹560.00 and the final price as ₹1,560.00', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    expect(formatExtra(variant.extra_price)).toBe('+₹560.00');
    expect(formatINR(variant.final_price)).toBe('₹1,560.00');
  });

  it('flows a base price change to 1660.00 without touching the variant', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    const before = await db('product_variants').where({ id: variant.id }).first();

    const result = await updateProduct(product.id, { ...CLOUD_CRM, sales_price: '1100.00' });

    expect(result.ok).toBe(true);
    expect((await getVariantPrice(variant.id)).final_price).toBe('1660.00');
    const after = await db('product_variants').where({ id: variant.id }).first();
    expect(after).toEqual(before);
  });

  it('prices the seeded demo product the same way', async () => {
    const { seed } = await import('../../backend/db/seeds/01_demo_data.js');
    await seed(db);
    const { rows } = await listProductsForSale({ q: 'CloudCRM' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sales_price).toBe('1000.00');
    expect(rows[0].variants).toEqual([
      expect.objectContaining({ attribute: 'Brand', value: 'Odoo', final_price: '1560.00' }),
    ]);
  });
});

describe('precise decimals', () => {
  it('adds 0.10 + 0.20 to exactly 0.30 in SQL', async () => {
    const product = await makeProduct({ sales_price: '0.10' });
    const variant = await makeVariant(product.id, { extra_price: '0.20' });
    expect(variant.final_price).toBe('0.30');
  });

  it('adds 0.10 + 0.20 to exactly 0.30 in the client preview', () => {
    expect(previewFinalPrice('0.10', '0.20')).toBe('0.30');
  });

  it('handles the largest allowed amounts in SQL', async () => {
    const product = await makeProduct({ sales_price: '9999999999.99' });
    const variant = await makeVariant(product.id, { extra_price: '9999999999.99' });
    expect(variant.final_price).toBe('19999999999.98');
    expect(formatINR(variant.final_price)).toBe('₹19,99,99,99,999.98');
  });

  it('returns money as strings', async () => {
    const product = await makeProduct({ sales_price: '1000.5' });
    expect(product.sales_price).toBe('1000.50');
    expect(typeof (await getProduct(product.id)).cost_price).toBe('string');
  });
});

describe('client price preview', () => {
  it('computes the worked example', () => {
    expect(previewFinalPrice('1000.00', '560.00')).toBe('1560.00');
    expect(previewFinalPrice('1000.00', ' 560 ')).toBe('1560.00');
  });

  it.each(['', 'abc', '-1', '1.234', '12345678901'])('shows nothing for extra %j', (extra) => {
    expect(previewFinalPrice('1000.00', extra)).toBeNull();
  });
});

describe('productSchema', () => {
  const valid = { name: 'CloudCRM', type: 'service', sales_price: '1000', cost_price: '400.5' };

  function salesPriceError(sales_price) {
    const result = productSchema.safeParse({ ...valid, sales_price });
    expect(result.success).toBe(false);
    return result.error.issues.find((issue) => issue.path[0] === 'sales_price').message;
  }

  it('trims the name and normalises money', () => {
    const { data } = productSchema.safeParse({ ...valid, name: '  CloudCRM ', notes: '  ' });
    expect(data).toEqual({
      name: 'CloudCRM',
      type: 'service',
      sales_price: '1000.00',
      cost_price: '400.50',
      notes: null,
    });
  });

  it('accepts zero and the largest numeric(12,2) value', () => {
    expect(productSchema.safeParse({ ...valid, sales_price: '0' }).success).toBe(true);
    expect(productSchema.safeParse({ ...valid, sales_price: '9999999999.99' }).data.sales_price).toBe(
      '9999999999.99',
    );
  });

  it.each([
    ['negative', '-1.00', /negative/],
    ['three decimals', '1.234', /2 decimal/],
    ['too large', '10000000000.00', /too large/],
    ['non-numeric', 'abc', /amount/],
    ['exponent', '1e5', /amount/],
    ['comma grouped', '1,000', /amount/],
    ['empty', '', /required/],
    ['blank', '   ', /required/],
  ])('rejects %s money', (_label, value, message) => {
    expect(salesPriceError(value)).toMatch(message);
  });

  it('rejects a missing or non-string price', () => {
    expect(salesPriceError(undefined)).toMatch(/required/);
    expect(salesPriceError(1000)).toMatch(/required/);
  });

  it('rejects the same bad money for cost and extra prices', () => {
    expect(productSchema.safeParse({ ...valid, cost_price: '-1' }).success).toBe(false);
    const bad = variantSchema.safeParse({ attribute: 'Brand', value: 'Odoo', extra_price: '1.234' });
    expect(bad.success).toBe(false);
    expect(bad.error.issues[0].path).toEqual(['extra_price']);
  });

  it.each([
    ['an empty name', { name: '   ' }],
    ['a long name', { name: 'x'.repeat(161) }],
    ['a NUL in the name', { name: 'Cloud\0CRM' }],
    ['an unknown type', { type: 'subscription' }],
    ['long notes', { notes: 'x'.repeat(2001) }],
    ['a NUL in the notes', { notes: 'a\0b' }],
  ])('rejects %s', (_label, change) => {
    expect(productSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('variantSchema', () => {
  it('trims text and normalises the extra price', () => {
    const { data } = variantSchema.safeParse({
      attribute: ' Brand ',
      value: ' Odoo ',
      extra_price: '560',
    });
    expect(data).toEqual({ attribute: 'Brand', value: 'Odoo', extra_price: '560.00' });
  });

  it.each([
    ['an empty attribute', { attribute: ' ' }],
    ['a long value', { value: 'x'.repeat(81) }],
    ['an empty extra', { extra_price: '' }],
  ])('rejects %s', (_label, change) => {
    expect(variantSchema.safeParse({ ...ODOO, ...change }).success).toBe(false);
  });
});

describe('parseId and parseStatus', () => {
  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
    [7, 7],
  ])('accepts %j', (input, expected) => {
    expect(parseId(input)).toBe(expected);
  });

  it.each(['0', '-1', '1.5', 'abc', '12abc', ' 1', '1e3', '', '2147483648', '99999999999', null, undefined, ['1']])(
    'rejects %j',
    (input) => {
      expect(parseId(input)).toBeNull();
    },
  );

  it('treats anything but archived as active', () => {
    expect(parseStatus('archived')).toBe('archived');
    expect(parseStatus('active')).toBe('active');
    expect(parseStatus('deleted')).toBe('active');
    expect(parseStatus(['archived'])).toBe('active');
    expect(parseStatus(undefined)).toBe('active');
  });
});

describe('getProduct', () => {
  it.each(['abc', '0', '-1', '99999999999', undefined])('returns null for id %j', async (id) => {
    expect(await getProduct(id)).toBeNull();
  });

  it('returns null for an id with no row', async () => {
    expect(await getProduct(12345)).toBeNull();
  });
});

describe('product names', () => {
  it('rejects a duplicate active name case-insensitively', async () => {
    await makeProduct();
    const result = await createProduct({ ...CLOUD_CRM, name: 'cloudcrm' });
    expect(result).toMatchObject({ ok: false, code: 'name_taken', field: 'name' });
    expect(result.message).toContain('cloudcrm');
    expect(await db('products').count('* as total').first()).toEqual({ total: 1 });
  });

  it('allows the same name again after archiving', async () => {
    const first = await makeProduct();
    await archiveProduct(first.id);
    const second = await makeProduct();
    expect(second.id).not.toBe(first.id);
  });

  it('gives a friendly error when restoring into a name clash', async () => {
    const first = await makeProduct();
    await archiveProduct(first.id);
    await makeProduct({ name: 'CLOUDCRM' });

    const result = await restoreProduct(first.id);

    expect(result).toMatchObject({ ok: false, code: 'name_taken' });
    expect(result.field).toBeUndefined();
    expect(result.message).toMatch(/Can't restore "CloudCRM"/);
    expect((await getProduct(first.id)).is_active).toBe(false);
  });

  it('restores when there is no clash, keeping variants as they were', async () => {
    const product = await makeProduct();
    const kept = await makeVariant(product.id);
    const gone = await makeVariant(product.id, { value: 'Zoho' });
    await archiveVariant(product.id, gone.id);
    await archiveProduct(product.id);

    const result = await restoreProduct(product.id);

    expect(result.ok).toBe(true);
    expect(result.product.is_active).toBe(true);
    expect((await listVariants(product.id)).rows.map((row) => row.id)).toEqual([kept.id]);
  });

  it('lets a product keep its own name when edited, including a case change', async () => {
    const product = await makeProduct();
    const result = await updateProduct(product.id, { ...CLOUD_CRM, name: 'CLOUDCRM' });
    expect(result.ok).toBe(true);
    expect(result.product.name).toBe('CLOUDCRM');
  });

  it('rejects renaming onto another active product', async () => {
    await makeProduct();
    const other = await makeProduct({ name: 'Mailer' });
    const result = await updateProduct(other.id, { ...CLOUD_CRM, name: 'cloudCRM' });
    expect(result).toMatchObject({ ok: false, code: 'name_taken', field: 'name' });
  });

  it('turns a lost create race into a friendly error', async () => {
    const result = await loseRace(
      (trx) => trx('products').insert(CLOUD_CRM),
      () => createProduct({ ...CLOUD_CRM, name: 'cloudcrm' }),
    );
    expect(result).toMatchObject({ ok: false, code: 'name_taken', field: 'name' });
  });

  it('turns a lost restore race into a friendly error', async () => {
    const first = await makeProduct();
    await archiveProduct(first.id);
    const result = await loseRace(
      (trx) => trx('products').insert(CLOUD_CRM),
      () => restoreProduct(first.id),
    );
    expect(result).toMatchObject({ ok: false, code: 'name_taken' });
    expect(result.message).toMatch(/Can't restore "CloudCRM"/);
    expect((await getProduct(first.id)).is_active).toBe(false);
  });

  it('turns a lost rename race into a friendly error', async () => {
    const product = await makeProduct({ name: 'Mailer' });
    const result = await loseRace(
      (trx) => trx('products').insert(CLOUD_CRM),
      () => updateProduct(product.id, CLOUD_CRM),
    );
    expect(result).toMatchObject({ ok: false, code: 'name_taken', field: 'name' });
  });

  it('lets exactly one of many concurrent creates win', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createProduct({ ...CLOUD_CRM })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((entry) => !entry.ok)) {
      expect(result.code).toBe('name_taken');
    }
  });

  it('keeps an outer transaction usable after a clash', async () => {
    await makeProduct();
    await db.transaction(async (trx) => {
      const result = await createProduct(CLOUD_CRM, trx);
      expect(result.ok).toBe(false);
      await createProduct({ ...CLOUD_CRM, name: 'Mailer' }, trx);
    });
    expect(await db('products').count('* as total').first()).toEqual({ total: 2 });
  });
});

describe('archived products are read-only', () => {
  it('refuses edits and variant changes until restored', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    await archiveProduct(product.id);
    const archived = { ok: false, code: 'archived' };

    expect(await updateProduct(product.id, CLOUD_CRM)).toMatchObject(archived);
    expect(await addVariant(product.id, { ...ODOO, value: 'Zoho' })).toMatchObject(archived);
    expect(await updateVariant(product.id, variant.id, ODOO)).toMatchObject(archived);
    expect(await archiveVariant(product.id, variant.id)).toMatchObject(archived);
    expect(await restoreVariant(product.id, variant.id)).toMatchObject(archived);
  });

  it('reports unknown ids without throwing', async () => {
    const notFound = { ok: false, code: 'not_found' };
    expect(await updateProduct(999, CLOUD_CRM)).toMatchObject(notFound);
    expect(await archiveProduct(999)).toMatchObject(notFound);
    expect(await restoreProduct(999)).toMatchObject(notFound);
    expect(await addVariant(999, ODOO)).toMatchObject(notFound);
  });
});

describe('variants', () => {
  it('rejects a duplicate active variant case-insensitively', async () => {
    const product = await makeProduct();
    await makeVariant(product.id);
    const result = await addVariant(product.id, { attribute: 'BRAND', value: 'odoo', extra_price: '1.00' });
    expect(result).toMatchObject({ ok: false, code: 'variant_taken', field: 'value' });
  });

  it('allows the same variant on a different product', async () => {
    const first = await makeProduct();
    const second = await makeProduct({ name: 'Mailer' });
    await makeVariant(first.id);
    await makeVariant(second.id);
  });

  it('lets exactly one of many concurrent adds win', async () => {
    const product = await makeProduct();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => addVariant(product.id, ODOO)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    for (const result of results.filter((entry) => !entry.ok)) {
      expect(result).toMatchObject({ code: 'variant_taken', field: 'value' });
    }
    const { total } = await db('product_variants').count('* as total').first();
    expect(total).toBe(1);
  });

  it('turns a lost add race into a friendly error', async () => {
    const product = await makeProduct();
    const result = await loseRace(
      (trx) => trx('product_variants').insert({ product_id: product.id, ...ODOO }),
      () => addVariant(product.id, ODOO),
    );
    expect(result).toMatchObject({ ok: false, code: 'variant_taken', field: 'value' });
  });

  it('edits a variant, keeping its own values allowed', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    const result = await updateVariant(product.id, variant.id, {
      attribute: 'brand',
      value: 'ODOO',
      extra_price: '600.00',
    });
    expect(result.ok).toBe(true);
    expect(result.variant).toMatchObject({ attribute: 'brand', extra_price: '600.00', final_price: '1600.00' });
  });

  it('rejects editing a variant onto another active one', async () => {
    const product = await makeProduct();
    await makeVariant(product.id);
    const other = await makeVariant(product.id, { value: 'Zoho' });
    const result = await updateVariant(product.id, other.id, ODOO);
    expect(result).toMatchObject({ ok: false, code: 'variant_taken' });
  });

  it('ignores a variant id from another product', async () => {
    const first = await makeProduct();
    const second = await makeProduct({ name: 'Mailer' });
    const variant = await makeVariant(first.id);
    const notFound = { ok: false, code: 'not_found' };

    expect(await updateVariant(second.id, variant.id, ODOO)).toMatchObject(notFound);
    expect(await archiveVariant(second.id, variant.id)).toMatchObject(notFound);
    expect(await restoreVariant(second.id, variant.id)).toMatchObject(notFound);
    expect(await getVariant(second.id, variant.id)).toBeNull();
    expect((await getVariant(first.id, variant.id)).is_active).toBe(true);
  });

  it('refuses to edit an archived variant', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    await archiveVariant(product.id, variant.id);
    expect(await updateVariant(product.id, variant.id, ODOO)).toMatchObject({ ok: false, code: 'archived' });
  });

  it('allows the same variant again after archiving, and blocks restoring the old one', async () => {
    const product = await makeProduct();
    const first = await makeVariant(product.id);
    await archiveVariant(product.id, first.id);
    await makeVariant(product.id);

    const result = await restoreVariant(product.id, first.id);

    expect(result).toMatchObject({ ok: false, code: 'variant_taken' });
    expect(result.message).toMatch(/Can't restore Brand: Odoo/);
  });

  it('turns a lost restore race into a friendly error', async () => {
    const product = await makeProduct();
    const first = await makeVariant(product.id);
    await archiveVariant(product.id, first.id);
    const result = await loseRace(
      (trx) => trx('product_variants').insert({ product_id: product.id, ...ODOO }),
      () => restoreVariant(product.id, first.id),
    );
    expect(result).toMatchObject({ ok: false, code: 'variant_taken' });
    expect(result.message).toMatch(/Can't restore Brand: Odoo/);
  });

  it('restores an archived variant', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    await archiveVariant(product.id, variant.id);
    expect((await listVariants(product.id, { status: 'archived' })).total).toBe(1);

    const result = await restoreVariant(product.id, variant.id);

    expect(result.ok).toBe(true);
    expect((await listVariants(product.id)).total).toBe(1);
    expect((await listVariants(product.id, { status: 'archived' })).total).toBe(0);
  });

  it('paginates variants in SQL', async () => {
    const product = await makeProduct();
    for (const value of ['A', 'B', 'C']) await makeVariant(product.id, { value });
    const { rows, total } = await listVariants(product.id, { page: 2, pageSize: 2 });
    expect(total).toBe(3);
    expect(rows.map((row) => row.value)).toEqual(['C']);
  });
});

describe('listProductsForSale and getVariantPrice', () => {
  it('excludes archived products and archived variants', async () => {
    const sold = await makeProduct();
    const kept = await makeVariant(sold.id);
    const archivedVariant = await makeVariant(sold.id, { value: 'Zoho' });
    await archiveVariant(sold.id, archivedVariant.id);
    const hidden = await makeProduct({ name: 'Retired' });
    await makeVariant(hidden.id);
    await archiveProduct(hidden.id);

    const { rows, total } = await listProductsForSale();

    expect(total).toBe(1);
    expect(rows.map((row) => row.id)).toEqual([sold.id]);
    expect(rows[0].variants).toEqual([
      {
        id: kept.id,
        attribute: 'Brand',
        value: 'Odoo',
        extra_price: '560.00',
        final_price: '1560.00',
      },
    ]);
  });

  it('includes a product with no variants at its sales price', async () => {
    await makeProduct();
    const { rows } = await listProductsForSale();
    expect(rows[0]).toMatchObject({ sales_price: '1000.00', variants: [] });
  });

  it('is empty when nothing is for sale', async () => {
    expect(await listProductsForSale()).toMatchObject({ rows: [], total: 0 });
  });

  it('paginates in SQL and keeps variants with their products', async () => {
    for (const name of ['A', 'B', 'C']) {
      const product = await makeProduct({ name });
      await makeVariant(product.id);
    }
    const { rows, total } = await listProductsForSale({ page: 2, pageSize: 2 });
    expect(total).toBe(3);
    expect(rows.map((row) => row.name)).toEqual(['C']);
    expect(rows[0].variants).toHaveLength(1);
  });

  it('prices a variant with its product details', async () => {
    const product = await makeProduct();
    const variant = await makeVariant(product.id);
    expect(await getVariantPrice(variant.id)).toEqual({
      variant_id: variant.id,
      product_id: product.id,
      product_name: 'CloudCRM',
      attribute: 'Brand',
      value: 'Odoo',
      sales_price: '1000.00',
      extra_price: '560.00',
      final_price: '1560.00',
    });
  });

  it('returns null for archived or unknown variants', async () => {
    const product = await makeProduct();
    const archived = await makeVariant(product.id, { value: 'Zoho' });
    await archiveVariant(product.id, archived.id);
    const onArchivedProduct = await makeVariant(product.id);
    await archiveProduct(product.id);

    expect(await getVariantPrice(archived.id)).toBeNull();
    expect(await getVariantPrice(onArchivedProduct.id)).toBeNull();
    expect(await getVariantPrice(99999)).toBeNull();
    expect(await getVariantPrice('abc')).toBeNull();
    expect(await getVariantPrice('99999999999')).toBeNull();
  });
});

describe('listProducts', () => {
  async function namesFor(q, options = {}) {
    const { rows } = await listProducts({ q, ...options });
    return rows.map((row) => row.name);
  }

  it('sorts active products by name and leaves archived ones out by default', async () => {
    await makeProduct({ name: 'beta' });
    await makeProduct({ name: 'Alpha' });
    const archived = await makeProduct({ name: 'Gone' });
    await archiveProduct(archived.id);

    expect(await namesFor('')).toEqual(['Alpha', 'beta']);
    expect(await namesFor('', { status: 'archived' })).toEqual(['Gone']);
  });

  it('counts only active variants', async () => {
    const product = await makeProduct();
    await makeVariant(product.id);
    const archived = await makeVariant(product.id, { value: 'Zoho' });
    await archiveVariant(product.id, archived.id);
    const { rows } = await listProducts();
    expect(rows[0].variant_count).toBe(1);
  });

  it('takes its total from a SQL count and its page from limit and offset', async () => {
    await db('products').insert(
      Array.from({ length: 25 }, (_, index) => ({
        name: `Product ${String(index + 1).padStart(2, '0')}`,
        type: 'service',
        sales_price: '1.00',
      })),
    );
    const queries = [];
    const record = (query) => queries.push(query);
    db.on('query', record);

    const { rows, total, page, pageSize } = await listProducts(
      parsePagination({ page: '3', pageSize: '10' }),
    );

    db.removeListener('query', record);
    expect(total).toBe(25);
    expect({ page, pageSize }).toEqual({ page: 3, pageSize: 10 });
    expect(rows.map((row) => row.name)).toEqual(
      Array.from({ length: 5 }, (_, index) => `Product ${21 + index}`),
    );

    const countQuery = queries.find((query) => /count\(\*\) as "total"/.test(query.sql));
    expect(countQuery).toBeDefined();
    expect(countQuery.sql).not.toMatch(/limit/i);
    const rowsQuery = queries.find((query) => /\blimit\b.*\boffset\b/i.test(query.sql));
    expect(rowsQuery).toBeDefined();
    expect(rowsQuery.bindings).toEqual(expect.arrayContaining([10, 20]));
  });

  it('caps the page size at 100', async () => {
    expect((await listProducts({ pageSize: 5000 })).pageSize).toBe(100);
  });

  it('returns no rows but the real total past the last page', async () => {
    await makeProduct();
    expect(await listProducts({ page: 9 })).toMatchObject({ rows: [], total: 1 });
  });

  it('counts only what the search matched', async () => {
    await makeProduct({ name: 'CloudCRM' });
    await makeProduct({ name: 'Cloud Backup' });
    await makeProduct({ name: 'Mailer' });
    const { rows, total } = await listProducts({ q: 'cloud', pageSize: 1 });
    expect(total).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it('matches case-insensitively anywhere in the name', async () => {
    await makeProduct({ name: 'CloudCRM' });
    expect(await namesFor('dcr')).toEqual(['CloudCRM']);
  });

  it('does not treat % in a search as a wildcard', async () => {
    await makeProduct({ name: '100% Uptime' });
    await makeProduct({ name: '1000 Seats' });
    await makeProduct({ name: 'Mailer' });

    expect(await namesFor('100%')).toEqual(['100% Uptime']);
    expect(await namesFor('%')).toEqual(['100% Uptime']);
    expect((await listProducts({ q: '100%' })).total).toBe(1);
  });

  it('does not treat _ in a search as a wildcard', async () => {
    await makeProduct({ name: 'a_b' });
    await makeProduct({ name: 'axb' });
    expect(await namesFor('a_b')).toEqual(['a_b']);
  });

  it('matches a literal backslash in a search', async () => {
    await makeProduct({ name: 'back\\slash' });
    await makeProduct({ name: 'backslash' });
    expect(await namesFor('k\\s')).toEqual(['back\\slash']);
  });

  it('survives a search containing SQL', async () => {
    await makeProduct();
    expect(await namesFor("'; DROP TABLE products; --")).toEqual([]);
    expect(await namesFor('')).toEqual(['CloudCRM']);
  });

  it('escapes wildcards in listProductsForSale too', async () => {
    await makeProduct({ name: '100% Uptime' });
    await makeProduct({ name: '1000 Seats' });
    const { rows, total } = await listProductsForSale({ q: '100%' });
    expect(total).toBe(1);
    expect(rows.map((row) => row.name)).toEqual(['100% Uptime']);
  });
});
