import { db } from '../lib/db';
import { isUniqueViolation } from '../lib/errors';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, likePattern } from '../lib/pagination';
import { parseId } from '../lib/validation/products';

// Reads return rows, or null for an unknown id. Writes never throw for a rule a
// person can break: they return { ok: true, product | variant } or
// { ok: false, code, message, field? }, where field names the form input at fault.
// Every write runs in `conn.transaction`, which is a savepoint when `conn` is
// already a transaction, so a caught 23505 cannot poison the caller's work.

const PRODUCT_NAME_INDEX = 'products_name_active_unique';
const VARIANT_INDEX = 'product_variants_active_unique';

const PRODUCT_COLUMNS = [
  'id',
  'name',
  'type',
  'sales_price',
  'cost_price',
  'notes',
  'is_active',
  'created_at',
  'updated_at',
];

const PRODUCT_NOT_FOUND = { ok: false, code: 'not_found', message: 'This product no longer exists.' };
const VARIANT_NOT_FOUND = { ok: false, code: 'not_found', message: 'This variant no longer exists.' };
const PRODUCT_ARCHIVED = {
  ok: false,
  code: 'archived',
  message: 'This product is archived. Restore it before changing it.',
};
const VARIANT_ARCHIVED = {
  ok: false,
  code: 'archived',
  message: 'This variant is archived. Restore it before changing it.',
};

function nameClash(name) {
  return {
    ok: false,
    code: 'name_taken',
    field: 'name',
    message: `An active product named "${name}" already exists.`,
  };
}

function restoreNameClash(name) {
  return {
    ok: false,
    code: 'name_taken',
    message: `Can't restore "${name}": another active product has that name. Rename or archive that one first.`,
  };
}

function variantClash({ attribute, value }) {
  return {
    ok: false,
    code: 'variant_taken',
    field: 'value',
    message: `This product already has an active variant ${attribute}: ${value}.`,
  };
}

function restoreVariantClash({ attribute, value }) {
  return {
    ok: false,
    code: 'variant_taken',
    message: `Can't restore ${attribute}: ${value}: this product already has an active variant with those values.`,
  };
}

/** Runs a write. A lost race on `indexName` becomes the failure from `onClash`. */
async function runWrite(conn, indexName, onClash, work) {
  try {
    return await conn.transaction(work);
  } catch (err) {
    if (isUniqueViolation(err, indexName)) return onClash();
    throw err;
  }
}

function paging({ page = 1, pageSize = DEFAULT_PAGE_SIZE }) {
  const size = Math.min(pageSize, MAX_PAGE_SIZE);
  return { page, pageSize: size, offset: (page - 1) * size };
}

/** A filtered query for products. Called once for the count and once for the rows. */
function productsQuery(conn, { q, status }) {
  const query = conn('products').where('is_active', status !== 'archived');
  return q ? query.whereRaw('lower(name) LIKE lower(?)', [likePattern(q)]) : query;
}

async function countRows(query) {
  const [{ total }] = await query.count('* as total');
  return total;
}

/**
 * One page of products. `options` is { q, status, page, pageSize }, so the result
 * of parsePagination can be spread in. Returns { rows, total, page, pageSize }.
 * Each row carries `variant_count`, the number of active variants.
 */
export async function listProducts(options = {}, conn = db) {
  const { page, pageSize, offset } = paging(options);
  const total = await countRows(productsQuery(conn, options));
  const rows = await productsQuery(conn, options)
    .select(
      ...PRODUCT_COLUMNS,
      conn.raw(`(
        SELECT count(*) FROM product_variants v
        WHERE v.product_id = products.id AND v.is_active
      ) AS variant_count`),
    )
    .orderByRaw('lower(name), id')
    .limit(pageSize)
    .offset(offset);
  return { rows, total, page, pageSize };
}

export async function getProduct(id, conn = db) {
  const productId = parseId(id);
  if (!productId) return null;
  return (await conn('products').where({ id: productId }).first(...PRODUCT_COLUMNS)) ?? null;
}

function nameTaken(conn, name, exceptId) {
  const query = conn('products').where('is_active', true).whereRaw('lower(name) = lower(?)', [name]);
  return (exceptId ? query.whereNot('id', exceptId) : query).first('id');
}

