import type { Grant, PrincipalType } from '@secrets/shared';
import type { Db } from '../db/index.js';
import type { GrantLike } from '../permissions.js';

/** A secret row plus its grants, before any access resolution. Internal to the server. */
export interface SecretRecord {
  id: number;
  orgId: number;
  ownerId: number;
  ownerLogin: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  grants: GrantLike[];
}

interface SecretRow {
  id: number;
  org_id: number;
  owner_id: number;
  owner_login: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

interface GrantRow {
  secret_id: number;
  principal_type: PrincipalType;
  principal_id: number;
  can_read: 0 | 1;
  can_write: 0 | 1;
}

const SELECT_SECRET = `
  SELECT s.*, u.github_login AS owner_login
  FROM secrets s JOIN users u ON u.id = s.owner_id`;

function toGrantLike(g: GrantRow): GrantLike {
  return {
    principalType: g.principal_type,
    principalId: g.principal_id,
    canRead: g.can_read === 1,
    canWrite: g.can_write === 1,
  };
}

function assemble(rows: SecretRow[], grants: GrantRow[]): SecretRecord[] {
  const bySecret = new Map<number, GrantLike[]>();
  for (const g of grants) {
    const list = bySecret.get(g.secret_id) ?? [];
    list.push(toGrantLike(g));
    bySecret.set(g.secret_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    orgId: r.org_id,
    ownerId: r.owner_id,
    ownerLogin: r.owner_login,
    key: r.key,
    value: r.value,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    grants: bySecret.get(r.id) ?? [],
  }));
}

export function getSecret(db: Db, id: number): SecretRecord | undefined {
  const row = db.prepare(`${SELECT_SECRET} WHERE s.id = ?`).get(id) as SecretRow | undefined;
  if (!row) return undefined;
  const grants = db.prepare('SELECT * FROM grants WHERE secret_id = ?').all(id) as GrantRow[];
  return assemble([row], grants)[0];
}

/** Every secret in the org with its grants — two queries total, resolved in memory. */
export function listSecrets(db: Db, orgId: number): SecretRecord[] {
  const rows = db.prepare(`${SELECT_SECRET} WHERE s.org_id = ? ORDER BY s.key`).all(orgId) as SecretRow[];
  const grants = db
    .prepare('SELECT g.* FROM grants g JOIN secrets s ON s.id = g.secret_id WHERE s.org_id = ?')
    .all(orgId) as GrantRow[];
  return assemble(rows, grants);
}

/** Insert a secret and its grants atomically. Caller has already validated the grants. */
export function createSecret(
  db: Db,
  input: { orgId: number; ownerId: number; key: string; value: string; grants: Grant[] },
): SecretRecord {
  const run = db.transaction(() => {
    const id = Number(
      db
        .prepare('INSERT INTO secrets (org_id, owner_id, key, value) VALUES (?, ?, ?, ?)')
        .run(input.orgId, input.ownerId, input.key, input.value).lastInsertRowid,
    );
    insertGrants(db, id, input.grants);
    return id;
  });
  return getSecret(db, run())!;
}

export function insertGrants(db: Db, secretId: number, grants: Grant[]): void {
  const stmt = db.prepare(
    'INSERT INTO grants (secret_id, principal_type, principal_id, can_read, can_write) VALUES (?, ?, ?, ?, ?)',
  );
  for (const g of grants) {
    stmt.run(secretId, g.principal.type, g.principal.id, g.canRead ? 1 : 0, g.canWrite ? 1 : 0);
  }
}
