import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, createError } from '../utils/appError.js';
import { mapDatabaseError } from '../utils/dbError.js';
import { logger } from '../utils/logger.js';

/** Unknown route -> 404 in the standard error envelope. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(createError('ROUTE_NOT_FOUND', { method: req.method, path: req.path }));
};

/**
 * Central error handler. Every error leaves the API in the same shape:
 *   { success: false, error: { code, message, details?, requestId } }
 * Unexpected errors are logged with full detail but only a generic message is
 * returned, so stack traces / SQL never reach the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err);

  if (appError.httpStatus >= 500) {
    logger.error({ err, requestId: req.id, path: req.path }, 'Unhandled error');
  } else {
    logger.debug({ code: appError.code, requestId: req.id }, appError.message);
  }

  res.status(appError.httpStatus).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      requestId: req.id,
    },
  });
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  // body-parser errors
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') return createError('INVALID_JSON');
  if (type === 'entity.too.large') return createError('PAYLOAD_TOO_LARGE');

  return mapDatabaseError(err) ?? createError('INTERNAL_SERVER_ERROR');
}
