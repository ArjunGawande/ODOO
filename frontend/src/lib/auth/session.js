import { cookies } from 'next/headers';

import { SESSION_COOKIE, createSession, deleteSessionByToken } from '@backend/lib/auth/session-store';

// Cookie wrapper around session-store. readSessionToken() is safe anywhere on the
// server. startSession() and endSession() write cookies, which Next allows only in
// server actions and route handlers, so server components must never call them.

export async function readSessionToken() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Call from a server action after a successful login or sign-up. */
export async function startSession(userId) {
  const { token, expiresAt } = await createSession(userId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/** Deletes the session row and clears the cookie. Server actions only. */
export async function endSession() {
  const store = await cookies();
  await deleteSessionByToken(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
}
