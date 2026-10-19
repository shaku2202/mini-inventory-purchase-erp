import { z } from 'zod';
import { PRODUCT_UNITS } from '../constants/enums.js';
import { decimalSchema, optionalText, requiredText } from './common.validator.js';
import { QTY_SCALE } from '../utils/decimal.js';

export const createProductSchema = z.strictObject({
  sku: requiredText(2, 40)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]+$/, { error: 'FIELD_INVALID_FORMAT' })),
  name: requiredText(2, 150),
  description: optionalText(1000),
  unit: z.enum(PRODUCT_UNITS),
  reorderLevel: decimalSchema({ scale: QTY_SCALE, maxIntegerDigits: 9, allowZero: true }).default('0'),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
