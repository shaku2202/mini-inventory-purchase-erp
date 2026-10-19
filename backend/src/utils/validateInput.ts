import type { z } from 'zod';
import { createError, formatMessage, isErrorCode, type ErrorCode, type FieldError, type MessageParams } from './appError.js';

/** `['items', 0, 'quantity']` -> `items[0].quantity` */
function toFieldName(path: ReadonlyArray<PropertyKey>): string {
  if (path.length === 0) return 'body';
  return path
    .map((segment, i) => (typeof segment === 'number' ? `[${segment}]` : `${i === 0 ? '' : '.'}${String(segment)}`))
    .join('');
}

function valueAt(input: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  return path.reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') return undefined;
    return (current as Record<PropertyKey, unknown>)[key];
  }, input);
}

/**
 * Translates one Zod issue into an error code from errorMessages.json plus the
 * parameters its message template needs.
 */
function resolveIssue(issue: z.core.$ZodIssue, input: unknown): { code: ErrorCode; params: MessageParams } {
  // Custom issues (refine / superRefine / { error: 'CODE' }) carry the code as message.
  if (isErrorCode(issue.message)) {
    const params = (issue as { params?: MessageParams }).params ?? {};
    // Required-but-missing takes priority over a type-specific message.
    if (issue.code === 'invalid_type' && valueAt(input, issue.path) === undefined) return { code: 'FIELD_REQUIRED', params };
    return { code: issue.message, params };
  }

  switch (issue.code) {
    case 'invalid_type':
      return valueAt(input, issue.path) === undefined || valueAt(input, issue.path) === null
        ? { code: 'FIELD_REQUIRED', params: {} }
        : { code: 'FIELD_INVALID_TYPE', params: { expected: issue.expected } };
    case 'too_small':
      if (issue.origin === 'string') {
        // An empty (or whitespace-only) value means the field was not filled in at all.
        const raw = valueAt(input, issue.path);
        if (typeof raw === 'string' && raw.trim() === '') return { code: 'FIELD_REQUIRED', params: {} };
        return { code: 'FIELD_TOO_SHORT', params: { min: Number(issue.minimum) } };
      }
      if (issue.origin === 'array') return { code: 'FIELD_ARRAY_MIN', params: { min: Number(issue.minimum) } };
      return { code: 'FIELD_MUST_BE_POSITIVE', params: {} };
    case 'too_big':
      if (issue.origin === 'string') return { code: 'FIELD_TOO_LONG', params: { max: Number(issue.maximum) } };
      if (issue.origin === 'array') return { code: 'FIELD_ARRAY_MAX', params: { max: Number(issue.maximum) } };
      return { code: 'FIELD_TOO_LARGE', params: { max: Number(issue.maximum) } };
    case 'invalid_format':
      if (issue.format === 'email') return { code: 'FIELD_INVALID_EMAIL', params: {} };
      if (issue.format === 'date') return { code: 'FIELD_INVALID_DATE', params: {} };
      return { code: 'FIELD_INVALID_FORMAT', params: {} };
    case 'invalid_value':
      return { code: 'FIELD_INVALID_ENUM', params: { options: issue.values.map(String).join(', ') } };
    case 'unrecognized_keys':
      return { code: 'FIELD_UNKNOWN', params: { keys: issue.keys.join(', ') } };
    case 'invalid_union':
      return { code: 'FIELD_INVALID_TYPE', params: { expected: 'value' } };
    default:
      return { code: 'FIELD_INVALID_FORMAT', params: {} };
  }
}

/**
 * Validates `input` against `schema` and returns the parsed (typed, trimmed,
 * defaulted) value. On failure throws VALIDATION_FAILED whose `details` lists
 * every invalid field with its own code and message.
 */
export function validateInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const details: FieldError[] = result.error.issues.map((issue) => {
    const field = toFieldName(issue.path);
    const { code, params } = resolveIssue(issue, input);
    return { field, code, message: formatMessage(code, { field, ...params }) };
  });

  throw createError('VALIDATION_FAILED', {}, details);
}
