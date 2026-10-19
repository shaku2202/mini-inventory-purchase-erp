import { LOCK_NAMESPACE, MOVEMENT_TYPE, PO_STATUS, REFERENCE_TYPE } from '../constants/enums.js';
import { pool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import * as goodsReceiptService from '../services/goodsReceipt.service.js';
import { lockIdempotencyKey } from '../services/lock.service.js';
import * as productService from '../services/product.service.js';
import * as purchaseOrderService from '../services/purchaseOrder.service.js';
import * as stockMovementService from '../services/stockMovement.service.js';
import type { Queryable } from '../types/db.types.js';
import type { GoodsReceipt, GoodsReceiptDetail, IdempotentResult, Paginated } from '../types/domain.types.js';
import { createError } from '../utils/appError.js';
import { compareDecimal, normalizeDecimal, QTY_SCALE } from '../utils/decimal.js';
import { hashPayload } from '../utils/hash.js';
import type { CreateGoodsReceiptInput, ListGoodsReceiptsQuery } from '../validators/goodsReceipt.validator.js';
import type { ReceiptLineToInsert } from '../services/goodsReceipt.service.js';

/**
 * Records a goods receipt (GRN) against a purchase order.
 *
 * Everything below runs in ONE transaction - receipt header, receipt lines,
 * PO received quantities, product stock, stock-movement ledger and PO status.
 * Any failure rolls all of it back, so stock and payables never drift apart.
 *
 * Duplicate protection (three layers):
 *  1. Idempotency-Key: a retried request with the same key + same payload
 *     returns the original GRN (no second stock increase). Same key with a
 *     different payload is rejected (409).
 *  2. Row locks on the PO and its lines: concurrent receipts for the same PO
 *     are serialised, and each one re-checks the still-pending quantity.
 *  3. CHECK (received_quantity <= quantity) in the database as a last guard.
 */
export async function receiveGoods(
  input: CreateGoodsReceiptInput,
  idempotencyKey: string,
): Promise<IdempotentResult<GoodsReceiptDetail>> {
  const requestHash = hashPayload(input);

  return withTransaction(async (tx) => {
    await lockIdempotencyKey(tx, LOCK_NAMESPACE.GOODS_RECEIPT_IDEMPOTENCY, idempotencyKey);
    const previous = await goodsReceiptService.findReceiptByIdempotencyKey(tx, idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash) throw createError('IDEMPOTENCY_KEY_REUSED', { key: idempotencyKey });
      return { replayed: true, data: await loadGoodsReceiptDetail(tx, previous.id) };
    }

    const purchaseOrder = await purchaseOrderService.findPurchaseOrderById(tx, input.purchaseOrderId, { forUpdate: true });
    if (!purchaseOrder) throw createError('PURCHASE_ORDER_NOT_FOUND', { purchaseOrderId: input.purchaseOrderId });
    if (purchaseOrder.status === PO_STATUS.RECEIVED) {
      throw createError('PO_ALREADY_FULLY_RECEIVED', { poNumber: purchaseOrder.poNumber });
    }

    const poItems = await purchaseOrderService.findPurchaseOrderItems(tx, purchaseOrder.id, { forUpdate: true });
    const poItemsById = new Map(poItems.map((item) => [item.id, item]));

    const lines: ReceiptLineToInsert[] = input.items.map((requested) => {
      const poItem = poItemsById.get(requested.purchaseOrderItemId);
      if (!poItem) {
        throw createError('RECEIPT_ITEM_NOT_IN_PO', {
          purchaseOrderItemId: requested.purchaseOrderItemId,
          poNumber: purchaseOrder.poNumber,
        });
      }
      if (compareDecimal(requested.quantity, poItem.pendingQuantity, QTY_SCALE) > 0) {
        throw createError(
          'RECEIPT_EXCEEDS_PENDING_QTY',
          {
            requested: normalizeDecimal(requested.quantity, QTY_SCALE),
            pending: poItem.pendingQuantity,
            productName: poItem.productName,
            poNumber: purchaseOrder.poNumber,
          },
          { purchaseOrderItemId: poItem.id, requested: requested.quantity, pending: poItem.pendingQuantity },
        );
      }
      return {
        purchaseOrderItemId: poItem.id,
        productId: poItem.productId,
        quantity: requested.quantity,
        unitPrice: poItem.unitPrice, // always the PO price - the client cannot change the payable
      };
    });

    const { id: goodsReceiptId } = await goodsReceiptService.insertGoodsReceipt(
      tx,
      {
        purchaseOrderId: purchaseOrder.id,
        vendorId: purchaseOrder.vendorId,
        receivedDate: input.receivedDate,
        notes: input.notes,
        idempotencyKey,
        requestHash,
      },
      lines,
    );
    await goodsReceiptService.insertGoodsReceiptItems(tx, goodsReceiptId, lines);

    // Update products in a fixed (id) order so two receipts touching the same
    // products can never deadlock each other.
    const ordered = [...lines].sort((a, b) => a.productId - b.productId);
    for (const line of ordered) {
      await purchaseOrderService.incrementReceivedQuantity(tx, line.purchaseOrderItemId, line.quantity);
      const balanceAfter = await productService.incrementStock(tx, line.productId, line.quantity);
      await stockMovementService.insertStockMovement(tx, {
        productId: line.productId,
        movementType: MOVEMENT_TYPE.PURCHASE_RECEIPT,
        quantity: line.quantity,
        balanceAfter,
        referenceType: REFERENCE_TYPE.GOODS_RECEIPT,
        referenceId: goodsReceiptId,
        remarks: `Received against ${purchaseOrder.poNumber}`,
      });
    }

    await purchaseOrderService.refreshPurchaseOrderStatus(tx, purchaseOrder.id);

    return { replayed: false, data: await loadGoodsReceiptDetail(tx, goodsReceiptId) };
  });
}

export async function getGoodsReceipt(goodsReceiptId: number): Promise<GoodsReceiptDetail> {
  return loadGoodsReceiptDetail(pool, goodsReceiptId);
}

export function listGoodsReceipts(query: ListGoodsReceiptsQuery): Promise<Paginated<GoodsReceipt>> {
  return goodsReceiptService.listGoodsReceipts(pool, query);
}

async function loadGoodsReceiptDetail(db: Queryable, goodsReceiptId: number): Promise<GoodsReceiptDetail> {
  const receipt = await goodsReceiptService.findGoodsReceiptById(db, goodsReceiptId);
  if (!receipt) throw createError('INTERNAL_SERVER_ERROR');
  const items = await goodsReceiptService.findGoodsReceiptItems(db, goodsReceiptId);
  return { ...receipt, items };
}
