import type { Request } from 'express';
import type { ZodType } from 'zod';
import { validation } from './errors.js';

/** Parse a request body with a shared zod schema; 400 with zod issues on failure. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validation('Invalid request body', result.error.issues);
  }
  return result.data;
}

/** `:id` route params must be positive integers; anything else is a 404 (nothing has that id). */
export function idParam(req: Request, name = 'id'): number {
  const raw = req.params[name];
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw validation(`Route parameter "${name}" must be a positive integer`);
  }
  return id;
}
