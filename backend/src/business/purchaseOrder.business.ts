import { pool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import * as productService from '../services/product.service.js';
import * as purchaseOrderService from '../services/purchaseOrder.service.js';
import * as vendorService from '../services/vendor.service.js';
import type { Queryable } from '../types/db.types.js';
import type { Paginated, PurchaseOrder, PurchaseOrderDetail } from '../types/domain.types.js';
import { createError } from '../utils/appError.js';
import type { CreatePurchaseOrderInput, ListPurchaseOrdersQuery } from '../validators/purchaseOrder.validator.js';

/**
 * Creates a PO with all its lines atomically. Line totals are generated
 * columns and the header total is recomputed from them in the same
 * transaction, so totals are always consistent.
 */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderDetail> {
  return withTransaction(async (tx) => {
    const vendor = await vendorService.findVendorById(tx, input.vendorId);
    if (!vendor) throw createError('VENDOR_NOT_FOUND', { vendorId: input.vendorId });
    if (!vendor.isActive) throw createError('VENDOR_INACTIVE', { vendorCode: vendor.code });

    const requestedIds = input.items.map((i) => i.productId);
    const found = new Set(await productService.findActiveProductIds(tx, requestedIds));
    const missing = requestedIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw createError('PRODUCTS_NOT_FOUND', { productIds: missing.join(', ') }, { productIds: missing });
    }

    const { id } = await purchaseOrderService.insertPurchaseOrder(tx, input);
    await purchaseOrderService.insertPurchaseOrderItems(tx, id, input.items);
    await purchaseOrderService.refreshPurchaseOrderTotal(tx, id);

    return loadPurchaseOrderDetail(tx, id);
  });
}

export async function getPurchaseOrder(purchaseOrderId: number): Promise<PurchaseOrderDetail> {
  return loadPurchaseOrderDetail(pool, purchaseOrderId);
}

export function listPurchaseOrders(query: ListPurchaseOrdersQuery): Promise<Paginated<PurchaseOrder>> {
  return purchaseOrderService.listPurchaseOrders(pool, query);
}

export async function loadPurchaseOrderDetail(db: Queryable, purchaseOrderId: number): Promise<PurchaseOrderDetail> {
  const purchaseOrder = await purchaseOrderService.findPurchaseOrderById(db, purchaseOrderId);
  if (!purchaseOrder) throw createError('PURCHASE_ORDER_NOT_FOUND', { purchaseOrderId });
  const [items, financials] = await Promise.all([
    purchaseOrderService.findPurchaseOrderItems(db, purchaseOrderId),
    purchaseOrderService.getPurchaseOrderFinancials(db, purchaseOrderId),
  ]);
  return { ...purchaseOrder, items, ...financials };
}
