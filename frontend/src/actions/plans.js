'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { actionError, actionOk, fromZodError } from '@backend/lib/action-result';
import { requirePermission } from '@/lib/auth/guards';
import { parsePlanForm, parsePlanId } from '@backend/lib/validation/plans';
import { archivePlan, createPlan, PlanError, restorePlan, updatePlan } from '@backend/services/plans';

const MISSING_PLAN = 'This plan no longer exists.';

function revalidatePlan(id) {
  revalidatePath('/plans');
  revalidatePath(`/plans/${id}`);
  revalidatePath(`/plans/${id}/edit`);
  // The dashboard shows plan counts.
  revalidatePath('/dashboard');
}

function failure(err) {
  if (!(err instanceof PlanError)) throw err;
  return actionError(err.message, err.field ? { [err.field]: err.message } : undefined);
}

export async function createPlanAction(_prevState, formData) {
  await requirePermission('plans.write');

  const parsed = parsePlanForm(formData);
  if (!parsed.success) return fromZodError(parsed.error);

  let plan;
  try {
    plan = await createPlan(parsed.data);
  } catch (err) {
    return failure(err);
  }
  revalidatePlan(plan.id);
  redirect(`/plans/${plan.id}`);
}

export async function updatePlanAction(_prevState, formData) {
  await requirePermission('plans.write');

  const id = parsePlanId(formData.get('id'));
  if (id === null) return actionError(MISSING_PLAN);
  const parsed = parsePlanForm(formData);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    await updatePlan(id, parsed.data);
  } catch (err) {
    return failure(err);
  }
  revalidatePlan(id);
  redirect(`/plans/${id}`);
}

export async function archivePlanAction(_prevState, formData) {
  await requirePermission('plans.write');

  const id = parsePlanId(formData.get('id'));
  if (id === null) return actionError(MISSING_PLAN);

  try {
    await archivePlan(id);
  } catch (err) {
    return failure(err);
  }
  revalidatePlan(id);
  return actionOk('Plan archived.');
}

export async function restorePlanAction(_prevState, formData) {
  await requirePermission('plans.write');

  const id = parsePlanId(formData.get('id'));
  if (id === null) return actionError(MISSING_PLAN);

  try {
    await restorePlan(id);
  } catch (err) {
    return failure(err);
  }
  revalidatePlan(id);
  return actionOk('Plan restored.');
}
