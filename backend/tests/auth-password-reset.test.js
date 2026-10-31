import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findUserByToken, hashToken } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';
import {
  INVITE_TTL_MS,
  RESET_TTL_MS,
  inspectToken,
  issueToken,
  requestPasswordReset,
  resetPassword,
} from '@backend/services/password-reset';
import { authenticate, deactivateStaff, inviteStaff, reactivateStaff } from '@backend/services/users';

import { resetTables } from './helpers/db';
import {
  DEFAULT_PASSWORD,
  createAdmin,
  createCustomer,
  createSessionFor,
  createStaff,
} from './helpers/factories';

const sendMail = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@backend/lib/mailer', () => ({ sendMail }));

const NEW_PASSWORD = 'Traders#2027';

function tokenFromMail(index = -1) {
  const { text } = sendMail.mock.calls.at(index)[0];
  return /\/reset-password\?token=([\w-]+)/.exec(text)[1];
}

async function requestToken(user) {
  await requestPasswordReset(user.email);
  return tokenFromMail();
}

beforeEach(async () => {
  sendMail.mockClear();
  sendMail.mockImplementation(async () => {});
  await resetTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestPasswordReset', () => {
  it('emails a link in the contract format to the stored address', async () => {
    const user = await createCustomer({ email: 'owner@sharma.in', name: 'Sharma Traders' });

    await requestPasswordReset('  OWNER@Sharma.in ');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe(user.email);
    expect(mail.subject).toBe('Reset your Brightloop password');
    expect(mail.text).toContain(
      `${process.env.APP_URL}/reset-password?token=${tokenFromMail()}`,
    );
    expect(mail.text).toContain('Sharma Traders');
    expect(mail.html).toContain('href=');
  });

  it('stores only the SHA-256 hash, with a one-hour expiry and reset purpose', async () => {
    const user = await createCustomer();
    const before = Date.now();

    const token = await requestToken(user);

    const rows = await db('password_reset_tokens');
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].purpose).toBe('reset');
    expect(rows[0].used_at).toBeNull();
    expect(rows[0].expires_at.getTime()).toBeGreaterThanOrEqual(before + RESET_TTL_MS);
    expect(rows[0].expires_at.getTime()).toBeLessThanOrEqual(Date.now() + RESET_TTL_MS);
  });

  it('uses a 32-byte token', async () => {
    const token = await requestToken(await createCustomer());
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('does nothing visible for an unknown email', async () => {
    await expect(requestPasswordReset('no@one.in')).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });

  it('does not email an inactive account or issue it a token', async () => {
    const user = await createCustomer({ is_active: false });
    await expect(requestPasswordReset(user.email)).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });

  it('returns the same undefined when the account exists', async () => {
    const user = await createCustomer();
    await expect(requestPasswordReset(user.email)).resolves.toBeUndefined();
  });

  it('swallows a failed send and logs it without the token', async () => {
    const user = await createCustomer();
    sendMail.mockImplementationOnce(async ({ text }) => {
      throw new Error(`smtp down`, { cause: text });
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(requestPasswordReset(user.email)).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).toBe(
      JSON.stringify([['Password reset request failed:', 'smtp down']]),
    );
  });

  it('swallows a database failure too', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A NUL byte makes Postgres reject the query.
    await expect(requestPasswordReset('a\0@b.in')).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('a new token invalidates the older one', async () => {
    const user = await createCustomer();
    const older = await requestToken(user);
    const newer = await requestToken(user);

    expect(newer).not.toBe(older);
    expect(await inspectToken(older)).toBeNull();
    expect(await resetPassword({ token: older, password: NEW_PASSWORD })).toEqual({ ok: false });
    expect((await resetPassword({ token: newer, password: NEW_PASSWORD })).ok).toBe(true);
  });

  it('a reset request invalidates an unused invite', async () => {
    await inviteStaff({ name: 'Asha', email: 'asha@brightloop.in' });
    const invite = tokenFromMail();

    await requestPasswordReset('asha@brightloop.in');

    expect(await inspectToken(invite)).toBeNull();
    expect(await inspectToken(tokenFromMail())).toEqual({ purpose: 'reset' });
  });

  it('leaves one live token after concurrent requests', async () => {
    const user = await createCustomer();

    await Promise.all(Array.from({ length: 5 }, () => requestPasswordReset(user.email)));

    expect(sendMail).toHaveBeenCalledTimes(5);
    const live = await db('password_reset_tokens').whereNull('used_at');
    expect(live).toHaveLength(1);
  });

  it('waits for an overlapping request, so its uncommitted token is retired too', async () => {
    const user = await createCustomer();

    // The first request is held open with its token inserted but not committed.
    let second;
    await db.transaction(async (trx) => {
      await issueToken(user.id, 'reset', trx);
      second = requestPasswordReset(user.email);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(sendMail).not.toHaveBeenCalled();
    });
    // The commit above released the second request.
    await second;
    expect(sendMail).toHaveBeenCalledTimes(1);

    const live = await db('password_reset_tokens').whereNull('used_at');
    expect(live).toHaveLength(1);
    expect(live[0].token_hash).toBe(hashToken(tokenFromMail()));
  });

  it('does not touch other users tokens', async () => {
    const first = await createCustomer();
    const second = await createCustomer();
    const token = await requestToken(first);

    await requestToken(second);

    expect(await inspectToken(token)).toEqual({ purpose: 'reset' });
  });
});

describe('inspectToken', () => {
  it('finds a live token without consuming it', async () => {
    const token = await requestToken(await createCustomer());
    expect(await inspectToken(token)).toEqual({ purpose: 'reset' });
    expect(await inspectToken(token)).toEqual({ purpose: 'reset' });
    expect((await db('password_reset_tokens').first()).used_at).toBeNull();
  });

  it('returns null for an empty or unknown token', async () => {
    expect(await inspectToken('')).toBeNull();
    expect(await inspectToken(undefined)).toBeNull();
    expect(await inspectToken('not-a-real-token')).toBeNull();
  });

  it('returns null for the stored hash used as a token', async () => {
    await requestToken(await createCustomer());
    const { token_hash } = await db('password_reset_tokens').first();
    expect(await inspectToken(token_hash)).toBeNull();
  });

  it('returns null for an expired token', async () => {
    const token = await requestToken(await createCustomer());
    await db('password_reset_tokens').update({ expires_at: new Date(Date.now() - 1000) });
    expect(await inspectToken(token)).toBeNull();
  });

  it('returns null once the user is inactive', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);
    await db('users').where('id', user.id).update({ is_active: false });
    expect(await inspectToken(token)).toBeNull();
  });
});

