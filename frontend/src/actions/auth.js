'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';

import { actionError, actionOk, fromZodError } from '@backend/lib/action-result';
import { homeForRole } from '@backend/lib/auth/permissions';
import { startSession } from '@/lib/auth/session';
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from '@backend/lib/validation/auth';
import { requestPasswordReset, resetPassword } from '@backend/services/password-reset';
import { authenticate, registerCustomer } from '@backend/services/users';

// These are the public actions, so unlike the rest of the app they have no guard.
// Each reads only its named fields: nothing else in the form can reach a service.

const LOGIN_FAILED = 'Incorrect email or password.';
const EMAIL_TAKEN = 'An account with this email already exists.';
const RESET_SENT = 'If an account exists for that email, a reset link is on its way.';
const LINK_INVALID = 'This link has expired or has already been used. Request a new one.';

export async function signupAction(_prevState, formData) {
  const parsed = signupSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await registerCustomer(parsed.data);
  if (!result.ok) return actionError(undefined, { email: EMAIL_TAKEN });

  await startSession(result.user.id);
  redirect(homeForRole(result.user.role));
}

export async function loginAction(_prevState, formData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await authenticate(parsed.data);
  if (!user) return actionError(LOGIN_FAILED);

  await startSession(user.id);
  redirect(homeForRole(user.role));
}

export async function forgotPasswordAction(_prevState, formData) {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return fromZodError(parsed.error);

  // After the response, so its timing can't reveal whether the account exists.
  after(() => requestPasswordReset(parsed.data.email));
  return actionOk(RESET_SENT);
}

export async function resetPasswordAction(_prevState, formData) {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get('token'),
    password: formData.get('password'),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await resetPassword(parsed.data);
  if (!result.ok) return actionError(LINK_INVALID);

  redirect('/login?reset=1');
}
