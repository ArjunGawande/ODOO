import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import { BCRYPT_COST, DUMMY_HASH, hashPassword, verifyPassword } from '@backend/lib/auth/password';

describe('password hashing', () => {
  it('hashes at cost 12 with a fresh salt', async () => {
    const [first, second] = await Promise.all([hashPassword('Sharma@2026'), hashPassword('Sharma@2026')]);
    expect(BCRYPT_COST).toBe(12);
    expect(bcrypt.getRounds(first)).toBe(12);
    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('Sharma@2026');
    expect(await verifyPassword('Sharma@2026', hash)).toBe(true);
    expect(await verifyPassword('sharma@2026', hash)).toBe(false);
  });
});

describe('dummy hash', () => {
  it('is a real cost-12 hash, so the timing matches a real check', () => {
    expect(bcrypt.getRounds(DUMMY_HASH)).toBe(BCRYPT_COST);
  });

  it('always fails for a null or undefined hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
  });

  it('does the full compare for a null hash, yet can never succeed', async () => {
    const spy = vi.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    expect(await verifyPassword('anything', null)).toBe(false);
    expect(spy).toHaveBeenCalledWith('anything', DUMMY_HASH);
    spy.mockRestore();
  });
});
