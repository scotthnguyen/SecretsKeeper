# SecretsKeeper

A secret-sharing system for teams: an interactive terminal UI (Ink) talking to a small HTTP server
(Express + SQLite). Secrets are key/value pairs. Users belong to exactly one organization and any
number of teams; every secret can be shared with any mix of users, teams, or the whole org, with
read and write granted separately. Login is GitHub OAuth from the terminal — the browser opens,
you authorize, you're back in the CLI.

Take-home for ChipAgents. Design decisions are in [`CLAUDE.md`](CLAUDE.md); the LLM-usage writeup
is in [`LLM_USAGE.md`](LLM_USAGE.md) (raw log in [`NOTES.md`](NOTES.md)).

```
cli/      Ink 7 TUI          shared/   HTTP contract (zod schemas, routes, error codes)
server/   Express 5 + better-sqlite3, raw SQL, no ORM
```

## Stack

| Layer      | Tool                                   | Assignment requirement                          |
|------------|----------------------------------------|-------------------------------------------------|
| CLI        | **TypeScript**, **Ink 7.1** (React 19) | CLI in JS/TS, built with Ink                     |
| Backend    | **TypeScript**, Node 24, Express 5     | JS/TS or Python backend                          |
| Database   | SQLite via `better-sqlite3`, one `schema.sql` | local, no cloud services or infrastructure |
| Auth       | GitHub OAuth2 (browser round-trip, no copy/paste); 30-day sessions in `~/.config/secrets-cli/session.json` | seamless social login, sessions persist across restarts |
| Contract   | `zod` schemas shared by server and CLI | —                                                |
| Tests      | `node:test` (30 tests on the access rule and fixture) | —                                     |

Every operation the assignment lists, and where it is:

| Operation                                        | Where                                            |
|--------------------------------------------------|--------------------------------------------------|
| Login / Logout                                   | login screen (browser) · main menu → *Log out*   |
| List all K/V pairs visible to you                | *Secrets*                                        |
| Create secrets with read/write scopes            | *New secret* → share step (users, teams, whole org, any mix, read and write separately) |
| Update secrets / change scopes                   | secret detail → `e` (writers) · `s` (owner)      |
| Admin: create users, teams; promote to admin; reassign/delete users and teams | *Admin* menu (admins are seeded, or promoted by an admin) |
| List all teams and users in org (for sharing)    | *Directory* (any user)                           |

Users belong to exactly one org (structural: a user row needs an `org_id`, and only provisioned
users can log in). Teams are optional — a user may be on none.

## Setup

Prerequisites: Node ≥ 22, a GitHub account.

**1. Register a GitHub OAuth App** at https://github.com/settings/developers → *New OAuth App*:

| Field                      | Value                                        |
|----------------------------|----------------------------------------------|
| Homepage URL               | `http://localhost:4000`                      |
| Authorization callback URL | `http://localhost:4000/auth/github/callback` |

Generate a client secret, then `cp server/.env.example server/.env` and paste
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` into it.

**2. Install, seed, run:**

```sh
npm install
npm run seed -w server        # creates server/data/secrets.db with the fixture below
npm run dev -w server         # terminal 1 → http://localhost:4000
npm run dev -w cli            # terminal 2 → the TUI; opens your browser to log in
```

`scotthnguyen` and `dannyrose30` are seeded as admins of org **chipagents**, so either GitHub
account logs straight in. Any other GitHub account is rejected ("not provisioned — ask an admin"):
only pre-created users can log in. Your session is kept in `~/.config/secrets-cli/session.json`
(mode 0600) for 30 days.

**Without a browser** (demos, curl, switching users quickly): the server can identify callers from
a header instead of a session.

```sh
AUTH_MODE=dev npm run dev -w server            # server trusts  X-Dev-User: <githubLogin>
SECRETS_DEV_USER=alice npm run dev -w cli      # CLI skips login and acts as alice
```

Don't mix modes on one port: a session-mode CLI against a dev-mode server logs in fine and then
gets "Session rejected by the server: Dev mode: send x-dev-user header" on the first request.
Run a second server on `PORT=4001` (and `SECRETS_SERVER_URL=http://localhost:4001` for the CLI)
if you want both at once.

