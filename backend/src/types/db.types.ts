import type { QueryResultRow } from 'pg';

/**
 * Anything that can run a query: the shared pool or a client that is inside a
 * transaction. Services accept this so the business layer decides whether a
 * call participates in a transaction.
 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}
