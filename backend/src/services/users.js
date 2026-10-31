import { hashPassword, verifyPassword } from '../lib/auth/password';
import { deleteSessionsForUser } from '../lib/auth/session-store';
import { db } from '../lib/db';
import { isUniqueViolation } from '../lib/errors';
import { likePattern } from '../lib/pagination';
import { MAX_PASSWORD_BYTES, normalizeEmail, passwordByteLength } from '../lib/validation/auth';

import { invalidateTokensForUser, issueToken, sendInviteEmail } from './password-reset';

const PUBLIC_COLUMNS = ['id', 'name', 'email', 'role'];
const EMAIL_INDEX = 'users_email_lower_unique';
const EMAIL_TAKEN = Object.freeze({ ok: false, reason: 'email_taken' });
const INVITE_EXPIRED_SQL = `password_hash IS NULL AND NOT EXISTS (
  SELECT 1 FROM password_reset_tokens
  WHERE password_reset_tokens.user_id = users.id
    AND password_reset_tokens.used_at IS NULL
    AND password_reset_tokens.expires_at > now()
) AS invite_expired`;

function emailInUse(email, trx) {
  return trx('users').whereRaw('lower(email) = ?', [email]).first('id');
}

/**
 * Public sign-up. The role is fixed here and never read from the input. Returns
 * { ok: true, user } or { ok: false, reason: 'email_taken' }. The first check gives
 * a quick answer; the unique index settles simultaneous sign-ups.
 */
export async function registerCustomer({ name, email, password }, trx = db) {
  const normalized = normalizeEmail(email);
  if (await emailInUse(normalized, trx)) return EMAIL_TAKEN;

  const password_hash = await hashPassword(password);
  try {
    const [user] = await trx('users')
      .insert({ name, email: normalized, password_hash, role: 'customer' })
      .returning(PUBLIC_COLUMNS);
    return { ok: true, user };
  } catch (err) {
    if (isUniqueViolation(err, EMAIL_INDEX)) return EMAIL_TAKEN;
    throw err;
  }
}

/**
 * Checks a login. Returns { id, name, email, role }, or null for every kind of
 * failure. All of them do one bcrypt comparison, so timing can't reveal which kind
 * it was. A password over 72 bytes can't be anyone's: bcrypt would otherwise ignore
 * the excess and accept it.
 */
export async function authenticate({ email, password }, trx = db) {
  const user = await trx('users')
    .whereRaw('lower(email) = ?', [normalizeEmail(email)])
    .first(...PUBLIC_COLUMNS, 'password_hash', 'is_active');

  const eligible = user?.is_active && passwordByteLength(password) <= MAX_PASSWORD_BYTES;
  const matched = await verifyPassword(password, eligible ? user.password_hash : null);
  if (!matched) return null;

  const { password_hash: _hash, is_active: _active, ...publicUser } = user;
  return publicUser;
}

/** Emails an invite link and reports whether it went, because the caller's work stands. */
async function deliverInvite(user, token) {
  try {
    await sendInviteEmail(user, token);
    return true;
  } catch (err) {
    console.error('Staff invite email failed:', err?.message);
    return false;
  }
}

/**
 * Creates a staff account with no password and emails an invite link. A failed
 * send keeps the account, because a retry would hit the duplicate email error.
 * The admin can resend, or the person can use "Forgot password", so `emailSent` is
 * reported rather than treated as a failure.
 * Returns { ok: true, user, emailSent } or { ok: false, reason: 'email_taken' }.
 */
export async function inviteStaff({ name, email }) {
  const normalized = normalizeEmail(email);
  let created;
  try {
    created = await db.transaction(async (trx) => {
      if (await emailInUse(normalized, trx)) return null;
      const [user] = await trx('users')
        .insert({ name, email: normalized, password_hash: null, role: 'staff' })
        .returning(PUBLIC_COLUMNS);
      return { user, token: await issueToken(user.id, 'invite', trx) };
    });
  } catch (err) {
    if (isUniqueViolation(err, EMAIL_INDEX)) return EMAIL_TAKEN;
    throw err;
  }
  if (!created) return EMAIL_TAKEN;

  return {
    ok: true,
    user: created.user,
    emailSent: await deliverInvite(created.user, created.token),
  };
}