describe('resetPassword', () => {
  it('sets the new password and retires the old one', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);

    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({
      ok: true,
      userId: user.id,
      purpose: 'reset',
    });

    expect(await authenticate({ email: user.email, password: NEW_PASSWORD })).not.toBeNull();
    expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).toBeNull();
  });

  it('stores the new password as a cost-12 hash', async () => {
    const user = await createCustomer();
    await resetPassword({ token: await requestToken(user), password: NEW_PASSWORD });
    const { password_hash } = await db('users').where('id', user.id).first();
    expect(password_hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('kills all of that user sessions and no one else', async () => {
    const user = await createCustomer();
    const other = await createCustomer();
    const first = await createSessionFor(user);
    const second = await createSessionFor(user);
    const untouched = await createSessionFor(other);
    const token = await requestToken(user);

    await resetPassword({ token, password: NEW_PASSWORD });

    expect(await findUserByToken(first.token)).toBeNull();
    expect(await findUserByToken(second.token)).toBeNull();
    expect((await findUserByToken(untouched.token)).id).toBe(other.id);
  });

  it('rejects a reused token', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);
    await resetPassword({ token, password: NEW_PASSWORD });

    expect(await resetPassword({ token, password: 'Another#2028' })).toEqual({ ok: false });
    expect(await authenticate({ email: user.email, password: NEW_PASSWORD })).not.toBeNull();
    expect(await inspectToken(token)).toBeNull();
  });

  it('rejects an expired token and leaves the password alone', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);
    await db('password_reset_tokens').update({ expires_at: new Date(Date.now() - 1000) });

    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({ ok: false });

    expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).not.toBeNull();
    expect((await db('password_reset_tokens').first()).used_at).toBeNull();
  });

  it('rejects an unknown or empty token', async () => {
    expect(await resetPassword({ token: 'nope', password: NEW_PASSWORD })).toEqual({ ok: false });
    expect(await resetPassword({ token: '', password: NEW_PASSWORD })).toEqual({ ok: false });
  });

  it('lets exactly one of two simultaneous uses win', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);

    const results = await Promise.all([
      resetPassword({ token, password: NEW_PASSWORD }),
      resetPassword({ token, password: 'Another#2028' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it('refuses a token held by a deactivated user', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);
    await db('users').where('id', user.id).update({ is_active: false });

    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({ ok: false });

    expect((await db('users').where('id', user.id).first()).password_hash).toBe(user.password_hash);
  });

  it('keeps the token unused if the transaction fails part way', async () => {
    const user = await createCustomer();
    const token = await requestToken(user);
    await db.raw(`
      CREATE FUNCTION test_block_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'blocked'; END;
      $$ LANGUAGE plpgsql
    `);
    await db.raw(`
      CREATE TRIGGER test_block_session_delete BEFORE DELETE ON sessions
      FOR EACH ROW EXECUTE FUNCTION test_block_delete()
    `);
    await createSessionFor(user);

    try {
      await expect(resetPassword({ token, password: NEW_PASSWORD })).rejects.toThrow(/blocked/);
      expect(await inspectToken(token)).toEqual({ purpose: 'reset' });
      expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).not.toBeNull();
    } finally {
      await db.raw('DROP TRIGGER test_block_session_delete ON sessions');
      await db.raw('DROP FUNCTION test_block_delete()');
    }
  });
});

