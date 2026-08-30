import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAccess, isVisible, type Caller, type GrantLike } from './permissions.js';

// Fixture: org 1 has users 10 (alice), 11 (bob, admin); teams 100 (platform, alice in it), 101.
// Org 2 is a different organization.
const alice: Caller = { id: 10, orgId: 1, isAdmin: false, teamIds: [100] };
const bobAdmin: Caller = { id: 11, orgId: 1, isAdmin: true, teamIds: [] };
const secretOwnedByBob = { orgId: 1, ownerId: 11 };
const secretOwnedByAlice = { orgId: 1, ownerId: 10 };

const grant = (
  principalType: GrantLike['principalType'],
  principalId: number,
  canRead: boolean,
  canWrite: boolean,
): GrantLike => ({ principalType, principalId, canRead, canWrite });

const NONE = { canRead: false, canWrite: false, isOwner: false };

describe('resolveAccess', () => {
  test('owner has full access regardless of grants', () => {
    assert.deepEqual(resolveAccess(alice, secretOwnedByAlice, []), {
      canRead: true,
      canWrite: true,
      isOwner: true,
    });
  });

  test('no grants, not owner → nothing', () => {
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, []), NONE);
  });

  test('direct user grant, read only', () => {
    const g = [grant('user', 10, true, false)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canRead: true });
  });

  test('direct user grant, write only: write does NOT imply read', () => {
    const g = [grant('user', 10, false, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canWrite: true });
  });

  test('grant to a different user is ignored', () => {
    const g = [grant('user', 99, true, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), NONE);
  });

  test('team grant applies when caller is a member', () => {
    const g = [grant('team', 100, true, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canRead: true, canWrite: true });
  });

  test('team grant is ignored when caller is not a member', () => {
    const g = [grant('team', 101, true, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), NONE);
  });

  test("org grant applies to everyone in the secret's org", () => {
    const g = [grant('org', 1, true, false)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canRead: true });
  });

  test('org grant naming a different org is ignored', () => {
    const g = [grant('org', 2, true, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), NONE);
  });

  test('overlapping grants are a union: user read + team write → read and write', () => {
    const g = [grant('user', 10, true, false), grant('team', 100, false, true)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canRead: true, canWrite: true });
  });

  test('a grant with neither flag adds nothing (no deny semantics, just no-op)', () => {
    const g = [grant('user', 10, false, false), grant('org', 1, true, false)];
    assert.deepEqual(resolveAccess(alice, secretOwnedByBob, g), { ...NONE, canRead: true });
  });

  test('admin gets no implicit access', () => {
    const g = [grant('user', 10, true, true)];
    assert.deepEqual(resolveAccess(bobAdmin, secretOwnedByAlice, g), NONE);
  });

  test("secret in another org is never accessible, even with a matching-looking grant", () => {
    const foreignSecret = { orgId: 2, ownerId: 10 }; // same ownerId number, different org
    const g = [grant('user', 10, true, true), grant('team', 100, true, true)];
    assert.deepEqual(resolveAccess(alice, foreignSecret, g), NONE);
  });
});

describe('isVisible', () => {
  test('visible if any of read/write/owner', () => {
    assert.equal(isVisible({ canRead: false, canWrite: false, isOwner: false }), false);
    assert.equal(isVisible({ canRead: true, canWrite: false, isOwner: false }), true);
    assert.equal(isVisible({ canRead: false, canWrite: true, isOwner: false }), true);
    assert.equal(isVisible({ canRead: false, canWrite: false, isOwner: true }), true);
  });
});
