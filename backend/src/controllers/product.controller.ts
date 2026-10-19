import type { Request, Response } from 'express';
import * as productBusiness from '../business/product.business.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { idParamSchema, listQuerySchema } from '../validators/common.validator.js';
import { createProductSchema } from '../validators/product.validator.js';

export async function createProduct(req: Request, res: Response) {
  const input = validateInput(createProductSchema, req.body);
  sendCreated(res, await productBusiness.createProduct(input));
}

export async function listProducts(req: Request, res: Response) {
  const query = validateInput(listQuerySchema, req.query);
  const { rows, total } = await productBusiness.listProducts(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}

export async function getProduct(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  sendSuccess(res, await productBusiness.getProduct(id));
}
