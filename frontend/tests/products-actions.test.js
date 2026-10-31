import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';

import { resetTables } from '../../backend/tests/helpers/db';
import { createAdmin, createCustomer, createSessionFor, createStaff } from '../../backend/tests/helpers/factories';

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
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const actions = await import('@/actions/products');
const { db } = await import('@backend/lib/db');
const { addVariant, archiveProduct, createProduct, getProduct, getVariant } = await import(
  '@backend/services/products'
);

const {
  addVariantAction,
  archiveProductAction,
  archiveVariantAction,
  createProductAction,
  restoreProductAction,
  restoreVariantAction,
  updateProductAction,
  updateVariantAction,
} = actions;

const PRODUCT_FIELDS = {
  name: 'CloudCRM',
  type: 'service',
  sales_price: '1000',
  cost_price: '400',
  notes: '',
};
const VARIANT_FIELDS = { attribute: 'Brand', value: 'Odoo', extra_price: '560' };

function form(fields) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

async function seedProduct() {
  const { product } = await createProduct({
    name: 'CloudCRM',
    type: 'service',
    sales_price: '1000.00',
    cost_price: '400.00',
  });
  const { variant } = await addVariant(product.id, {
    attribute: 'Brand',
    value: 'Odoo',
    extra_price: '560.00',
  });
  return { product, variant };
}

async function snapshot() {
  return {
    products: await db('products').orderBy('id'),
    variants: await db('product_variants').orderBy('id'),
  };
}

/** Every write action, with a form that would succeed for an admin. */
function allActions({ product, variant }) {
  const ids = { id: product.id, product_id: product.id, variant_id: variant.id };
  return [
    ['createProductAction', createProductAction, { ...PRODUCT_FIELDS, name: 'New' }],
    ['updateProductAction', updateProductAction, { ...PRODUCT_FIELDS, ...ids }],
    ['archiveProductAction', archiveProductAction, ids],
    ['restoreProductAction', restoreProductAction, ids],
    ['addVariantAction', addVariantAction, { ...VARIANT_FIELDS, value: 'Zoho', ...ids }],
    ['updateVariantAction', updateVariantAction, { ...VARIANT_FIELDS, extra_price: '1', ...ids }],
    ['archiveVariantAction', archiveVariantAction, ids],
    ['restoreVariantAction', restoreVariantAction, ids],
  ];
}

beforeEach(async () => {
  cookieJar.clear();
  await resetTables();
});

describe('permissions', () => {
  it('exports exactly the eight actions covered here', () => {
    const names = allActions({ product: {}, variant: {} }).map(([name]) => name);
    expect(Object.keys(actions).sort()).toEqual([...names].sort());
  });

  it.each([
    ['staff', createStaff, '/forbidden'],
    ['a customer', createCustomer, '/forbidden'],
    ['a logged out visitor', null, '/login'],
  ])('refuses every action for %s and changes nothing', async (_who, makeUser, target) => {
    const seeded = await seedProduct();
    if (makeUser) await logIn(await makeUser());
    const before = await snapshot();

    for (const [, action, fields] of allActions(seeded)) {
      await expect(action(null, form(fields))).rejects.toThrow(`REDIRECT:${target}`);
    }

    expect(await snapshot()).toEqual(before);
  });

  it('checks the permission before reading the form', async () => {
    await logIn(await createStaff());
    await expect(createProductAction(null, form({}))).rejects.toThrow('REDIRECT:/forbidden');
  });
});

