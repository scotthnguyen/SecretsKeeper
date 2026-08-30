import { z } from 'zod';

/**
 * Error codes. The HTTP status is fixed per code (see table) so clients can branch on `code`
 * and ignore the status.
 *
 *   validation_error  400  request body/query failed zod validation; `details` = zod issues
 *   unauthenticated   401  missing/invalid/expired session (or unknown X-Dev-User in dev mode)
 *   forbidden         403  authenticated but not allowed (e.g. non-admin calling /admin/*, writer editing grants)
 *   not_found         404  no such row — ALSO returned when the caller cannot see the secret,
 *                          so that existence of other people's secrets is never leaked
 *   conflict          409  unique violation (duplicate secret key in org, duplicate team name,
 *                          duplicate github login)
 *   invalid_code      400  POST /auth/cli/exchange with an unknown/expired/used code
 *   internal          500  unexpected server error
 *
 * Login-callback-only codes (arrive on the CLI loopback as `?error=<code>`, never as JSON):
 *
 *   unknown_user      GitHub login succeeded but no user row exists for that GitHub account
 *   invalid_state     state param unknown or expired
 *   oauth_failed      GitHub denied / code exchange failed
 */
export const ErrorCodeSchema = z.enum([
  'validation_error',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'invalid_code',
  'internal',
  // login-callback-only
  'unknown_user',
  'invalid_state',
  'oauth_failed',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function isErrorResponse(body: unknown): body is ErrorResponse {
  return ErrorResponseSchema.safeParse(body).success;
}

/** HTTP status the server uses for each JSON error code. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_code: 400,
  internal: 500,
  unknown_user: 403,
  invalid_state: 400,
  oauth_failed: 502,
};
