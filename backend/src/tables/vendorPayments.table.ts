import { defineTable } from '../utils/sql.js';

export const VendorPaymentsTable = defineTable('vendor_payments', {
  id: 'id',
  paymentNumber: 'payment_number',
  vendorId: 'vendor_id',
  purchaseOrderId: 'purchase_order_id',
  amount: 'amount',
  paymentDate: 'payment_date',
  paymentMethod: 'payment_method',
  referenceNo: 'reference_no',
  idempotencyKey: 'idempotency_key',
  requestHash: 'request_hash',
  notes: 'notes',
  createdAt: 'created_at',
});
