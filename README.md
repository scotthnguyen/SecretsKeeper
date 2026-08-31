# SecretsKeeper

A secret-sharing system: an interactive terminal UI (Ink) talking to a small HTTP server
(Express + SQLite). Secrets are key/value pairs, no encryption. Users belong to exactly one
organization and any number of teams; every secret can be shared with any mix of users, teams, or
the whole org, with read and write granted separately. Login is GitHub OAuth from the terminal —
the browser opens, you authorize, you're back in the CLI. No codes to copy.

Take-home for ChipAgents. Written for a live walkthrough: every design decision is documented in
[`CLAUDE.md`](CLAUDE.md), and the LLM-usage log requested by the assignment is in
[`LLM_USAGE.md`](LLM_USAGE.md) (distilled from the running log in [`NOTES.md`](NOTES.md)).

## Quickstart

Prerequisites: Node ≥ 22 (`node --version`), a GitHub account.

**1. Register a GitHub OAuth App** (2 minutes) at https://github.com/settings/developers → *New OAuth App*:

| Field                      | Value                                          |
|----------------------------|------------------------------------------------|
| Homepage URL               | `http://localhost:4000`                        |
| Authorization callback URL | `http://localhost:4000/auth/github/callback`   |

Generate a client secret, then:

```sh
cp server/.env.example server/.env      # paste GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET
```

**2. Install, seed, run:**

```sh
npm install
npm run seed -w server                   # creates server/data/secrets.db with the fixture below
npm run dev -w server                    # http://localhost:4000
npm run dev -w cli                       # in a second terminal
```

The CLI opens your browser on first launch. `dannyrose30` and `scotthnguyen` are seeded as admins
of org **chipagents**, so either GitHub account logs straight in. Any other GitHub account is
rejected with "not provisioned — ask an admin": only pre-created users can log in, which is how
"every user belongs to an org" is enforced structurally rather than by a check.

Sessions persist in `~/.config/secrets-cli/session.json` (mode 0600) for 30 days.

**Without OAuth** (curl, demos, tests) the server can identify callers from a header:

```sh
AUTH_MODE=dev npm run dev -w server                # server trusts  X-Dev-User: <githubLogin>
SECRETS_DEV_USER=alice npm run dev -w cli          # CLI skips login and acts as alice
bash server/scripts/curl.sh                        # 20-step API walkthrough with real responses
```

## Seed fixture

Org **chipagents**: admins `scotthnguyen`, `dannyrose30`; members `alice`, `bob`, `carol`, `dave`.
Teams `platform` (alice, carol), `firmware` (bob, carol). Org **acme** (isolation check): `erin`
(admin), `frank`, team `acme-core`.

| Secret           | Owner        | Shared with                                                | Point it makes                       |
|------------------|--------------|------------------------------------------------------------|--------------------------------------|
| `DATABASE_URL`   | alice        | team platform **rw**, team firmware **r**                  | carol (both teams) gets the union    |
| `DEPLOY_KEY`     | bob          | carol **r**, dave **w**                                    | dave sees the key but not the value  |
| `OPENAI_API_KEY` | scotthnguyen | org chipagents **r**                                       | everyone in the org, nobody in acme  |
| `NPM_TOKEN`      | carol        | alice **rw**, team platform **r**                          | overlapping user + team grants       |
| `PERSONAL_NOTE`  | dave         | —                                                          | admins can't see it                  |
| `ACME_DB_URL`    | erin (acme)  | org acme **rw**                                            | invisible from chipagents            |

`npm run seed` resets the database to exactly this.

## How it works

```
cli/      Ink TUI.   views: login · main menu · secrets · secret detail · create+share · directory · admin
shared/   The HTTP contract: zod schemas, route table, error codes. Server validates with them,
          CLI parses responses with them, so drift fails loudly on both sides.
server/   Express 5 + better-sqlite3. Raw SQL behind small repo functions; no ORM.
```

### Data model

