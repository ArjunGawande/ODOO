import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

// A cost-12 hash of random bytes nobody holds. Comparing against it costs as much
// as a real check, so a failed login can't reveal whether the account exists.
export const DUMMY_HASH = '$2b$12$2UllqQNjEHyb9RdfhVN2c.jxRJb.V5Z7jqNJ2wUFgO0S2HXXIGKQC';

export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Pass the stored hash, or null when there is no user or no password yet. A null
 * hash still does the full bcrypt work and always returns false.
 */
export async function verifyPassword(plain, hash) {
  const matched = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash ? matched : false;
}