## How to use

Everything is keyboard-driven: `↑↓` move, `Enter` opens, `Esc` goes back, `q` quits. The bottom
line of every screen lists the keys that work there.

**Main menu** — Secrets · New secret · Directory · Admin (admins only) · Log out.

**Secrets** — every secret you can see, with owner and your access (`owner`, `read`, `write`,
`read+write`). Values are masked; write-only rows say so. `n` new, `r` refresh.

**Secret detail** — keys appear only if you're allowed to use them:

| Key | Action           | Who                         |
|-----|------------------|-----------------------------|
| `v` | reveal / hide value | anyone with read          |
| `e` | edit value       | anyone with write           |
| `s` | sharing          | owner only                  |
| `d` | delete           | owner only                  |

Non-owners never see who else a secret is shared with.

**New secret** — four steps: key → value → share → confirm. Keys are unique per org and can't be
renamed later; a duplicate sends you back to the key step with the server's message.

**Share editor** (in *New secret* and `s`) — one row per principal: *everyone in \<org\>*, each
team, each user. `space` toggles **read**, `w` toggles **write**; the bits are independent, so
write-only is allowed (e.g. a rotation job that may replace a value but never read it). `Enter`
saves the whole list.

**Directory** — every team (with members) and every person (with teams and admin flag) in your
org. This is the same list the share editor offers.

**Admin** (admins only) — Add user (by GitHub login) · Promote to admin · Reassign teams ·
Delete user · Create team · Delete team. Deleting a user transfers their secrets to you.
Admins get **no** access to secrets by being admins.

### Seeing access control work

Run the CLI as different users (dev mode makes this a one-line switch) and compare:

```sh
SECRETS_DEV_USER=dave  npm run dev -w cli   # DEPLOY_KEY: can edit, value hidden (write-only)
SECRETS_DEV_USER=carol npm run dev -w cli   # DATABASE_URL: read+write (union of two team grants)
SECRETS_DEV_USER=erin  npm run dev -w cli   # org acme: none of the chipagents secrets exist
```

Or share something with yourself from another account and watch it appear; un-share it and it
disappears. Guessing an id doesn't help: a secret you can't see is a 404, not a 403.

### Seed fixture

Org **chipagents**: admins `scotthnguyen`, `dannyrose30`; members `alice`, `bob`, `carol`, `dave`.
Teams `platform` (alice, carol), `firmware` (bob, carol). Org **acme**: `erin` (admin), `frank`,
team `acme-core`. `npm run seed -w server` resets to exactly this (restart the server afterwards).

| Secret           | Owner        | Shared with                               | Point it makes                      |
|------------------|--------------|-------------------------------------------|-------------------------------------|
| `DATABASE_URL`   | alice        | team platform **rw**, team firmware **r** | carol (both teams) gets the union   |
| `DEPLOY_KEY`     | bob          | carol **r**, dave **w**                   | dave sees the key but not the value |
| `OPENAI_API_KEY` | scotthnguyen | org chipagents **r**                      | everyone in the org, nobody in acme |
| `NPM_TOKEN`      | carol        | alice **rw**, team platform **r**         | overlapping user + team grants      |
| `PERSONAL_NOTE`  | dave         | —                                         | admins can't see it                 |
| `ACME_DB_URL`    | erin (acme)  | org acme **rw**                           | invisible from chipagents           |

### Tests and checks

```sh
npm test -w server            # 30 tests: access resolver (table-driven), fixture visibility, github binding, sessions
npm run typecheck             # all three workspaces, strict
bash server/scripts/curl.sh   # 22-step API walkthrough against a dev-mode server
```

---

## How it works

### The access rule (`server/src/permissions.ts`)

```
isOwner  = secret.owner == me
matches  = grants for me, for any of my teams, or for my org
canRead  = isOwner || any(matches.can_read)
canWrite = isOwner || any(matches.can_write)
visible  = canRead || canWrite
```

Union only — no deny rules, no precedence. **Write does not imply read.** **Admins get nothing
implicitly**: admin is a user/team-management role, not a data role (a least-privilege default,
not a hard boundary — an admin can add themselves to a team). Only the owner can change sharing
or delete; anyone with write can update the value.

