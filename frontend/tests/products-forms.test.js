import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A real form reset needs a DOM, which the suite doesn't have. React only resets a
// form after running an action passed to `action`, so these prove the submit never
// takes that path when JavaScript is on, and that errors render beside the fields.
const hook = vi.hoisted(() => ({ state: null, dispatch: vi.fn(), pending: false }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal()),
  useActionState: () => [hook.state, hook.dispatch, hook.pending],
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ children, ...props }) => h('a', props, children) };
});

const { ProductForm } = await import('@/app/(workspace)/products/ProductForm');
const { VariantForm } = await import('@/app/(workspace)/products/VariantForm');
const { useFormAction } = await import('@/app/(workspace)/products/useFormAction');

class FakeFormData {
  constructor(form) {
    this.form = form;
  }
}

beforeEach(() => {
  hook.state = null;
  hook.pending = false;
  hook.dispatch.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFormAction', () => {
  it('stops the native submit and dispatches the form data itself', () => {
    vi.stubGlobal('FormData', FakeFormData);
    const { onSubmit } = useFormAction(async () => {});
    const preventDefault = vi.fn();
    const currentTarget = { id: 'the-form' };

    onSubmit({ preventDefault, currentTarget });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(hook.dispatch).toHaveBeenCalledOnce();
    expect(hook.dispatch.mock.calls[0][0].form).toBe(currentTarget);
  });

  it('returns the state, so a rejection reaches the form', () => {
    hook.state = { ok: false, message: 'No' };
    expect(useFormAction(async () => {}).state).toBe(hook.state);
  });
});

describe('ProductForm', () => {
  it('shows field and form errors from a rejected save', () => {
    hook.state = {
      ok: false,
      message: 'Please fix the highlighted fields.',
      fieldErrors: { name: 'That name is taken.', sales_price: 'Enter a valid amount.' },
    };
    const page = renderToStaticMarkup(createElement(ProductForm));
    expect(page).toContain('Please fix the highlighted fields.');
    expect(page).toContain('That name is taken.');
    expect(page).toContain('Enter a valid amount.');
    expect(page).toContain('aria-invalid="true"');
  });

  it('pre-fills an edit and disables the button while saving', () => {
    hook.pending = true;
    const page = renderToStaticMarkup(
      createElement(ProductForm, {
        product: {
          id: 3,
          name: 'CloudCRM',
          type: 'goods',
          sales_price: '1000.00',
          cost_price: '400.00',
          notes: null,
        },
      }),
    );
    expect(page).toContain('name="id" value="3"');
    expect(page).toContain('value="CloudCRM"');
    expect(page).toMatch(/<option value="goods" selected/);
    expect(page).toContain('Saving...');
    expect(page).toMatch(/<button[^>]*disabled/);
  });
});

describe('VariantForm', () => {
  it('previews the final price from the sales price and the extra', () => {
    const page = renderToStaticMarkup(
      createElement(VariantForm, {
        productId: 1,
        salesPrice: '1000.00',
        variant: { id: 2, attribute: 'Brand', value: 'Odoo', extra_price: '560.00' },
      }),
    );
    expect(page).toContain('Final price ₹1,560.00');
    expect(page).toContain('+₹560.00');
    expect(page).toContain('name="variant_id" value="2"');
  });

  it('shows field errors from a rejected save', () => {
    hook.state = { ok: false, fieldErrors: { value: 'That variant already exists.' } };
    const page = renderToStaticMarkup(
      createElement(VariantForm, { productId: 1, salesPrice: '1000.00' }),
    );
    expect(page).toContain('That variant already exists.');
  });
});
