import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';

import { resetTables } from '../../backend/tests/helpers/db';
import {
  DEFAULT_PASSWORD,
  createAdmin,
  createCustomer,
  createSessionFor,
  createStaff,
} from '../../backend/tests/helpers/factories';

const cookieJar = vi.hoisted(() => new Map());
const afterQueue = vi.hoisted(() => []);
const revalidated = vi.hoisted(() => []);
const sendMail = vi.hoisted(() => vi.fn(async () => {}));

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
vi.mock('next/server', () => ({ after: (callback) => afterQueue.push(callback) }));
vi.mock('next/cache', () => ({ revalidatePath: (path) => revalidated.push(path) }));
vi.mock('@backend/lib/mailer', () => ({ sendMail }));

const { forgotPasswordAction, loginAction, resetPasswordAction, signupAction } =
  await import('@/actions/auth');
const { deactivateStaffAction, inviteStaffAction, reactivateStaffAction, resendInviteAction } =
  await import('@/actions/staff');
const { getCurrentUser } = await import('@/lib/auth/guards');

const SHARMA = { name: 'Sharma Traders', email: 'owner@sharma.in', password: 'Sharma@2026' };

function form(fields) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

async function flushAfter() {
  for (const callback of afterQueue.splice(0)) await callback();
}

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

function tokenFromMail() {
  return /token=([\w-]+)/.exec(sendMail.mock.calls.at(-1)[0].text)[1];
}

beforeEach(async () => {
  cookieJar.clear();
  afterQueue.length = 0;
  revalidated.length = 0;
  sendMail.mockClear();
  sendMail.mockImplementation(async () => {});
  await resetTables();
});

describe('worked example: Sharma Traders signs up', () => {
  it('creates the account, logs in and lands on the portal', async () => {
    await expect(signupAction(null, form(SHARMA))).rejects.toThrow('REDIRECT:/portal');

    const row = await db('users').where('email', 'owner@sharma.in').first();
    expect(row).toMatchObject({ name: 'Sharma Traders', role: 'customer', is_active: true });
    expect(await getCurrentUser()).toMatchObject({ email: 'owner@sharma.in', role: 'customer' });
  });

  it('rejects someone else registering with the same email', async () => {
    await expect(signupAction(null, form(SHARMA))).rejects.toThrow('REDIRECT:/portal');
    cookieJar.clear();

    const result = await signupAction(null, form({ ...SHARMA, name: 'Impostor Ltd' }));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { email: 'An account with this email already exists.' },
    });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db('users')).toHaveLength(1);
  });

  it('rejects the case variant OWNER@Sharma.in', async () => {
    await expect(signupAction(null, form(SHARMA))).rejects.toThrow('REDIRECT:/portal');

    const result = await signupAction(null, form({ ...SHARMA, email: 'OWNER@Sharma.in' }));

    expect(result.fieldErrors.email).toMatch(/already exists/);
    expect(await db('users')).toHaveLength(1);
  });

  it('can log in afterwards with the same password', async () => {
    await expect(signupAction(null, form(SHARMA))).rejects.toThrow('REDIRECT:/portal');
    cookieJar.clear();

    await expect(
      loginAction(null, form({ email: 'owner@sharma.in', password: 'Sharma@2026' })),
    ).rejects.toThrow('REDIRECT:/portal');

    expect((await getCurrentUser()).email).toBe('owner@sharma.in');
  });
});

