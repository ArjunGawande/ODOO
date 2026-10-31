import bcrypt from 'bcryptjs';

import { createSession } from '@backend/lib/auth/session-store';
import { db } from '@backend/lib/db';

export const DEFAULT_PASSWORD = 'Sharma@2026';

// Cost 4 keeps tests fast: only tests/password.test.js cares about the real cost.
const TEST_COST = 4;
let sequence = 0;

/**
 * Inserts a user and returns the full row plus the plain `password`. Pass
 * `password: null` for an invited user with no password yet. Other overrides are
 * columns: name, email, role, is_active.
 */
export async function createUser(overrides = {}) {
  sequence += 1;
  const { password = DEFAULT_PASSWORD, ...columns } = overrides;
  const password_hash = password === null ? null : await bcrypt.hash(password, TEST_COST);
  const [user] = await db('users')
    .insert({
      name: `Test User ${sequence}`,
      email: `user${sequence}@example.test`,
      role: 'customer',
      is_active: true,
      password_hash,
      ...columns,
    })
    .returning('*');
  return { ...user, password };
}

export function createAdmin(overrides = {}) {
  return createUser({ role: 'admin', ...overrides });
}

export function createStaff(overrides = {}) {
  return createUser({ role: 'staff', ...overrides });
}

export function createCustomer(overrides = {}) {
  return createUser({ role: 'customer', ...overrides });
}

/** Creates a session row for a user and returns { token, expiresAt }. */
export function createSessionFor(user) {
  return createSession(user.id);
}
