-- SecretsKeeper schema. Applied idempotently at startup (see db/index.ts).
-- Booleans are INTEGER 0/1. Timestamps are ISO-8601 UTC text.

CREATE TABLE IF NOT EXISTS organizations (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- A user row cannot exist without an org: "every user belongs to exactly one org" is structural.
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  org_id       INTEGER NOT NULL REFERENCES organizations(id),
  github_login TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  -- NULL until first successful login, then bound. Login matches github_id first (immutable),
  -- github_login only as a fallback while github_id IS NULL.
  github_id    INTEGER UNIQUE,
  is_admin     INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS teams (
  id     INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id),
  name   TEXT    NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- owner_id deliberately has NO cascade: deleting a user while they own secrets is an FK error.
-- The delete-user transaction must transfer ownership first. The database enforces the
-- "deleting a person must not destroy secrets" rule, not just the application code.
CREATE TABLE IF NOT EXISTS secrets (
  id         INTEGER PRIMARY KEY,
  org_id     INTEGER NOT NULL REFERENCES organizations(id),
  owner_id   INTEGER NOT NULL REFERENCES users(id),
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (org_id, key)
);

-- Polymorphic principal: principal_id points at users, teams, or organizations depending on
-- principal_type, so it cannot carry a foreign key. Consequences, handled in code:
--   * deleting a user/team must DELETE FROM grants WHERE principal_type=? AND principal_id=?
--   * cross-org principals must be rejected at write time (services/secrets.ts)
CREATE TABLE IF NOT EXISTS grants (
  id             INTEGER PRIMARY KEY,
  secret_id      INTEGER NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  principal_type TEXT    NOT NULL CHECK (principal_type IN ('user', 'team', 'org')),
  principal_id   INTEGER NOT NULL,
  can_read       INTEGER NOT NULL DEFAULT 0 CHECK (can_read IN (0, 1)),
  can_write      INTEGER NOT NULL DEFAULT 0 CHECK (can_write IN (0, 1)),
  UNIQUE (secret_id, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS grants_by_principal ON grants (principal_type, principal_id);

-- Opaque bearer tokens; only the SHA-256 hash is stored. Fixed expiry, non-sliding.
CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT    NOT NULL
);
