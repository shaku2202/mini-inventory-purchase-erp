import { defineTable } from '../utils/sql.js';

export const GoodsReceiptItemsTable = defineTable('goods_receipt_items', {
  id: 'id',
  goodsReceiptId: 'goods_receipt_id',
  purchaseOrderItemId: 'purchase_order_item_id',
  productId: 'product_id',
  quantity: 'quantity',
  unitPrice: 'unit_price',
  lineValue: 'line_value',
});