function productFields({ name, type, sales_price, cost_price, notes }) {
  return { name, type, sales_price, cost_price, notes: notes ?? null };
}

export function createProduct(data, conn = db) {
  return runWrite(conn, PRODUCT_NAME_INDEX, () => nameClash(data.name), async (trx) => {
    if (await nameTaken(trx, data.name)) return nameClash(data.name);
    const [product] = await trx('products').insert(productFields(data)).returning(PRODUCT_COLUMNS);
    return { ok: true, product };
  });
}

/** Archived products are read-only, so restore one before editing it. */
export function updateProduct(id, data, conn = db) {
  return runWrite(conn, PRODUCT_NAME_INDEX, () => nameClash(data.name), async (trx) => {
    const current = await trx('products').where({ id }).forUpdate().first('is_active');
    if (!current) return PRODUCT_NOT_FOUND;
    if (!current.is_active) return PRODUCT_ARCHIVED;
    if (await nameTaken(trx, data.name, id)) return nameClash(data.name);
    const [product] = await trx('products')
      .where({ id })
      .update(productFields(data))
      .returning(PRODUCT_COLUMNS);
    return { ok: true, product };
  });
}

/** Variants keep their own state, so restoring brings the product back as it was. */
export async function archiveProduct(id, conn = db) {
  const [product] = await conn('products')
    .where({ id })
    .update({ is_active: false })
    .returning(PRODUCT_COLUMNS);
  return product ? { ok: true, product } : PRODUCT_NOT_FOUND;
}

export function restoreProduct(id, conn = db) {
  let name;
  return runWrite(conn, PRODUCT_NAME_INDEX, () => restoreNameClash(name), async (trx) => {
    const current = await trx('products').where({ id }).forUpdate().first(...PRODUCT_COLUMNS);
    if (!current) return PRODUCT_NOT_FOUND;
    if (current.is_active) return { ok: true, product: current };
    name = current.name;
    if (await nameTaken(trx, name, id)) return restoreNameClash(name);
    const [product] = await trx('products')
      .where({ id })
      .update({ is_active: true })
      .returning(PRODUCT_COLUMNS);
    return { ok: true, product };
  });
}

/** Variant rows with the final price computed by Postgres, never stored. */
function variantsQuery(conn) {
  return conn('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .select(
      'v.id',
      'v.product_id',
      'v.attribute',
      'v.value',
      'v.extra_price',
      'v.is_active',
      conn.raw('p.sales_price + v.extra_price AS final_price'),
    );
}

/**
 * One page of a product's variants. `options` is { status, page, pageSize }.
 * Returns { rows, total, page, pageSize }.
 */
export async function listVariants(productId, options = {}, conn = db) {
  const { page, pageSize, offset } = paging(options);
  const isActive = options.status !== 'archived';
  const total = await countRows(
    conn('product_variants').where({ product_id: productId, is_active: isActive }),
  );
  const rows = await variantsQuery(conn)
    .where({ 'v.product_id': productId, 'v.is_active': isActive })
    .orderByRaw('lower(v.attribute), lower(v.value), v.id')
    .limit(pageSize)
    .offset(offset);
  return { rows, total, page, pageSize };
}

/** A variant of this product, active or archived, or null. */
export async function getVariant(productId, variantId, conn = db) {
  const id = parseId(variantId);
  if (!id) return null;
  const variant = await variantsQuery(conn)
    .where({ 'v.id': id, 'v.product_id': productId })
    .first();
  return variant ?? null;
}

/** Holds the product still for the transaction. Returns a failure if it can't change. */
async function blockedProduct(trx, productId) {
  const product = await trx('products').where({ id: productId }).forShare().first('is_active');
  if (!product) return PRODUCT_NOT_FOUND;
  return product.is_active ? null : PRODUCT_ARCHIVED;
}

function variantTaken(conn, productId, { attribute, value }, exceptId) {
  const query = conn('product_variants')
    .where({ product_id: productId, is_active: true })
    .whereRaw('lower(attribute) = lower(?) AND lower(value) = lower(?)', [attribute, value]);
  return (exceptId ? query.whereNot('id', exceptId) : query).first('id');
}

function variantFields({ attribute, value, extra_price }) {
  return { attribute, value, extra_price };
}

