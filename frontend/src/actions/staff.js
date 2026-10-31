'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { actionError, actionOk, fromZodError } from '@backend/lib/action-result';
import { requirePermission } from '@/lib/auth/guards';
import { inviteStaffSchema, staffTargetSchema } from '@backend/lib/validation/auth';
import { deactivateStaff, inviteStaff, reactivateStaff, resendInvite } from '@backend/services/users';

const NOT_FOUND = 'That staff member could not be found.';
const NOT_ELIGIBLE = 'Only an active staff member who has not set a password can be re-invited.';
const RESENT = 'Invite sent. The link is valid for 72 hours.';
const UNSENT = 'A new link was created, but the email could not be sent. Try again.';

export async function inviteStaffAction(_prevState, formData) {
  await requirePermission('staff.manage');

  const parsed = inviteStaffSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await inviteStaff(parsed.data);
  if (!result.ok) {
    return actionError(undefined, { email: 'An account with this email already exists.' });
  }

  revalidatePath('/staff');
  redirect(result.emailSent ? '/staff?invited=sent' : '/staff?invited=unsent');
}

export async function resendInviteAction(_prevState, formData) {
  await requirePermission('staff.manage');

  const parsed = staffTargetSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return actionError(NOT_FOUND);

  const result = await resendInvite({ userId: parsed.data.userId });
  if (!result.ok) {
    return actionError(result.reason === 'not_eligible' ? NOT_ELIGIBLE : NOT_FOUND);
  }

  revalidatePath('/staff');
  return result.emailSent ? actionOk(RESENT) : actionError(UNSENT);
}

export async function deactivateStaffAction(_prevState, formData) {
  const admin = await requirePermission('staff.manage');

  const parsed = staffTargetSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return actionError(NOT_FOUND);

  const result = await deactivateStaff({ actorId: admin.id, userId: parsed.data.userId });
  if (!result.ok) {
    return actionError(result.reason === 'self' ? 'You cannot deactivate your own account.' : NOT_FOUND);
  }

  revalidatePath('/staff');
  return actionOk('Staff member deactivated.');
}

export async function reactivateStaffAction(_prevState, formData) {
  await requirePermission('staff.manage');

  const parsed = staffTargetSchema.safeParse({ userId: formData.get('userId') });
  if (!parsed.success) return actionError(NOT_FOUND);

  const result = await reactivateStaff({ userId: parsed.data.userId });
  if (!result.ok) return actionError(NOT_FOUND);

  revalidatePath('/staff');
  return actionOk('Staff member reactivated.');
}
