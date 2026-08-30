# HANDOFF — for the CLI session

You own `/cli`. Another session owns `/server`. `/shared` is **frozen**: it is the contract.
Do not edit `/shared`; if a field/route is missing, stop and tell the human what and why.
Read `CLAUDE.md` first (data model, permission rule, decisions). This file is the operational
detail you need to build the CLI before the server endpoints exist.

## Repo / tooling

- npm workspaces, ESM, TypeScript 5.9, `tsx` for everything. `npm install` at the root once.
- `npm run typecheck` (root) type-checks all workspaces. Keep it green.
- `/cli` already has: `ink@7.1.1`, `react@19.2`, `@types/react@19.2`, `open@11`, `@secrets/shared`.
  `tsconfig` has `jsx: react-jsx`. `npm run dev -w cli` runs `src/index.tsx` (a placeholder now).
- Import the contract as `import { ROUTES, SecretsListResponseSchema, ... } from '@secrets/shared'`.
  Relative imports need `.js` extensions (NodeNext).
- Do NOT add dependencies without telling the human (root `package-lock.json` is shared).
  No `ink-table`. Hand-roll lists with `Box`/`Text`. Ink source is at `./ink` (read
  `ink/readme.md`, `ink/examples/select-input`, `ink/examples/table`, `ink/examples/use-input`).

## The contract (`/shared/src`)

- `routes.ts`     — every method/path, auth level, request/response type, status code, and the
                    permission semantics per route. Use `ROUTES.*` constants, never string literals.
- `schemas.ts`    — zod schemas + inferred types for every body/query/response. Parse responses
                    with `XSchema.parse(json)` so a contract drift fails loudly.
- `errors.ts`     — error envelope `{ error: { code, message, details? } }`, `isErrorResponse()`,
                    and `ERROR_STATUS`. Branch on `code`, not on HTTP status.
- `constants.ts`  — `DEFAULT_SERVER_URL`, `HEADERS`, `CLI_ENV`, `CLI_LOOPBACK_PATH`, `SESSION_TTL_MS`.

## Running the server

**Status:** Phase 2 landed — every non-`/auth` route works in `AUTH_MODE=dev`. Phase 3 (`/auth/*`,
Bearer sessions) is next. `bash server/scripts/curl.sh` walks the whole API and shows real responses.

```
npm run seed -w server                          # creates server/data/secrets.db
AUTH_MODE=dev npm run dev -w server             # http://localhost:4000, header auth
npm run dev -w server                           # real sessions (needs server/.env with GitHub app creds)
curl localhost:4000/health                      # {"ok":true}
```

Server phases: Phase 2 = all `/me /users /teams /secrets /admin` routes with dev-header auth.
Phase 3 = `/auth/*` and Bearer sessions. Until Phase 2 lands, build against the schemas only.

## Seed data (fixed — build your demo flows around these)

Org `chipagents` (id 1): users `scotthnguyen` (admin), `dannyrose30` (admin), `alice`, `bob`,
`carol`, `dave`. Teams `platform` (alice, carol) and `firmware` (bob, carol). `dave` is on no team.
Org `acme` (id 2): `erin` (admin), `frank`; team `acme-core` (erin, frank).
Secrets (owner → grants), all in `chipagents` unless noted:
- `DATABASE_URL`      alice → team platform r/w, team firmware r
- `DEPLOY_KEY`        bob   → user carol r, user dave w (write-only: dave sees key, not value)
- `OPENAI_API_KEY`    scotthnguyen → org chipagents r
- `NPM_TOKEN`         carol → user alice r/w, team platform r   (overlapping: alice gets union)
- `PERSONAL_NOTE`     dave  → no grants (only dave sees it)
- `ACME_DB_URL`       erin (acme) → org acme r/w               (invisible from chipagents)
Exact ids are assigned by insertion order; do not hard-code ids, look things up by login/key.

## Auth: how the CLI sends it

