import type { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Uniform success envelope: `{ success: true, data, meta? }` */
export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta?: PaginationMeta | Record<string, unknown>) {
  return res.status(statusCode).json(meta ? { success: true, data, meta } : { success: true, data });
}

export function sendCreated<T>(res: Response, data: T) {
  return sendSuccess(res, data, 201);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
