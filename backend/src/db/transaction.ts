import type { PoolClient } from 'pg';
import { pool } from './pool.js';

/**
 * Runs `work` inside a single database transaction.
 * COMMIT on success, ROLLBACK on any thrown error - so a failure half way
 * through (e.g. stock updated but GRN insert failed) never leaves partial data.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
