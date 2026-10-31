import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';
import { issueToken } from '@backend/services/password-reset';

import { resetTables } from '../../backend/tests/helpers/db';
import {
  createAdmin,
  createCustomer,
  createSessionFor,
  createStaff,
} from '../../backend/tests/helpers/factories';

const cookieJar = vi.hoisted(() => new Map());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name, value) => cookieJar.set(name, value),
    delete: (name) => cookieJar.delete(name),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/server', () => ({ after: () => {} }));
vi.mock('next/form', async () => {
  const { createElement: h } = await import('react');
  return { default: (props) => h('form', props) };
});

const { default: LoginPage } = await import('@/app/(auth)/login/page');
const { default: SignupPage } = await import('@/app/(auth)/signup/page');
const { default: ForgotPage } = await import('@/app/(auth)/forgot-password/page');
const { default: ResetPage } = await import('@/app/(auth)/reset-password/page');
const { default: DashboardPage } = await import('@/app/(workspace)/dashboard/page');
const { default: StaffPage } = await import('@/app/(workspace)/staff/page');
const { default: NewStaffPage } = await import('@/app/(workspace)/staff/new/page');
const { default: PortalPage } = await import('@/app/portal/page');

const search = (params = {}) => ({ searchParams: Promise.resolve(params) });

async function html(Page, props) {
  const element = await Page(props);
  return renderToStaticMarkup(createElement(() => element));
}

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

function issue(user, purpose) {
  return db.transaction((trx) => issueToken(user.id, purpose, trx));
}

