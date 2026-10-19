import { createHash } from 'node:crypto';

/** Stable JSON: object keys are sorted recursively so `{a,b}` and `{b,a}` hash equal. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** SHA-256 fingerprint of a request payload, used to detect idempotency-key reuse. */
export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}
