import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// React resets a form after every action, so typed values survive a failed submit
// only in controlled inputs. A reset needs a DOM, which the suite doesn't have, so
// these prove the inputs are controlled and that errors render beside the fields.
const hook = vi.hoisted(() => ({ state: null }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal()),
  useActionState: () => [hook.state, () => {}],
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('next/link', async () => {
  const { createElement: h } = await import('react');
  return { default: ({ children, ...props }) => h('a', props, children) };
});

const { SignupForm } = await import('@/app/(auth)/signup/SignupForm');
const { LoginForm } = await import('@/app/(auth)/login/LoginForm');
const { ForgotPasswordForm } = await import('@/app/(auth)/forgot-password/ForgotPasswordForm');
const { InviteStaffForm } = await import('@/app/(workspace)/staff/new/InviteStaffForm');

function inputNamed(page, name) {
  return new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(page)[0];
}

beforeEach(() => {
  hook.state = null;
});

describe('forms keep typed values through a failed submit', () => {
  it.each([
    ['SignupForm', SignupForm, ['name', 'email']],
    ['LoginForm', LoginForm, ['email']],
    ['ForgotPasswordForm', ForgotPasswordForm, ['email']],
    ['InviteStaffForm', InviteStaffForm, ['name', 'email']],
  ])('%s controls its text fields', (_label, Form, names) => {
    const page = renderToStaticMarkup(createElement(Form, { passwordRule: 'Rule' }));
    for (const name of names) expect(inputNamed(page, name)).toContain('value=""');
  });

  it.each([
    ['SignupForm', SignupForm],
    ['LoginForm', LoginForm],
  ])('%s leaves the password uncontrolled, so the reset clears it', (_label, Form) => {
    const page = renderToStaticMarkup(createElement(Form, { passwordRule: 'Rule' }));
    expect(inputNamed(page, 'password')).not.toContain('value=');
  });
});

describe('failed submits show their errors', () => {
  it('shows field errors on sign-up beside the rule', () => {
    hook.state = {
      ok: false,
      message: 'Please fix the highlighted fields.',
      fieldErrors: {
        email: 'An account with this email already exists.',
        password: 'Add an uppercase letter.',
      },
    };
    const page = renderToStaticMarkup(createElement(SignupForm, { passwordRule: 'The rule.' }));
    expect(page).toContain('An account with this email already exists.');
    expect(page).toContain('Add an uppercase letter.');
    expect(page).toContain('The rule.');
    expect(inputNamed(page, 'email')).toContain('aria-invalid="true"');
  });

  it('shows the generic login error', () => {
    hook.state = { ok: false, message: 'Incorrect email or password.' };
    const page = renderToStaticMarkup(createElement(LoginForm));
    expect(page).toContain('Incorrect email or password.');
  });

  it('shows the same success message on forgot password', () => {
    hook.state = { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
    const page = renderToStaticMarkup(createElement(ForgotPasswordForm));
    expect(page).toContain('a reset link is on its way');
  });
});
