import { AppError, createError } from './appError.js';

/** PostgreSQL SQLSTATE codes that are translated into API errors. */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  INVALID_TEXT_REPRESENTATION: '22P02',
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
} as const;

const CONNECTION_ERRORS = new Set(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', '57P01', '57P03', '08006', '08001']);

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Safety net: if a database constraint catches something the business layer
 * did not (e.g. a race condition), the client still gets a meaningful 4xx
 * instead of a generic 500. Raw SQL details are never leaked to the client.
 */
export function mapDatabaseError(error: unknown): AppError | null {
  const pgError = error as PgLikeError;
  if (!pgError || typeof pgError.code !== 'string') return null;

  if (CONNECTION_ERRORS.has(pgError.code)) return createError('SERVICE_UNAVAILABLE');

  switch (pgError.code) {
    case PG.UNIQUE_VIOLATION:
      if (pgError.constraint === 'uq_vendors_code') return createError('VENDOR_CODE_EXISTS', { code: extractValue(pgError.detail) });
      if (pgError.constraint === 'uq_products_sku') return createError('PRODUCT_SKU_EXISTS', { sku: extractValue(pgError.detail) });
      return createError('DUPLICATE_RESOURCE', {}, { constraint: pgError.constraint });
    case PG.FOREIGN_KEY_VIOLATION:
      return createError('REFERENCED_RESOURCE_NOT_FOUND', {}, { constraint: pgError.constraint });
    case PG.CHECK_VIOLATION:
    case PG.NOT_NULL_VIOLATION:
    case PG.NUMERIC_VALUE_OUT_OF_RANGE:
      return createError('CONSTRAINT_VIOLATION', { constraint: pgError.constraint ?? 'value out of range' });
    case PG.INVALID_TEXT_REPRESENTATION:
      return createError('VALIDATION_FAILED');
    default:
      return null;
  }
}

/** `Key (code)=(V001) already exists.` -> `V001` */
function extractValue(detail?: string): string {
  const match = detail?.match(/\)=\((.*)\)/);
  return match?.[1] ?? '';
}
