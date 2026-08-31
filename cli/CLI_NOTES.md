# CLI session notes (for the human to merge into README / LLM_USAGE / NOTES)

Built by the CLI session against the frozen `/shared` contract and the server at `cc0072b`.
Nothing under `/server` or `/shared` was modified. No dependencies were added.

## Verify each phase

Prereqs (once): `npm install`, `npm run seed -w server`, then in one terminal
`AUTH_MODE=dev npm run dev -w server`. Reseeding deletes the db file, so restart the server
after `npm run seed` (tsx watch keeps the old inode open).

| Phase | Commit    | Command |
|-------|-----------|---------|
| 1 session + api client | `3acd7fb` | `SECRETS_DEV_USER=alice npx tsx cli/scripts/api-smoke.ts` (try `dave` for a write-only row) |
| 2 login + logout       | `cef15d3` | `npx tsx cli/scripts/login-smoke.ts` (drives the loopback without GitHub: 400 on state mismatch, unknown_user, exchange, cancel). Then `SECRETS_DEV_USER=alice npm run dev -w cli` for the shell; `HOME=$(mktemp -d) npm run dev -w cli` for the login screen; real GitHub login needs `npm run dev -w server` with `server/.env` filled in |
| 3 secret list + detail | `218abcc` | `SECRETS_DEV_USER=alice npm run dev -w cli` → Secrets → Enter, `v`; as `dave` open `DEPLOY_KEY` (write-only: `e` works, no `v`) |
| 4 create + share       | `7565c00` | `SECRETS_DEV_USER=alice npm run dev -w cli` → New secret; try a key with a space, then an existing key (`NPM_TOKEN`) for the 409 path |
| 5 org directory        | `7565c00` | same session → Directory |
| 6 admin menu           | `16ff3e0` | `SECRETS_DEV_USER=scotthnguyen npm run dev -w cli` → Admin (hidden for `alice`) |

`npm run typecheck` is green across workspaces. `git checkout <commit>` reproduces any step.

## Layout (`cli/src`, ~2k lines)

```
index.tsx      TTY check, loadConfig, render(<App/>)
config.ts      SECRETS_SERVER_URL / SECRETS_DEV_USER → Config
session.ts     ~/.config/secrets-cli/session.json: dir 0700, file 0600, atomic rename, self-heals if corrupt
api.ts         ApiClient: one request() (auth header, JSON, error envelope → ApiError, zod parse of the
               response) + a one-line wrapper per route. ConnectionError for "server down / not JSON / drift".
login.ts       loginViaBrowser(): the loopback handshake, copied from server/scripts/login.ts, plus
               cancel(), a 5-minute timeout and server.unref() so Ctrl+C never hangs on the loopback
context.tsx    SessionContext {api, me, mode, refreshMe, logout} and NavContext {route, push, pop, replace, quit}
app.tsx        boot state machine (dev → /me; session → session.json → /me; 401 → drop file → login),
               Authenticated (route stack) and Router (switch on route.name)
hooks/useAsync loading/ready/error + reload, ignores superseded responses
ui/TextInput   useInput-based single-line input (no ink-text-input); paste = one input chunk, CR/LF stripped
ui/Menu        arrow list, j/k, home/end/pgup/pgdn, scroll window, disabled rows, onKey for view hotkeys
ui/ShareEditor grant editor: rows = org / teams / users-minus-owner; space = read+write, r / w individually
ui/CheckList   multi-select (team membership)
ui/Screen      Screen frame (title · identity · key hints), ErrorLine, Notice, Loading, Field, AccessBadge
format.ts      describePrincipal (never shows a bare id), rights(), shortDate(), mask()
views/         Login, MainMenu, SecretList, SecretDetail, CreateSecret, Directory, Admin
```

## Decisions (defensible out loud)

- **No router library.** Navigation is a `Route[]` stack in `Authenticated`; only the top route is
  mounted, so each view's `useInput` is naturally the only active one. Sub-modes inside a view
  (edit value, confirm delete, share editor) pass `isActive` to their hooks so two handlers never
  see the same keystroke.
