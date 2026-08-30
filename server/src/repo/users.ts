import type { User } from '@secrets/shared';
import type { Db } from '../db/index.js';
import type { Caller } from '../permissions.js';

interface UserRow {
  id: number;
  org_id: number;
  github_login: string;
  github_id: number | null;
  is_admin: 0 | 1;
  created_at: string;
  /** JSON array of team ids, built by the subquery below. */
  team_ids: string;
}

// team_ids is aggregated in SQL so a user (or a whole org directory) is one query.
const SELECT_USER = `
  SELECT u.*,
         (SELECT json_group_array(tm.team_id) FROM team_members tm WHERE tm.user_id = u.id) AS team_ids
  FROM users u`;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    orgId: row.org_id,
    githubLogin: row.github_login,
    isAdmin: row.is_admin === 1,
    teamIds: JSON.parse(row.team_ids) as number[],
    createdAt: row.created_at,
  };
}

export function createUser(
  db: Db,
  input: { orgId: number; githubLogin: string; isAdmin?: boolean },
): User {
  const id = Number(
    db
      .prepare('INSERT INTO users (org_id, github_login, is_admin) VALUES (?, ?, ?)')
      .run(input.orgId, input.githubLogin, input.isAdmin ? 1 : 0).lastInsertRowid,
  );
  return getUserById(db, id)!;
}

export function getUserById(db: Db, id: number): User | undefined {
  const row = db.prepare(`${SELECT_USER} WHERE u.id = ?`).get(id) as UserRow | undefined;
  return row && toUser(row);
}

/** Case-insensitive (github_login is COLLATE NOCASE). */
export function getUserByLogin(db: Db, githubLogin: string): User | undefined {
  const row = db.prepare(`${SELECT_USER} WHERE u.github_login = ?`).get(githubLogin) as UserRow | undefined;
  return row && toUser(row);
}

export function listUsers(db: Db, orgId: number): User[] {
  const rows = db.prepare(`${SELECT_USER} WHERE u.org_id = ? ORDER BY u.github_login`).all(orgId) as UserRow[];
  return rows.map(toUser);
}

/** The auth context handlers run with. */
export function getCaller(db: Db, userId: number): Caller | undefined {
  const u = getUserById(db, userId);
  return u && { id: u.id, orgId: u.orgId, isAdmin: u.isAdmin, teamIds: u.teamIds };
}

export function setAdmin(db: Db, userId: number, isAdmin: boolean): void {
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
}

/** Full replace of team memberships. Caller has validated the team ids. */
export function setTeams(db: Db, userId: number, teamIds: number[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM team_members WHERE user_id = ?').run(userId);
    const ins = db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)');
    for (const teamId of teamIds) ins.run(teamId, userId);
  })();
}

/** Memberships and sessions cascade. Owned secrets do NOT — transfer them first or this throws. */
export function deleteUser(db: Db, userId: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

/**
 * Map a GitHub account to a provisioned user.
 *
 *  1. github_id match → that user (immutable id; survives username renames).
 *  2. else login match with github_id IS NULL → first login: bind github_id, return that user.
 *  3. else → undefined. This includes the case "login matches but is bound to a different
 *     github_id": someone re-registered an old username. They must not inherit the account.
 */
export function findUserForGithubAccount(db: Db, github: { id: number; login: string }): User | undefined {
  const byId = db.prepare('SELECT id FROM users WHERE github_id = ?').get(github.id) as { id: number } | undefined;
  if (byId) return getUserById(db, byId.id);

  const unbound = db
    .prepare('SELECT id FROM users WHERE github_login = ? AND github_id IS NULL')
    .get(github.login) as { id: number } | undefined;
  if (!unbound) return undefined;

  db.prepare('UPDATE users SET github_id = ?, github_login = ? WHERE id = ?').run(github.id, github.login, unbound.id);
  return getUserById(db, unbound.id);
}
