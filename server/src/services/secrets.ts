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
