/**
 * Fixture used by `npm run seed` and by the integration tests. Documented in HANDOFF.md — the
 * CLI session builds its demo flows around these exact logins, teams, and secrets.
 */
import type { Db } from './db/index.js';
import { createOrg } from './repo/orgs.js';
import { createUser } from './repo/users.js';
import { addMember, createTeam } from './repo/teams.js';
import { createSecret } from './repo/secrets.js';

export function seedDatabase(db: Db): void {
  db.transaction(() => {
    // ---- org 1: chipagents ---------------------------------------------------------------
    const chip = createOrg(db, 'chipagents');
    const scott = createUser(db, { orgId: chip.id, githubLogin: 'scotthnguyen', isAdmin: true });
    createUser(db, { orgId: chip.id, githubLogin: 'dannyrose30', isAdmin: true });
    const alice = createUser(db, { orgId: chip.id, githubLogin: 'alice' });
    const bob = createUser(db, { orgId: chip.id, githubLogin: 'bob' });
    const carol = createUser(db, { orgId: chip.id, githubLogin: 'carol' });
    const dave = createUser(db, { orgId: chip.id, githubLogin: 'dave' });

    const platform = createTeam(db, { orgId: chip.id, name: 'platform' });
    const firmware = createTeam(db, { orgId: chip.id, name: 'firmware' });
    addMember(db, platform.id, alice.id);
    addMember(db, platform.id, carol.id);
    addMember(db, firmware.id, bob.id);
    addMember(db, firmware.id, carol.id);
    // dave is on no team

    createSecret(db, {
      orgId: chip.id, ownerId: alice.id, key: 'DATABASE_URL', value: 'postgres://db.internal/chip',
      grants: [
        { principal: { type: 'team', id: platform.id }, canRead: true, canWrite: true },
        { principal: { type: 'team', id: firmware.id }, canRead: true, canWrite: false },
      ],
    });
    createSecret(db, {
      orgId: chip.id, ownerId: bob.id, key: 'DEPLOY_KEY', value: 'ssh-ed25519 AAAA...deploy',
      grants: [
        { principal: { type: 'user', id: carol.id }, canRead: true, canWrite: false },
        { principal: { type: 'user', id: dave.id }, canRead: false, canWrite: true }, // write-only
      ],
    });
    createSecret(db, {
      orgId: chip.id, ownerId: scott.id, key: 'OPENAI_API_KEY', value: 'sk-chipagents-shared',
      grants: [{ principal: { type: 'org', id: chip.id }, canRead: true, canWrite: false }],
    });
    createSecret(db, {
      orgId: chip.id, ownerId: carol.id, key: 'NPM_TOKEN', value: 'npm_carol_token',
      grants: [
        { principal: { type: 'user', id: alice.id }, canRead: true, canWrite: true },
        { principal: { type: 'team', id: platform.id }, canRead: true, canWrite: false },
      ],
    });
    createSecret(db, {
      orgId: chip.id, ownerId: dave.id, key: 'PERSONAL_NOTE', value: 'only dave can see this',
      grants: [],
    });

    // ---- org 2: acme (proves isolation) ----------------------------------------------------
    const acme = createOrg(db, 'acme');
    const erin = createUser(db, { orgId: acme.id, githubLogin: 'erin', isAdmin: true });
    const frank = createUser(db, { orgId: acme.id, githubLogin: 'frank' });
    const core = createTeam(db, { orgId: acme.id, name: 'acme-core' });
    addMember(db, core.id, erin.id);
    addMember(db, core.id, frank.id);
    createSecret(db, {
      orgId: acme.id, ownerId: erin.id, key: 'ACME_DB_URL', value: 'postgres://db.acme/main',
      grants: [{ principal: { type: 'org', id: acme.id }, canRead: true, canWrite: true }],
    });
  })();
}