/** The table row that holds this person's name. */
function rowOf(page, name) {
  const row = page.split('<tr').find((part) => part.includes(`>${name}<`));
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

beforeEach(async () => {
  cookieJar.clear();
  await resetTables();
});

describe('public pages', () => {
  it('renders the login form', async () => {
    const page = await html(LoginPage, search());
    expect(page).toContain('name="email"');
    expect(page).toContain('type="password"');
    expect(page).toContain('/forgot-password');
    expect(page).not.toContain('Your password has been set');
  });

  it('shows the notice after a reset', async () => {
    expect(await html(LoginPage, search({ reset: '1' }))).toContain('Your password has been set');
  });

  it('sends a logged-in user home from login and sign-up', async () => {
    await logIn(await createCustomer());
    await expect(LoginPage(search())).rejects.toThrow('REDIRECT:/portal');
    await expect(SignupPage()).rejects.toThrow('REDIRECT:/portal');

    cookieJar.clear();
    await logIn(await createAdmin());
    await expect(LoginPage(search())).rejects.toThrow('REDIRECT:/dashboard');
    await expect(SignupPage()).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('shows the password rule on sign-up', async () => {
    expect(await html(SignupPage)).toContain('at least 9 characters');
  });

  it('renders the forgot-password form', async () => {
    expect(await html(ForgotPage)).toContain('Send reset link');
  });

  it.each([[{}], [{ token: 'bad' }], [{ token: ['a', 'b'] }]])(
    'refuses a missing, unknown or repeated token: %j',
    async (params) => {
      const page = await html(ResetPage, search(params));
      expect(page).toContain('Request a new link');
      expect(page).not.toContain('type="password"');
    },
  );

  it('shows reset and invite wording, with the rule and the token in a hidden field', async () => {
    const user = await createCustomer();

    const reset = await issue(user, 'reset');
    const resetPage = await html(ResetPage, search({ token: reset }));
    expect(resetPage).toContain('Choose a new password');
    expect(resetPage).toContain('at least 9 characters');
    expect(resetPage).toContain(`value="${reset}"`);

    const invite = await issue(user, 'invite');
    expect(await html(ResetPage, search({ token: invite }))).toContain('Set your password');
  });
});

describe('dashboard and portal', () => {
  it('shows the dashboard cards to staff', async () => {
    await logIn(await createStaff());
    const page = await html(DashboardPage);
    for (const label of ['Active products', 'Active plans', 'Plans on sale today', 'Customers']) {
      expect(page).toContain(label);
    }
  });

  it('refuses the dashboard to a visitor and a customer', async () => {
    await expect(DashboardPage()).rejects.toThrow('REDIRECT:/login');
    await logIn(await createCustomer());
    await expect(DashboardPage()).rejects.toThrow('REDIRECT:/forbidden');
  });

  it('shows the portal to a customer only', async () => {
    await logIn(await createCustomer({ name: 'Sharma Traders' }));
    const page = await html(PortalPage);
    for (const text of ['Welcome, Sharma Traders', 'My subscriptions', 'My invoices']) {
      expect(page).toContain(text);
    }

    cookieJar.clear();
    await logIn(await createAdmin());
    await expect(PortalPage()).rejects.toThrow('REDIRECT:/forbidden');
  });
});

describe('/staff', () => {
  let admin;

  beforeEach(async () => {
    admin = await createAdmin({ email: 'boss@example.test' });
    await logIn(admin);
  });

  it('lists staff only, with a one-time notice that stays out of the paging links', async () => {
    await createCustomer({ email: 'owner@sharma.in' });
    await createStaff({ name: 'Active Person' });
    await createStaff({ name: 'Gone Person', is_active: false });

    const page = await html(StaffPage, search({ invited: 'unsent' }));

    expect(page).toContain('Active Person');
    expect(page).toContain('Inactive');
    expect(page).toContain('Reactivate');
    expect(page).toContain('Deactivate');
    expect(page).toContain('could not be sent');
    expect(page).not.toContain('value="unsent"');
    expect(page).not.toContain('boss@example.test');
    expect(page).not.toContain('owner@sharma.in');
  });

  it('shows Invite pending while the link is live', async () => {
    const staff = await createStaff({ name: 'Pending Person', password: null });
    await issue(staff, 'invite');

    const row = rowOf(await html(StaffPage, search()), 'Pending Person');

    expect(row).toContain('Invite pending');
    expect(row).not.toContain('Invite expired');
  });

  it('shows Invite expired once no link can be redeemed', async () => {
    const staff = await createStaff({ name: 'Late Person', password: null });
    await issue(staff, 'invite');
    await db('password_reset_tokens').update({ expires_at: db.raw("now() - interval '1 minute'") });

    const row = rowOf(await html(StaffPage, search()), 'Late Person');

    expect(row).toContain('Invite expired');
    expect(row).not.toContain('Invite pending');
  });

  it('offers Resend invite only to active staff with no password', async () => {
    const pending = await createStaff({ name: 'Pending Person', password: null });
    await issue(pending, 'invite');
    await createStaff({ name: 'Late Person', password: null });
    await createStaff({ name: 'Active Person' });
    await createStaff({ name: 'Gone Unset', password: null, is_active: false });
    await createStaff({ name: 'Gone Person', is_active: false });

    const page = await html(StaffPage, search());

    expect(rowOf(page, 'Pending Person')).toContain('Resend invite');
    expect(rowOf(page, 'Late Person')).toContain('Resend invite');
    expect(rowOf(page, 'Active Person')).not.toContain('Resend invite');
    expect(rowOf(page, 'Gone Unset')).not.toContain('Resend invite');
    expect(rowOf(page, 'Gone Person')).not.toContain('Resend invite');
  });

  it('copes with an empty search and a page past the end', async () => {
    await createStaff();
    expect(await html(StaffPage, search({ q: 'zzz' }))).toContain('No staff match');
    const page = await html(StaffPage, search({ page: '9' }));
    expect(page).toContain('No staff on this page');
    expect(page).toContain('Pagination');
  });

  it('renders the invite form', async () => {
    expect(await html(NewStaffPage)).toContain('Send invite');
  });

  it('refuses staff and customers', async () => {
    for (const actor of [await createStaff(), await createCustomer()]) {
      cookieJar.clear();
      await logIn(actor);
      await expect(StaffPage(search())).rejects.toThrow('REDIRECT:/forbidden');
      await expect(NewStaffPage()).rejects.toThrow('REDIRECT:/forbidden');
    }
  });

  it('sends a visitor to /login', async () => {
    cookieJar.clear();
    await expect(StaffPage(search())).rejects.toThrow('REDIRECT:/login');
    await expect(NewStaffPage()).rejects.toThrow('REDIRECT:/login');
  });
});
