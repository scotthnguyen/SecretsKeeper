/**
 * Admin operations. Every target is looked up *within the admin's org*; a target in another org
 * is a 404, the same as a nonexistent one.
 */
import type { Team, User } from '@secrets/shared';
import type { Db } from '../db/index.js';
import type { Caller } from '../permissions.js';
import { forbidden, notFound, uniqueOr409, validation } from '../http/errors.js';
import { deleteGrantsForPrincipal, transferOwnership } from '../repo/secrets.js';
import { createTeam as insertTeam, deleteTeam as removeTeam, getTeam, listTeams } from '../repo/teams.js';
import {
  createUser as insertUser,
  deleteUser as removeUser,
  getUserById,
  setAdmin,
  setTeams,
} from '../repo/users.js';

function userInOrg(db: Db, admin: Caller, userId: number): User {
  const user = getUserById(db, userId);
  if (!user || user.orgId !== admin.orgId) throw notFound('No such user');
  return user;
}

function teamInOrg(db: Db, admin: Caller, teamId: number): Team {
  const team = getTeam(db, teamId);
  if (!team || team.orgId !== admin.orgId) throw notFound('No such team');
  return team;
}

export function createUser(db: Db, admin: Caller, input: { githubLogin: string; isAdmin?: boolean }): User {
  return uniqueOr409(`GitHub login "${input.githubLogin}" is already provisioned`, () =>
    insertUser(db, { orgId: admin.orgId, ...input }),
  );
}

/**
 * Deleting a person must not destroy secrets a team depends on: their secrets transfer to the
 * admin doing the deletion (the schema's FK on secrets.owner_id would reject the delete otherwise).
 * Grants *to* the user are dropped by hand (polymorphic table, no FK).
 */
export function deleteUser(db: Db, admin: Caller, userId: number): { transferredSecrets: number } {
  const target = userInOrg(db, admin, userId);
  if (target.id === admin.id) throw forbidden('You cannot delete yourself');
  return db.transaction(() => {
    const transferredSecrets = transferOwnership(db, target.id, admin.id);
    deleteGrantsForPrincipal(db, 'user', target.id);
    removeUser(db, target.id);
    return { transferredSecrets };
  })();
}

/** Idempotent. There is deliberately no demote: the assignment only asks for promotion. */
export function promoteUser(db: Db, admin: Caller, userId: number): User {
  const target = userInOrg(db, admin, userId);
  setAdmin(db, target.id, true);
  return getUserById(db, target.id)!;
}

/** "Reassign": full replace of a user's team memberships, all teams must be in the admin's org. */
export function setUserTeams(db: Db, admin: Caller, userId: number, teamIds: number[]): User {
  const target = userInOrg(db, admin, userId);
  const valid = new Set(listTeams(db, admin.orgId).map((t) => t.id));
  const unknown = teamIds.filter((id) => !valid.has(id));
  if (unknown.length) throw validation(`Unknown team ids: ${unknown.join(', ')}`);
  setTeams(db, target.id, [...new Set(teamIds)]);
  return getUserById(db, target.id)!;
}

export function createTeam(db: Db, admin: Caller, name: string): Team {
  return uniqueOr409(`A team named "${name}" already exists in your org`, () =>
    insertTeam(db, { orgId: admin.orgId, name }),
  );
}

/** Memberships cascade; grants naming the team are dropped by hand (polymorphic table, no FK). */
export function deleteTeam(db: Db, admin: Caller, teamId: number): void {
  const team = teamInOrg(db, admin, teamId);
  db.transaction(() => {
    deleteGrantsForPrincipal(db, 'team', team.id);
    removeTeam(db, team.id);
  })();
}
