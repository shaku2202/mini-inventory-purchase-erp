import { z } from 'zod';
import { PO_STATUSES } from '../constants/enums.js';
import { idSchema, listQuerySchema, moneySchema, optionalDate, optionalText, quantitySchema } from './common.validator.js';

const purchaseOrderItemSchema = z.strictObject({
  productId: idSchema,
  quantity: quantitySchema,
  unitPrice: moneySchema,
});

export const createPurchaseOrderSchema = z
  .strictObject({
    vendorId: idSchema,
    orderDate: optionalDate,
    expectedDate: optionalDate,
    notes: optionalText(1000),
    items: z.array(purchaseOrderItemSchema).min(1).max(100),
  })
  .superRefine((po, ctx) => {
    const seen = new Set<number>();
    po.items.forEach((item, index) => {
      if (seen.has(item.productId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'productId'],
          message: 'PO_DUPLICATE_PRODUCT',
          params: { productId: item.productId },
        });
      }
      seen.add(item.productId);
    });
    if (po.orderDate && po.expectedDate && po.expectedDate < po.orderDate) {
      ctx.addIssue({ code: 'custom', path: ['expectedDate'], message: 'FIELD_DATE_BEFORE_ORDER' });
    }
  });

export const listPurchaseOrdersQuerySchema = listQuerySchema.extend({
  vendorId: idSchema.optional(),
  status: z.enum(PO_STATUSES).optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
