import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const Id = z.number().int().positive();
/** ISO-8601 UTC timestamp, e.g. "2026-08-30T21:04:00.000Z". */
const Timestamp = z.string();

export const PrincipalTypeSchema = z.enum(['user', 'team', 'org']);
export type PrincipalType = z.infer<typeof PrincipalTypeSchema>;

/**
 * Who a grant applies to. For `org`, `id` must equal the secret's orgId (the server validates;
 * the CLI should send the caller's own orgId from GET /me).
 */
export const PrincipalSchema = z.object({
  type: PrincipalTypeSchema,
  id: Id,
});
export type Principal = z.infer<typeof PrincipalSchema>;

// ---------------------------------------------------------------------------
// Entities (as returned by the API)
// ---------------------------------------------------------------------------

export const OrgSchema = z.object({
  id: Id,
  name: z.string(),
});
export type Org = z.infer<typeof OrgSchema>;

export const TeamSchema = z.object({
  id: Id,
  orgId: Id,
  name: z.string(),
  /** Ids of users in this team. */
  memberIds: z.array(Id),
});
export type Team = z.infer<typeof TeamSchema>;

export const UserSchema = z.object({
  id: Id,
  orgId: Id,
  githubLogin: z.string(),
  isAdmin: z.boolean(),
  /** Ids of teams this user belongs to. */
  teamIds: z.array(Id),
  createdAt: Timestamp,
});
export type User = z.infer<typeof UserSchema>;

/** The caller's effective rights on one secret (resolved from ownership + grants). */
export const SecretAccessSchema = z.object({
  canRead: z.boolean(),
  canWrite: z.boolean(),
  isOwner: z.boolean(),
});
export type SecretAccess = z.infer<typeof SecretAccessSchema>;

/** One sharing rule. Used identically in requests and responses. */
export const GrantSchema = z.object({
  principal: PrincipalSchema,
  canRead: z.boolean(),
  canWrite: z.boolean(),
});
export type Grant = z.infer<typeof GrantSchema>;

export const SecretSummarySchema = z.object({
  id: Id,
  orgId: Id,
  ownerId: Id,
  /** Login of the owner, denormalized for display. */
  ownerLogin: z.string(),
  key: z.string(),
  /** null when the caller has write-only access (canRead=false). */
  value: z.string().nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  access: SecretAccessSchema,
});
export type SecretSummary = z.infer<typeof SecretSummarySchema>;

export const SecretDetailSchema = SecretSummarySchema.extend({
  /** Full grant list. null unless the caller is the owner. */
  grants: z.array(GrantSchema).nullable(),
});
export type SecretDetail = z.infer<typeof SecretDetailSchema>;

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

/** Secret keys: 1–200 chars, no whitespace. Unique per org, immutable after create. */
export const SecretKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\S+$/, 'key must not contain whitespace');
export const SecretValueSchema = z.string().max(10_000);

/** POST /secrets */
export const CreateSecretRequestSchema = z.object({
  key: SecretKeySchema,
  value: SecretValueSchema,
  /** May be empty. Duplicate principals are a validation error. */
  grants: z.array(GrantSchema),
});
export type CreateSecretRequest = z.infer<typeof CreateSecretRequestSchema>;

/** PUT /secrets/:id  (any writer) */
export const UpdateSecretRequestSchema = z.object({
  value: SecretValueSchema,
});
export type UpdateSecretRequest = z.infer<typeof UpdateSecretRequestSchema>;

/** PUT /secrets/:id/grants  (owner only) — FULL REPLACE of the grant list. */
export const SetGrantsRequestSchema = z.object({
  grants: z.array(GrantSchema),
});
export type SetGrantsRequest = z.infer<typeof SetGrantsRequestSchema>;

/** GitHub login rules: alphanumeric or hyphen, no leading/trailing hyphen, max 39. */
export const GithubLoginSchema = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, 'not a valid GitHub login');

