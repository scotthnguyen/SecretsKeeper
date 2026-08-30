// Integration: schema + repo + resolver, over the real seed fixture in an in-memory database.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, type Db } from '../db/index.js';
import { seedDatabase } from '../seed-data.js';
import { getUserByLogin, getCaller } from '../repo/users.js';
import { listVisibleSecrets, getVisibleSecret } from './secrets.js';
import type { Caller } from '../permissions.js';

let db: Db;
const callerOf = (login: string): Caller => getCaller(db, getUserByLogin(db, login)!.id)!;

/** key → [canRead, canWrite, isOwner] */
type Expect = Record<string, [boolean, boolean, boolean]>;
function assertSees(login: string, expected: Expect) {
  const seen = Object.fromEntries(
    listVisibleSecrets(db, callerOf(login)).map((s) => [s.key, [s.access.canRead, s.access.canWrite, s.access.isOwner]]),
  );
  assert.deepEqual(seen, expected, `visible set for ${login}`);
}

describe('listVisibleSecrets over the seed', () => {
  before(() => {
    db = openDb(':memory:');
    seedDatabase(db);
  });

  test('alice: owner of DATABASE_URL, user+team union on NPM_TOKEN, org read on OPENAI', () => {
    assertSees('alice', {
      DATABASE_URL: [true, true, true],
      NPM_TOKEN: [true, true, false],
      OPENAI_API_KEY: [true, false, false],
    });
  });

  test('carol: platform rw ∪ firmware r on DATABASE_URL, direct read on DEPLOY_KEY, owns NPM_TOKEN', () => {
    assertSees('carol', {
      DATABASE_URL: [true, true, false],
      DEPLOY_KEY: [true, false, false],
      NPM_TOKEN: [true, true, true],
      OPENAI_API_KEY: [true, false, false],
    });
  });

  test('dave: write-only on DEPLOY_KEY (visible, value hidden), owns PERSONAL_NOTE', () => {
    assertSees('dave', {
      DEPLOY_KEY: [false, true, false],
      OPENAI_API_KEY: [true, false, false],
      PERSONAL_NOTE: [true, true, true],
    });
    const deployKey = listVisibleSecrets(db, callerOf('dave')).find((s) => s.key === 'DEPLOY_KEY')!;
    assert.equal(deployKey.value, null);
  });

  test('dannyrose30 (admin) sees only what is shared with the org — no admin privilege', () => {
    assertSees('dannyrose30', { OPENAI_API_KEY: [true, false, false] });
  });

  test('erin (acme) sees only acme secrets; chipagents secrets never appear', () => {
    assertSees('erin', { ACME_DB_URL: [true, true, true] });
  });

  test('values are present when readable', () => {
    const openai = listVisibleSecrets(db, callerOf('bob')).find((s) => s.key === 'OPENAI_API_KEY')!;
    assert.equal(openai.value, 'sk-chipagents-shared');
  });
});

describe('getVisibleSecret', () => {
  before(() => {
    db = openDb(':memory:');
    seedDatabase(db);
  });

  const idOf = (key: string) => (db.prepare('SELECT id FROM secrets WHERE key = ?').get(key) as { id: number }).id;

  test('owner gets grants; non-owner reader gets grants=null', () => {
    const asBob = getVisibleSecret(db, callerOf('bob'), idOf('DEPLOY_KEY'))!;
    assert.equal(asBob.grants?.length, 2);
    const asCarol = getVisibleSecret(db, callerOf('carol'), idOf('DEPLOY_KEY'))!;
    assert.equal(asCarol.grants, null);
    assert.equal(asCarol.value, 'ssh-ed25519 AAAA...deploy');
  });

  test('invisible secret and nonexistent secret are indistinguishable (undefined ⇒ 404)', () => {
    assert.equal(getVisibleSecret(db, callerOf('alice'), idOf('PERSONAL_NOTE')), undefined);
    assert.equal(getVisibleSecret(db, callerOf('alice'), idOf('ACME_DB_URL')), undefined);
    assert.equal(getVisibleSecret(db, callerOf('alice'), 999_999), undefined);
  });
});
