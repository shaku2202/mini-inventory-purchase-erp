import type { Request, Response } from 'express';
import * as purchaseOrderBusiness from '../business/purchaseOrder.business.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { idParamSchema } from '../validators/common.validator.js';
import { createPurchaseOrderSchema, listPurchaseOrdersQuerySchema } from '../validators/purchaseOrder.validator.js';

export async function createPurchaseOrder(req: Request, res: Response) {
  const input = validateInput(createPurchaseOrderSchema, req.body);
  sendCreated(res, await purchaseOrderBusiness.createPurchaseOrder(input));
}

export async function listPurchaseOrders(req: Request, res: Response) {
  const query = validateInput(listPurchaseOrdersQuerySchema, req.query);
  const { rows, total } = await purchaseOrderBusiness.listPurchaseOrders(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}

export async function getPurchaseOrder(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  sendSuccess(res, await purchaseOrderBusiness.getPurchaseOrder(id));
}