describe('staff invite flow', () => {
  const ASHA = { name: 'Asha Rao', email: 'asha@brightloop.in' };

  it('goes from invite to set password to login', async () => {
    const { user } = await inviteStaff(ASHA);
    expect(await authenticate({ email: ASHA.email, password: NEW_PASSWORD })).toBeNull();

    const token = tokenFromMail();
    expect(await inspectToken(token)).toEqual({ purpose: 'invite' });
    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({
      ok: true,
      userId: user.id,
      purpose: 'invite',
    });

    expect(await authenticate({ email: ASHA.email, password: NEW_PASSWORD })).toEqual({
      id: user.id,
      name: 'Asha Rao',
      email: ASHA.email,
      role: 'staff',
    });
  });

  it('gives the invite a 72-hour expiry and stores only its hash', async () => {
    const before = Date.now();
    await inviteStaff(ASHA);
    const token = tokenFromMail();

    const row = await db('password_reset_tokens').first();
    expect(row.purpose).toBe('invite');
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.expires_at.getTime()).toBeGreaterThanOrEqual(before + INVITE_TTL_MS);
    expect(row.expires_at.getTime()).toBeLessThanOrEqual(Date.now() + INVITE_TTL_MS);
  });

  it('rejects an expired invite', async () => {
    await inviteStaff(ASHA);
    const token = tokenFromMail();
    await db('password_reset_tokens').update({ expires_at: new Date(Date.now() - 1000) });

    expect(await inspectToken(token)).toBeNull();
    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({ ok: false });
  });

  it('rejects a reused invite', async () => {
    await inviteStaff(ASHA);
    const token = tokenFromMail();
    await resetPassword({ token, password: NEW_PASSWORD });
    expect(await resetPassword({ token, password: 'Another#2028' })).toEqual({ ok: false });
  });

  it('escapes the name in the HTML body', async () => {
    await inviteStaff({ ...ASHA, name: '<script>alert(1)</script>' });
    const { html } = sendMail.mock.calls[0][0];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('retires an open invite on deactivation, even after reactivation', async () => {
    const admin = await createAdmin();
    const { user } = await inviteStaff(ASHA);
    const token = tokenFromMail();

    await deactivateStaff({ actorId: admin.id, userId: user.id });
    await reactivateStaff({ userId: user.id });

    expect(await inspectToken(token)).toBeNull();
    expect(await resetPassword({ token, password: NEW_PASSWORD })).toEqual({ ok: false });
  });

  it('lets a reactivated, passwordless person recover through forgot password', async () => {
    const admin = await createAdmin();
    const { user } = await inviteStaff(ASHA);
    await deactivateStaff({ actorId: admin.id, userId: user.id });
    await reactivateStaff({ userId: user.id });

    await requestPasswordReset(ASHA.email);
    await resetPassword({ token: tokenFromMail(), password: NEW_PASSWORD });

    expect(await authenticate({ email: ASHA.email, password: NEW_PASSWORD })).not.toBeNull();
  });

  it('a reset on an existing staff member works like any other', async () => {
    const staff = await createStaff();
    const token = await requestToken(staff);
    expect((await resetPassword({ token, password: NEW_PASSWORD })).ok).toBe(true);
  });
});
