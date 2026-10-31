import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stands in for useActionState so the real wrapper in PlanForm can be driven. A real
// form reset needs a DOM, which the suite doesn't have: what PlanForm has to get
// right is that the state it keeps remounts the form with the submitted values.
const hook = vi.hoisted(() => ({ state: null, wrapper: null }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal()),
  useActionState: (wrapper) => {
    hook.wrapper = wrapper;
    return [hook.state, () => {}];
  },
}));
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ children, ...props }) => h('a', props, children) };
});

const { PlanForm } = await import('@/app/(workspace)/plans/PlanForm');

const SAVED_PLAN = {
  id: 7,
  name: 'Saved',
  price: '1.00',
  billing_period: 'monthly',
  min_quantity: 5,
  start_date: '2026-11-01',
  end_date: '2027-12-31',
  auto_close: true,
  can_close_early: false,
  can_pause: true,
  can_renew: false,
};

function render(props) {
  return renderToStaticMarkup(
    createElement(PlanForm, {
      action: async () => {},
      submitLabel: 'Save',
      cancelHref: '/plans',
      ...props,
    }),
  );
}

function checkbox(page, name) {
  return new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(page)[0];
}

function typedForm() {
  const formData = new FormData();
  formData.set('id', '7');
  formData.set('name', 'Typed');
  formData.set('price', '2.50');
  formData.set('billing_period', 'yearly');
  formData.set('min_quantity', '0');
  formData.set('start_date', '2026-12-01');
  formData.set('end_date', '2026-11-01');
  formData.set('can_renew', 'on');
  return formData;
}

const REJECTED = {
  ok: false,
  message: 'Please fix the highlighted fields.',
  fieldErrors: { min_quantity: 'Enter a whole number of 1 or more.' },
};

beforeEach(() => {
  hook.state = null;
  hook.wrapper = null;
});

describe('a failed plan save keeps what the user entered', () => {
  it('re-renders the submitted values, not the saved ones', async () => {
    const action = vi.fn(async () => REJECTED);
    render({ action, plan: SAVED_PLAN });
    const formData = typedForm();

    const next = await hook.wrapper(null, formData);

    expect(action).toHaveBeenCalledWith(null, formData);
    expect(next.attempt).toBe(1);

    hook.state = next;
    const page = render({ action, plan: SAVED_PLAN });

    for (const value of ['Typed', '2.50', '0', '2026-12-01', '2026-11-01']) {
      expect(page).toContain(`value="${value}"`);
    }
    expect(page).not.toContain('value="Saved"');
    expect(page).toMatch(/<option value="yearly" selected/);
    expect(checkbox(page, 'can_renew')).toContain('checked');
    expect(checkbox(page, 'auto_close')).not.toContain('checked');
    expect(checkbox(page, 'can_pause')).not.toContain('checked');
    expect(page).toContain('Enter a whole number of 1 or more.');
    expect(page).toContain('Please fix the highlighted fields.');
    expect(page).toContain('name="id" value="7"');
  });

  it('counts attempts, so each one remounts the form', async () => {
    const action = vi.fn(async () => REJECTED);
    render({ action });
    const first = await hook.wrapper(null, typedForm());
    const second = await hook.wrapper(first, typedForm());
    expect(second.attempt).toBe(2);
  });

  it('passes a redirect from the action through instead of swallowing it', async () => {
    const action = async () => {
      throw new Error('NEXT_REDIRECT');
    };
    render({ action });
    await expect(hook.wrapper(null, new FormData())).rejects.toThrow('NEXT_REDIRECT');
  });
});
