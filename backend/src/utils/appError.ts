import errorMessages from '../constants/errorMessages.json' with { type: 'json' };

export type ErrorCode = keyof typeof errorMessages;
export type MessageParams = Record<string, string | number | boolean | null | undefined>;

export interface FieldError {
  field: string;
  code: ErrorCode;
  message: string;
}

/**
 * Single error type used across all layers. It carries a stable machine
 * readable `code` (from errorMessages.json), the HTTP status that belongs to
 * that code and a human readable, already interpolated message.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, httpStatus: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/** Replaces `{placeholder}` tokens in the message template with values from `params`. */
export function formatMessage(code: ErrorCode, params: MessageParams = {}): string {
  const template = (errorMessages[code] ?? errorMessages.INTERNAL_SERVER_ERROR).message;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * The one dynamic error factory used everywhere:
 *   throw createError('VENDOR_NOT_FOUND', { vendorId: 42 });
 * Status code and message text are looked up from errorMessages.json, so the
 * wording can change without touching business code.
 */
export function createError(code: ErrorCode, params: MessageParams = {}, details?: unknown): AppError {
  const entry = errorMessages[code] ?? errorMessages.INTERNAL_SERVER_ERROR;
  return new AppError(code, formatMessage(code, params), entry.httpStatus, details);
}

export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(errorMessages, value);
}
