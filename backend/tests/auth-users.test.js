import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DUMMY_HASH } from '@backend/lib/auth/password';
import { findUserByToken } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';
import { inspectToken, issueToken, resetPassword } from '@backend/services/password-reset';
import {
  authenticate,
  deactivateStaff,
  inviteStaff,
  listStaff,
  reactivateStaff,
  registerCustomer,
  resendInvite,
} from '@backend/services/users';

import { resetTables } from './helpers/db';
import {
  DEFAULT_PASSWORD,
  createAdmin,
  createCustomer,
  createSessionFor,
  createStaff,
  createUser,
} from './helpers/factories';

const sendMail = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@backend/lib/mailer', () => ({ sendMail }));

const SHARMA = { name: 'Sharma Traders', email: 'owner@sharma.in', password: 'Sharma@2026' };

beforeEach(async () => {
  sendMail.mockClear();
  sendMail.mockImplementation(async () => {});
  await resetTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerCustomer', () => {
  it('creates the Sharma Traders customer', async () => {
    const result = await registerCustomer(SHARMA);

    expect(result).toEqual({
      ok: true,
      user: { id: 1, name: 'Sharma Traders', email: 'owner@sharma.in', role: 'customer' },
    });
    const row = await db('users').where('id', 1).first();
    expect(row.is_active).toBe(true);
    expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.password_hash).not.toContain(SHARMA.password);
  });

  it('rejects the same email a second time', async () => {
    await registerCustomer(SHARMA);
    expect(await registerCustomer({ ...SHARMA, name: 'Someone else' })).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(await db('users')).toHaveLength(1);
  });

  it('rejects a case variant of an existing email', async () => {
    await registerCustomer(SHARMA);
    const result = await registerCustomer({ ...SHARMA, email: 'OWNER@Sharma.in' });
    expect(result.reason).toBe('email_taken');
    expect(await db('users')).toHaveLength(1);
  });

  it('rejects an email held by a mixed-case row written by something else', async () => {
    await createUser({ email: 'Owner@Sharma.in' });
    expect((await registerCustomer(SHARMA)).reason).toBe('email_taken');
  });

  it('stores the email trimmed and lowercased even if called directly', async () => {
    const { user } = await registerCustomer({ ...SHARMA, email: '  OWNER@Sharma.in ' });
    expect(user.email).toBe('owner@sharma.in');
  });

  it('ignores a role passed to the service', async () => {
    const { user } = await registerCustomer({ ...SHARMA, role: 'admin', is_active: false });
    expect(user.role).toBe('customer');
    expect(await db('users').where('id', user.id).first('is_active')).toEqual({ is_active: true });
  });

  it('settles concurrent duplicates to one account with friendly results', async () => {
    const attempts = ['owner@sharma.in', 'OWNER@sharma.in', 'Owner@Sharma.in', 'owner@SHARMA.in'];
    const results = await Promise.all(
      attempts.map((email) => registerCustomer({ ...SHARMA, email })),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.reason === 'email_taken')).toHaveLength(3);
    expect(await db('users')).toHaveLength(1);
  });

  it('surfaces errors that are not duplicate emails', async () => {
    await expect(registerCustomer({ ...SHARMA, name: 'a'.repeat(121) })).rejects.toThrow();
  });
});

