import { z } from 'zod';
import { MONEY_SCALE, QTY_SCALE, toScaled } from '../utils/decimal.js';

/**
 * Reusable schema building blocks. Custom issues use an error code from
 * errorMessages.json as their `message`; utils/validateInput.ts turns every
 * issue into `{ field, code, message }` using that same JSON file.
 */

export const idSchema = z.coerce
  .number({ error: 'FIELD_INVALID_ID' })
  .int({ error: 'FIELD_INVALID_ID' })
  .positive({ error: 'FIELD_INVALID_ID' })
  .max(Number.MAX_SAFE_INTEGER, { error: 'FIELD_INVALID_ID' });

export const idParamSchema = z.object({ id: idSchema });

/** Optional free text: trims, turns '' into null, enforces a max length. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (min: number, max: number) => z.string().trim().min(min).max(max);

export const isoDateSchema = z.iso.date({ error: 'FIELD_INVALID_DATE' });
export const optionalDate = isoDateSchema.nullish().transform((v) => v ?? null);

interface DecimalOptions {
  scale: number;
  /** maximum digits before the decimal point */
  maxIntegerDigits: number;
  allowZero?: boolean;
}

/**
 * Accepts a JSON number or numeric string and returns a canonical string.
 * Money/quantities stay strings end-to-end so PostgreSQL NUMERIC does the
 * arithmetic - binary floats are never used for business values.
 */
export const decimalSchema = ({ scale, maxIntegerDigits, allowZero = false }: DecimalOptions) =>
  z
    .union([z.number(), z.string()], { error: 'FIELD_INVALID_TYPE' })
    .transform((v) => (typeof v === 'number' ? String(v) : v.trim()))
    .superRefine((value, ctx) => {
      if (value === '') {
        ctx.addIssue({ code: 'custom', message: 'FIELD_REQUIRED' });
        return;
      }
      if (!/^-?\d+(\.\d+)?$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'FIELD_INVALID_TYPE', params: { expected: 'number' } });
        return;
      }
      const [, fraction = ''] = value.replace('-', '').split('.');
      if (fraction.length > scale) {
        ctx.addIssue({ code: 'custom', message: 'FIELD_INVALID_DECIMAL', params: { scale } });
        return;
      }
      const scaled = toScaled(value, scale);
      if (scaled < 0n || (!allowZero && scaled === 0n)) {
        ctx.addIssue({ code: 'custom', message: allowZero ? 'FIELD_MUST_BE_NON_NEGATIVE' : 'FIELD_MUST_BE_POSITIVE' });
        return;
      }
      const max = 10n ** BigInt(maxIntegerDigits + scale);
      if (scaled >= max) {
        ctx.addIssue({ code: 'custom', message: 'FIELD_TOO_LARGE', params: { max: `${'9'.repeat(maxIntegerDigits)}` } });
      }
    });

export const quantitySchema = decimalSchema({ scale: QTY_SCALE, maxIntegerDigits: 9 });
export const moneySchema = decimalSchema({ scale: MONEY_SCALE, maxIntegerDigits: 10 });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;
