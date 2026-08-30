import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ERROR_STATUS, type ErrorCode, type ErrorResponse } from '@secrets/shared';

/** Thrown anywhere below the route layer; the error handler turns it into the JSON envelope. */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new ApiError('not_found', what);
export const forbidden = (why: string) => new ApiError('forbidden', why);
export const conflict = (why: string) => new ApiError('conflict', why);
export const validation = (why: string, details?: unknown) =>
  new ApiError('validation_error', why, details);

/**
 * Run `fn`; if SQLite raises a UNIQUE violation, rethrow as 409 with a human message.
 * Used instead of check-then-insert so the uniqueness rule has exactly one owner: the schema.
 */
export function uniqueOr409<T>(message: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (isSqliteError(err) && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw conflict(message);
    }
    throw err;
  }
}

function isSqliteError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && typeof (err as { code?: unknown }).code === 'string';
}

/** Unknown route → 404 envelope (registered last). */
export const notFoundHandler: RequestHandler = (_req, res) => {
  send(res, new ApiError('not_found', 'No such route'));
};

/** Express 5 forwards thrown/rejected errors here. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    send(res, err);
    return;
  }
  // body-parser: malformed JSON
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    send(res, new ApiError('validation_error', 'Malformed JSON body'));
    return;
  }
  console.error(err);
  send(res, new ApiError('internal', 'Internal server error'));
};

function send(res: Parameters<RequestHandler>[1], err: ApiError): void {
  const body: ErrorResponse = {
    error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) },
  };
  res.status(ERROR_STATUS[err.code]).json(body);
}