export function addVariant(productId, data, conn = db) {
  return runWrite(conn, VARIANT_INDEX, () => variantClash(data), async (trx) => {
    const blocked = await blockedProduct(trx, productId);
    if (blocked) return blocked;
    if (await variantTaken(trx, productId, data)) return variantClash(data);
    const [{ id }] = await trx('product_variants')
      .insert({ product_id: productId, ...variantFields(data) })
      .returning('id');
    return { ok: true, variant: await getVariant(productId, id, trx) };
  });
}

export function updateVariant(productId, variantId, data, conn = db) {
  return runWrite(conn, VARIANT_INDEX, () => variantClash(data), async (trx) => {
    const blocked = await blockedProduct(trx, productId);
    if (blocked) return blocked;
    const current = await getVariant(productId, variantId, trx);
    if (!current) return VARIANT_NOT_FOUND;
    if (!current.is_active) return VARIANT_ARCHIVED;
    if (await variantTaken(trx, productId, data, variantId)) return variantClash(data);
    await trx('product_variants').where({ id: variantId }).update(variantFields(data));
    return { ok: true, variant: await getVariant(productId, variantId, trx) };
  });
}

export function archiveVariant(productId, variantId, conn = db) {
  return conn.transaction(async (trx) => {
    const blocked = await blockedProduct(trx, productId);
    if (blocked) return blocked;
    const updated = await trx('product_variants')
      .where({ id: variantId, product_id: productId })
      .update({ is_active: false });
    if (updated === 0) return VARIANT_NOT_FOUND;
    return { ok: true, variant: await getVariant(productId, variantId, trx) };
  });
}

export function restoreVariant(productId, variantId, conn = db) {
  let current;
  return runWrite(conn, VARIANT_INDEX, () => restoreVariantClash(current), async (trx) => {
    const blocked = await blockedProduct(trx, productId);
    if (blocked) return blocked;
    current = await getVariant(productId, variantId, trx);
    if (!current) return VARIANT_NOT_FOUND;
    if (current.is_active) return { ok: true, variant: current };
    if (await variantTaken(trx, productId, current, variantId)) return restoreVariantClash(current);
    await trx('product_variants').where({ id: variantId }).update({ is_active: true });
    return { ok: true, variant: await getVariant(productId, variantId, trx) };
  });
}

/**
 * One page of what can be sold: active products, each with its active variants.
 * A product with no variants sells at its sales price. `options` is
 * { q, page, pageSize }. Returns { rows, total, page, pageSize }; each row is
 * { id, name, type, sales_price, variants: [{ id, attribute, value, extra_price, final_price }] }.
 */
export async function listProductsForSale(options = {}, conn = db) {
  const { page, pageSize, offset } = paging(options);
  const filters = { q: options.q, status: 'active' };
  const total = await countRows(productsQuery(conn, filters));
  const products = await productsQuery(conn, filters)
    .select('id', 'name', 'type', 'sales_price')
    .orderByRaw('lower(name), id')
    .limit(pageSize)
    .offset(offset);

  const variants = await variantsQuery(conn)
    .whereIn('v.product_id', products.map((product) => product.id))
    .where('v.is_active', true)
    .orderByRaw('lower(v.attribute), lower(v.value), v.id');

  const byProduct = Map.groupBy(variants, (variant) => variant.product_id);
  const rows = products.map((product) => ({
    ...product,
    variants: (byProduct.get(product.id) ?? []).map(
      ({ id, attribute, value, extra_price, final_price }) => ({
        id,
        attribute,
        value,
        extra_price,
        final_price,
      }),
    ),
  }));
  return { rows, total, page, pageSize };
}

/**
 * The current price of a variant that can be sold, or null when the id is unknown
 * or the variant or its product is archived. Returns
 * { variant_id, product_id, product_name, attribute, value, sales_price, extra_price, final_price }.
 */
export async function getVariantPrice(variantId, conn = db) {
  const id = parseId(variantId);
  if (!id) return null;
  const row = await conn('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .where({ 'v.id': id, 'v.is_active': true, 'p.is_active': true })
    .first(
      'v.id as variant_id',
      'v.product_id',
      'p.name as product_name',
      'v.attribute',
      'v.value',
      'p.sales_price',
      'v.extra_price',
      conn.raw('p.sales_price + v.extra_price AS final_price'),
    );
  return row ?? null;
}
