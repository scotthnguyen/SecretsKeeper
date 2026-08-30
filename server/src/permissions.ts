/**
 * Grant resolution — the one place the access rule lives.
 *
 *   isOwner  = secret.ownerId == caller.id
 *   matches  = grants whose principal is the caller, one of the caller's teams, or the caller's org
 *   canRead  = isOwner || any(matches.canRead)
 *   canWrite = isOwner || any(matches.canWrite)
 *   visible  = canRead || canWrite || isOwner
 *
 * Pure union semantics: no deny rules, no precedence, write does not imply read, admins get
 * nothing implicitly. A secret from another org is never accessible, whatever the grants say
 * (defense in depth — queries already filter by org).
 */
import type { PrincipalType, SecretAccess } from '@secrets/shared';

/** The authenticated caller, as produced by the auth middleware. */
export interface Caller {
  id: number;
  orgId: number;
  isAdmin: boolean;
  teamIds: readonly number[];
}

/** The subset of a secret the rule needs. */
export interface AccessSubject {
  orgId: number;
  ownerId: number;
}

/** The subset of a grant row the rule needs. */
export interface GrantLike {
  principalType: PrincipalType;
  principalId: number;
  canRead: boolean;
  canWrite: boolean;
}

/** Does this grant's principal include the caller? */
export function grantApplies(caller: Caller, grant: GrantLike): boolean {
  switch (grant.principalType) {
    case 'user':
      return grant.principalId === caller.id;
    case 'team':
      return caller.teamIds.includes(grant.principalId);
    case 'org':
      return grant.principalId === caller.orgId;
  }
}

export function resolveAccess(
  caller: Caller,
  secret: AccessSubject,
  grants: readonly GrantLike[],
): SecretAccess {
  if (secret.orgId !== caller.orgId) {
    return { canRead: false, canWrite: false, isOwner: false };
  }
  const isOwner = secret.ownerId === caller.id;
  const matching = grants.filter((g) => grantApplies(caller, g));
  return {
    canRead: isOwner || matching.some((g) => g.canRead),
    canWrite: isOwner || matching.some((g) => g.canWrite),
    isOwner,
  };
}

export function isVisible(access: SecretAccess): boolean {
  return access.canRead || access.canWrite || access.isOwner;
}
