import type { Queryable } from '../types/db.types.js';

/**
 * Transaction-scoped advisory lock on (namespace, key). Two requests that
 * carry the same Idempotency-Key are processed strictly one after the other;
 * the second one then finds the first one's committed record and replays it.
 * Released automatically on COMMIT / ROLLBACK.
 */
export async function lockIdempotencyKey(db: Queryable, namespace: number, key: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock($1::int, hashtext($2))', [namespace, key]);
}
