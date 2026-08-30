// The two security-relevant rules that are cheap to prove: GitHub account binding and expiry.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../db/index.js';
import { seedDatabase } from '../seed-data.js';
import { findUserForGithubAccount, getUserByLogin } from '../repo/users.js';
import { createSession, deleteSession, findSessionUser } from '../repo/sessions.js';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  seedDatabase(db);
});

describe('findUserForGithubAccount', () => {
  test('first login binds github_id to the provisioned login (case-insensitive)', () => {
    const u = findUserForGithubAccount(db, { id: 501, login: 'Alice' });
    assert.equal(u?.githubLogin, 'Alice'); // canonical casing from GitHub is stored
    const row = db.prepare('SELECT github_id FROM users WHERE id = ?').get(u!.id) as { github_id: number };
    assert.equal(row.github_id, 501);
  });

  test('after binding, a renamed GitHub account still maps by id', () => {
    findUserForGithubAccount(db, { id: 501, login: 'alice' });
    const u = findUserForGithubAccount(db, { id: 501, login: 'alice-renamed' });
    assert.equal(u?.id, getUserByLogin(db, 'alice')!.id);
  });

  test('a different GitHub account that took over the old username is rejected', () => {
    findUserForGithubAccount(db, { id: 501, login: 'alice' });
    assert.equal(findUserForGithubAccount(db, { id: 999, login: 'alice' }), undefined);
  });

  test('unprovisioned account → undefined', () => {
    assert.equal(findUserForGithubAccount(db, { id: 1, login: 'mallory' }), undefined);
  });
});

describe('sessions', () => {
  test('token round-trips; only the hash is stored', () => {
    const alice = getUserByLogin(db, 'alice')!;
    const token = createSession(db, alice.id, 60_000);
    assert.equal(findSessionUser(db, token), alice.id);
    const stored = db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    assert.ok(stored.every((r) => r.token_hash !== token));
  });

  test('expired session is not found (fixed expiry, non-sliding)', () => {
    const alice = getUserByLogin(db, 'alice')!;
    const token = createSession(db, alice.id, -1);
    assert.equal(findSessionUser(db, token), undefined);
  });

  test('logout deletes; unknown token is a no-op', () => {
    const alice = getUserByLogin(db, 'alice')!;
    const token = createSession(db, alice.id, 60_000);
    deleteSession(db, token);
    assert.equal(findSessionUser(db, token), undefined);
    deleteSession(db, 'nope');
  });

  test('deleting a user cascades their sessions', () => {
    const bob = getUserByLogin(db, 'bob')!;
    const token = createSession(db, bob.id, 60_000);
    db.prepare('UPDATE secrets SET owner_id = ? WHERE owner_id = ?').run(getUserByLogin(db, 'alice')!.id, bob.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(bob.id);
    assert.equal(findSessionUser(db, token), undefined);
  });
});
