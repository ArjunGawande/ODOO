import { hashPassword } from '../lib/auth/password';
import { deleteSessionsForUser, generateToken, hashToken } from '../lib/auth/session-store';
import { db } from '../lib/db';
import { sendMail } from '../lib/mailer';
import { normalizeEmail } from '../lib/validation/auth';

// Reset and invite tokens share one table and one page. The raw token exists only
// in the emailed link; the database holds its SHA-256 hash.

export const RESET_TTL_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const TTL_BY_PURPOSE = { reset: RESET_TTL_MS, invite: INVITE_TTL_MS };

/** Tokens that can still be redeemed, for a user who is still active. */
function liveTokens(query, trx) {
  return query
    .whereNull('used_at')
    .whereRaw('expires_at > now()')
    .whereIn('user_id', trx('users').select('id').where('is_active', true));
}

/** Retires every unused token of a user. Returns the rows changed. */
export async function invalidateTokensForUser(userId, trx = db) {
  return trx('password_reset_tokens')
    .where('user_id', userId)
    .whereNull('used_at')
    .update({ used_at: trx.fn.now() });
}

/**
 * Stores a new token and retires the user's earlier ones. Pass a transaction: the
 * row lock stops two concurrent requests from each leaving a live token behind.
 * Returns the raw token.
 */
export async function issueToken(userId, purpose, trx) {
  await trx('users').where('id', userId).forUpdate().first('id');
  await invalidateTokensForUser(userId, trx);
  const token = generateToken();
  await trx('password_reset_tokens').insert({
    user_id: userId,
    token_hash: hashToken(token),
    purpose,
    expires_at: new Date(Date.now() + TTL_BY_PURPOSE[purpose]),
  });
  return token;
}

function resetLink(token) {
  const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/reset-password?token=${token}`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

function emailBody({ greetingName, intro, action, closing, link }) {
  const name = escapeHtml(greetingName);
  return {
    text: `Hello ${greetingName},\n\n${intro}\n\n${action}: ${link}\n\n${closing}\n`,
    html:
      `<p>Hello ${name},</p><p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(link)}">${escapeHtml(action)}</a></p>` +
      `<p>${escapeHtml(closing)}</p>`,
  };
}

async function sendResetEmail(user, token) {
  await sendMail({
    to: user.email,
    subject: 'Reset your Brightloop password',
    ...emailBody({
      greetingName: user.name,
      intro: 'We received a request to reset your Brightloop password.',
      action: 'Reset your password',
      closing: 'This link expires in 1 hour. If you did not ask for it, you can ignore this email.',
      link: resetLink(token),
    }),
  });
}

/** Rejects if the mail can't be sent. */
export async function sendInviteEmail(user, token) {
  await sendMail({
    to: user.email,
    subject: 'You are invited to Brightloop',
    ...emailBody({
      greetingName: user.name,
      intro: 'You have been invited to join the Brightloop team.',
      action: 'Set your password',
      closing: 'This link expires in 72 hours.',
      link: resetLink(token),
    }),
  });
}

/**
 * Issues a reset token and emails it, if the email belongs to an active account.
 * Never rejects and returns nothing, so no caller can tell the cases apart. Failures
 * go to the server log.
 */
export async function requestPasswordReset(email) {
  try {
    const pending = await db.transaction(async (trx) => {
      const user = await trx('users')
        .whereRaw('lower(email) = ?', [normalizeEmail(email)])
        .where('is_active', true)
        .first('id', 'name', 'email');
      if (!user) return null;
      return { user, token: await issueToken(user.id, 'reset', trx) };
    });
    // The stored address, never the typed one.
    if (pending) await sendResetEmail(pending.user, pending.token);
  } catch (err) {
    // err.message only: a token must never reach the log through a failed send.
    console.error('Password reset request failed:', err?.message);
  }
}

/** What the reset page needs to know: { purpose } for a redeemable token, else null. */
export async function inspectToken(rawToken, trx = db) {
  if (!rawToken) return null;
  const query = trx('password_reset_tokens').where('token_hash', hashToken(rawToken));
  const row = await liveTokens(query, trx).first('purpose');
  return row ?? null;
}

/**
 * Redeems a token atomically and sets the password, ending all of that user's
 * sessions in the same transaction. Two simultaneous attempts can't both win: the
 * second waits on the row lock, then no longer matches `used_at IS NULL`.
 * Returns { ok: true, userId, purpose } or { ok: false }.
 */
export async function resetPassword({ token, password }) {
  // Hash first: bcrypt is slow and must not run inside the transaction.
  const password_hash = await hashPassword(password);
  return db.transaction(async (trx) => {
    const query = trx('password_reset_tokens').where('token_hash', hashToken(token));
    const [consumed] = await liveTokens(query, trx).update({ used_at: trx.fn.now() }, [
      'user_id',
      'purpose',
    ]);
    if (!consumed) return { ok: false };
    await trx('users').where('id', consumed.user_id).update({ password_hash });
    await deleteSessionsForUser(consumed.user_id, trx);
    return { ok: true, userId: consumed.user_id, purpose: consumed.purpose };
  });
}
