import { LOCK_NAMESPACE } from '../constants/enums.js';
import { pool } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import { lockIdempotencyKey } from '../services/lock.service.js';
import * as purchaseOrderService from '../services/purchaseOrder.service.js';
import * as vendorPaymentService from '../services/vendorPayment.service.js';
import * as vendorService from '../services/vendor.service.js';
import type { IdempotentResult, Paginated, VendorBalance, VendorPayment } from '../types/domain.types.js';
import { createError } from '../utils/appError.js';
import { compareDecimal, MONEY_SCALE, normalizeDecimal } from '../utils/decimal.js';
import { hashPayload } from '../utils/hash.js';
import type { CreateVendorPaymentInput, ListVendorPaymentsQuery } from '../validators/vendorPayment.validator.js';

export interface PaymentResult {
  payment: VendorPayment;
  vendorBalance: VendorBalance;
}

/**
 * Records a payment to a vendor (optionally allocated to one PO).
 *
 * Payable policy: the vendor is owed the value of goods RECEIVED (GRN value),
 * so outstanding = received value - payments. Advance payments and
 * overpayments are NOT supported: amount must be <= outstanding.
 *
 * The vendor row is locked FOR UPDATE, so two simultaneous payments cannot
 * both pass the outstanding-balance check and overpay the vendor.
 */
export async function recordPayment(
  input: CreateVendorPaymentInput,
  idempotencyKey: string,
): Promise<IdempotentResult<PaymentResult>> {
  const requestHash = hashPayload(input);

  return withTransaction(async (tx) => {
    await lockIdempotencyKey(tx, LOCK_NAMESPACE.VENDOR_PAYMENT_IDEMPOTENCY, idempotencyKey);
    const previous = await vendorPaymentService.findPaymentByIdempotencyKey(tx, idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash) throw createError('IDEMPOTENCY_KEY_REUSED', { key: idempotencyKey });
      const payment = await vendorPaymentService.findPaymentById(tx, previous.id);
      const vendorBalance = await vendorService.findVendorBalance(tx, input.vendorId);
      return { replayed: true, data: { payment: payment!, vendorBalance: vendorBalance! } };
    }

    const vendor = await vendorService.findVendorById(tx, input.vendorId, { forUpdate: true });
    if (!vendor) throw createError('VENDOR_NOT_FOUND', { vendorId: input.vendorId });

    const amount = normalizeDecimal(input.amount, MONEY_SCALE);
    const balance = await vendorService.findVendorBalance(tx, vendor.id);
    const outstanding = balance!.outstandingBalance;

    if (compareDecimal(outstanding, '0', MONEY_SCALE) <= 0) {
      throw createError('PAYMENT_NO_OUTSTANDING', { vendorCode: vendor.code });
    }
    if (compareDecimal(amount, outstanding, MONEY_SCALE) > 0) {
      throw createError('PAYMENT_EXCEEDS_OUTSTANDING', { amount, outstanding, vendorCode: vendor.code }, { outstanding });
    }

    if (input.purchaseOrderId !== null) {
      const purchaseOrder = await purchaseOrderService.findPurchaseOrderById(tx, input.purchaseOrderId);
      if (!purchaseOrder) throw createError('PURCHASE_ORDER_NOT_FOUND', { purchaseOrderId: input.purchaseOrderId });
      if (purchaseOrder.vendorId !== vendor.id) {
        throw createError('PO_VENDOR_MISMATCH', { poNumber: purchaseOrder.poNumber, vendorId: vendor.id });
      }
      const { outstandingAmount } = await purchaseOrderService.getPurchaseOrderFinancials(tx, purchaseOrder.id);
      if (compareDecimal(amount, outstandingAmount, MONEY_SCALE) > 0) {
        throw createError(
          'PAYMENT_EXCEEDS_PO_OUTSTANDING',
          { amount, outstanding: outstandingAmount, poNumber: purchaseOrder.poNumber },
          { outstanding: outstandingAmount },
        );
      }
    }

    const { id } = await vendorPaymentService.insertVendorPayment(tx, { ...input, idempotencyKey, requestHash });
    const [payment, vendorBalance] = await Promise.all([
      vendorPaymentService.findPaymentById(tx, id),
      vendorService.findVendorBalance(tx, vendor.id),
    ]);
    return { replayed: false, data: { payment: payment!, vendorBalance: vendorBalance! } };
  });
}

export function listPayments(query: ListVendorPaymentsQuery): Promise<Paginated<VendorPayment>> {
  return vendorPaymentService.listPayments(pool, query);
}