describe('signupAction', () => {
  it('cannot set a role or other columns from the form', async () => {
    await expect(
      signupAction(
        null,
        form({
          ...SHARMA,
          role: 'admin',
          is_active: 'false',
          password_hash: 'x',
          id: '99',
        }),
      ),
    ).rejects.toThrow('REDIRECT:/portal');

    const row = await db('users').first();
    expect(row.id).toBe(1);
    expect(row.role).toBe('customer');
    expect(row.is_active).toBe(true);
    expect(row.password_hash).toMatch(/^\$2/);
  });

  it('returns a field error for each invalid field and creates nothing', async () => {
    const result = await signupAction(
      null,
      form({ name: '', email: 'nope', password: 'sharma@2026' }),
    );

    expect(result.ok).toBe(false);
    expect(result.fieldErrors).toMatchObject({
      name: expect.any(String),
      email: expect.any(String),
      password: expect.stringMatching(/uppercase/),
    });
    expect(await db('users')).toHaveLength(0);
  });

  it('rejects a multibyte password over 72 bytes on the server', async () => {
    const result = await signupAction(
      null,
      form({ ...SHARMA, password: `Aa@aa${'é'.repeat(34)}` }),
    );
    expect(result.fieldErrors.password).toMatch(/72 bytes/);
    expect(await db('users')).toHaveLength(0);
  });

  it('handles fields missing from the post', async () => {
    const result = await signupAction(null, form({}));
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['email', 'name', 'password']);
  });

  it('handles a file posted in place of text', async () => {
    const data = form({ name: 'Sharma', password: 'Sharma@2026' });
    data.append('email', new File(['x'], 'x.txt'));
    const result = await signupAction(null, data);
    expect(result.fieldErrors.email).toBeDefined();
  });

  it('resolves concurrent duplicates to one account and a friendly error', async () => {
    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, () => signupAction(null, form(SHARMA))),
    );

    const redirected = outcomes.filter(
      (outcome) => outcome.status === 'rejected' && /REDIRECT:\/portal/.test(outcome.reason.message),
    );
    const friendly = outcomes.filter((outcome) => outcome.value?.fieldErrors?.email);
    expect(redirected).toHaveLength(1);
    expect(friendly).toHaveLength(3);
    expect(await db('users')).toHaveLength(1);
  });
});

describe('loginAction', () => {
  const GENERIC = { ok: false, message: 'Incorrect email or password.' };

  it('sends each role to its home', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    const customer = await createCustomer();
    const cases = [
      [admin, '/dashboard'],
      [staff, '/dashboard'],
      [customer, '/portal'],
    ];

    for (const [user, home] of cases) {
      await expect(
        loginAction(null, form({ email: user.email, password: DEFAULT_PASSWORD })),
      ).rejects.toThrow(`REDIRECT:${home}`);
    }
  });

  it('gives the same message for unknown, wrong, inactive and passwordless', async () => {
    const known = await createCustomer();
    const inactive = await createStaff({ is_active: false });
    const invited = await createStaff({ password: null });

    const results = [
      await loginAction(null, form({ email: 'no@one.in', password: DEFAULT_PASSWORD })),
      await loginAction(null, form({ email: known.email, password: 'Wrong@2026' })),
      await loginAction(null, form({ email: inactive.email, password: DEFAULT_PASSWORD })),
      await loginAction(null, form({ email: invited.email, password: DEFAULT_PASSWORD })),
    ];

    for (const result of results) expect(result).toEqual(GENERIC);
    expect(await db('sessions')).toHaveLength(0);
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });

  it('purges expired sessions on login', async () => {
    const user = await createCustomer();
    await db('sessions').insert({
      user_id: user.id,
      token_hash: 'e'.repeat(64),
      expires_at: new Date(Date.now() - 1000),
    });

    await expect(
      loginAction(null, form({ email: user.email, password: DEFAULT_PASSWORD })),
    ).rejects.toThrow('REDIRECT:/portal');

    const rows = await db('sessions').where('user_id', user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe('e'.repeat(64));
  });

  it('asks for blank fields without touching the database path', async () => {
    const result = await loginAction(null, form({ email: '', password: '' }));
    expect(result.fieldErrors).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    });
  });
});

