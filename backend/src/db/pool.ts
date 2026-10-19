import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// NUMERIC values are returned as strings on purpose: money and quantities must
// never pass through binary floating point. BIGINT ids/counts fit safely in a
// JS number for this application, so they are parsed.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// Return DATE columns as 'YYYY-MM-DD' strings (no timezone shifting).
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({
  connectionString: env.db.url,
  max: env.db.poolMax,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));

export async function closePool(): Promise<void> {
  await pool.end();
}
