'use server';

import { redirect } from 'next/navigation';

import { endSession } from '@/lib/auth/session';

/** Use as <form action={logoutAction}>. Harmless with no session, so it has no guard. */
export async function logoutAction() {
  await endSession();
  redirect('/login');
}
