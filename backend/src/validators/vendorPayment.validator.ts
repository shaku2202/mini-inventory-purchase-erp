import { z } from 'zod';
import { PAYMENT_METHODS } from '../constants/enums.js';
import { idSchema, listQuerySchema, moneySchema, optionalDate, optionalText } from './common.validator.js';

export const createVendorPaymentSchema = z.strictObject({
  vendorId: idSchema,
  // Optional allocation of the payment to one purchase order ("invoice").
  purchaseOrderId: idSchema.nullish().transform((v) => v ?? null),
  amount: moneySchema,
  paymentDate: optionalDate,
  paymentMethod: z.enum(PAYMENT_METHODS),
  referenceNo: optionalText(50),
  notes: optionalText(1000),
});

export const listVendorPaymentsQuerySchema = listQuerySchema.extend({
  vendorId: idSchema.optional(),
});

export type CreateVendorPaymentInput = z.infer<typeof createVendorPaymentSchema>;
export type ListVendorPaymentsQuery = z.infer<typeof listVendorPaymentsQuerySchema>;
