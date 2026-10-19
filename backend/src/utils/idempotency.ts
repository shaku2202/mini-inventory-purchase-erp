import type { Request } from 'express';
import { createError } from './appError.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_:-]{8,100}$/;

/**
 * Reads the mandatory `Idempotency-Key` header of a state-changing financial
 * or stock operation. The client generates one key per user action (e.g. a
 * UUID when the form opens) and re-sends the SAME key on every retry.
 */
export function getIdempotencyKey(req: Request): string {
  const key = req.header('Idempotency-Key')?.trim();
  if (!key) throw createError('IDEMPOTENCY_KEY_REQUIRED');
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) throw createError('IDEMPOTENCY_KEY_INVALID');
  return key;
}
