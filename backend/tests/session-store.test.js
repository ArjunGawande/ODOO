import { beforeEach, describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  deleteSessionByToken,
  deleteSessionsForUser,
  findUserByToken,
  generateToken,
  hashToken,
  purgeExpiredSessions,
} from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';

import { resetTables } from './helpers/db';
import { createCustomer, createSessionFor, createUser } from './helpers/factories';

function expireSession(token) {
  return db('sessions')
    .where('token_hash', hashToken(token))
    .update({ expires_at: new Date(Date.now() - 1000) });
}

beforeEach(resetTables);

describe('tokens', () => {
  it('generates 32 random URL-safe bytes', () => {
    const token = generateToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(token).toMatch(/^[\w-]+$/);
    expect(generateToken()).not.toBe(token);
  });

  it('hashes to 64 hex characters', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('createSession', () => {
  it('stores only the hash, with a 7-day expiry', async () => {
    const user = await createCustomer();
    const before = Date.now();
    const { token, expiresAt } = await createSession(user.id);

    const [row] = await db('sessions').where('user_id', user.id);
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).not.toBe(token);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(row.expires_at.getTime()).toBe(expiresAt.getTime());
    expect(SESSION_TTL_MS).toBe(604800000);
    expect(SESSION_COOKIE).toBe('bl_session');
  });

  it("purges only that user's expired sessions", async () => {
    const user = await createCustomer();
    const other = await createCustomer();
    const expired = await createSession(user.id);
    const stillValid = await createSession(user.id);
    const othersExpired = await createSession(other.id);
    await expireSession(expired.token);
    await expireSession(othersExpired.token);

    await createSession(user.id);

    const hashes = await db('sessions').where('user_id', user.id).pluck('token_hash');
    expect(hashes).toHaveLength(2);
    expect(hashes).toContain(hashToken(stillValid.token));
    expect(hashes).not.toContain(hashToken(expired.token));
    expect(await db('sessions').where('user_id', other.id)).toHaveLength(1);
  });

  it('takes part in a transaction', async () => {
    const user = await createCustomer();
    await expect(
      db.transaction(async (trx) => {
        await createSession(user.id, trx);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db('sessions')).toHaveLength(0);
  });
});

describe('findUserByToken', () => {
  it('returns only the public user fields', async () => {
    const user = await createUser({ name: 'Sharma Traders', email: 'owner@sharma.in' });
    const { token } = await createSessionFor(user);
    expect(await findUserByToken(token)).toEqual({
      id: user.id,
      name: 'Sharma Traders',
      email: 'owner@sharma.in',
      role: 'customer',
    });
  });

  it('returns null for a missing or unknown token', async () => {
    expect(await findUserByToken(null)).toBeNull();
    expect(await findUserByToken(undefined)).toBeNull();
    expect(await findUserByToken('')).toBeNull();
    expect(await findUserByToken(generateToken())).toBeNull();
  });

  it('does not accept the stored hash as a token', async () => {
    const user = await createCustomer();
    const { token } = await createSessionFor(user);
    expect(await findUserByToken(hashToken(token))).toBeNull();
  });

  it('treats an expired session as logged out', async () => {
    const user = await createCustomer();
    const { token } = await createSessionFor(user);
    await expireSession(token);
    expect(await findUserByToken(token)).toBeNull();
  });

  it('treats a deactivated user as logged out', async () => {
    const user = await createCustomer();
    const { token } = await createSessionFor(user);
    await db('users').where('id', user.id).update({ is_active: false });
    expect(await findUserByToken(token)).toBeNull();
  });
});

describe('deleting sessions', () => {
  it('deletes one session by token', async () => {
    const user = await createCustomer();
    const first = await createSessionFor(user);
    const second = await createSessionFor(user);

    expect(await deleteSessionByToken(first.token)).toBe(1);
    expect(await findUserByToken(first.token)).toBeNull();
    expect(await findUserByToken(second.token)).not.toBeNull();
    expect(await deleteSessionByToken(null)).toBe(0);
  });

  it("deletes all of one user's sessions", async () => {
    const user = await createCustomer();
    const other = await createCustomer();
    await createSessionFor(user);
    await createSessionFor(user);
    const kept = await createSessionFor(other);

    expect(await deleteSessionsForUser(user.id)).toBe(2);
    expect(await findUserByToken(kept.token)).not.toBeNull();
  });

  it('purges expired sessions on request', async () => {
    const user = await createCustomer();
    const { token } = await createSessionFor(user);
    await expireSession(token);
    expect(await purgeExpiredSessions(user.id)).toBe(1);
  });

  it('cascades when the user is deleted', async () => {
    const user = await createCustomer();
    await createSessionFor(user);
    await db('users').where('id', user.id).del();
    expect(await db('sessions')).toHaveLength(0);
  });
});
