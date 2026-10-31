import { db } from '@backend/lib/db';

/** Empties every application table and restarts ids. Call it in beforeEach. */
export async function resetTables() {
  const rows = await db('pg_tables')
    .where('schemaname', 'public')
    .whereNot('tablename', 'like', 'knex\\_%')
    .select('tablename');
  if (rows.length === 0) return;
  const tables = rows.map((row) => row.tablename);
  const placeholders = tables.map(() => '??').join(', ');
  await db.raw(`TRUNCATE ${placeholders} RESTART IDENTITY CASCADE`, tables);
}