describe('forgotPasswordAction', () => {
  it('answers identically for known, unknown and inactive accounts', async () => {
    const known = await createCustomer();
    const inactive = await createCustomer({ is_active: false });

    const results = [
      await forgotPasswordAction(null, form({ email: known.email })),
      await forgotPasswordAction(null, form({ email: 'no@one.in' })),
      await forgotPasswordAction(null, form({ email: inactive.email })),
    ];

    expect(results[0]).toEqual({
      ok: true,
      message: 'If an account exists for that email, a reset link is on its way.',
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('does the work only after the response, for every outcome', async () => {
    const known = await createCustomer();

    await forgotPasswordAction(null, form({ email: known.email }));
    await forgotPasswordAction(null, form({ email: 'no@one.in' }));

    expect(afterQueue).toHaveLength(2);
    expect(sendMail).not.toHaveBeenCalled();
    expect(await db('password_reset_tokens')).toHaveLength(0);

    await flushAfter();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe(known.email);
  });

  it('keeps the response identical when sending fails', async () => {
    const known = await createCustomer();
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await forgotPasswordAction(null, form({ email: known.email }));
    await expect(flushAfter()).resolves.toBeUndefined();

    expect(result.ok).toBe(true);
    logged.mockRestore();
  });

  it('asks for a blank email', async () => {
    const result = await forgotPasswordAction(null, form({ email: ' ' }));
    expect(result.fieldErrors.email).toBeDefined();
    expect(afterQueue).toHaveLength(0);
  });
});

describe('resetPasswordAction', () => {
  async function tokenFor(user) {
    await forgotPasswordAction(null, form({ email: user.email }));
    await flushAfter();
    return tokenFromMail();
  }

  it('sets the password, ends sessions and sends the person to login', async () => {
    const user = await createCustomer();
    const session = await createSessionFor(user);
    cookieJar.set(SESSION_COOKIE, session.token);
    const token = await tokenFor(user);

    await expect(
      resetPasswordAction(null, form({ token, password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:/login?reset=1');

    expect(await getCurrentUser()).toBeNull();
    await expect(
      loginAction(null, form({ email: user.email, password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:/portal');
  });

  it('applies the password rule and leaves the token usable', async () => {
    const user = await createCustomer();
    const token = await tokenFor(user);

    const result = await resetPasswordAction(null, form({ token, password: 'short' }));

    expect(result.fieldErrors.password).toMatch(/at least 9/);
    await expect(
      resetPasswordAction(null, form({ token, password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:');
  });

  it('gives a clear message for a used token', async () => {
    const user = await createCustomer();
    const token = await tokenFor(user);
    await expect(
      resetPasswordAction(null, form({ token, password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:');

    const result = await resetPasswordAction(null, form({ token, password: 'Another#2028' }));

    expect(result).toEqual({
      ok: false,
      message: 'This link has expired or has already been used. Request a new one.',
    });
  });

  it('treats a missing token as an invalid link', async () => {
    const result = await resetPasswordAction(null, form({ password: 'Traders#2027' }));
    expect(result.message).toMatch(/expired/);
  });
});

describe('inviteStaffAction', () => {
  const ASHA = { name: 'Asha Rao', email: 'asha@brightloop.in' };

  it('needs a login', async () => {
    await expect(inviteStaffAction(null, form(ASHA))).rejects.toThrow('REDIRECT:/login');
    expect(await db('users')).toHaveLength(0);
  });

  it.each([
    ['staff', createStaff],
    ['customer', createCustomer],
  ])('refuses a %s before doing anything', async (_label, factory) => {
    await logIn(await factory());
    await expect(inviteStaffAction(null, form(ASHA))).rejects.toThrow('REDIRECT:/forbidden');
    expect(await db('users').where('email', ASHA.email)).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('invites as admin, ignoring a posted role', async () => {
    await logIn(await createAdmin());

    await expect(inviteStaffAction(null, form({ ...ASHA, role: 'admin' }))).rejects.toThrow(
      'REDIRECT:/staff?invited=sent',
    );

    const row = await db('users').where('email', ASHA.email).first();
    expect(row.role).toBe('staff');
    expect(row.password_hash).toBeNull();
    expect(revalidated).toContain('/staff');
  });

  it('then the invited person can set a password and log in', async () => {
    await logIn(await createAdmin());
    await expect(inviteStaffAction(null, form(ASHA))).rejects.toThrow('REDIRECT:/staff');
    cookieJar.clear();

    await expect(
      resetPasswordAction(null, form({ token: tokenFromMail(), password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:/login?reset=1');
    await expect(
      loginAction(null, form({ email: ASHA.email, password: 'Traders#2027' })),
    ).rejects.toThrow('REDIRECT:/dashboard');
  });

  it('returns a field error on email when the account exists', async () => {
    await logIn(await createAdmin());
    await createCustomer({ email: 'asha@brightloop.in' });

    const result = await inviteStaffAction(null, form(ASHA));

    expect(result).toEqual({
      ok: false,
      fieldErrors: { email: 'An account with this email already exists.' },
    });
  });

  it('tells the admin when the email could not be sent', async () => {
    await logIn(await createAdmin());
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(inviteStaffAction(null, form(ASHA))).rejects.toThrow(
      'REDIRECT:/staff?invited=unsent',
    );
    logged.mockRestore();
  });

  it('returns field errors for invalid input', async () => {
    await logIn(await createAdmin());
    const result = await inviteStaffAction(null, form({ name: '', email: 'nope' }));
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['email', 'name']);
  });
});

describe('resendInviteAction', () => {
  it('needs a login', async () => {
    const target = await createStaff({ password: null });
    await expect(resendInviteAction(null, form({ userId: target.id }))).rejects.toThrow(
      'REDIRECT:/login',
    );
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });

  it('refuses staff and customers', async () => {
    const target = await createStaff({ password: null });
    for (const actor of [await createStaff(), await createCustomer()]) {
      cookieJar.clear();
      await logIn(actor);
      await expect(resendInviteAction(null, form({ userId: target.id }))).rejects.toThrow(
        'REDIRECT:/forbidden',
      );
    }
    expect(await db('password_reset_tokens')).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('sends a fresh link for an admin and refreshes the list', async () => {
    await logIn(await createAdmin());
    const target = await createStaff({ password: null });

    expect(await resendInviteAction(null, form({ userId: target.id }))).toEqual({
      ok: true,
      message: 'Invite sent. The link is valid for 72 hours.',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(revalidated).toContain('/staff');
  });

  it('explains when the person is not eligible', async () => {
    await logIn(await createAdmin());
    const target = await createStaff();

    const result = await resendInviteAction(null, form({ userId: target.id }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('has not set a password');
  });

  it('returns a friendly error for a bad or unknown id', async () => {
    await logIn(await createAdmin());
    for (const userId of ['abc', '99999', '99999999999']) {
      const result = await resendInviteAction(null, form({ userId }));
      expect(result.message).toBe('That staff member could not be found.');
    }
  });

  it('says so when the email could not be sent', async () => {
    await logIn(await createAdmin());
    const target = await createStaff({ password: null });
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await resendInviteAction(null, form({ userId: target.id }));
    logged.mockRestore();

    expect(result.ok).toBe(false);
    expect(result.message).toContain('could not be sent');
  });
});

describe('deactivateStaffAction and reactivateStaffAction', () => {
  it('need a login', async () => {
    const staff = await createStaff();
    await expect(deactivateStaffAction(null, form({ userId: staff.id }))).rejects.toThrow(
      'REDIRECT:/login',
    );
    await expect(reactivateStaffAction(null, form({ userId: staff.id }))).rejects.toThrow(
      'REDIRECT:/login',
    );
  });

  it('refuse staff and customers', async () => {
    const target = await createStaff();
    for (const actor of [await createStaff(), await createCustomer()]) {
      cookieJar.clear();
      await logIn(actor);
      await expect(deactivateStaffAction(null, form({ userId: target.id }))).rejects.toThrow(
        'REDIRECT:/forbidden',
      );
      await expect(reactivateStaffAction(null, form({ userId: target.id }))).rejects.toThrow(
        'REDIRECT:/forbidden',
      );
    }
    const row = await db('users').where('id', target.id).first('is_active');
    expect(row.is_active).toBe(true);
  });

  it('deactivate and reactivate a staff member', async () => {
    await logIn(await createAdmin());
    const staff = await createStaff();
    await createSessionFor(staff);

    expect(await deactivateStaffAction(null, form({ userId: staff.id }))).toEqual({
      ok: true,
      message: 'Staff member deactivated.',
    });
    expect(await db('sessions').where('user_id', staff.id)).toHaveLength(0);
    expect(revalidated).toContain('/staff');

    expect(await reactivateStaffAction(null, form({ userId: staff.id }))).toEqual({
      ok: true,
      message: 'Staff member reactivated.',
    });
    expect((await db('users').where('id', staff.id).first()).is_active).toBe(true);
  });

  it('take the actor from the session, so an admin cannot deactivate themselves', async () => {
    const admin = await createAdmin();
    await logIn(admin);

    const result = await deactivateStaffAction(
      null,
      form({ userId: admin.id, actorId: 12345 }),
    );

    expect(result).toEqual({ ok: false, message: 'You cannot deactivate your own account.' });
    expect((await db('users').where('id', admin.id).first()).is_active).toBe(true);
    expect((await getCurrentUser()).id).toBe(admin.id);
  });

  it('return a friendly error for a bad or unknown id', async () => {
    await logIn(await createAdmin());
    for (const userId of ['abc', '99999', '99999999999']) {
      const result = await deactivateStaffAction(null, form({ userId }));
      expect(result.message).toBe('That staff member could not be found.');
    }
  });

  it('deactivating the logged-in staff member logs them out on the next request', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    await logIn(admin);
    await deactivateStaffAction(null, form({ userId: staff.id }));

    cookieJar.clear();
    await expect(
      loginAction(null, form({ email: staff.email, password: DEFAULT_PASSWORD })),
    ).resolves.toEqual({ ok: false, message: 'Incorrect email or password.' });
  });
});
