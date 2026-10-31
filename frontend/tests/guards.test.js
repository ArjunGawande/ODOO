import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_COOKIE } from '@backend/lib/auth/session-store';

import { resetTables } from '../../backend/tests/helpers/db';
import { createAdmin, createCustomer, createSessionFor, createStaff } from '../../backend/tests/helpers/factories';

const cookieJar = vi.hoisted(() => new Map());
const cookieOptions = vi.hoisted(() => new Map());

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name, value, options) => {
      cookieJar.set(name, value);
      cookieOptions.set(name, options);
    },
    delete: (name) => cookieJar.delete(name),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (path) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { getCurrentUser, requirePermission, requireUser } = await import('@/lib/auth/guards');
const { db } = await import('@backend/lib/db');
const { endSession, startSession } = await import('@/lib/auth/session');

async function logIn(user) {
  const { token } = await createSessionFor(user);
  cookieJar.set(SESSION_COOKIE, token);
}

beforeEach(async () => {
  cookieJar.clear();
  cookieOptions.clear();
  await resetTables();
});

describe('getCurrentUser', () => {
  it('returns null without a cookie', async () => {
    expect(await getCurrentUser()).toBeNull();
  });

  it('returns the public user fields for a valid cookie', async () => {
    const user = await createStaff({ name: 'Asha', email: 'asha@example.test' });
    await logIn(user);
    expect(await getCurrentUser()).toEqual({
      id: user.id,
      name: 'Asha',
      email: 'asha@example.test',
      role: 'staff',
    });
  });

  it('treats a deactivated user as logged out', async () => {
    const user = await createStaff();
    await logIn(user);
    await db('users').where('id', user.id).update({ is_active: false });
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('requireUser', () => {
  it('redirects to /login when logged out', async () => {
    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });

  it('returns the user when logged in', async () => {
    const user = await createCustomer();
    await logIn(user);
    expect((await requireUser()).id).toBe(user.id);
  });
});

describe('requirePermission', () => {
  it('sends a logged-out visitor to /login, not /forbidden', async () => {
    await expect(requirePermission('workspace.view')).rejects.toThrow('REDIRECT:/login');
  });

  it('sends a role without the permission to /forbidden', async () => {
    await logIn(await createCustomer());
    await expect(requirePermission('workspace.view')).rejects.toThrow('REDIRECT:/forbidden');
  });

  it('blocks staff from admin-only permissions', async () => {
    await logIn(await createStaff());
    await expect(requirePermission('products.write')).rejects.toThrow('REDIRECT:/forbidden');
  });

  it('returns the user when allowed', async () => {
    const admin = await createAdmin();
    await logIn(admin);
    expect((await requirePermission('staff.manage')).id).toBe(admin.id);
  });
});

describe('session cookie wrapper', () => {
  it('sets the cookie with the contract flags on login', async () => {
    const user = await createCustomer();
    await startSession(user.id);

    const options = cookieOptions.get(SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, path: '/' });
    expect(options.expires).toBeInstanceOf(Date);
    expect(await db('sessions').where('user_id', user.id)).toHaveLength(1);
    expect((await getCurrentUser()).id).toBe(user.id);
  });

  it('marks the cookie secure in production', async () => {
    const user = await createCustomer();
    vi.stubEnv('NODE_ENV', 'production');
    await startSession(user.id);
    vi.unstubAllEnvs();
    expect(cookieOptions.get(SESSION_COOKIE)).toMatchObject({ secure: true });
  });

  it('deletes the row and clears the cookie on logout', async () => {
    const user = await createCustomer();
    await logIn(user);
    await endSession();
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(await db('sessions')).toHaveLength(0);
  });

  it('logout is harmless with no cookie', async () => {
    await expect(endSession()).resolves.toBeUndefined();
  });
});