describe('authenticate', () => {
  it('returns only public fields on success', async () => {
    const user = await createCustomer({ email: 'owner@sharma.in', name: 'Sharma Traders' });
    expect(await authenticate({ email: 'owner@sharma.in', password: DEFAULT_PASSWORD })).toEqual({
      id: user.id,
      name: 'Sharma Traders',
      email: 'owner@sharma.in',
      role: 'customer',
    });
  });

  it('matches email case-insensitively', async () => {
    const user = await createCustomer({ email: 'owner@sharma.in' });
    const found = await authenticate({ email: ' OWNER@Sharma.in', password: DEFAULT_PASSWORD });
    expect(found.id).toBe(user.id);
  });

  it('returns null for an unknown email', async () => {
    expect(await authenticate({ email: 'no@one.in', password: DEFAULT_PASSWORD })).toBeNull();
  });

  it('returns null for a wrong password', async () => {
    const user = await createCustomer();
    expect(await authenticate({ email: user.email, password: 'Wrong@2026' })).toBeNull();
  });

  it('returns null for an inactive user with the right password', async () => {
    const user = await createStaff({ is_active: false });
    expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).toBeNull();
  });

  it('returns null for a user with no password yet', async () => {
    const user = await createStaff({ password: null });
    expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).toBeNull();
  });

  it('refuses extra bytes after a 72-byte password, which bcrypt would ignore', async () => {
    const password = `Aa@${'x'.repeat(69)}`;
    const user = await createCustomer({ password });
    expect(await authenticate({ email: user.email, password })).not.toBeNull();
    expect(await authenticate({ email: user.email, password: `${password}y` })).toBeNull();
  });

  it('does one bcrypt comparison against the dummy hash in every no-account case', async () => {
    const inactive = await createStaff({ is_active: false });
    const invited = await createStaff({ password: null });
    const compare = vi.spyOn(bcrypt, 'compare');

    for (const email of ['no@one.in', inactive.email, invited.email]) {
      compare.mockClear();
      await authenticate({ email, password: DEFAULT_PASSWORD });
      expect(compare).toHaveBeenCalledTimes(1);
      expect(compare.mock.calls[0][1]).toBe(DUMMY_HASH);
    }
  });
});

