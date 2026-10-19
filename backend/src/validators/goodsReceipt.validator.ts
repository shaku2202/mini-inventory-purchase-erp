import { z } from 'zod';
import { idSchema, listQuerySchema, optionalDate, optionalText, quantitySchema } from './common.validator.js';

export const createGoodsReceiptSchema = z
  .strictObject({
    purchaseOrderId: idSchema,
    receivedDate: optionalDate,
    notes: optionalText(1000),
    items: z
      .array(
        z.strictObject({
          purchaseOrderItemId: idSchema,
          quantity: quantitySchema,
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((receipt, ctx) => {
    const seen = new Set<number>();
    receipt.items.forEach((item, index) => {
      if (seen.has(item.purchaseOrderItemId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'purchaseOrderItemId'],
          message: 'RECEIPT_DUPLICATE_ITEM',
          params: { purchaseOrderItemId: item.purchaseOrderItemId },
        });
      }
      seen.add(item.purchaseOrderItemId);
    });
  });

export const listGoodsReceiptsQuerySchema = listQuerySchema.extend({
  purchaseOrderId: idSchema.optional(),
});

export type CreateGoodsReceiptInput = z.infer<typeof createGoodsReceiptSchema>;
export type ListGoodsReceiptsQuery = z.infer<typeof listGoodsReceiptsQuerySchema>;
