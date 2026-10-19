import { defineTable } from '../utils/sql.js';

export const GoodsReceiptsTable = defineTable('goods_receipts', {
  id: 'id',
  grnNumber: 'grn_number',
  purchaseOrderId: 'purchase_order_id',
  vendorId: 'vendor_id',
  receivedDate: 'received_date',
  totalValue: 'total_value',
  idempotencyKey: 'idempotency_key',
  requestHash: 'request_hash',
  notes: 'notes',
  createdAt: 'created_at',
});
