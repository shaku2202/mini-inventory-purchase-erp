import { defineTable } from '../utils/sql.js';

/** Read-only view defined in migrations/002_vendor_balance_view.sql */
export const VendorBalancesView = defineTable('v_vendor_balances', {
  vendorId: 'vendor_id',
  vendorCode: 'vendor_code',
  vendorName: 'vendor_name',
  purchaseOrderCount: 'purchase_order_count',
  totalOrderedValue: 'total_ordered_value',
  goodsReceiptCount: 'goods_receipt_count',
  totalReceivedValue: 'total_received_value',
  paymentCount: 'payment_count',
  totalPaid: 'total_paid',
  outstandingBalance: 'outstanding_balance',
});
