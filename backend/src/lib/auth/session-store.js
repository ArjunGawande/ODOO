import { createHash, randomBytes } from 'node:crypto';

import { db } from '../db';

// Token and database logic only. No next/* imports, so this runs under vitest.
// Only the SHA-256 hash of a token is ever stored.

export const SESSION_COOKIE = 'bl_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes, URL-safe. Also used for password reset and invite tokens. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 as 64 hex characters, matching the token_hash columns. */
export function hashToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Starts a 7-day session and purges the user's expired ones. The raw token goes
 * in the cookie and is never stored. Returns { token, expiresAt }.
 */
export async function createSession(userId, trx = db) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await purgeExpiredSessions(userId, trx);
  await trx('sessions').insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });
  return { token, expiresAt };
}

/**
 * The user behind a raw token as { id, name, email, role }. Null when the token is
 * missing or unknown, the session has expired or the user is deactivated.
 */
export async function findUserByToken(rawToken, trx = db) {
  if (!rawToken) return null;
  const user = await trx('sessions as s')
    .join('users as u', 'u.id', 's.user_id')
    .where('s.token_hash', hashToken(rawToken))
    .where('u.is_active', true)
    .whereRaw('s.expires_at > now()')
    .first('u.id', 'u.name', 'u.email', 'u.role');
  return user ?? null;
}

/** Logout: removes the session behind a raw token. Returns the rows deleted. */
export async function deleteSessionByToken(rawToken, trx = db) {
  if (!rawToken) return 0;
  return trx('sessions').where('token_hash', hashToken(rawToken)).del();
}

/** Ends every session of a user, for password reset and deactivation. */
export async function deleteSessionsForUser(userId, trx = db) {
  return trx('sessions').where('user_id', userId).del();
}

export async function purgeExpiredSessions(userId, trx = db) {
  return trx('sessions').where('user_id', userId).whereRaw('expires_at <= now()').del();
}
