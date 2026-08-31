# How I used LLMs on this project

Short version: I made the architecture decisions and reviewed every file; Claude Code (Fable 5)
wrote most of the code from a spec I froze up front, in phases I verified one at a time. Two
sessions ran in parallel against a frozen contract — one on the server, one on the CLI. The raw
log is in [`NOTES.md`](NOTES.md); this is the distillation.

## What I decided before any code was written

Stack (npm workspaces, Express + better-sqlite3, no ORM, Ink 7), the polymorphic `grants` table,
union-only resolution, admins get no implicit read, pre-provisioned users only, hashed opaque
sessions, and the seed shape. I gave the model those as constraints and asked it three things
first: to ask me anything genuinely ambiguous, to list the real tradeoffs *including where it
disagreed with me*, and to propose a build order in which the authorization logic was testable
before OAuth existed.

## Where the model changed my mind, and where it didn't

Accepted from the model: matching users on immutable `github_id` after first login instead of
username only; a one-time exchange code so the session token never rides in a browser URL;
404-instead-of-403 for invisible secrets; the resolver as one pure function rather than a SQL
predicate that would have to be duplicated for single-secret checks; enforcing uniqueness in the
schema only and translating the violation to a 409.

Rejected: it proposed a subcommand CLI (`secrets list ...`) to save Ink effort — the assignment asks
for an Ink interface, so the interactive TUI is the deliverable. It proposed cascade-deleting a
user's secrets — I chose transfer-to-admin, because deleting a person shouldn't destroy a secret a
team depends on, and then made the schema enforce it (no cascade on `owner_id`). It proposed
sliding session expiry — fixed expiry, less to defend. It proposed sending my OAuth app secret to
the reviewer out-of-band — the README tells you to register your own instead.

## Process

- **Phases with a stop after each.** Scaffold → schema + resolver (TDD) → HTTP API under a
  header-auth middleware → real OAuth → CLI → docs. I ran the verification commands myself after
  each phase (tests, seed, a 20-step curl walkthrough, the real browser round-trip) before saying
  "go" on the next.
- **TDD only where it pays.** The resolver's 14 tests were written first and run red. The Ink
  screens have no tests; hand-verifying them was cheaper than mocking a terminal.
- **A frozen contract for parallel work.** Before the CLI session started, `/shared` was completed
  (every zod schema, route, and error code) and a `HANDOFF.md` written that a session with no
  conversation history could build from. Neither session was allowed to edit `/shared`; a change
  would have gone through me.
- **Reference source over recall.** I cloned the Ink repo into the workspace and told the model to
  read the real component APIs and examples rather than remember them — Ink 7 requires React 19 and
  the ecosystem is full of stale answers.

## What the model got wrong

Small things, all caught by running the code:

- Put shell comments on the same line as `npm run ...` in its verification instructions; npm
  forwards trailing args, so `tsc` received `# three workspaces, clean` as filenames.
- One integration-test expectation contradicted its own test title (carol *owns* `NPM_TOKEN`).
  The red run caught it.
- Used an `as unknown as number` cast to reuse client path helpers as Express route patterns, and
  a `void x;` to silence an unused import. Both cleaned up before commit.

<!-- CLI session: add the CLI-side entries here (handoffs, overrides, mistakes) before submission. -->

## What I'd tell a reviewer

I can defend every decision because I made or explicitly accepted each one, and I can point at the
line where it's enforced. The parts I'd change with more time are listed in the README under
"Deliberate limitations".