The rule is one pure function. Listing loads an org's secrets + grants and filters through it
instead of duplicating the predicate in SQL: orgs are small, and one implementation beats two
that drift.

### Data model

```
organizations   users(org_id, github_login, github_id, is_admin)   teams(org_id, name)
team_members(team_id, user_id)
secrets(org_id, owner_id, key, value)                UNIQUE(org_id, key)
grants(secret_id, principal_type ∈ {user,team,org}, principal_id, can_read, can_write)
sessions(user_id, token_hash, expires_at)
```

`grants` is one polymorphic table. `principal_id` can't carry a foreign key (it points at three
tables), so two things live in code that a FK would normally do: grant validation rejects
principals outside the secret's org, and deleting a user or team deletes the grants naming them in
the same transaction. A `principals` supertype table is the textbook fix and would be the first
change if this grew.

`secrets.org_id` is denormalized from the owner: it is the isolation boundary and survives
ownership transfer. Every query starts with `WHERE org_id = :callerOrg`.

### Login

```
CLI:    random state, loopback on 127.0.0.1:<port>, open  /auth/github/start?state&port
Server: → GitHub → /auth/github/callback: verify state, exchange code server-side, GET /user,
        map github_id → user (bind on first login), create session,
        redirect browser to  127.0.0.1:<port>/callback?state&code=<one-time exchange code>
CLI:    check state, POST /auth/cli/exchange {code} → {token, user, org, teams}, write session.json
```

The session token never appears in a browser URL; only a 60-second one-time code does. The CLI
checks `state` on the loopback hop, so a hostile page can't log your CLI in as someone else.
Users are matched by immutable `github_id` after first login — a username rename doesn't lock you
out and someone who registers your old username doesn't inherit your access. Tokens are 32 random
bytes; the server stores only the SHA-256 (fast hash is right for a high-entropy token; bcrypt is
for passwords). 30-day fixed expiry; logout deletes the row. Any 401 makes the CLI drop
`session.json` and show the login screen with the server's reason.

### HTTP API

`shared/src/routes.ts` is the route table, `shared/src/schemas.ts` every body. The server
validates requests with those schemas and the CLI parses responses with them, so contract drift
fails loudly on both sides.

```
POST /auth/cli/exchange   POST /auth/logout   GET /me   GET /users   GET /teams
GET  /secrets             POST /secrets       GET /secrets/:id
PUT  /secrets/:id {value}                     PUT /secrets/:id/grants {grants}   DELETE /secrets/:id
POST /admin/users         DELETE /admin/users/:id   POST /admin/users/:id/promote   PUT /admin/users/:id/teams
POST /admin/teams         DELETE /admin/teams/:id
```

Errors are `{ "error": { "code", "message", "details?" } }`. A secret you can't see is a **404**,
not a 403, so the existence of other people's secrets never leaks. Uniqueness (secret key per org,
team name per org, GitHub login) is enforced by the schema; the server translates the SQLite
violation into a 409 with a readable message.

### Admin semantics

Admins are scoped to their own org; a target in another org is a 404. Deleting a user transfers
their secrets to the admin doing the deletion (grants *on* those secrets are kept, grants *to* the
deleted user are dropped) — the schema has no cascade on `secrets.owner_id`, so the database
refuses a delete that would orphan a secret. Deleting a team drops its memberships and grants.
You cannot delete yourself.

### CLI internals (`cli/src`)

No router library: navigation is a route stack, only the top view is mounted, so each view's
`useInput` is the only active handler. Inputs and lists are hand-rolled on `useInput` (no
`ink-text-input`, no `ink-table`). The action keys shown on a screen are derived from the
`access` the server returns, but the server enforces regardless. More in
[`cli/CLI_NOTES.md`](cli/CLI_NOTES.md).

## Deliberate limitations

- No encryption at rest (out of scope per the assignment). Values are plain text in SQLite.
- Single process, in-memory OAuth handshake state. Restarting the server mid-login means "log in again".
- Only the owner sees who a secret is shared with; there is no ownership transfer other than user deletion.
- No demote-admin, no cross-org moves, no audit log. Each is a small addition; none was asked for.
- CLI text input is single-line with the cursor at the end (paste works; no ←/→ editing).
