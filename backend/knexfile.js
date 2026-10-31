const path = require('node:path');
const { loadEnvConfig } = require('@next/env');

// Same env files as Next, so the CLI and the app agree. Quiet by default.
loadEnvConfig(path.join(__dirname, '..'), process.env.NODE_ENV !== 'production', {
  info() {},
  error: console.error,
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  // Without this, pg silently falls back to localhost:5432.
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
}

module.exports = {
  client: 'pg',
  connection: { connectionString },
  pool: { min: 0, max: 5 },
  migrations: {
    directory: path.join(__dirname, 'db', 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'db', 'seeds'),
  },
};
