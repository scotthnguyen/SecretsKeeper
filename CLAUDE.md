# Secrets — ChipAgents take-home

Secret sharing system: Ink CLI + Node backend. A secret is a key/value pair (no encryption).
Users, teams, organizations, admins. GitHub OAuth login. Local only, no cloud, no Docker.

Reviewer: Danny Rose (founding engineer). Every decision here must be defensible out loud.
Priority: clean, defensible architecture > feature count. Author must understand every file.

## Stack (pinned)

| Layer   | Choice                                         | Why                                                  |
|---------|------------------------------------------------|------------------------------------------------------|
| Runtime | Node 24 (Ink requires >=22), ESM everywhere    | Ink 7 is ESM-only                                    |
| Lang    | TypeScript 5, `tsx` for dev/test               | No build step during dev                             |
| Server  | Express 5 + `better-sqlite3`                   | Sync SQLite API = trivial transactions, no ORM       |
| Valid.  | `zod` (schemas live in `/shared`)              | One contract for server validation + CLI types       |
| CLI     | Ink **7.1.1** + React **19.2.x** (majors must match Ink's peer dep) | Required by assignment          |
| Tests   | `node:test` via `node --import tsx --test`     | Zero deps; TDD only for permission logic             |

Do NOT use `ink-table` (breaks across React majors). Hand-roll lists with `Box`/`Text`.
Ink source is cloned at `./ink` (gitignored; `git clone https://github.com/vadimdemedes/ink ink`) —
read `ink/readme.md` and `ink/examples/*` for real APIs, don't guess.
Useful examples: `select-input` (arrow-key list), `table` (Box-width columns), `use-input`, `router`.

## Repo layout (npm workspaces)

```
/shared   types + zod schemas for the HTTP contract (imported by server and cli)
/server   Express API, SQLite, OAuth, seed script, permission tests
/cli      Ink CLI
/ink      reference clone of Ink (read-only, gitignored, not a workspace)
CLAUDE.md this file
HANDOFF.md what the CLI session needs to know cold (server run modes, auth, login handshake)
NOTES.md  LLM-usage log: handoffs, overrides, LLM mistakes (becomes the writeup)
```

## Parallel sessions — ownership

Two Claude Code sessions work in this repo at once: **server session owns `/server`**, **CLI session
owns `/cli`**. `/shared` is FROZEN after Phase 0: it is the contract both build against. Neither
session edits `/shared` — if you need a contract change, stop and tell the human what and why;
they make the edit and sync both sessions. Commits are small and scoped to your own workspace.

## Data model (SQLite)

```
organizations  id, name UNIQUE
users          id, org_id→organizations, github_login UNIQUE (NOCASE), github_id INTEGER UNIQUE NULL,
               is_admin INT, created_at
teams          id, org_id→organizations, name, UNIQUE(org_id, name)
team_members   team_id→teams, user_id→users, PK(team_id, user_id)
secrets        id, org_id→organizations, owner_id→users, key, value, created_at, updated_at,
               UNIQUE(org_id, key)
grants         id, secret_id→secrets ON DELETE CASCADE,
               principal_type TEXT CHECK IN ('user','team','org'), principal_id INTEGER,
               can_read INT, can_write INT,
               UNIQUE(secret_id, principal_type, principal_id)
sessions       id, user_id→users ON DELETE CASCADE, token_hash UNIQUE, created_at, expires_at, last_used_at
```

- `grants` is a single **polymorphic** table; `principal_id` has no FK (can't FK to three tables).
  Consequence: orphan cleanup is explicit — deleting a user/team runs `DELETE FROM grants WHERE
  principal_type=? AND principal_id=?` in the same transaction. Documented tradeoff, see below.
- `github_id` is NULL until the user's first login, then bound. Login matches on `github_id` first,
  falls back to `github_login` only when `github_id IS NULL`. Protects against GitHub username
  renames/re-registration.
- `secrets.org_id` is denormalized from the owner: it is the isolation boundary and survives
  ownership changes. Every query starts with `WHERE org_id = :callerOrg`.
- Foreign keys ON (`PRAGMA foreign_keys = ON` per connection). WAL mode.
- Schema is one `schema.sql` applied idempotently at startup (`CREATE TABLE IF NOT EXISTS`). No migration tool.

## Grant resolution rule (the core of the system)

For caller `u` (with `orgId`, `teamIds[]`) and secret `s` with grants `G`:

```
isOwner  = s.owner_id == u.id
matches  = { g in G | (g.principal_type='user' and g.principal_id == u.id)
                   or (g.principal_type='team' and g.principal_id in u.teamIds)
                   or (g.principal_type='org'  and g.principal_id == u.orgId) }
canRead  = isOwner or any(g.can_read  for g in matches)
canWrite = isOwner or any(g.can_write for g in matches)
visible  = canRead or canWrite        // write-only callers see the key but not the value
```

- Pure **union / additive** semantics. No deny rules, no precedence. Write does NOT imply read.
- Implemented ONCE as a pure function `resolveAccess(caller, secret, grants)` in
  `server/src/permissions.ts`, TDD'd with table-driven `node:test` cases. Listing loads the org's
  secrets + grants and filters through the same function (orgs are small; one implementation
  beats two that drift). Never re-implement the rule in SQL.
- Owner-only operations: change grants, delete secret, view the grant list. Writers may only change `value`.
- `key` is `UNIQUE(org_id, key)`; it is the secret's identity and cannot be changed after create.
  Known cost: a create with a colliding key reveals that the key exists to someone who can't see it.
- Admins get **no** implicit secret access. Admin is a user/team management role, not a data role.
  (Least-privilege default, not a hard security boundary: an admin can add themselves to a team.)
- Cross-org grants are rejected at write time: a `user`/`team` principal must belong to the
  secret's org; an `org` principal must equal the secret's org.

## Decisions already made (do not re-litigate)

1. Monorepo, npm workspaces, ESM, tsx. No Docker, no cloud.
2. Express + better-sqlite3, raw SQL behind small repository functions, no ORM.
3. Polymorphic `grants` table (see rule above).
4. Admins do not auto-read secrets.
5. **Only pre-provisioned users can log in.** Admin creates a user by GitHub login; unknown GitHub
   login at OAuth callback → clear rejection page + CLI error. This makes "every user belongs to
   exactly one org" structural: a user row cannot exist without an org_id.
6. Admin scope is **per-org**. Admins manage users/teams in their own org only. Promotion is
   admin-only. Admins can be seeded. "Reassign" = replace a user's team memberships. No
   cross-org moves.
7. Seed: org "chipagents" with `scotthnguyen` and `dannyrose30` as admins, two teams, a few
   users, secrets with overlapping grants; a second org "acme" with its own users and secrets to
   prove isolation.
8. Session tokens: 32 random bytes, base64url, sent as `Authorization: Bearer`. Server stores
   SHA-256 hash only (high-entropy token ⇒ fast hash is correct; bcrypt is for low-entropy
   passwords). **30-day fixed expiry, non-sliding.** Logout deletes the session row.
11. **Deleting a user transfers their secrets to the admin performing the deletion** (grants on
    those secrets are kept; grants *to* the deleted user are dropped). Deleting a person must not
    destroy secrets a team depends on. Deleting a team drops its grants and memberships.
12. Secret delete exists and is owner-only.
13. Write does not imply read in the model. The CLI share UI defaults a newly selected principal
    to read+write, with read as a separate toggle — independent model, sane default.
14. CLI is an **interactive Ink TUI**, not subcommands: views = login, main menu, secret list,
    secret detail, create+share flow, org directory, admin menu. Subcommand shortcuts only if
    Phase 5 has room.
15. GitHub OAuth App credentials are never committed. README tells the reviewer to register their
    own app (callback `http://localhost:4000/auth/github/callback`) and fill `server/.env`.
9. CLI session file: `~/.config/secrets-cli/session.json`, mode 0600, `{ serverUrl, token, user }`.
10. OAuth `state` is verified on both hops (see flow).

## OAuth flow (GitHub, "no copy/paste")

```
CLI                              Server (:4000)                        GitHub
 | start loopback 127.0.0.1:P     |                                      |
 | state = random                 |                                      |
 | open browser → GET /auth/github/start?state&port=P                    |
 |                                | remember {state→port} (10 min TTL)   |
 |                                | 302 → github authorize (state)   →   |
 |                                |   ← 302 /auth/github/callback?code&state
 |                                | verify state; exchange code (client secret stays server-side)
 |                                | GET /user → {login, id}
 |                                | lookup user (github_id, then login); unknown → 403 page + redirect CLI ?error
 |                                | create session; mint one-time exchange_code (60 s)
 |                                | 302 → http://127.0.0.1:P/callback?code=exchange_code&state
 | verify state matches           |                                      |
 | POST /auth/cli/exchange {code} → returns {token, user}                |
 | write session.json 0600; show "Logged in as X" page; close loopback   |
```

- The session token never transits the browser URL (only the short-lived one-time code does).
- Handshake state (`state→port`, `exchange_code→token`) is an in-memory Map with TTL. Single
  process, ephemeral by nature; a table would be ceremony.
- Device Flow was rejected: it requires the user to type a code.
- Register a GitHub OAuth App with callback `http://localhost:4000/auth/github/callback`.
  Env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `PORT` in `server/.env` (gitignored; `.env.example`
  committed). Loaded with `process.loadEnvFile()` — no dotenv dependency.

## Auth middleware (two implementations, one interface)

Handlers only ever see `req.user: Caller = { id, orgId, isAdmin, teamIds }`.

- `sessionAuth` — real: Bearer token → hash → sessions row → load Caller.
- `devHeaderAuth` — `X-Dev-User: <github_login>` → load Caller. Enabled ONLY when
  `AUTH_MODE=dev`. Used to build/curl-test the whole API before OAuth exists, and by tests.
  Server refuses to start with `AUTH_MODE=dev` if `NODE_ENV=production`.

## HTTP API

`shared/src/routes.ts` is the source of truth for the route list; `shared/src/schemas.ts` for every
request/response body. Summary:

```
GET    /auth/github/start?state&port   browser   GET /auth/github/callback   browser
POST   /auth/cli/exchange {code}       → {token, user, org, teams}
POST   /auth/logout                    → {ok}
GET    /me                             → {user, org, teams}
GET    /users  → {users}   GET /teams → {teams}          (org-scoped directory, for sharing pickers)
GET    /secrets                        → {secrets: SecretSummary[]}  value only if canRead
GET    /secrets/:id                    → {secret: SecretDetail}      grants only if owner
POST   /secrets {key, value, grants}   → {secret}  201
PUT    /secrets/:id {value}            → {secret}            (writer)
PUT    /secrets/:id/grants {grants}    → {secret}  full replace (owner)
DELETE /secrets/:id                    → {ok}                (owner)
POST   /admin/users {githubLogin, isAdmin?}  → {user} 201    DELETE /admin/users/:id → {ok, transferredSecrets}
POST   /admin/users/:id/promote        → {user}
PUT    /admin/users/:id/teams {teamIds} → {user}   full replace ("reassign")
POST   /admin/teams {name}             → {team} 201          DELETE /admin/teams/:id → {ok}
grant = { principal: {type:'user'|'team'|'org', id}, canRead, canWrite }
```
Errors: `{ error: { code, message, details? } }`. 400 validation_error, 401 unauthenticated,
403 forbidden, 404 not_found (also used instead of 403 when the caller can't see the secret, to
avoid existence leaks), 409 conflict, 500 internal.

## Run commands

```
npm install                                  # root, installs all workspaces
npm run seed -w server                       # creates server/data/secrets.db with seed data
npm run dev  -w server                       # http://localhost:4000 (reads server/.env)
AUTH_MODE=dev npm run dev -w server          # header auth for curl testing
npm test     -w server                       # permission tests (node:test)
npm run typecheck                            # tsc --noEmit across workspaces
npm run dev  -w cli                          # launch the TUI (SECRETS_SERVER_URL defaults to http://localhost:4000)
SECRETS_DEV_USER=alice npm run dev -w cli    # skip OAuth, send X-Dev-User (server must be AUTH_MODE=dev)
```

## Build discipline

- One phase at a time; stop after each phase with verification commands.
- TDD for `permissions.ts` only. No tests for Ink screens.
- Backend must be verified with curl (dev header auth, then real sessions) before any CLI code.
- Log every handoff / override / LLM mistake in `NOTES.md` as it happens.
