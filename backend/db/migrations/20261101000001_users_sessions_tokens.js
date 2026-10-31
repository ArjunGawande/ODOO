/**
 * Shared updated_at trigger function, then users, sessions and
 * password_reset_tokens. Later migrations reuse set_updated_at().
 */

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  await knex.raw(`
    CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.schema.createTable('users', (t) => {
    t.increments('id');
    t.string('name', 120).notNullable();
    t.string('email', 254).notNullable();
    t.text('password_hash');
    t.text('role').notNullable().defaultTo('customer');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.raw(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'staff', 'customer'))
  `);
  await knex.raw('CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email))');
  await knex.raw('CREATE INDEX users_role_is_active_idx ON users (role, is_active)');
  await knex.raw(`
    CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.createTable('sessions', (t) => {
    t.increments('id');
    t.integer('user_id').notNullable();
    t.specificType('token_hash', 'char(64)').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id', 'sessions_user_id_fkey').references('users.id').onDelete('CASCADE');
    t.unique(['token_hash'], { indexName: 'sessions_token_hash_unique' });
    t.index(['user_id'], 'sessions_user_id_idx');
    t.index(['expires_at'], 'sessions_expires_at_idx');
  });
  await knex.raw(`
    CREATE TRIGGER sessions_set_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);

  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.increments('id');
    t.integer('user_id').notNullable();
    t.specificType('token_hash', 'char(64)').notNullable();
    t.text('purpose').notNullable();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('used_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.foreign('user_id', 'password_reset_tokens_user_id_fkey')
      .references('users.id')
      .onDelete('CASCADE');
    t.unique(['token_hash'], { indexName: 'password_reset_tokens_token_hash_unique' });
    t.index(['user_id'], 'password_reset_tokens_user_id_idx');
  });
  await knex.raw(`
    ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_purpose_check
    CHECK (purpose IN ('reset', 'invite'))
  `);
  await knex.raw(`
    CREATE TRIGGER password_reset_tokens_set_updated_at BEFORE UPDATE ON password_reset_tokens
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()
  `);
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTable('password_reset_tokens');
  await knex.schema.dropTable('sessions');
  await knex.schema.dropTable('users');
  await knex.raw('DROP FUNCTION set_updated_at()');
};
