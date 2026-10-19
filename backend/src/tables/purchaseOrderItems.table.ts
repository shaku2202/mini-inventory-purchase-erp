import { defineTable } from '../utils/sql.js';

export const PurchaseOrderItemsTable = defineTable('purchase_order_items', {
  id: 'id',
  purchaseOrderId: 'purchase_order_id',
  productId: 'product_id',
  quantity: 'quantity',
  unitPrice: 'unit_price',
  lineTotal: 'line_total',
  receivedQuantity: 'received_quantity',
  createdAt: 'created_at',
});