Two modes, chosen by env var **`SECRETS_DEV_USER`** (`CLI_ENV.devUser`):

| Mode    | When                        | Header the CLI sends                          | Server flag     |
|---------|-----------------------------|-----------------------------------------------|-----------------|
| dev     | `SECRETS_DEV_USER=alice`    | `X-Dev-User: alice`  (skip the login screen)  | `AUTH_MODE=dev` |
| session | default                     | `Authorization: Bearer <token>` from session.json | (default)   |

In dev mode, an unknown login → `401 unauthenticated`. In session mode, missing/expired/revoked
token → `401 unauthenticated`; the CLI should drop `session.json` and show the login view.
Base URL: env `SECRETS_SERVER_URL` (`CLI_ENV.serverUrl`), default `http://localhost:4000`.

## Session file

`~/.config/secrets-cli/session.json`, directory `0700`, file `0600`:

```json
{ "serverUrl": "http://localhost:4000", "token": "<opaque>", "user": { ...User }, "org": { ...Org } }
```
Write it with `fs.writeFileSync(path, json, { mode: 0o600 })` after `mkdirSync(dir, { recursive: true, mode: 0o700 })`.
Sessions expire 30 days after login (server-side, non-sliding); on `401` just re-login.
Logout: `POST /auth/logout` (best-effort, ignore errors) then delete the file.

## Login handshake (exact steps — the CLI side)

1. Generate `state = randomBytes(24).toString('base64url')` (32 chars; schema requires 16–128).
2. Start an HTTP server on `127.0.0.1`, port `0` (OS picks); read the port from `server.address()`.
   Handle only `GET /callback` (`CLI_LOOPBACK_PATH`); anything else → 404.
3. Open the browser at
   `${serverUrl}/auth/github/start?state=${state}&port=${port}`  (use `open` package; also print
   the URL as a fallback in case the browser does not open).
4. The server takes over: redirects to GitHub, user authorizes, GitHub calls the server back, the
   server verifies `state`, exchanges the code (client secret stays on the server), looks the
   GitHub account up, creates a session, and finally redirects the browser to
   `http://127.0.0.1:${port}/callback?state=${state}&code=${exchangeCode}`
   — or on failure `http://127.0.0.1:${port}/callback?state=${state}&error=<unknown_user|invalid_state|oauth_failed>`.
5. Loopback handler: parse the query with `LoginCallbackQuerySchema`. **If `query.state !== state`,
   respond 400 and ignore it** (prevents login CSRF). Otherwise respond with a small HTML page
   ("You can close this tab") and close the loopback server.
6. If `error` is present: show it in the TUI. `unknown_user` message should say the GitHub
   account is not provisioned and to ask an admin. Done.
7. If `code` is present: `POST ${serverUrl}/auth/cli/exchange` with body `{ "code": code }`
   (`ExchangeRequestSchema`). Response is `ExchangeResponseSchema`: `{ token, user, org, teams }`.
   The exchange code is single-use and expires 60 s after issue; on `400 invalid_code` restart login.
8. Write session.json, proceed to the main menu.

The session token never appears in a browser URL — only the one-time exchange code does.
Time out the whole flow after ~5 minutes and close the loopback.

## API client shape (suggestion, not a contract)

One `api.ts` with `request<T>(schema, method, path, body?)` that: builds headers per the auth mode
above, `fetch`es, parses JSON, throws an `ApiError(code, message)` if `isErrorResponse(body)`,
and returns `schema.parse(body)`. Everything else in the CLI calls typed wrappers over that.

## TUI views (from CLAUDE.md decision 14)

login · main menu · secret list · secret detail · create+share flow · org directory · admin menu.
Share flow default: selecting a principal sets read+write; read is a separate toggle
(independent model, sane default). Use `access` on each secret to hide actions the caller
cannot perform (server enforces regardless). Admin menu only appears when `user.isAdmin`.
The org principal's `id` is `org.id` from `/me`.
