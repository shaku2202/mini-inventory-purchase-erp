import { describe, expect, it } from 'vitest';
import { createError, formatMessage } from '../src/utils/appError.js';
import { compareDecimal, normalizeDecimal, subtractDecimal } from '../src/utils/decimal.js';
import { hashPayload } from '../src/utils/hash.js';

describe('error message factory', () => {
  it('interpolates parameters and takes the HTTP status from errorMessages.json', () => {
    const error = createError('VENDOR_NOT_FOUND', { vendorId: 42 });
    expect(error.httpStatus).toBe(404);
    expect(error.message).toBe('Vendor with id 42 does not exist.');
  });

  it('leaves unknown placeholders visible instead of printing "undefined"', () => {
    expect(formatMessage('VENDOR_NOT_FOUND')).toContain('{vendorId}');
  });
});

describe('decimal helpers (no floating point)', () => {
  it('compares exactly', () => {
    expect(compareDecimal('0.3', '0.30', 2)).toBe(0);
    expect(compareDecimal('1000.01', '1000.00', 2)).toBe(1);
    expect(compareDecimal('10', '10.001', 3)).toBe(-1);
  });

  it('subtracts and normalises', () => {
    expect(subtractDecimal('0.3', '0.1', 2)).toBe('0.20');
    expect(subtractDecimal('5', '7.5', 3)).toBe('-2.500');
    expect(normalizeDecimal('7', 3)).toBe('7.000');
  });
});

describe('payload hashing', () => {
  it('is independent of key order', () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: 3 } })).toBe(hashPayload({ b: { d: 3, c: 2 }, a: 1 }));
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });
});
