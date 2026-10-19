/**
 * Mirrors the API response shapes (backend/src/types/domain.types.ts).
 * Money and quantities are decimal strings - they are only formatted for
 * display, never used for float arithmetic that is sent back to the server.
 */

export type ProductUnit = 'PCS' | 'SQM' | 'SQFT' | 'KG' | 'LTR' | 'MTR' | 'BOX';
export type PurchaseOrderStatus = 'OPEN' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
export type PaymentMethod = 'BANK_TRANSFER' | 'CHEQUE' | 'CASH' | 'UPI';

export const PRODUCT_UNITS: ProductUnit[] = ['PCS', 'SQM', 'SQFT', 'KG', 'LTR', 'MTR', 'BOX'];
export const PAYMENT_METHODS: PaymentMethod[] = ['BANK_TRANSFER', 'CHEQUE', 'CASH', 'UPI'];

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
}

export interface InventoryItem {
	id: number;
	sku: string;
	name: string;
	unit: ProductUnit;
	reorderLevel: string;
	currentStock: string;
	incomingQuantity: string;
	isLowStock: boolean;
	lastMovementAt: string | null;
}

export interface StockMovement {
	id: number;
	movementType: string;
	quantity: string;
	balanceAfter: string;
	referenceType: string;
	referenceId: number;
	referenceNumber: string | null;
	remarks: string | null;
	createdAt: string;
}

export interface PurchaseOrderItem {
	id: number;
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
}

export interface PurchaseOrderDetail extends PurchaseOrder {
	items: PurchaseOrderItem[];
	receivedValue: string;
	paidAmount: string;
	outstandingAmount: string;
}

export interface GoodsReceipt {
	id: number;
	grnNumber: string;
	purchaseOrderId: number;
	poNumber: string;
	vendorName: string;
	receivedDate: string;
	totalValue: string;
	notes: string | null;
	createdAt: string;
}

export interface GoodsReceiptDetail extends GoodsReceipt {
	items: Array<{
		id: number;
		purchaseOrderItemId: number;
		productName: string;
		productSku: string;
		unit: ProductUnit;
		quantity: string;
		unitPrice: string;
		lineValue: string;
	}>;
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

export interface PageMeta {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

export interface Paged<T> {
	data: T[];
	meta: PageMeta;
}
