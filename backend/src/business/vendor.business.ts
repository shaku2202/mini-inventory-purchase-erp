import { pool } from '../db/pool.js';
import * as vendorService from '../services/vendor.service.js';
import type { Paginated, Vendor, VendorBalance } from '../types/domain.types.js';
import { createError } from '../utils/appError.js';
import type { ListQuery } from '../validators/common.validator.js';
import type { CreateVendorInput } from '../validators/vendor.validator.js';

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  // Friendly pre-check; the UNIQUE constraint still guards against a race
  // (mapped to the same VENDOR_CODE_EXISTS error in utils/dbError.ts).
  if (await vendorService.existsVendorWithCode(pool, input.code)) {
    throw createError('VENDOR_CODE_EXISTS', { code: input.code });
  }
  return vendorService.insertVendor(pool, input);
}

export async function getVendor(vendorId: number): Promise<Vendor> {
  const vendor = await vendorService.findVendorById(pool, vendorId);
  if (!vendor) throw createError('VENDOR_NOT_FOUND', { vendorId });
  return vendor;
}

export function listVendors(query: ListQuery): Promise<Paginated<Vendor>> {
  return vendorService.listVendors(pool, query);
}

export async function getVendorBalance(vendorId: number): Promise<VendorBalance> {
  const balance = await vendorService.findVendorBalance(pool, vendorId);
  if (!balance) throw createError('VENDOR_NOT_FOUND', { vendorId });
  return balance;
}

export function listVendorBalances(): Promise<VendorBalance[]> {
  return vendorService.listVendorBalances(pool);
}
