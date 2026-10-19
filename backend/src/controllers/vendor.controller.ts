import type { Request, Response } from 'express';
import * as vendorBusiness from '../business/vendor.business.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/response.js';
import { validateInput } from '../utils/validateInput.js';
import { idParamSchema, listQuerySchema } from '../validators/common.validator.js';
import { createVendorSchema } from '../validators/vendor.validator.js';

export async function createVendor(req: Request, res: Response) {
  const input = validateInput(createVendorSchema, req.body);
  const vendor = await vendorBusiness.createVendor(input);
  sendCreated(res, vendor);
}

export async function listVendors(req: Request, res: Response) {
  const query = validateInput(listQuerySchema, req.query);
  const { rows, total } = await vendorBusiness.listVendors(query);
  sendSuccess(res, rows, 200, buildPaginationMeta(query.page, query.limit, total));
}

export async function getVendor(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  sendSuccess(res, await vendorBusiness.getVendor(id));
}

export async function getVendorBalance(req: Request, res: Response) {
  const { id } = validateInput(idParamSchema, req.params);
  sendSuccess(res, await vendorBusiness.getVendorBalance(id));
}

export async function listVendorBalances(_req: Request, res: Response) {
  sendSuccess(res, await vendorBusiness.listVendorBalances());
}
