import knex from 'knex';
import pg from 'pg';

const OID_INT8 = 20;
const OID_DATE = 1082;

// Dates stay YYYY-MM-DD strings: a JS Date would shift days across timezones.
pg.types.setTypeParser(OID_DATE, (value) => value);
// count(*) comes back as int8. Numeric (money) is left alone and stays a string.
pg.types.setTypeParser(OID_INT8, (value) => Number.parseInt(value, 10));

function createDb() {
  return knex({
    client: 'pg',
    // Resolved on first use, so importing this module needs no database. Without
    // the check, pg would silently fall back to localhost:5432.
    connection: () => {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
      }
      return { connectionString };
    },
    pool: { min: 0, max: 10 },
  });
}

// Kept on globalThis so hot reload in `next dev` reuses one connection pool.
globalThis.__brightloopDb ??= createDb();

export const db = globalThis.__brightloopDb;
export default db;
