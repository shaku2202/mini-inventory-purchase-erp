/**
 * Runs once before the test suite: rebuilds the schema of the dedicated test
 * database (TEST_DATABASE_URL) from the migration files.
 */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  await import('dotenv/config');
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set - tests never run against DATABASE_URL.');
  }

  const { pool, closePool } = await import('../src/db/pool.js');
  const { runMigrations } = await import('../src/db/migrate.js');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await runMigrations();
  await closePool();
}
