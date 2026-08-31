// Phase 1 verification: exercises the API client (dev-header auth) and the session file
// round-trip, without any UI.  Server must be running with AUTH_MODE=dev.
//   SECRETS_DEV_USER=alice npx tsx cli/scripts/api-smoke.ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { ApiClient, ApiError, describeError } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { clearSession, loadSession, saveSession } from '../src/session.js';

const cfg = loadConfig();
if (!cfg.devUser) {
  console.error('set SECRETS_DEV_USER=<login> (server must run with AUTH_MODE=dev)');
  process.exit(1);
}
const api = new ApiClient({ baseUrl: cfg.serverUrl, auth: { kind: 'dev', login: cfg.devUser } });

const me = await api.me();
console.log(`GET /me           → ${me.user.githubLogin} @ ${me.org.name} admin=${me.user.isAdmin} teams=[${me.teams.map((t) => t.name).join(', ')}]`);

const secrets = await api.listSecrets();
console.log(`GET /secrets      → ${secrets.length} visible`);
for (const s of secrets) {
  const a = s.access;
  const flags = `${a.isOwner ? 'O' : '-'}${a.canRead ? 'R' : '-'}${a.canWrite ? 'W' : '-'}`;
  console.log(`   ${flags}  ${s.key.padEnd(18)} owner=${s.ownerLogin.padEnd(14)} value=${s.value === null ? '(hidden: write-only)' : JSON.stringify(s.value)}`);
}

if (secrets[0]) {
  const d = await api.getSecret(secrets[0].id);
  console.log(`GET /secrets/${d.id}   → ${d.key}, grants=${d.grants === null ? 'null (not owner)' : JSON.stringify(d.grants)}`);
}

try {
  await api.getSecret(999_999);
} catch (err) {
  console.log(`GET /secrets/999999 → ${describeError(err)}  [expected not_found]`);
  if (!(err instanceof ApiError) || err.code !== 'not_found') throw err;
}

try {
  await api.withAuth({ kind: 'dev', login: 'nobody-such' }).me();
} catch (err) {
  console.log(`GET /me as nobody → ${describeError(err)}  [expected unauthenticated]`);
  if (!(err instanceof ApiError) || err.code !== 'unauthenticated') throw err;
}

// Session file round-trip in a temp dir (never touches ~/.config).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-cli-'));
const file = path.join(tmp, 'session.json');
saveSession({ serverUrl: cfg.serverUrl, token: 'not-a-real-token', user: me.user, org: me.org }, file);
const mode = fs.statSync(file).mode & 0o777;
const back = loadSession(file);
console.log(`session.json      → mode=${mode.toString(8)} reloaded user=${back?.user.githubLogin}`);
fs.writeFileSync(file, '{ corrupt');
console.log(`corrupt session   → loadSession=${loadSession(file)} fileRemoved=${!fs.existsSync(file)}`);
clearSession(file); // idempotent on a missing file
fs.rmSync(tmp, { recursive: true });
console.log('OK');