/**
 * Sends a fresh invite to an active staff member who has never set a password.
 * Issuing the token retires any older link. The row lock means the password can't
 * be set between the check and the new token.
 * Returns { ok: true, user, emailSent } or { ok: false, reason: 'not_found' | 'not_eligible' }.
 */
export async function resendInvite({ userId }) {
  const outcome = await db.transaction(async (trx) => {
    const user = await trx('users')
      .where({ id: userId, role: 'staff' })
      .forUpdate()
      .first(...PUBLIC_COLUMNS, 'password_hash', 'is_active');
    if (!user) return { reason: 'not_found' };
    if (!user.is_active || user.password_hash !== null) return { reason: 'not_eligible' };

    const { password_hash: _hash, is_active: _active, ...publicUser } = user;
    return { user: publicUser, token: await issueToken(user.id, 'invite', trx) };
  });
  if (outcome.reason) return { ok: false, reason: outcome.reason };

  return {
    ok: true,
    user: outcome.user,
    emailSent: await deliverInvite(outcome.user, outcome.token),
  };
}

function staffQuery(q) {
  const query = db('users').where('role', 'staff');
  if (q) {
    const pattern = likePattern(q);
    query.where((builder) => {
      builder
        .whereRaw('lower(name) LIKE lower(?)', [pattern])
        .orWhereRaw('lower(email) LIKE lower(?)', [pattern]);
    });
  }
  return query;
}

/**
 * One page of staff, active first. `invite_pending` means no password has been set.
 * `invite_expired` adds that no link can still be redeemed, so the invite needs
 * resending. Both come from this one query. Returns { rows, total }.
 */
export async function listStaff({ q = '', limit = 20, offset = 0 } = {}) {
  const [rows, [{ count }]] = await Promise.all([
    staffQuery(q)
      .select(
        'id',
        'name',
        'email',
        'is_active',
        db.raw('password_hash IS NULL AS invite_pending'),
        db.raw(INVITE_EXPIRED_SQL),
      )
      .orderBy('is_active', 'desc')
      .orderByRaw('lower(name), id')
      .limit(limit)
      .offset(offset),
    staffQuery(q).count({ count: '*' }),
  ]);
  return { rows, total: count };
}

/**
 * Deactivates a staff member and ends their sessions in one transaction. Unused
 * links are retired too, so an old invite can't come back to life on reactivation.
 * Only role='staff' rows can be reached, so this can't touch customers or admins.
 * Returns { ok: true } or { ok: false, reason: 'self' | 'not_found' }.
 */
export async function deactivateStaff({ actorId, userId }) {
  if (actorId === userId) return { ok: false, reason: 'self' };
  return db.transaction(async (trx) => {
    const updated = await trx('users')
      .where({ id: userId, role: 'staff' })
      .update({ is_active: false });
    if (updated === 0) return { ok: false, reason: 'not_found' };
    await deleteSessionsForUser(userId, trx);
    await invalidateTokensForUser(userId, trx);
    return { ok: true };
  });
}

/**
 * Lets a staff member log in again. A session row can survive if a login raced the
 * deactivation, and it would wake up here, so sessions are cleared once more.
 * Returns { ok: true } or { ok: false, reason: 'not_found' }.
 */
export async function reactivateStaff({ userId }) {
  return db.transaction(async (trx) => {
    const updated = await trx('users')
      .where({ id: userId, role: 'staff' })
      .update({ is_active: true });
    if (updated === 0) return { ok: false, reason: 'not_found' };
    await deleteSessionsForUser(userId, trx);
    return { ok: true };
  });
}
