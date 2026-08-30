/**
 * Secrets as seen by a caller. Every function here takes a Caller and never returns anything the
 * caller is not allowed to see. Handlers call this layer, never the repo directly.
 */
import type { Grant, SecretAccess, SecretDetail, SecretSummary } from '@secrets/shared';
import type { Db } from '../db/index.js';
import { isVisible, resolveAccess, type Caller, type GrantLike } from '../permissions.js';
import { getSecret, listSecrets, type SecretRecord } from '../repo/secrets.js';

function toGrant(g: GrantLike): Grant {
  return { principal: { type: g.principalType, id: g.principalId }, canRead: g.canRead, canWrite: g.canWrite };
}

function toSummary(s: SecretRecord, access: SecretAccess): SecretSummary {
  return {
    id: s.id,
    orgId: s.orgId,
    ownerId: s.ownerId,
    ownerLogin: s.ownerLogin,
    key: s.key,
    value: access.canRead ? s.value : null, // write-only callers see the key, never the value
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    access,
  };
}

export function toDetail(s: SecretRecord, access: SecretAccess): SecretDetail {
  return {
    ...toSummary(s, access),
    grants: access.isOwner ? s.grants.map(toGrant) : null, // sharing list is the owner's business
  };
}

export function listVisibleSecrets(db: Db, caller: Caller): SecretSummary[] {
  return listSecrets(db, caller.orgId)
    .map((s) => ({ s, access: resolveAccess(caller, s, s.grants) }))
    .filter(({ access }) => isVisible(access))
    .map(({ s, access }) => toSummary(s, access));
}

/** undefined ⇒ caller must get a 404 (not found OR not visible — indistinguishable by design). */
export function getVisibleSecret(db: Db, caller: Caller, id: number): SecretDetail | undefined {
  const s = getSecret(db, id);
  if (!s) return undefined;
  const access = resolveAccess(caller, s, s.grants);
  return isVisible(access) ? toDetail(s, access) : undefined;
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

import { forbidden, notFound, uniqueOr409, validation } from '../http/errors.js';
import {
  createSecret as insertSecret,
  deleteSecret as removeSecret,
  replaceGrants,
  updateSecretValue,
} from '../repo/secrets.js';
import { listTeams } from '../repo/teams.js';
import { listUsers } from '../repo/users.js';

/**
 * The polymorphic grants table cannot enforce that a principal exists or lives in this org, so
 * this does. Rejects duplicates, foreign users/teams, and an org principal other than the
 * secret's own org.
 */
export function validateGrants(db: Db, orgId: number, grants: Grant[]): void {
  const seen = new Set<string>();
  const userIds = new Set(listUsers(db, orgId).map((u) => u.id));
  const teamIds = new Set(listTeams(db, orgId).map((t) => t.id));
  for (const { principal } of grants) {
    const tag = `${principal.type}:${principal.id}`;
    if (seen.has(tag)) throw validation(`Duplicate grant for ${tag}`);
    seen.add(tag);
    const ok =
      principal.type === 'user' ? userIds.has(principal.id)
      : principal.type === 'team' ? teamIds.has(principal.id)
      : principal.id === orgId;
    if (!ok) throw validation(`Unknown principal ${tag} (must exist in your org)`);
  }
}

export function createSecret(
  db: Db,
  caller: Caller,
  input: { key: string; value: string; grants: Grant[] },
): SecretDetail {
  validateGrants(db, caller.orgId, input.grants);
  const record = uniqueOr409(`A secret named "${input.key}" already exists in your org`, () =>
    insertSecret(db, { orgId: caller.orgId, ownerId: caller.id, ...input }),
  );
  return toDetail(record, resolveAccess(caller, record, record.grants));
}

/** Loads + resolves, mapping "not visible" to 404 so handlers cannot forget. */
function loadForCaller(db: Db, caller: Caller, id: number): { record: SecretRecord; access: SecretAccess } {
  const record = getSecret(db, id);
  if (!record) throw notFound('No such secret');
  const access = resolveAccess(caller, record, record.grants);
  if (!isVisible(access)) throw notFound('No such secret');
  return { record, access };
}

export function updateSecret(db: Db, caller: Caller, id: number, value: string): SecretDetail {
  const { access } = loadForCaller(db, caller, id);
  if (!access.canWrite) throw forbidden('You do not have write access to this secret');
  updateSecretValue(db, id, value);
  return toDetail(getSecret(db, id)!, access);
}

export function setSecretGrants(db: Db, caller: Caller, id: number, grants: Grant[]): SecretDetail {
  const { access } = loadForCaller(db, caller, id);
  if (!access.isOwner) throw forbidden('Only the owner can change sharing');
  validateGrants(db, caller.orgId, grants);
  replaceGrants(db, id, grants);
  return toDetail(getSecret(db, id)!, access);
}

export function deleteSecret(db: Db, caller: Caller, id: number): void {
  const { access } = loadForCaller(db, caller, id);
  if (!access.isOwner) throw forbidden('Only the owner can delete a secret');
  removeSecret(db, id);
}
