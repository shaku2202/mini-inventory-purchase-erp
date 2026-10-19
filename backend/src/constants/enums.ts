/** Domain enumerations. Must stay in sync with the CHECK constraints in migrations/001_init_schema.sql. */

export const PRODUCT_UNITS = ['PCS', 'SQM', 'SQFT', 'KG', 'LTR', 'MTR', 'BOX'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PO_STATUS = {
  OPEN: 'OPEN',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
} as const;
export type PurchaseOrderStatus = (typeof PO_STATUS)[keyof typeof PO_STATUS];
export const PO_STATUSES = Object.values(PO_STATUS);

export const PAYMENT_METHODS = ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MOVEMENT_TYPE = {
  PURCHASE_RECEIPT: 'PURCHASE_RECEIPT',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  ISSUE: 'ISSUE',
} as const;
export type MovementType = (typeof MOVEMENT_TYPE)[keyof typeof MOVEMENT_TYPE];

export const REFERENCE_TYPE = {
  GOODS_RECEIPT: 'GOODS_RECEIPT',
} as const;

/** Advisory-lock namespaces (first int of pg_advisory_xact_lock(int, int)). */
export const LOCK_NAMESPACE = {
  GOODS_RECEIPT_IDEMPOTENCY: 101,
  VENDOR_PAYMENT_IDEMPOTENCY: 102,
} as const;
