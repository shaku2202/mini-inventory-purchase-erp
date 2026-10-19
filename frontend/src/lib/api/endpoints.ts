import type {
	GoodsReceipt,
	GoodsReceiptDetail,
	InventoryItem,
	PageMeta,
	PaymentMethod,
	Product,
	ProductUnit,
	PurchaseOrder,
	PurchaseOrderDetail,
	PurchaseOrderStatus,
	StockMovement,
	Vendor,
	VendorBalance,
	VendorPayment
} from '#lib/types.ts';
import { request } from './client.ts';

type ListParams = { page?: number; limit?: number; search?: string };

export const vendorsApi = {
	list: (params: ListParams = {}) => request<Vendor[], PageMeta>('/vendors', { query: { limit: 100, ...params } }),
	create: (body: {
		code: string;
		name: string;
		contactPerson?: string;
		email?: string;
		phone?: string;
		gstin?: string;
		address?: string;
	}) => request<Vendor>('/vendors', { method: 'POST', body }),
	balances: () => request<VendorBalance[]>('/vendors/balances'),
	balance: (id: number) => request<VendorBalance>(`/vendors/${id}/balance`)
};

export const productsApi = {
	list: (params: ListParams = {}) => request<Product[], PageMeta>('/products', { query: { limit: 100, ...params } }),
	create: (body: { sku: string; name: string; unit: ProductUnit; reorderLevel?: string; description?: string }) =>
		request<Product>('/products', { method: 'POST', body })
};

export const inventoryApi = {
	list: (params: ListParams & { lowStockOnly?: boolean } = {}) =>
		request<InventoryItem[], PageMeta>('/inventory', { query: { limit: 50, ...params } }),
	movements: (productId: number, params: ListParams = {}) =>
		request<{ product: Product; movements: StockMovement[] }, PageMeta>(`/inventory/${productId}/movements`, {
			query: params
		})
};

export const purchaseOrdersApi = {
	list: (params: ListParams & { status?: PurchaseOrderStatus | ''; vendorId?: number } = {}) =>
		request<PurchaseOrder[], PageMeta>('/purchase-orders', { query: { limit: 50, ...params } }),
	get: (id: number) => request<PurchaseOrderDetail>(`/purchase-orders/${id}`),
	create: (body: {
		vendorId?: number;
		orderDate?: string;
		expectedDate?: string;
		notes?: string;
		items: Array<{ productId?: number; quantity: string; unitPrice: string }>;
	}) => request<PurchaseOrderDetail>('/purchase-orders', { method: 'POST', body })
};

export const goodsReceiptsApi = {
	list: (params: ListParams & { purchaseOrderId?: number } = {}) =>
		request<GoodsReceipt[], PageMeta>('/goods-receipts', { query: { limit: 50, ...params } }),
	create: (
		body: { purchaseOrderId: number; receivedDate?: string; notes?: string; items: Array<{ purchaseOrderItemId: number; quantity: string }> },
		idempotencyKey: string
	) => request<GoodsReceiptDetail>('/goods-receipts', { method: 'POST', body, idempotencyKey })
};

export const paymentsApi = {
	list: (params: ListParams & { vendorId?: number } = {}) =>
		request<VendorPayment[], PageMeta>('/vendor-payments', { query: { limit: 50, ...params } }),
	create: (
		body: {
			vendorId?: number;
			purchaseOrderId?: number | null;
			amount: string;
			paymentMethod: PaymentMethod;
			paymentDate?: string;
			referenceNo?: string;
			notes?: string;
		},
		idempotencyKey: string
	) => request<{ payment: VendorPayment; vendorBalance: VendorBalance }>('/vendor-payments', { method: 'POST', body, idempotencyKey })
};
