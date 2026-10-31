'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { actionError, actionOk, fromZodError } from '@backend/lib/action-result';
import { requirePermission } from '@/lib/auth/guards';
import { parseId, productSchema, variantSchema } from '@backend/lib/validation/products';
import {
  addVariant,
  archiveProduct,
  archiveVariant,
  createProduct,
  restoreProduct,
  restoreVariant,
  updateProduct,
  updateVariant,
} from '@backend/services/products';

const PERMISSION = 'products.write';
const PRODUCT_GONE = 'This product no longer exists.';
const VARIANT_GONE = 'This variant no longer exists.';

function refresh(productId) {
  revalidatePath('/products');
  if (productId) revalidatePath(`/products/${productId}`);
  // The dashboard shows a product count.
  revalidatePath('/dashboard');
}

function failed(result) {
  return result.field
    ? actionError(undefined, { [result.field]: result.message })
    : actionError(result.message);
}

function parseForm(schema, formData) {
  return schema.safeParse(Object.fromEntries(formData));
}

function savedVariantPath(productId, variantId) {
  return `/products/${productId}?saved=${variantId}#variants`;
}

export async function createProductAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const parsed = parseForm(productSchema, formData);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await createProduct(parsed.data);
  if (!result.ok) return failed(result);

  refresh();
  redirect(`/products/${result.product.id}`);
}

export async function updateProductAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const id = parseId(formData.get('id'));
  if (!id) return actionError(PRODUCT_GONE);
  const parsed = parseForm(productSchema, formData);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await updateProduct(id, parsed.data);
  if (!result.ok) return failed(result);

  refresh(id);
  redirect(`/products/${id}`);
}

export async function archiveProductAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const id = parseId(formData.get('id'));
  if (!id) return actionError(PRODUCT_GONE);

  const result = await archiveProduct(id);
  if (!result.ok) return failed(result);

  refresh(id);
  return actionOk('Product archived.');
}

export async function restoreProductAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const id = parseId(formData.get('id'));
  if (!id) return actionError(PRODUCT_GONE);

  const result = await restoreProduct(id);
  if (!result.ok) return failed(result);

  refresh(id);
  return actionOk('Product restored.');
}

export async function addVariantAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const productId = parseId(formData.get('product_id'));
  if (!productId) return actionError(PRODUCT_GONE);
  const parsed = parseForm(variantSchema, formData);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await addVariant(productId, parsed.data);
  if (!result.ok) return failed(result);

  refresh(productId);
  redirect(savedVariantPath(productId, result.variant.id));
}

export async function updateVariantAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const productId = parseId(formData.get('product_id'));
  const variantId = parseId(formData.get('variant_id'));
  if (!productId || !variantId) return actionError(VARIANT_GONE);
  const parsed = parseForm(variantSchema, formData);
  if (!parsed.success) return fromZodError(parsed.error);

  const result = await updateVariant(productId, variantId, parsed.data);
  if (!result.ok) return failed(result);

  refresh(productId);
  redirect(savedVariantPath(productId, variantId));
}

export async function archiveVariantAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const productId = parseId(formData.get('product_id'));
  const variantId = parseId(formData.get('variant_id'));
  if (!productId || !variantId) return actionError(VARIANT_GONE);

  const result = await archiveVariant(productId, variantId);
  if (!result.ok) return failed(result);

  refresh(productId);
  return actionOk('Variant archived.');
}

export async function restoreVariantAction(_prevState, formData) {
  await requirePermission(PERMISSION);
  const productId = parseId(formData.get('product_id'));
  const variantId = parseId(formData.get('variant_id'));
  if (!productId || !variantId) return actionError(VARIANT_GONE);

  const result = await restoreVariant(productId, variantId);
  if (!result.ok) return failed(result);

  refresh(productId);
  return actionOk('Variant restored.');
}
