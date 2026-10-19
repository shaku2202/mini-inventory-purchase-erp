import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDatabase(): Promise<void> {
  await pool.query(`TRUNCATE vendor_payments, stock_movements, goods_receipt_items, goods_receipts,
    purchase_order_items, purchase_orders, products, vendors RESTART IDENTITY CASCADE`);
  await pool.query('ALTER SEQUENCE po_number_seq RESTART; ALTER SEQUENCE grn_number_seq RESTART; ALTER SEQUENCE payment_number_seq RESTART;');
}

export const newKey = () => `test-${randomUUID()}`;

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

export async function createVendor(overrides: Record<string, unknown> = {}) {
  const res = await api().post('/api/vendors').send({ code: unique('V'), name: 'Test Glass Vendor', ...overrides });
  if (res.status !== 201) throw new Error(`createVendor failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { id: number; code: string };
}

export async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await api().post('/api/products').send({ sku: unique('SKU'), name: 'Clear Float 5mm', unit: 'SQM', ...overrides });
  if (res.status !== 201) throw new Error(`createProduct failed: ${JSON.stringify(res.body)}`);
  return res.body.data as { id: number; sku: string; currentStock: string };
}

export interface PoLine {
  productId: number;
  quantity: number | string;
  unitPrice: number | string;
}

export async function createPurchaseOrder(vendorId: number, items: PoLine[]) {
  const res = await api().post('/api/purchase-orders').send({ vendorId, items });
  if (res.status !== 201) throw new Error(`createPurchaseOrder failed: ${JSON.stringify(res.body)}`);
  return res.body.data as {
    id: number;
    poNumber: string;
    totalAmount: string;
    status: string;
    items: Array<{ id: number; productId: number; quantity: string; lineTotal: string }>;
  };
}

export function receive(purchaseOrderId: number, items: Array<{ purchaseOrderItemId: number; quantity: number | string }>, key = newKey()) {
  return api().post('/api/goods-receipts').set('Idempotency-Key', key).send({ purchaseOrderId, items });
}

export function pay(body: Record<string, unknown>, key = newKey()) {
  return api().post('/api/vendor-payments').set('Idempotency-Key', key).send({ paymentMethod: 'BANK_TRANSFER', ...body });
}

export async function stockOf(productId: number): Promise<string> {
  const { rows } = await pool.query<{ current_stock: string }>('SELECT current_stock FROM products WHERE id = $1', [productId]);
  return rows[0]!.current_stock;
}

export async function countRows(table: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0]!.n;
}

/** A vendor with one PO line received, i.e. an outstanding payable of `quantity * unitPrice`. */
export async function vendorWithPayable(quantity = 10, unitPrice = 100) {
  const vendor = await createVendor();
  const product = await createProduct();
  const po = await createPurchaseOrder(vendor.id, [{ productId: product.id, quantity, unitPrice }]);
  const res = await receive(po.id, [{ purchaseOrderItemId: po.items[0]!.id, quantity }]);
  if (res.status !== 201) throw new Error(`receive failed: ${JSON.stringify(res.body)}`);
  return { vendor, product, po };
}
