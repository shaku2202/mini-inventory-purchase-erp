import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool, pool } from '../src/db/pool.js';
import {
  api,
  countRows,
  createProduct,
  createPurchaseOrder,
  createVendor,
  newKey,
  receive,
  resetDatabase,
  stockOf,
} from './helpers.js';

beforeEach(resetDatabase);
afterAll(closePool);

async function setupPo(quantity = 100, unitPrice = 450.5) {
  const vendor = await createVendor();
  const product = await createProduct();
  const po = await createPurchaseOrder(vendor.id, [{ productId: product.id, quantity, unitPrice }]);
  return { vendor, product, po, itemId: po.items[0]!.id };
}

describe('Goods receipt - happy path', () => {
  it('creates a GRN + stock movement and increases stock exactly once', async () => {
    const { product, po, itemId } = await setupPo();

    const res = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 60 }]);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ grnNumber: 'GRN-000001', totalValue: '27030.00' });
    expect(await stockOf(product.id)).toBe('60.000');

    const ledger = await api().get(`/api/inventory/${product.id}/movements`);
    expect(ledger.body.data.movements).toHaveLength(1);
    expect(ledger.body.data.movements[0]).toMatchObject({
      movementType: 'PURCHASE_RECEIPT',
      quantity: '60.000',
      balanceAfter: '60.000',
      referenceNumber: 'GRN-000001',
    });
  });

  it('supports partial receipts and moves PO status OPEN -> PARTIALLY_RECEIVED -> RECEIVED', async () => {
    const { po, itemId, product } = await setupPo(10, 5);

    await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 4 }]);
    expect((await api().get(`/api/purchase-orders/${po.id}`)).body.data.status).toBe('PARTIALLY_RECEIVED');

    await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 6 }]);
    const detail = (await api().get(`/api/purchase-orders/${po.id}`)).body.data;
    expect(detail.status).toBe('RECEIVED');
    expect(detail.items[0].pendingQuantity).toBe('0.000');
    expect(await stockOf(product.id)).toBe('10.000');
  });
});

describe('Goods receipt - duplicate protection', () => {
  it('replays a retried request with the same Idempotency-Key without touching stock again', async () => {
    const { po, itemId, product } = await setupPo();
    const key = newKey();

    const first = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 10 }], key);
    const retry = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 10 }], key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await stockOf(product.id)).toBe('10.000');
    expect(await countRows('goods_receipts')).toBe(1);
    expect(await countRows('stock_movements')).toBe(1);
  });

  it('treats "10" and 10 as the same payload when replaying', async () => {
    const { po, itemId } = await setupPo();
    const key = newKey();
    await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 10 }], key);
    const retry = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: '10' }], key);
    expect(retry.status).toBe(200);
  });

  it('rejects reuse of an Idempotency-Key with a different payload (409)', async () => {
    const { po, itemId, product } = await setupPo();
    const key = newKey();
    await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 10 }], key);
    const reuse = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 20 }], key);

    expect(reuse.status).toBe(409);
    expect(reuse.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await stockOf(product.id)).toBe('10.000');
  });

  it('processes concurrent duplicate submissions only once', async () => {
    const { po, itemId, product } = await setupPo();
    const key = newKey();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 25 }], key)),
    );

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(await stockOf(product.id)).toBe('25.000');
    expect(await countRows('goods_receipts')).toBe(1);
  });

  it('never over-receives when different receipts race for the last pending quantity', async () => {
    const { po, itemId, product } = await setupPo(10, 1);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 6 }])),
    );

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.error.code === 'RECEIPT_EXCEEDS_PENDING_QTY')).toBe(true);
    expect(await stockOf(product.id)).toBe('6.000');
  });

  it('rejects receiving against a fully received PO (409)', async () => {
    const { po, itemId } = await setupPo(5, 1);
    await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 5 }]);
    const again = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: 5 }]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PO_ALREADY_FULLY_RECEIVED');
  });

  it('requires the Idempotency-Key header', async () => {
    const { po, itemId } = await setupPo();
    const res = await api().post('/api/goods-receipts').send({ purchaseOrderId: po.id, items: [{ purchaseOrderItemId: itemId, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });
});

describe('Goods receipt - validation & atomicity', () => {
  it('rejects invalid and non-positive quantities', async () => {
    const { po, itemId } = await setupPo();
    for (const quantity of [0, -5, 'abc', 1.23456]) {
      const res = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity }]);
      expect(res.status, `quantity=${quantity}`).toBe(400);
    }
    expect(await countRows('goods_receipts')).toBe(0);
  });

  it('rejects receiving more than is pending on the PO line (422)', async () => {
    const { po, itemId, product } = await setupPo(10, 1);
    const res = await receive(po.id, [{ purchaseOrderItemId: itemId, quantity: '10.001' }]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RECEIPT_EXCEEDS_PENDING_QTY');
    expect(await stockOf(product.id)).toBe('0.000');
  });

  it('returns 404 for a nonexistent purchase order', async () => {
    const res = await receive(4242, [{ purchaseOrderItemId: 1, quantity: 1 }]);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PURCHASE_ORDER_NOT_FOUND');
  });

  it('is all-or-nothing: one invalid line rolls back every other line', async () => {
    const vendor = await createVendor();
    const a = await createProduct();
    const b = await createProduct();
    const po = await createPurchaseOrder(vendor.id, [
      { productId: a.id, quantity: 10, unitPrice: 1 },
      { productId: b.id, quantity: 10, unitPrice: 1 },
    ]);
    const otherPo = await createPurchaseOrder(vendor.id, [{ productId: a.id, quantity: 1, unitPrice: 1 }]);

    const res = await receive(po.id, [
      { purchaseOrderItemId: po.items[0]!.id, quantity: 5 },
      { purchaseOrderItemId: otherPo.items[0]!.id, quantity: 1 }, // belongs to another PO
    ]);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('RECEIPT_ITEM_NOT_IN_PO');
    expect(await stockOf(a.id)).toBe('0.000');
    expect(await countRows('goods_receipts')).toBe(0);
    expect(await countRows('stock_movements')).toBe(0);
  });

  it('database constraint blocks over-receipt even if the API check were bypassed', async () => {
    const { itemId } = await setupPo(5, 1);
    await expect(pool.query('UPDATE purchase_order_items SET received_quantity = 6 WHERE id = $1', [itemId])).rejects.toMatchObject({
      constraint: 'ck_po_items_received_range',
    });
  });
});
