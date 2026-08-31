# NOTES — how this was built with an LLM

Running log. Three kinds of entries:
- **Handoff**: what I delegated to the LLM (Claude Code, model Fable 5) and how I framed it.
- **Override**: where I rejected or changed the LLM's proposal, and why.
- **LLM mistake**: what it got wrong that I caught and fixed.

Final writeup is distilled from this file.

## 2026-08-30 — Planning session

**Handoff.** Gave the LLM the assignment, a fixed set of architecture decisions (monorepo, Express +
better-sqlite3, polymorphic grants table, union-only resolution, admins get no implicit read,
pre-provisioned users only, hashed opaque session tokens), and a cloned Ink repo as reference so
it would read real component APIs instead of recalling them. Asked for: clarifying questions,
CLAUDE.md, a blunt tradeoff list (including disagreements), and a phased build order with a
temporary header-auth middleware so authorization could be tested before OAuth existed.

**What the LLM did.** Read `ink/package.json` and examples to pin Ink 7.1.1 / React 19.2 / Node >=22.
Wrote CLAUDE.md. Proposed: pure-function permission resolver (one implementation, TDD'd) instead of
SQL; CLI loopback + one-time exchange code so the session token never rides in a browser URL;
binding `github_id` on first login so username renames don't break auth; 404-instead-of-403 for
invisible secrets.

**Overrides.**
- LLM proposed a subcommand CLI (`secrets list ...`) to save Ink effort. Rejected: the assignment
  asks for an Ink interface, so the interactive TUI is the deliverable, not a stretch.
- LLM proposed cascade-deleting a user's secrets. Rejected: secrets transfer to the deleting admin
  because a team may depend on them.
- LLM proposed a 30-day sliding session expiry. Changed to fixed/non-sliding (less to defend).
- LLM proposed shipping my OAuth app secret out-of-band. Rejected: reviewer registers their own app.
- "Write does not imply read" kept in the model, but I specified the share UI defaults a selected
  principal to read+write with read as a separate toggle.
- Accepted: pure-function resolver over SQL, exchange-code hop, github_id binding, 404-not-403,
  per-org admins, team reassignment only, owner-only grant edits, secret delete included.

**LLM mistakes.** None in this phase.

## 2026-08-30 — Phase 0: scaffold + frozen contract

**Handoff.** Told the LLM I'd run a second session for `/cli` in parallel; it had to freeze `/shared`
(every zod schema, route, error code) and write `HANDOFF.md` so the CLI session could build cold.

**What the LLM did.** Root npm workspaces, `tsconfig.base.json` (NodeNext, strict, noEmit),
`/shared` with `schemas.ts` / `routes.ts` / `errors.ts` / `constants.ts`, placeholder server
(`/health`) and CLI (renders a box), `HANDOFF.md`. Verified `npm run typecheck`, Ink render, and
`curl /health`. Noticed TypeScript 7.0 is now latest and pinned `~5.9` deliberately. Noticed my
`server/.env` already contained real credentials and gitignored it before the first commit.

## 2026-08-30 — Phase 1: schema, resolver (TDD), repos, seed

**Handoff.** "Go" after verifying Phase 0. Schema + permission resolver test-first, repositories,
seed fixture, no HTTP yet.

**What the LLM did.** `db/schema.sql` (FK on, CHECK constraints, `UNIQUE(secret_id, principal_type,
principal_id)`; `secrets.owner_id` deliberately has no cascade so the DB itself refuses to delete a
user who still owns secrets — the transfer rule is enforced structurally). Wrote 14 resolver tests
first, ran them red, then `permissions.ts` (pure function, ~40 lines), green. Repo layer aggregates
`teamIds`/`memberIds` with `json_group_array` so directory listings are one query. `services/secrets.ts`
is the only path handlers will use: it never returns anything the caller can't see (value nulled
for write-only, grants nulled for non-owners, `undefined` ⇒ 404). Seed fixture is a reusable
`seedDatabase(db)` so the integration test runs the real seed into `:memory:` and asserts what each
seeded user sees — this is the demo script, executable.

**Overrides.** None.

**LLM mistakes.**
- Phase 0 verify snippet put `# comments` on the same line as `npm run ...`; npm forwards trailing
  args to the script, so `tsc` received `# three workspaces, clean` as file names. Harmless, but
  it cost a round-trip. Rule: no inline comments on command lines.
- Integration test expected `carol` to be a non-owner of `NPM_TOKEN` while the test title said
  "owns NPM_TOKEN". Test bug, not code bug; caught by the red run.

## 2026-08-30 — Phase 2: HTTP API with dev-header auth

**Handoff.** "Go" after verifying Phase 1 (tests, seed, sqlite query).

**What the LLM did.** `http/auth.ts` (two middlewares, one `req.caller`), `http/errors.ts`
(`ApiError` → envelope; `uniqueOr409` maps SQLite UNIQUE violations to 409 so uniqueness has one
owner: the schema), `http/validate.ts`, write-side of `services/secrets.ts` (`validateGrants` is the
code that does what the polymorphic table's missing FK can't), `services/admin.ts` (delete-user
transfers secrets inside a transaction; delete-team drops grants by hand), three route files,
`app.ts`/`index.ts`, and `scripts/curl.sh` — a 20-step walkthrough. Ran it against a scratch DB;
verified the orphan-grant query returns 0 after user and team deletion.

**Overrides.** None.

**LLM mistakes.**
- First draft used `ROUTES.secret(':id' as unknown as number)` to reuse the shared path helpers as
  Express patterns. Ugly cast; replaced with `` `${ROUTES.secrets}/:id` `` before commit.
- Left a `void conflict;` to silence an unused import instead of removing the import. Removed.

## 2026-08-30 — Phase 3: GitHub OAuth, sessions, exchange-code hop

**Handoff.** "Go" after the curl walkthrough matched every header's claim.

**What the LLM did.** `repo/sessions.ts` (random 32 bytes, SHA-256 stored, fixed expiry),
`findUserForGithubAccount` (github_id first; login only while unbound; a re-registered username is
rejected), `services/auth.ts` (three hops with in-memory state/exchange maps + TTL sweeps),
`routes/auth.ts`, real `sessionAuth`, startup guard that refuses session mode without GitHub creds.
Tests for the binding rules and expiry (30 total now). `scripts/login.ts` plays the CLI's part of the
handshake — used to verify end-to-end and handed to the CLI session as a reference. Probed every
auth route on a session-mode scratch server without touching GitHub (minted a session directly).

**Overrides.** None.

**LLM mistakes.** None caught in this phase. (The browser round-trip itself is verified by the
human, below, since it needs a real GitHub account.)

## 2026-08-30 — Phase 5 (server side): README, LLM_USAGE, clean-clone check

**Handoff.** After the real GitHub round-trip succeeded (`login: scotthnguyen (#…)`), asked for
the docs. CLI-dependent parts left as marked placeholders for the CLI session.

**What the LLM did.** Replaced the stub README (quickstart with OAuth-app registration, seed table,
architecture, access rule, login flow, errors, admin semantics, tests, deliberate limitations).
Drafted `LLM_USAGE.md` from this file. Cloned the repo into a scratch dir and verified from
scratch: `npm install`, typecheck (0 errors), 30/30 tests, seed, dev-mode server answers, and
session mode without `.env` exits with a clear message.

**Overrides.** None yet.

**LLM mistakes.** None caught in this phase.
