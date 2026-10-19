// Starts a throw-away local PostgreSQL server for development/testing when no
// Postgres installation (or Docker) is available. Data lives in ./.pgdata.
import EmbeddedPostgres from 'embedded-postgres';
import 'dotenv/config';

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const pg = new EmbeddedPostgres({
  databaseDir: './.pgdata',
  user: 'erp_user',
  password: process.env.LOCAL_PG_PASSWORD ?? 'change_me',
  port,
  persistent: true,
});

const { existsSync } = await import('node:fs');
if (!existsSync('./.pgdata/PG_VERSION')) await pg.initialise();
await pg.start();
for (const db of ['erp_db', 'erp_test']) {
  try { await pg.createDatabase(db); } catch { /* already exists */ }
}
console.log(`Local PostgreSQL running on port ${port} (databases: erp_db, erp_test). Ctrl+C to stop.`);

const stop = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
