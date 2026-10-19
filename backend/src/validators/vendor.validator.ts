import { z } from 'zod';
import { optionalText, requiredText } from './common.validator.js';

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const emailSchema = z.email();

export const createVendorSchema = z.strictObject({
  code: requiredText(2, 30)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]+$/, { error: 'FIELD_INVALID_FORMAT' })),
  name: requiredText(2, 150),
  contactPerson: optionalText(100),
  email: optionalText(150)
    .transform((v) => v?.toLowerCase() ?? null)
    .refine((v) => v === null || emailSchema.safeParse(v).success, { error: 'FIELD_INVALID_EMAIL' }),
  phone: optionalText(20).refine((v) => v === null || /^[0-9+\-\s()]{7,20}$/.test(v), { error: 'FIELD_INVALID_FORMAT' }),
  gstin: optionalText(15)
    .transform((v) => v?.toUpperCase() ?? null)
    .refine((v) => v === null || GSTIN_PATTERN.test(v), { error: 'FIELD_INVALID_FORMAT' }),
  address: optionalText(500),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;
