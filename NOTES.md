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