- **Values are masked by default** in the list and detail; `v` reveals. The system stores plaintext,
  but the screen shouldn't broadcast it. Write-only rows say so explicitly instead of showing a mask
  that would imply a readable value exists for the caller.
- **Actions are hidden by `access`** (`e` only if canWrite, `s`/`d` only if isOwner, Admin only if
  isAdmin) but the server is the authority; a 403/404 still renders as an error line.
- **Create is a 4-step wizard** (key → value → share → confirm) rather than a form with focus
  management: Enter advances, Esc backs up, and the key is validated client-side with the same
  `SecretKeySchema` the server uses. A 409 returns the user to the key step with the server message.
- **Share editor semantics match decision 13**: selecting a principal defaults to read+write, `r`/`w`
  toggle independently, and a write-only row is legal (the legend explains what it means). Grants
  are sent as a full replace, matching `PUT /secrets/:id/grants`.
- **Session-mode 401 anywhere** (not just at boot) drops `session.json` and returns to the login
  view with a warning; the `ApiClient` calls back into `App`, views don't handle it.
- **Dev mode has no "Log out"** — there's no session to revoke, so the item reads "Quit". Session
  mode logout is best-effort `POST /auth/logout` then delete the file.
- **Login flow** matches `server/scripts/login.ts` byte-for-byte where it matters: 24 random bytes
  base64url state, loopback on 127.0.0.1:0, 400 + keep waiting on state mismatch, 404 on other
  paths, HTML "you can close this tab", then `POST /auth/cli/exchange`. Additions for a TUI: the URL
  is also printed as a fallback, Esc cancels, an `invalid_code` from a spent one-time code tells the
  user to press Enter and start over.
- **Admin picker guards**: you cannot pick yourself for delete (server would 403 anyway), promote
  lists non-admins only, reassign pre-checks current teams. After every admin mutation the
  directory is refetched and `/me` is refreshed (the admin may have changed their own teams).
- **No UI tests** (per instruction). Verification during the build was a pty harness that feeds
  keystrokes to the real TUI and dumps the screen; that script lived in the session scratchpad,
  the two committed smoke scripts under `cli/scripts/` cover the non-UI parts.

## LLM mistakes / overrides worth logging

- Nested a `<Box>` inside `<Text>` for a column in the secret list; Ink throws at render. Fixed by
  padding strings instead (`AccessBadge width`).
- Wrote imports with `.tsx` extensions; NodeNext wants `.js` even for `.tsx` sources. Caught by
  `tsc`, fixed with a sed.
- Left a duplicate `useNav` import after a refactor. Caught by `tsc`.
- The keystroke harness initially sent bursts without delays; Ink saw `bad key\r` as a single
  paste and my `TextInput` (correctly) stripped the CR instead of submitting. Looked like an app
  bug, was a harness bug. Added a 250 ms gap per key.
- `git add cli` in the phase-5 commit swept in the not-yet-verified `AdminView.tsx`; the commit was
  split afterwards so each phase is checkout-able on its own.
- The seeded db had drifted from the fixture (server's curl walkthrough had deleted `bob`, so
  `DEPLOY_KEY` belonged to `dannyrose30`). Reseeded before verifying the UI; reseeded again at the
  end since verifying the admin menu deletes `bob` and mutates grants.

## Known gaps (would do next, in order)

1. `TextInput` cursor is always at the end (backspace, ctrl-u, paste; no ←/→ editing).
2. Values are single-line; CR/LF are stripped from pastes. Multi-line values need a different input.
3. No subcommand shortcuts (`secrets get KEY`) — decision 14 said "only if Phase 5 has room".
4. No clipboard copy from the detail view.
5. Directory / share editor scroll but don't filter; fine for orgs of tens, not hundreds.

## Contract observations (no change needed)

- `GET /teams` sorts by name, so `firmware` precedes `platform`; the CLI relies on server order.
- `DELETE /admin/users/:id` on yourself is 403; the CLI removes "you" from the picker rather than
  surfacing the error.
