/**
 * The first admin, plus demo data from docs/CONTRACT.md outside production. The
 * demo logins have public passwords, so production only ever gets the admin.
 * Idempotent: a row that already exists is left alone, so re-running never
 * duplicates anything or resets a password someone has since changed. Archived
 * rows count as existing.
 */
const bcrypt = require('bcryptjs');

const BCRYPT_COST = 12;
const DEMO_PASSWORD = 'Brightloop@2026';

function adminCredentials() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.NODE_ENV === 'production' && (!email || !password)) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must both be set in production.');
  }
  return { email: email || 'admin@brightloop.in', password: password || DEMO_PASSWORD };
}

async function ensureUser(trx, { name, email, password, role }) {
  const existing = await trx('users').whereRaw('lower(email) = lower(?)', [email]).first('id');
  if (existing) return existing.id;
  const password_hash = await bcrypt.hash(password, BCRYPT_COST);
  const [row] = await trx('users')
    .insert({ name, email, password_hash, role, is_active: true })
    .returning('id');
  return row.id;
}

async function ensureProduct(trx, product) {
  const existing = await trx('products')
    .whereRaw('lower(name) = lower(?)', [product.name])
    .orderBy('is_active', 'desc')
    .orderBy('id')
    .first('id');
  if (existing) return existing.id;
  const [row] = await trx('products').insert(product).returning('id');
  return row.id;
}

async function ensureVariant(trx, variant) {
  const existing = await trx('product_variants')
    .where('product_id', variant.product_id)
    .whereRaw('lower(attribute) = lower(?)', [variant.attribute])
    .whereRaw('lower(value) = lower(?)', [variant.value])
    .first('id');
  if (!existing) await trx('product_variants').insert(variant);
}

async function ensurePlan(trx, plan) {
  const existing = await trx('plans').whereRaw('lower(name) = lower(?)', [plan.name]).first('id');
  if (!existing) await trx('plans').insert(plan);
}

async function seedDemoData(trx) {
  await ensureUser(trx, {
    name: 'Brightloop Staff',
    email: 'staff@brightloop.in',
    password: DEMO_PASSWORD,
    role: 'staff',
  });
  await ensureUser(trx, {
    name: 'Sharma Traders',
    email: 'owner@sharma.in',
    password: 'Sharma@2026',
    role: 'customer',
  });

  const productId = await ensureProduct(trx, {
    name: 'CloudCRM',
    type: 'service',
    sales_price: '1000.00',
    cost_price: '400.00',
  });
  await ensureVariant(trx, {
    product_id: productId,
    attribute: 'Brand',
    value: 'Odoo',
    extra_price: '560.00',
  });

  await ensurePlan(trx, {
    name: 'CloudCRM Monthly',
    price: '1000.00',
    billing_period: 'monthly',
    min_quantity: 5,
    start_date: '2026-11-01',
    end_date: '2027-12-31',
    auto_close: true,
    can_close_early: false,
    can_pause: true,
    can_renew: false,
  });
}

/** @param {import('knex').Knex} knex */
exports.seed = async function seed(knex) {
  const admin = adminCredentials();

  await knex.transaction(async (trx) => {
    await ensureUser(trx, { name: 'Brightloop Admin', role: 'admin', ...admin });
    if (process.env.NODE_ENV !== 'production') await seedDemoData(trx);
  });
};