/** POST /admin/users */
export const CreateUserRequestSchema = z.object({
  githubLogin: GithubLoginSchema,
  /** Defaults to false on the server. */
  isAdmin: z.boolean().optional(),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

/** PUT /admin/users/:id/teams — FULL REPLACE of the user's team memberships. */
export const SetUserTeamsRequestSchema = z.object({
  teamIds: z.array(Id),
});
export type SetUserTeamsRequest = z.infer<typeof SetUserTeamsRequestSchema>;

/** POST /admin/teams */
export const CreateTeamRequestSchema = z.object({
  name: z.string().min(1).max(100),
});
export type CreateTeamRequest = z.infer<typeof CreateTeamRequestSchema>;

/** POST /auth/cli/exchange */
export const ExchangeRequestSchema = z.object({
  code: z.string().min(1),
});
export type ExchangeRequest = z.infer<typeof ExchangeRequestSchema>;

// ---------------------------------------------------------------------------
// Query strings
// ---------------------------------------------------------------------------

/** GET /auth/github/start?state=<cli-generated>&port=<cli loopback port> */
export const AuthStartQuerySchema = z.object({
  state: z.string().min(16).max(128),
  port: z.coerce.number().int().min(1024).max(65535),
});
export type AuthStartQuery = z.infer<typeof AuthStartQuerySchema>;

/**
 * What lands on the CLI loopback: GET http://127.0.0.1:<port>/callback?...
 * Exactly one of `code` / `error` is present. `state` is always present and MUST equal the
 * value the CLI generated, else the CLI must ignore the request.
 */
export const LoginCallbackQuerySchema = z.object({
  state: z.string(),
  code: z.string().optional(),
  error: z.enum(['unknown_user', 'invalid_state', 'oauth_failed']).optional(),
});
export type LoginCallbackQuery = z.infer<typeof LoginCallbackQuerySchema>;

// ---------------------------------------------------------------------------
// Response bodies
// ---------------------------------------------------------------------------

export const OkResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponseSchema>;

/** GET /me */
export const MeResponseSchema = z.object({
  user: UserSchema,
  org: OrgSchema,
  /** Teams the caller belongs to (full objects, for convenience). */
  teams: z.array(TeamSchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** POST /auth/cli/exchange */
export const ExchangeResponseSchema = MeResponseSchema.extend({
  /** Opaque bearer token. Store it; it is never shown again. */
  token: z.string(),
});
export type ExchangeResponse = z.infer<typeof ExchangeResponseSchema>;

/** GET /users — every user in the caller's org (including the caller). */
export const UsersResponseSchema = z.object({ users: z.array(UserSchema) });
export type UsersResponse = z.infer<typeof UsersResponseSchema>;

/** GET /teams — every team in the caller's org. */
export const TeamsResponseSchema = z.object({ teams: z.array(TeamSchema) });
export type TeamsResponse = z.infer<typeof TeamsResponseSchema>;

/** POST /admin/users, POST /admin/users/:id/promote, PUT /admin/users/:id/teams */
export const UserResponseSchema = z.object({ user: UserSchema });
export type UserResponse = z.infer<typeof UserResponseSchema>;

/** POST /admin/teams */
export const TeamResponseSchema = z.object({ team: TeamSchema });
export type TeamResponse = z.infer<typeof TeamResponseSchema>;

/** DELETE /admin/users/:id */
export const DeleteUserResponseSchema = z.object({
  ok: z.literal(true),
  /** Number of secrets whose ownership moved to the deleting admin. */
  transferredSecrets: z.number().int(),
});
export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

/** GET /secrets — sorted by key. */
export const SecretsListResponseSchema = z.object({
  secrets: z.array(SecretSummarySchema),
});
export type SecretsListResponse = z.infer<typeof SecretsListResponseSchema>;

/** GET /secrets/:id, POST /secrets, PUT /secrets/:id, PUT /secrets/:id/grants */
export const SecretResponseSchema = z.object({ secret: SecretDetailSchema });
export type SecretResponse = z.infer<typeof SecretResponseSchema>;
