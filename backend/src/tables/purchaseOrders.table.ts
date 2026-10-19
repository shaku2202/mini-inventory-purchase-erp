import { defineTable } from '../utils/sql.js';

export const PurchaseOrdersTable = defineTable('purchase_orders', {
  id: 'id',
  poNumber: 'po_number',
  vendorId: 'vendor_id',
  orderDate: 'order_date',
  expectedDate: 'expected_date',
  status: 'status',
  totalAmount: 'total_amount',
  notes: 'notes',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});
