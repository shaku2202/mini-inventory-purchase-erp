import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../src/db/pool.js';
import { api, countRows, createProduct, createPurchaseOrder, createVendor, resetDatabase } from './helpers.js';

beforeEach(resetDatabase);
afterAll(closePool);

describe('Purchase orders', () => {
  it('creates a multi-line PO and calculates line and header totals consistently', async () => {
    const vendor = await createVendor();
    const glass = await createProduct();
    const film = await createProduct({ unit: 'SQM' });

    const po = await createPurchaseOrder(vendor.id, [
      { productId: glass.id, quantity: 3, unitPrice: '33.33' }, // 99.99
      { productId: film.id, quantity: '1.5', unitPrice: '10.01' }, // 15.015 -> 15.02
    ]);

    expect(po.poNumber).toBe('PO-000001');
    expect(po.status).toBe('OPEN');
    expect(po.items.map((i) => i.lineTotal)).toEqual(['99.99', '15.02']);
    expect(po.totalAmount).toBe('115.01');
  });

  it('rejects zero / negative quantities and prices', async () => {
    const vendor = await createVendor();
    const product = await createProduct();
    const res = await api()
      .post('/api/purchase-orders')
      .send({ vendorId: vendor.id, items: [{ productId: product.id, quantity: 0, unitPrice: -5 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toEqual(['items[0].quantity', 'items[0].unitPrice']);
  });

  it('rejects an empty item list and duplicate product lines', async () => {
    const vendor = await createVendor();
    const product = await createProduct();
    const empty = await api().post('/api/purchase-orders').send({ vendorId: vendor.id, items: [] });
    expect(empty.body.error.details[0].code).toBe('FIELD_ARRAY_MIN');

    const dup = await api()
      .post('/api/purchase-orders')
      .send({
        vendorId: vendor.id,
        items: [
          { productId: product.id, quantity: 1, unitPrice: 1 },
          { productId: product.id, quantity: 2, unitPrice: 1 },
        ],
      });
    expect(dup.body.error.details[0].code).toBe('PO_DUPLICATE_PRODUCT');
  });

  it('rejects a nonexistent vendor (404) without writing anything', async () => {
    const product = await createProduct();
    const res = await api()
      .post('/api/purchase-orders')
      .send({ vendorId: 9999, items: [{ productId: product.id, quantity: 1, unitPrice: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VENDOR_NOT_FOUND');
    expect(await countRows('purchase_orders')).toBe(0);
  });

  it('rejects nonexistent products (404) and lists every missing id', async () => {
    const vendor = await createVendor();
    const product = await createProduct();
    const res = await api()
      .post('/api/purchase-orders')
      .send({
        vendorId: vendor.id,
        items: [
          { productId: product.id, quantity: 1, unitPrice: 1 },
          { productId: 777, quantity: 1, unitPrice: 1 },
          { productId: 888, quantity: 1, unitPrice: 1 },
        ],
      });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PRODUCTS_NOT_FOUND');
    expect(res.body.error.details.productIds).toEqual([777, 888]);
    expect(await countRows('purchase_orders')).toBe(0);
    expect(await countRows('purchase_order_items')).toBe(0);
  });
});