```
organizations   users(org_id, github_login, github_id, is_admin)   teams(org_id, name)
team_members(team_id, user_id)
secrets(org_id, owner_id, key, value)                UNIQUE(org_id, key)
grants(secret_id, principal_type ∈ {user,team,org}, principal_id, can_read, can_write)
sessions(user_id, token_hash, expires_at)
```

`grants` is one polymorphic table. `principal_id` can't carry a foreign key (it points at three
tables), so two things live in code that a FK would normally do: `validateGrants` rejects
principals outside the secret's org, and deleting a user or team deletes the grants naming them
inside the same transaction. The alternative — a `principals` supertype table — is the textbook fix
and would be the first change if this grew.

### The access rule (`server/src/permissions.ts`, ~40 lines, 14 tests)

```
isOwner  = secret.owner == me
matches  = grants for me, for any of my teams, or for my org
canRead  = isOwner || any(matches.can_read)
canWrite = isOwner || any(matches.can_write)
visible  = canRead || canWrite
```

Union only, no deny rules, no precedence. **Write does not imply read**: a write-only grantee sees
the key exists and can overwrite the value, but the value comes back `null`. **Admins get nothing
implicitly** — admin is a user/team-management role, not a data role. (It's a least-privilege
default, not a hard boundary: an admin can add themselves to a team.) Only the owner can change
sharing or delete; anyone with write can update the value.

The rule is a pure function, and listing loads an org's secrets + grants and filters through it,
rather than duplicating the predicate in SQL. Orgs are small; one implementation beats two that drift.

### Login (`server/src/services/auth.ts`)

```
CLI: random state, loopback on 127.0.0.1:<port>, open  /auth/github/start?state&port
Server → GitHub → /auth/github/callback: verify state (one-shot), exchange code server-side,
        GET /user, map github_id → user (bind on first login), create session,
        redirect browser to  127.0.0.1:<port>/callback?state&code=<one-time exchange code>
CLI: check state, POST /auth/cli/exchange {code} → {token, user, org, teams}, write session.json
```

The session token never appears in a browser URL; only a 60-second one-time code does. The CLI
checks `state` on the loopback hop, so a hostile page can't log your CLI in as someone else. Users
are matched by immutable `github_id` after first login — a GitHub username rename doesn't lock you
out, and someone who registers your old username doesn't inherit your access. Tokens are 32 random
bytes; the server stores the SHA-256 (fast hash is correct for a high-entropy token — bcrypt is
for passwords). 30-day fixed expiry; logout deletes the row.

### Errors

Every error is `{ "error": { "code", "message", "details?" } }`. A secret you can't see is a **404**,
not a 403, so the existence of other people's secrets never leaks through `PUT /secrets/:id`.
Uniqueness (secret key per org, team name per org, GitHub login) is enforced by the schema only;
the server translates the SQLite violation into a 409 with a human message.

### Admin operations

Create user (by GitHub login), create team, replace a user's team memberships, promote to admin,
delete team, delete user. **Deleting a user transfers their secrets to the admin doing the
deletion** — the schema has no cascade on `secrets.owner_id`, so the database itself refuses a
delete that would orphan secrets. Admins are scoped to their own org; a target in another org is
a 404.

## Tests

```sh
npm test -w server      # 30 tests: resolver (table-driven), seed-visibility integration, github binding, sessions
npm run typecheck       # all three workspaces, strict
```

The integration test seeds an in-memory database with the fixture above and asserts exactly what
`alice`, `carol`, `dave`, `dannyrose30`, and `erin` each see. It's the demo, executable.

## Deliberate limitations

- No encryption at rest (out of scope per the assignment). Values are plain text in SQLite.
- Single process, in-memory OAuth handshake state. Restarting the server mid-login means "log in again".
- Grants are not visible to non-owners; only the owner sees who a secret is shared with.
- No demote-admin, no cross-org moves, no audit log. Each is a small addition; none was asked for.
