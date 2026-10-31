import path from 'node:path';
import { fileURLToPath } from 'node:url';

import knex from 'knex';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

/** Brings the test database up to the latest schema, once per run. */
export default async function globalSetup() {
  const client = knex({
    client: 'pg',
    connection: { connectionString: process.env.TEST_DATABASE_URL },
    pool: { min: 0, max: 1 },
    migrations: { directory: migrationsDir },
  });
  try {
    await client.migrate.latest();
  } finally {
    await client.destroy();
  }
}
