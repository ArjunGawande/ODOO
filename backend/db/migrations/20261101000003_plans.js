/** Sellable plans. Availability is derived from the dates, never stored. */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('plans', (t) => {
    t.increments('id');
    t.string('name', 160).notNullable();
    t.decimal('price', 12, 2).notNullable();
    t.text('billing_period').notNullable();
    t.integer('min_quantity').notNullable().defaultTo(1);
    t.date('start_date').notNullable();
    t.date('end_date').notNullable();
    t.boolean('auto_close').notNullable().defaultTo(false);
    t.boolean('can_close_early').notNullable().defaultTo(false);
    t.boolean('can_pause').notNullable().defaultTo(false);
    t.boolean('can_renew').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(['is_active', 'start_date', 'end_date'], 'plans_is_active_dates_idx');
  });
  await knex.raw(`
    ALTER TABLE plans
      ADD CONSTRAINT plans_price_check CHECK (price >= 0),
      ADD CONSTRAINT plans_billing_period_check
        CHECK (billing_period IN ('daily', 'weekly', 'monthly', 'yearly')),
      ADD CONSTRAINT plans_min_quantity_check CHECK (min_quantity >= 1),
      ADD CONSTRAINT plans_dates_check CHECK (end_date >= start_date)
  `);
  await knex.raw('CREATE UNIQUE INDEX plans_name_active_unique ON plans (lower(name)) WHERE is_active');
  await knex.raw(`
    CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON plans
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('plans');
};
