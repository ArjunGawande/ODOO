import { cache } from 'react';
import { redirect } from 'next/navigation';

import { can } from '@backend/lib/auth/permissions';
import { readSessionToken } from './session';
import { findUserByToken } from '@backend/lib/auth/session-store';

// These only read the cookie, so they work in pages, layouts and server actions.
// A stale cookie is left in place (a server component can't clear it) and simply
// counts as logged out. redirect() throws, so don't call guards inside try/catch.

/** { id, name, email, role } or null. Cached for the request. */
export const getCurrentUser = cache(async () => {
  return findUserByToken(await readSessionToken());
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export async function requirePermission(permission) {
  const user = await requireUser();
  if (!can(user, permission)) redirect('/forbidden');
  return user;
}
