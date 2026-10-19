import type { Request, Response } from 'express';
import * as goodsReceiptBusiness from '../business/goodsReceipt.business.js';
import { getIdempotencyKey } from '../utils/idempotency.js';
import { buildPaginationMeta, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createGoodsReceiptSchema, listGoodsReceiptsQuerySchema } from '../validators/goodsReceipt.validator.js';

/**
 * 201 Created            -> receipt recorded, stock increased.
 * 200 OK + replay header -> same Idempotency-Key retried; original receipt returned, nothing changed.
 */
export async function createGoodsReceipt(req: Request, res: Response) {
  const idempotencyKey = getIdempotencyKey(req);
  const input = validateInput(createGoodsReceiptSchema, req.body);
  const { replayed, data } = await goodsReceiptBusiness.receiveGoods(input, idempotencyKey);
  res.setHeader('Idempotent-Replayed', String(replayed));
  sendSuccess(res, data, replayed ? 200 : 201, { replayed });
}

export async function listGoodsReceipts(req: Request, res: Response) {
  const query = validateInput(listGoodsReceiptsQuerySchema, req.query);
  const { rows, total } = await goodsReceiptBusiness.listGoodsReceipts(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}

export async function getGoodsReceipt(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  sendSuccess(res, await goodsReceiptBusiness.getGoodsReceipt(id));
}