describe('as admin', () => {
  beforeEach(async () => {
    await logIn(await createAdmin());
  });

  it('creates a product and goes to its page', async () => {
    await expect(createProductAction(null, form(PRODUCT_FIELDS))).rejects.toThrow(
      'REDIRECT:/products/1',
    );
    expect(await getProduct(1)).toMatchObject({
      name: 'CloudCRM',
      sales_price: '1000.00',
      cost_price: '400.00',
      notes: null,
    });
  });

  it('returns field errors for invalid money and writes nothing', async () => {
    const result = await createProductAction(
      null,
      form({ ...PRODUCT_FIELDS, name: '', sales_price: '-1', cost_price: '1.234' }),
    );
    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['cost_price', 'name', 'sales_price']);
    expect(await db('products').count('* as total').first()).toEqual({ total: 0 });
  });

  it('returns a field error for a duplicate name', async () => {
    await seedProduct();
    const result = await createProductAction(null, form({ ...PRODUCT_FIELDS, name: 'CLOUDCRM' }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: 'An active product named "CLOUDCRM" already exists.' },
    });
  });

  it('updates a product and goes back to its page', async () => {
    const { product } = await seedProduct();
    await expect(
      updateProductAction(null, form({ ...PRODUCT_FIELDS, id: product.id, sales_price: '1100' })),
    ).rejects.toThrow(`REDIRECT:/products/${product.id}`);
    expect((await getVariant(product.id, 1)).final_price).toBe('1660.00');
  });

  it.each(['abc', '', '99999999999'])('fails softly on a bad product id %j', async (id) => {
    const result = await updateProductAction(null, form({ ...PRODUCT_FIELDS, id }));
    expect(result).toEqual({ ok: false, message: 'This product no longer exists.' });
  });

  it('archives and restores a product', async () => {
    const { product } = await seedProduct();
    const ids = { id: product.id };

    expect(await archiveProductAction(null, form(ids))).toEqual({
      ok: true,
      message: 'Product archived.',
    });
    expect((await getProduct(product.id)).is_active).toBe(false);

    expect(await restoreProductAction(null, form(ids))).toEqual({
      ok: true,
      message: 'Product restored.',
    });
    expect((await getProduct(product.id)).is_active).toBe(true);
  });

  it('returns a friendly message for a restore clash, not a thrown 23505', async () => {
    const { product } = await seedProduct();
    await archiveProduct(product.id);
    await createProduct({
      name: 'cloudcrm',
      type: 'goods',
      sales_price: '1.00',
      cost_price: '0.00',
    });

    const result = await restoreProductAction(null, form({ id: product.id }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Can't restore "CloudCRM"/);
  });

  it('adds a variant and returns to the variants section', async () => {
    const { product } = await seedProduct();
    await expect(
      addVariantAction(
        null,
        form({ product_id: product.id, attribute: 'Brand', value: 'Zoho', extra_price: '100' }),
      ),
    ).rejects.toThrow(`REDIRECT:/products/${product.id}?saved=2#variants`);
    expect((await getVariant(product.id, 2)).final_price).toBe('1100.00');
  });

  it('returns a field error for a duplicate variant', async () => {
    const { product } = await seedProduct();
    const result = await addVariantAction(
      null,
      form({ ...VARIANT_FIELDS, product_id: product.id, value: 'ODOO' }),
    );
    expect(result.ok).toBe(false);
    expect(result.fieldErrors.value).toMatch(/already has an active variant/);
  });

  it('updates a variant', async () => {
    const { product, variant } = await seedProduct();
    await expect(
      updateVariantAction(
        null,
        form({ ...VARIANT_FIELDS, product_id: product.id, variant_id: variant.id, extra_price: '600' }),
      ),
    ).rejects.toThrow(`REDIRECT:/products/${product.id}?saved=${variant.id}#variants`);
    expect((await getVariant(product.id, variant.id)).final_price).toBe('1600.00');
  });

  it('archives and restores a variant', async () => {
    const { product, variant } = await seedProduct();
    const ids = { product_id: product.id, variant_id: variant.id };

    expect(await archiveVariantAction(null, form(ids))).toEqual({
      ok: true,
      message: 'Variant archived.',
    });
    expect((await getVariant(product.id, variant.id)).is_active).toBe(false);

    expect(await restoreVariantAction(null, form(ids))).toEqual({
      ok: true,
      message: 'Variant restored.',
    });
    expect((await getVariant(product.id, variant.id)).is_active).toBe(true);
  });

  it('will not touch a variant through the wrong product id', async () => {
    const { variant } = await seedProduct();
    const { product: other } = await createProduct({
      name: 'Mailer',
      type: 'goods',
      sales_price: '1.00',
      cost_price: '0.00',
    });
    const result = await archiveVariantAction(
      null,
      form({ product_id: other.id, variant_id: variant.id }),
    );
    expect(result).toEqual({ ok: false, message: 'This variant no longer exists.' });
  });

  it('fails softly on a bad variant id', async () => {
    const result = await archiveVariantAction(null, form({ product_id: 'x', variant_id: 'y' }));
    expect(result).toEqual({ ok: false, message: 'This variant no longer exists.' });
  });
});
