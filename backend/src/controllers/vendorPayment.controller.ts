import type { Request, Response } from 'express';
import * as vendorPaymentBusiness from '../business/vendorPayment.business.js';
import { getIdempotencyKey } from '../utils/idempotency.js';
import { buildPaginationMeta, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { createVendorPaymentSchema, listVendorPaymentsQuerySchema } from '../validators/vendorPayment.validator.js';

export async function createVendorPayment(req: Request, res: Response) {
  const idempotencyKey = getIdempotencyKey(req);
  const input = validateInput(createVendorPaymentSchema, req.body);
  const { replayed, data } = await vendorPaymentBusiness.recordPayment(input, idempotencyKey);
  res.setHeader('Idempotent-Replayed', String(replayed));
  sendSuccess(res, data, replayed ? 200 : 201, { replayed });
}

export async function listVendorPayments(req: Request, res: Response) {
  const query = validateInput(listVendorPaymentsQuerySchema, req.query);
  const { rows, total } = await vendorPaymentBusiness.listPayments(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}
