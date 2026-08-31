// Phase 2 verification of the loopback handshake WITHOUT GitHub: we play the server's browser
// redirect ourselves with curl-equivalent fetches against the CLI's loopback.
//   npx tsx cli/scripts/login-smoke.ts         (any server mode; exchange is hit with a bogus code)
import { ApiClient, ApiError } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { LoginError, loginViaBrowser } from '../src/login.js';

const cfg = loadConfig();
const api = new ApiClient({ baseUrl: cfg.serverUrl, auth: { kind: 'anonymous' } });

function run(label: string, drive: (loopback: string, state: string, cancel: () => void) => Promise<void>) {
  return new Promise<void>((resolve) => {
    const h: ReturnType<typeof loginViaBrowser> = loginViaBrowser(api, {
      timeoutMs: 5000,
      onAuthorizeUrl: (url) => {
        const u = new URL(url);
        const state = u.searchParams.get('state')!;
        const port = u.searchParams.get('port')!;
        console.log(`${label}: authorize url ok → ${u.pathname} state.len=${state.length} port=${port}`);
        void drive(`http://127.0.0.1:${port}/callback`, state, () => h.cancel());
      },
    });
    h.result.then(
      (r) => { console.log(`${label}: LOGGED IN as ${r.user.githubLogin} (unexpected here)`); resolve(); },
      (err: unknown) => {
        const tag = err instanceof LoginError ? `LoginError(${err.reason})` : err instanceof ApiError ? `ApiError(${err.code})` : String(err);
        console.log(`${label}: rejected with ${tag}: ${(err as Error).message}`);
        resolve();
      },
    );
  });
}

await run('wrong-state', async (cb, state) => {
  const r1 = await fetch(`${cb}?state=${state}x&code=abc`);
  console.log(`   wrong state → HTTP ${r1.status} (expect 400, flow keeps waiting)`);
  const r2 = await fetch(`http://127.0.0.1:${new URL(cb).port}/nope`);
  console.log(`   other path  → HTTP ${r2.status} (expect 404)`);
  const r3 = await fetch(`${cb}?state=${state}&error=unknown_user`);
  console.log(`   unknown_user → HTTP ${r3.status} ${(await r3.text()).includes('Login failed') ? '(error page)' : ''}`);
});

await run('bogus-code', async (cb, state) => {
  const r = await fetch(`${cb}?state=${state}&code=not-a-real-code`);
  console.log(`   good state + code → HTTP ${r.status} ${(await r.text()).includes('Logged in') ? '(success page, then exchange)' : ''}`);
});

await run('cancel', async (_cb, _state, cancel) => cancel());
setTimeout(() => {}, 0);
