import type { Request, Response } from 'express';
import { z } from 'zod';
import * as productBusiness from '../business/product.business.js';
import { buildPaginationMeta, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { idParamSchema, listQuerySchema } from '../validators/common.validator.js';

const inventoryQuerySchema = listQuerySchema.extend({
  lowStockOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export async function listInventory(req: Request, res: Response) {
  const query = validateInput(inventoryQuerySchema, req.query);
  const { rows, total } = await productBusiness.listInventory(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}

export async function getStockMovements(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  const page = validateInput(listQuerySchema.pick({ page: true, limit: true }), req.query);
  const { product, movements } = await productBusiness.getStockMovements(id, page);
  sendSuccess(res, { product, movements: movements.rows }, 200, buildPaginationMeta(page.page, page.limit, movements.total));
}
