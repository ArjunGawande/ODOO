/** Products and their price-changing variants. Archived, never deleted. */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.schema.createTable('products', (t) => {
    t.increments('id');
    t.string('name', 160).notNullable();
    t.text('type').notNullable();
    t.decimal('sales_price', 12, 2).notNullable();
    t.decimal('cost_price', 12, 2).notNullable().defaultTo(0);
    t.text('notes');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    ALTER TABLE products
      ADD CONSTRAINT products_type_check CHECK (type IN ('service', 'goods')),
      ADD CONSTRAINT products_sales_price_check CHECK (sales_price >= 0),
      ADD CONSTRAINT products_cost_price_check CHECK (cost_price >= 0)
  `);
  await knex.raw(
    'CREATE UNIQUE INDEX products_name_active_unique ON products (lower(name)) WHERE is_active',
  );
  await knex.raw('CREATE INDEX products_is_active_lower_name_idx ON products (is_active, lower(name))');
  await knex.raw(`
    CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.createTable('product_variants', (t) => {
    t.increments('id');
    t.integer('product_id').notNullable();
    t.string('attribute', 80).notNullable();
    t.string('value', 80).notNullable();
    t.decimal('extra_price', 12, 2).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.foreign('product_id', 'product_variants_product_id_fkey')
      .references('products.id')
      .onDelete('RESTRICT');
    t.index(['product_id', 'is_active'], 'product_variants_product_id_is_active_idx');
  });
  await knex.raw(`
    ALTER TABLE product_variants ADD CONSTRAINT product_variants_extra_price_check
    CHECK (extra_price >= 0)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX product_variants_active_unique
    ON product_variants (product_id, lower(attribute), lower(value))
    WHERE is_active
  `);
  await knex.raw(`
    CREATE TRIGGER product_variants_set_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('product_variants');
  await knex.schema.dropTable('products');
};