describe('inviteStaff', () => {
  it('creates staff with no password and sends one invite', async () => {
    const result = await inviteStaff({ name: 'Asha Rao', email: 'ASHA@Brightloop.in' });

    expect(result).toMatchObject({
      ok: true,
      emailSent: true,
      user: { name: 'Asha Rao', email: 'asha@brightloop.in', role: 'staff' },
    });
    const row = await db('users').where('email', 'asha@brightloop.in').first();
    expect(row.password_hash).toBeNull();
    expect(row.is_active).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('asha@brightloop.in');
  });

  it('rejects an email that already has an account, in any case', async () => {
    await createCustomer({ email: 'owner@sharma.in' });
    expect(await inviteStaff({ name: 'Asha', email: 'OWNER@sharma.in' })).toEqual({
      ok: false,
      reason: 'email_taken',
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });

  it('never upgrades an existing customer to staff', async () => {
    const customer = await createCustomer({ email: 'owner@sharma.in' });
    await inviteStaff({ name: 'Asha', email: 'owner@sharma.in' });
    expect(await db('users').where('id', customer.id).first('role')).toEqual({ role: 'customer' });
  });

  it('settles concurrent invites to one account and one email', async () => {
    const results = await Promise.all([
      inviteStaff({ name: 'Asha', email: 'asha@brightloop.in' }),
      inviteStaff({ name: 'Asha', email: 'ASHA@brightloop.in' }),
      inviteStaff({ name: 'Asha', email: 'Asha@Brightloop.in' }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => result.reason === 'email_taken')).toHaveLength(2);
    expect(await db('users')).toHaveLength(1);
    expect(await db('password_reset_tokens')).toHaveLength(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('keeps the account and reports it when the email fails', async () => {
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await inviteStaff({ name: 'Asha', email: 'asha@brightloop.in' });

    expect(result).toMatchObject({ ok: true, emailSent: false });
    expect(await db('users')).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
  });
});

describe('listStaff', () => {
  it('lists only staff, active first, with the total from the database', async () => {
    await createAdmin();
    await createCustomer();
    await createStaff({ name: 'Zoya' });
    await createStaff({ name: 'Bina', is_active: false });
    await createStaff({ name: 'Asha', password: null });

    const { rows, total } = await listStaff();

    expect(total).toBe(3);
    expect(rows.map((row) => row.name)).toEqual(['Asha', 'Zoya', 'Bina']);
    expect(rows[0].invite_pending).toBe(true);
    expect(rows[1].invite_pending).toBe(false);
  });

  it('never returns a password hash', async () => {
    await createStaff();
    const { rows } = await listStaff();
    expect(Object.keys(rows[0]).sort()).toEqual([
      'email',
      'id',
      'invite_expired',
      'invite_pending',
      'is_active',
      'name',
    ]);
  });

  describe('invite_expired', () => {
    const issue = (user, purpose = 'invite') =>
      db.transaction((trx) => issueToken(user.id, purpose, trx));

    async function statusOf(user) {
      const { rows } = await listStaff();
      return rows.find((row) => row.id === user.id);
    }

    it('is false while an unused link is still valid', async () => {
      const staff = await createStaff({ password: null });
      await issue(staff);
      expect(await statusOf(staff)).toMatchObject({ invite_pending: true, invite_expired: false });
    });

    it('is true when the only link has run out', async () => {
      const staff = await createStaff({ password: null });
      await issue(staff);
      await db('password_reset_tokens').update({ expires_at: db.raw("now() - interval '1 second'") });
      expect(await statusOf(staff)).toMatchObject({ invite_pending: true, invite_expired: true });
    });

    it('is true when the link was retired, or there never was one', async () => {
      const staff = await createStaff({ password: null });
      expect((await statusOf(staff)).invite_expired).toBe(true);

      await issue(staff);
      await db('password_reset_tokens').update({ used_at: db.fn.now() });
      expect((await statusOf(staff)).invite_expired).toBe(true);
    });

    it('ignores another person who has a live link', async () => {
      const expired = await createStaff({ password: null });
      const pending = await createStaff({ password: null });
      await issue(pending);
      expect((await statusOf(expired)).invite_expired).toBe(true);
      expect((await statusOf(pending)).invite_expired).toBe(false);
    });

    it('counts a live reset link, because it can set the password too', async () => {
      const staff = await createStaff({ password: null });
      await issue(staff, 'reset');
      expect((await statusOf(staff)).invite_expired).toBe(false);
    });

    it('is false for anyone who has a password, whatever their tokens', async () => {
      const staff = await createStaff();
      expect(await statusOf(staff)).toMatchObject({ invite_pending: false, invite_expired: false });
    });

    it('takes the same two queries however many staff there are', async () => {
      for (let index = 0; index < 5; index += 1) await createStaff({ password: null });
      const queries = [];
      const record = (query) => queries.push(query.sql);
      db.on('query', record);
      try {
        await listStaff();
      } finally {
        db.removeListener('query', record);
      }
      expect(queries).toHaveLength(2);
    });
  });

  it('pages in SQL and keeps the full total', async () => {
    for (const name of ['A', 'B', 'C']) await createStaff({ name });
    const { rows, total } = await listStaff({ limit: 2, offset: 2 });
    expect(rows.map((row) => row.name)).toEqual(['C']);
    expect(total).toBe(3);
  });

  it('searches name and email case-insensitively', async () => {
    await createStaff({ name: 'Asha Rao', email: 'asha@x.in' });
    await createStaff({ name: 'Bina', email: 'bina@rao.in' });
    await createStaff({ name: 'Chitra', email: 'chitra@x.in' });

    const { rows, total } = await listStaff({ q: 'RAO' });

    expect(rows.map((row) => row.name)).toEqual(['Asha Rao', 'Bina']);
    expect(total).toBe(2);
  });

  it('treats % and _ in a search as literal text', async () => {
    await createStaff({ name: 'Asha', email: 'asha@x.in' });
    await createStaff({ name: '100% Bina', email: 'bina@x.in' });

    expect((await listStaff({ q: '%' })).rows.map((row) => row.name)).toEqual(['100% Bina']);
    expect((await listStaff({ q: 'a_h' })).total).toBe(0);
  });

  it('does not count customers who match a search', async () => {
    await createCustomer({ name: 'Rao Traders' });
    await createStaff({ name: 'Asha' });
    expect((await listStaff({ q: 'rao' })).total).toBe(0);
  });
});

describe('resendInvite', () => {
  function liveTokens(userId) {
    return db('password_reset_tokens')
      .where('user_id', userId)
      .whereNull('used_at')
      .whereRaw('expires_at > now()');
  }

  function tokenFromMail() {
    return /token=([\w-]+)/.exec(sendMail.mock.calls.at(-1)[0].text)[1];
  }

  it('issues a fresh invite and mails it to the stored address', async () => {
    const staff = await createStaff({ password: null, email: 'asha@brightloop.in' });

    const result = await resendInvite({ userId: staff.id });

    expect(result).toMatchObject({
      ok: true,
      emailSent: true,
      user: { id: staff.id, email: 'asha@brightloop.in', role: 'staff' },
    });
    expect(result.user).not.toHaveProperty('password_hash');
    expect(sendMail.mock.calls[0][0].to).toBe('asha@brightloop.in');
    expect(sendMail.mock.calls[0][0].subject).toBe('You are invited to Brightloop');
    expect(await inspectToken(tokenFromMail())).toEqual({ purpose: 'invite' });
  });

  it('kills the older link, and the new one sets the password', async () => {
    const { user } = await inviteStaff({ name: 'Asha', email: 'asha@brightloop.in' });
    const first = tokenFromMail();

    await resendInvite({ userId: user.id });
    const second = tokenFromMail();

    expect(second).not.toBe(first);
    expect(await liveTokens(user.id)).toHaveLength(1);
    expect(await inspectToken(first)).toBeNull();
    expect(await resetPassword({ token: first, password: DEFAULT_PASSWORD })).toEqual({ ok: false });
    expect(await resetPassword({ token: second, password: DEFAULT_PASSWORD })).toMatchObject({
      ok: true,
    });
    expect(await authenticate({ email: user.email, password: DEFAULT_PASSWORD })).toMatchObject({
      id: user.id,
    });
  });

  it('turns an expired invite back into a pending one', async () => {
    const { user } = await inviteStaff({ name: 'Asha', email: 'asha@brightloop.in' });
    await db('password_reset_tokens').update({ expires_at: db.raw("now() - interval '1 second'") });
    expect((await listStaff()).rows[0].invite_expired).toBe(true);

    await resendInvite({ userId: user.id });

    expect((await listStaff()).rows[0].invite_expired).toBe(false);
  });

  it('refuses someone who has already set a password', async () => {
    const staff = await createStaff();
    expect(await resendInvite({ userId: staff.id })).toEqual({ ok: false, reason: 'not_eligible' });
    expect(await db('password_reset_tokens')).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('refuses an inactive staff member', async () => {
    const staff = await createStaff({ password: null, is_active: false });
    expect(await resendInvite({ userId: staff.id })).toEqual({ ok: false, reason: 'not_eligible' });
    expect(await db('password_reset_tokens')).toHaveLength(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('cannot reach customers, admins or unknown ids', async () => {
    const customer = await createCustomer({ password: null });
    const admin = await createAdmin({ password: null });
    for (const userId of [customer.id, admin.id, 99999]) {
      expect(await resendInvite({ userId })).toEqual({ ok: false, reason: 'not_found' });
    }
    expect(await db('password_reset_tokens')).toHaveLength(0);
  });

  it('reports a failed send and leaves the new token in place', async () => {
    const staff = await createStaff({ password: null });
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await resendInvite({ userId: staff.id })).toMatchObject({ ok: true, emailSent: false });

    expect(await liveTokens(staff.id)).toHaveLength(1);
    expect(logged).toHaveBeenCalled();
  });

  it('leaves one live token when two resends overlap', async () => {
    const staff = await createStaff({ password: null });
    await Promise.all([resendInvite({ userId: staff.id }), resendInvite({ userId: staff.id })]);
    expect(await liveTokens(staff.id)).toHaveLength(1);
  });
});

describe('deactivateStaff', () => {
  it('sets is_active false and removes every session', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    const first = await createSessionFor(staff);
    const second = await createSessionFor(staff);

    expect(await deactivateStaff({ actorId: admin.id, userId: staff.id })).toEqual({ ok: true });

    expect(await db('users').where('id', staff.id).first('is_active')).toEqual({ is_active: false });
    expect(await db('sessions').where('user_id', staff.id)).toHaveLength(0);
    expect(await findUserByToken(first.token)).toBeNull();
    expect(await findUserByToken(second.token)).toBeNull();
  });

  it('blocks login afterwards', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    await deactivateStaff({ actorId: admin.id, userId: staff.id });
    expect(await authenticate({ email: staff.email, password: DEFAULT_PASSWORD })).toBeNull();
  });

  it('leaves other users sessions alone', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    const other = await createStaff();
    const session = await createSessionFor(other);

    await deactivateStaff({ actorId: admin.id, userId: staff.id });

    expect((await findUserByToken(session.token)).id).toBe(other.id);
  });

  it('refuses to let an admin deactivate themselves', async () => {
    const admin = await createAdmin();
    const session = await createSessionFor(admin);

    expect(await deactivateStaff({ actorId: admin.id, userId: admin.id })).toEqual({
      ok: false,
      reason: 'self',
    });
    expect((await findUserByToken(session.token)).id).toBe(admin.id);
  });

  it('cannot reach a customer or another admin', async () => {
    const admin = await createAdmin();
    const otherAdmin = await createAdmin();
    const customer = await createCustomer();

    for (const target of [otherAdmin, customer]) {
      expect(await deactivateStaff({ actorId: admin.id, userId: target.id })).toEqual({
        ok: false,
        reason: 'not_found',
      });
      const row = await db('users').where('id', target.id).first('is_active');
      expect(row.is_active).toBe(true);
    }
  });

  it('reports a missing user', async () => {
    const admin = await createAdmin();
    const result = await deactivateStaff({ actorId: admin.id, userId: 9999 });
    expect(result.reason).toBe('not_found');
  });

  it('rolls back the deactivation if removing sessions fails', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    const session = await createSessionFor(staff);
    // A trigger makes the session delete fail after the users update has run.
    await db.raw(`
      CREATE FUNCTION test_block_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'blocked'; END;
      $$ LANGUAGE plpgsql
    `);
    await db.raw(`
      CREATE TRIGGER test_block_session_delete BEFORE DELETE ON sessions
      FOR EACH ROW EXECUTE FUNCTION test_block_delete()
    `);

    try {
      await expect(deactivateStaff({ actorId: admin.id, userId: staff.id })).rejects.toThrow(
        /blocked/,
      );
      const row = await db('users').where('id', staff.id).first('is_active');
      expect(row.is_active).toBe(true);
      expect((await findUserByToken(session.token)).id).toBe(staff.id);
    } finally {
      await db.raw('DROP TRIGGER test_block_session_delete ON sessions');
      await db.raw('DROP FUNCTION test_block_delete()');
    }
  });
});

describe('reactivateStaff', () => {
  it('lets the person log in again', async () => {
    const admin = await createAdmin();
    const staff = await createStaff();
    await deactivateStaff({ actorId: admin.id, userId: staff.id });

    expect(await reactivateStaff({ userId: staff.id })).toEqual({ ok: true });

    const found = await authenticate({ email: staff.email, password: DEFAULT_PASSWORD });
    expect(found.id).toBe(staff.id);
  });

  it('does not revive a session left over from before', async () => {
    const staff = await createStaff({ is_active: false });
    const leftover = await createSessionFor(staff);

    await reactivateStaff({ userId: staff.id });

    expect(await findUserByToken(leftover.token)).toBeNull();
  });

  it('cannot reach a customer', async () => {
    const customer = await createCustomer({ is_active: false });
    expect(await reactivateStaff({ userId: customer.id })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    const row = await db('users').where('id', customer.id).first('is_active');
    expect(row.is_active).toBe(false);
  });
});
