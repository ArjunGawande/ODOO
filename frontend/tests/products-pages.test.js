import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';

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

const { default: ProductsPage } = await import('@/app/(workspace)/products/page');
const { default: ProductPage } = await import('@/app/(workspace)/products/[id]/page');
const { default: EditProductPage } = await import('@/app/(workspace)/products/[id]/edit/page');
const { default: NewProductPage } = await import('@/app/(workspace)/products/new/page');
const { addVariant, archiveProduct, archiveVariant, createProduct } =
  await import('@backend/services/products');

const CLOUD_CRM = {
  name: 'CloudCRM',
  type: 'service',
  sales_price: '1000.00',
  cost_price: '400.00',
  notes: 'line <b>',
};
const ODOO = { attribute: 'Brand', value: 'Odoo', extra_price: '560.00' };

async function html(Page, { params = {}, search = {} } = {}) {
  const element = await Page({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(search),
  });
  return renderToStaticMarkup(createElement(() => element));
}

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

async function seedProduct() {
  const { product } = await createProduct(CLOUD_CRM);
  const { variant } = await addVariant(product.id, ODOO);
  return { id: String(product.id), productId: product.id, variant };
}

beforeEach(async () => {
  cookieJar.clear();
  await resetTables();
});

describe('product pages as admin', () => {
  beforeEach(async () => logIn(await createAdmin()));

  it('lists products with the write control', async () => {
    await seedProduct();
    const page = await html(ProductsPage);
    for (const text of ['New product', '₹1,000.00', 'CloudCRM']) expect(page).toContain(text);
  });

  it('shows the worked example with every write control', async () => {
    const { id } = await seedProduct();
    const page = await html(ProductPage, { params: { id } });
    for (const text of [
      '+₹560.00',
      '₹1,560.00',
      'Add a variant',
      'Archive',
      'Edit',
      'Final price',
      'line &lt;b&gt;',
    ]) {
      expect(page).toContain(text);
    }
  });

  it('opens the variant edit form and the saved notice from the URL', async () => {
    const { id, variant } = await seedProduct();

    const editing = await html(ProductPage, {
      params: { id },
      search: { edit: String(variant.id) },
    });
    expect(editing).toContain('Edit Brand: Odoo');
    expect(editing).toContain('Save variant');
    expect(editing).toContain('value="560.00"');

    const saved = await html(ProductPage, {
      params: { id },
      search: { saved: String(variant.id) },
    });
    expect(saved).toContain('Variant saved.');
  });

  it('pre-fills the edit form and renders a blank new form', async () => {
    const { id } = await seedProduct();
    const page = await html(EditProductPage, { params: { id } });
    expect(page).toContain('Save changes');
    expect(page).toContain('value="1000.00"');
    expect(await html(NewProductPage)).toContain('Create product');
  });

  it.each(['abc', '0', '-1', '1.5', '999', '99999999999', '12abc'])(
    'gives notFound for id %j',
    async (id) => {
      await expect(html(ProductPage, { params: { id } })).rejects.toThrow('NOT_FOUND');
      await expect(html(EditProductPage, { params: { id } })).rejects.toThrow('NOT_FOUND');
    },
  );

  it('handles the archived views, bad query values and empty lists', async () => {
    expect(await html(ProductsPage)).toContain('No products yet');

    const { id, productId, variant } = await seedProduct();
    await archiveVariant(productId, variant.id);

    const archivedTab = await html(ProductPage, { params: { id }, search: { variants: 'archived' } });
    expect(archivedTab).toContain('Restore');
    expect(
      await html(ProductPage, { params: { id }, search: { edit: 'zzz', page: 'x', saved: ['1'] } }),
    ).toContain('No variants yet');

    await archiveProduct(productId);
    const page = await html(ProductPage, { params: { id } });
    expect(page).toContain('archived');
    expect(page).toContain('Restore');
    expect(page).not.toContain('Add a variant');
    await expect(html(EditProductPage, { params: { id } })).rejects.toThrow(
      `REDIRECT:/products/${id}`,
    );

    expect(await html(ProductsPage, { search: { status: 'archived' } })).toContain('CloudCRM');
    expect(await html(ProductsPage, { search: { q: '100%' } })).toContain('No products match');
    expect(await html(ProductsPage, { search: { page: '99', status: 'archived' } })).toContain(
      'No products on this page',
    );
  });
});

describe('product pages as staff', () => {
  beforeEach(async () => logIn(await createStaff()));

  it('hides every write control, including with ?edit in the URL', async () => {
    const { id, variant } = await seedProduct();

    expect(await html(ProductsPage)).not.toContain('New product');

    for (const search of [{}, { edit: String(variant.id) }]) {
      const page = await html(ProductPage, { params: { id }, search });
      expect(page).toContain('₹1,560.00');
      for (const text of ['Add a variant', 'Archive<', '"Archive ', '>Edit<', 'Restore', '<form']) {
        expect(page).not.toContain(text);
      }
      expect(page).not.toContain('Actions');
    }
  });

  it('is sent to /forbidden by the write pages', async () => {
    const { id } = await seedProduct();
    await expect(html(NewProductPage)).rejects.toThrow('REDIRECT:/forbidden');
    await expect(html(EditProductPage, { params: { id } })).rejects.toThrow('REDIRECT:/forbidden');
  });
});

describe('product pages logged out', () => {
  it('sends every page to /login', async () => {
    await expect(html(ProductsPage)).rejects.toThrow('REDIRECT:/login');
    await expect(html(ProductPage, { params: { id: '1' } })).rejects.toThrow('REDIRECT:/login');
    await expect(html(EditProductPage, { params: { id: '1' } })).rejects.toThrow('REDIRECT:/login');
    await expect(html(NewProductPage)).rejects.toThrow('REDIRECT:/login');
  });
});
