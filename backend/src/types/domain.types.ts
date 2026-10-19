import type { MovementType, PaymentMethod, ProductUnit, PurchaseOrderStatus } from '../constants/enums.js';

/**
 * API-facing shapes. NUMERIC columns (money, quantities) are typed as string
 * on purpose - see db/pool.ts.
 */

export interface Vendor {
  id: number;
  code: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: ProductUnit;
  reorderLevel: string;
  currentStock: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem extends Pick<Product, 'id' | 'sku' | 'name' | 'unit' | 'reorderLevel' | 'currentStock'> {
  /** Ordered but not yet received on open purchase orders */
  incomingQuantity: string;
  isLowStock: boolean;
  lastMovementAt: string | null;
}

export interface PurchaseOrderItem {
  id: number;
  purchaseOrderId: number;
  productId: number;
  productSku: string;
  productName: string;
  unit: ProductUnit;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  receivedQuantity: string;
  pendingQuantity: string;
}

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string | null;
  status: PurchaseOrderStatus;
  totalAmount: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  items: PurchaseOrderItem[];
  receivedValue: string;
  paidAmount: string;
  outstandingAmount: string;
}

export interface GoodsReceiptItem {
  id: number;
  purchaseOrderItemId: number;
  productId: number;
  productSku: string;
  productName: string;
  unit: ProductUnit;
  quantity: string;
  unitPrice: string;
  lineValue: string;
}

export interface GoodsReceipt {
  id: number;
  grnNumber: string;
  purchaseOrderId: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  receivedDate: string;
  totalValue: string;
  notes: string | null;
  createdAt: string;
}

export interface GoodsReceiptDetail extends GoodsReceipt {
  items: GoodsReceiptItem[];
}

export interface StockMovement {
  id: number;
  productId: number;
  movementType: MovementType;
  quantity: string;
  balanceAfter: string;
  referenceType: string;
  referenceId: number;
  referenceNumber: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface VendorPayment {
  id: number;
  paymentNumber: string;
  vendorId: number;
  vendorName: string;
  purchaseOrderId: number | null;
  poNumber: string | null;
  amount: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNo: string | null;
  notes: string | null;
  createdAt: string;
}

export interface VendorBalance {
  vendorId: number;
  vendorCode: string;
  vendorName: string;
  purchaseOrderCount: number;
  totalOrderedValue: string;
  goodsReceiptCount: number;
  totalReceivedValue: string;
  paymentCount: number;
  totalPaid: string;
  outstandingBalance: string;
}

/** Result of an idempotent command: `replayed` = served from a previous identical request. */
export interface IdempotentResult<T> {
  replayed: boolean;
  data: T;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
}
