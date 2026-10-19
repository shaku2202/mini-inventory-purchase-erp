import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closePool } from '../src/db/pool.js';
import {
  api,
  countRows,
  createProduct,
  createPurchaseOrder,
  createVendor,
  newKey,
  pay,
  receive,
  resetDatabase,
  vendorWithPayable,
} from './helpers.js';

beforeEach(resetDatabase);
afterAll(closePool);

describe('Vendor payable policy', () => {
  it('only goods RECEIVED create a payable, not goods merely ordered', async () => {
    const vendor = await createVendor();
    const product = await createProduct();
    const po = await createPurchaseOrder(vendor.id, [{ productId: product.id, quantity: 10, unitPrice: 100 }]);

    let balance = (await api().get(`/api/vendors/${vendor.id}/balance`)).body.data;
    expect(balance).toMatchObject({ totalOrderedValue: '1000.00', totalReceivedValue: '0.00', outstandingBalance: '0.00' });

    await receive(po.id, [{ purchaseOrderItemId: po.items[0]!.id, quantity: 4 }]);
    balance = (await api().get(`/api/vendors/${vendor.id}/balance`)).body.data;
    expect(balance).toMatchObject({ totalReceivedValue: '400.00', outstandingBalance: '400.00' });
  });
});

describe('Vendor payments', () => {
  it('records a payment and reduces the outstanding balance', async () => {
    const { vendor } = await vendorWithPayable(10, 100); // owes 1000

    const res = await pay({ vendorId: vendor.id, amount: '250.50', paymentMethod: 'UPI', referenceNo: 'UTR123' });

    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ paymentNumber: 'PAY-000001', amount: '250.50' });
    expect(res.body.data.vendorBalance).toMatchObject({ totalPaid: '250.50', outstandingBalance: '749.50' });
  });

  it('allows paying exactly the outstanding balance, then rejects any further payment', async () => {
    const { vendor } = await vendorWithPayable(10, 100);
    expect((await pay({ vendorId: vendor.id, amount: 1000 })).status).toBe(201);

    const extra = await pay({ vendorId: vendor.id, amount: 1 });
    expect(extra.status).toBe(422);
    expect(extra.body.error.code).toBe('PAYMENT_NO_OUTSTANDING');
  });

  it('rejects a payment exceeding the outstanding balance (422) and changes nothing', async () => {
    const { vendor } = await vendorWithPayable(10, 100);
    const res = await pay({ vendorId: vendor.id, amount: '1000.01' });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'PAYMENT_EXCEEDS_OUTSTANDING', details: { outstanding: '1000.00' } });
    expect(await countRows('vendor_payments')).toBe(0);
  });

  it('rejects zero, negative and non-numeric amounts and >2 decimals', async () => {
    const { vendor } = await vendorWithPayable();
    for (const amount of [0, -10, 'ten', '10.999']) {
      const res = await pay({ vendorId: vendor.id, amount });
      expect(res.status, `amount=${amount}`).toBe(400);
    }
  });

  it('rejects a nonexistent vendor (404)', async () => {
    const res = await pay({ vendorId: 123456, amount: 10 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VENDOR_NOT_FOUND');
  });

  it('validates PO allocation: PO must belong to the vendor and amount <= PO outstanding', async () => {
    const { vendor, po } = await vendorWithPayable(10, 100);
    const other = await vendorWithPayable(1, 50);

    const mismatch = await pay({ vendorId: vendor.id, purchaseOrderId: other.po.id, amount: 10 });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('PO_VENDOR_MISMATCH');

    // A second received PO keeps the vendor-level outstanding above the PO-level one.
    const po2 = await createPurchaseOrder(vendor.id, [{ productId: (await createProduct()).id, quantity: 5, unitPrice: 100 }]);
    await receive(po2.id, [{ purchaseOrderItemId: po2.items[0]!.id, quantity: 5 }]);

    await pay({ vendorId: vendor.id, purchaseOrderId: po.id, amount: 900 }); // PO left: 100, vendor left: 600
    const tooMuch = await pay({ vendorId: vendor.id, purchaseOrderId: po.id, amount: 101 });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe('PAYMENT_EXCEEDS_PO_OUTSTANDING');
  });

  it('replays a retried payment with the same Idempotency-Key (no double payment)', async () => {
    const { vendor } = await vendorWithPayable(10, 100);
    const key = newKey();

    const first = await pay({ vendorId: vendor.id, amount: 300 }, key);
    const retry = await pay({ vendorId: vendor.id, amount: 300 }, key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.payment.id).toBe(first.body.data.payment.id);
    expect(retry.body.data.vendorBalance.outstandingBalance).toBe('700.00');
    expect(await countRows('vendor_payments')).toBe(1);
  });

  it('concurrent payments can never overpay the vendor', async () => {
    const { vendor } = await vendorWithPayable(10, 100); // owes 1000

    const results = await Promise.all(Array.from({ length: 5 }, () => pay({ vendorId: vendor.id, amount: 400 })));

    expect(results.filter((r) => r.status === 201)).toHaveLength(2); // 800 paid, 200 left
    const balance = (await api().get(`/api/vendors/${vendor.id}/balance`)).body.data;
    expect(balance.outstandingBalance).toBe('200.00');
  });
});

describe('Vendor balance report (no fan-out)', () => {
  it('totals stay correct with several POs, receipts and payments per vendor', async () => {
    const vendor = await createVendor();
    const product = await createProduct();
    const po1 = await createPurchaseOrder(vendor.id, [{ productId: product.id, quantity: 10, unitPrice: 100 }]); // 1000
    const po2 = await createPurchaseOrder(vendor.id, [{ productId: product.id, quantity: 5, unitPrice: 200 }]); // 1000
    await receive(po1.id, [{ purchaseOrderItemId: po1.items[0]!.id, quantity: 10 }]); // +1000
    await receive(po2.id, [{ purchaseOrderItemId: po2.items[0]!.id, quantity: 2 }]); // +400
    await receive(po2.id, [{ purchaseOrderItemId: po2.items[0]!.id, quantity: 3 }]); // +600
    await pay({ vendorId: vendor.id, amount: 500 });
    await pay({ vendorId: vendor.id, amount: 300 });
    await pay({ vendorId: vendor.id, amount: 200 });

    const res = await api().get('/api/vendors/balances');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      vendorId: vendor.id,
      purchaseOrderCount: 2,
      totalOrderedValue: '2000.00',
      goodsReceiptCount: 3,
      totalReceivedValue: '2000.00',
      paymentCount: 3,
      totalPaid: '1000.00',
      outstandingBalance: '1000.00',
    });
  });
});
