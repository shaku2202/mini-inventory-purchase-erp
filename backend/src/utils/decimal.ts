/**
 * Exact decimal helpers for quantities and money that arrive as strings (from
 * the API or from PostgreSQL NUMERIC columns). Values are converted to scaled
 * BigInts, so comparisons never suffer from floating point error
 * (0.1 + 0.2 !== 0.3).
 */
export const QTY_SCALE = 3;
export const MONEY_SCALE = 2;

export function toScaled(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const [intPart = '0', fracPart = ''] = trimmed.replace(/^[-+]/, '').split('.');
  const frac = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const scaled = BigInt(intPart || '0') * 10n ** BigInt(scale) + BigInt(frac || '0');
  return negative ? -scaled : scaled;
}

export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(scale);
  const int = abs / base;
  const frac = (abs % base).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${int}${scale > 0 ? `.${frac}` : ''}`;
}

export function compareDecimal(a: string, b: string, scale: number): -1 | 0 | 1 {
  const x = toScaled(a, scale);
  const y = toScaled(b, scale);
  return x === y ? 0 : x > y ? 1 : -1;
}

export function subtractDecimal(a: string, b: string, scale: number): string {
  return fromScaled(toScaled(a, scale) - toScaled(b, scale), scale);
}

/** Canonical representation, e.g. `"10"` -> `"10.000"` for a quantity. */
export function normalizeDecimal(value: string, scale: number): string {
  return fromScaled(toScaled(value, scale), scale);
}
