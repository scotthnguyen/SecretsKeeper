/**
 * Route table. Method, path, auth requirement, request, response, success status.
 *
 * Auth column: "session" = Bearer token (or X-Dev-User in dev mode); "admin" = session + isAdmin;
 * "browser" = no API auth, hit by the browser during login; "none" = public.
 *
 * | Method | Path                        | Auth    | Request                | Response            | OK  |
 * |--------|-----------------------------|---------|------------------------|---------------------|-----|
 * | GET    | /health                     | none    | —                      | { ok: true }        | 200 |
 * | GET    | /auth/github/start          | browser | ?state&port (AuthStartQuery) | 302 → GitHub  | 302 |
 * | GET    | /auth/github/callback       | browser | ?code&state (from GitHub) | 302 → CLI loopback | 302 |
 * | POST   | /auth/cli/exchange          | none    | ExchangeRequest        | ExchangeResponse    | 200 |
 * | POST   | /auth/logout                | session | —                      | OkResponse          | 200 |
 * | GET    | /me                         | session | —                      | MeResponse          | 200 |
 * | GET    | /users                      | session | —                      | UsersResponse       | 200 |
 * | GET    | /teams                      | session | —                      | TeamsResponse       | 200 |
 * | GET    | /secrets                    | session | —                      | SecretsListResponse | 200 |
 * | POST   | /secrets                    | session | CreateSecretRequest    | SecretResponse      | 201 |
 * | GET    | /secrets/:id                | session | —                      | SecretResponse      | 200 |
 * | PUT    | /secrets/:id                | session | UpdateSecretRequest    | SecretResponse      | 200 |
 * | PUT    | /secrets/:id/grants         | session | SetGrantsRequest       | SecretResponse      | 200 |
 * | DELETE | /secrets/:id                | session | —                      | OkResponse          | 200 |
 * | POST   | /admin/users                | admin   | CreateUserRequest      | UserResponse        | 201 |
 * | DELETE | /admin/users/:id            | admin   | —                      | DeleteUserResponse  | 200 |
 * | POST   | /admin/users/:id/promote    | admin   | —                      | UserResponse        | 200 |
 * | PUT    | /admin/users/:id/teams      | admin   | SetUserTeamsRequest    | UserResponse        | 200 |
 * | POST   | /admin/teams                | admin   | CreateTeamRequest      | TeamResponse        | 201 |
 * | DELETE | /admin/teams/:id            | admin   | —                      | OkResponse          | 200 |
 *
 * Permission semantics (server enforces; CLI can use `access` to hide buttons):
 *   GET /secrets            → only secrets where canRead || canWrite || isOwner. value=null if !canRead.
 *   GET /secrets/:id        → 404 if not visible. grants=null unless isOwner.
 *   PUT /secrets/:id        → 403 if visible but !canWrite; 404 if not visible.
 *   PUT /secrets/:id/grants → 403 if visible but !isOwner; 404 if not visible.
 *   DELETE /secrets/:id     → 403 if visible but !isOwner; 404 if not visible.
 *   POST /secrets           → 409 if key exists in org. Grants validated: principals must be in the
 *                             caller's org; org principal id must equal caller's orgId; no duplicates.
 *   /admin/*                → 403 for non-admins. Targets must be in the admin's org, else 404.
 *   DELETE /admin/users/:id → 403 if deleting yourself. Secrets owned by the target transfer to the
 *                             caller; grants naming the target are dropped.
 *   DELETE /admin/teams/:id → drops memberships and grants naming the team.
 *   POST /admin/users/:id/promote → idempotent (promoting an admin returns 200).
 */
export const ROUTES = {
  health: '/health',
  auth: {
    start: '/auth/github/start',
    callback: '/auth/github/callback',
    exchange: '/auth/cli/exchange',
    logout: '/auth/logout',
  },
  me: '/me',
  users: '/users',
  teams: '/teams',
  secrets: '/secrets',
  secret: (id: number) => `/secrets/${id}`,
  secretGrants: (id: number) => `/secrets/${id}/grants`,
  admin: {
    users: '/admin/users',
    user: (id: number) => `/admin/users/${id}`,
    promoteUser: (id: number) => `/admin/users/${id}/promote`,
    userTeams: (id: number) => `/admin/users/${id}/teams`,
    teams: '/admin/teams',
    team: (id: number) => `/admin/teams/${id}`,
  },
} as const;
