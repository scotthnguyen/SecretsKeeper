// Plays the CLI's part of the login handshake, for verifying the server end-to-end without the
// real CLI. Also a reference implementation of HANDOFF.md §"Login handshake".
//   npx tsx server/scripts/login.ts            (server must be running in session mode)
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  CLI_LOOPBACK_PATH,
  DEFAULT_SERVER_URL,
  ExchangeResponseSchema,
  LoginCallbackQuerySchema,
  MeResponseSchema,
  ROUTES,
} from '@secrets/shared';

const serverUrl = process.env.SECRETS_SERVER_URL ?? DEFAULT_SERVER_URL;
const state = randomBytes(24).toString('base64url');

const callback = new Promise<{ code?: string; error?: string }>((resolve) => {
  const loopback = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== CLI_LOOPBACK_PATH) {
      res.writeHead(404).end();
      return;
    }
    const q = LoginCallbackQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!q.success || q.data.state !== state) {
      res.writeHead(400).end('state mismatch'); // login CSRF guard
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Logged in. You can close this tab.</h1>');
    loopback.close();
    resolve(q.data);
  });
  loopback.listen(0, '127.0.0.1', () => {
    const { port } = loopback.address() as { port: number };
    const start = `${serverUrl}${ROUTES.auth.start}?state=${state}&port=${port}`;
    console.log('opening', start);
    spawn('open', [start], { stdio: 'ignore' }).unref();
  });
});

const result = await callback;
if (result.error) {
  console.error('login failed:', result.error);
  process.exit(1);
}

const exchange = await fetch(`${serverUrl}${ROUTES.auth.exchange}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: result.code }),
});
const { token, user, org } = ExchangeResponseSchema.parse(await exchange.json());
console.log(`logged in as ${user.githubLogin} (org ${org.name}, admin=${user.isAdmin})`);

const me = await fetch(`${serverUrl}${ROUTES.me}`, { headers: { Authorization: `Bearer ${token}` } });
console.log('GET /me →', MeResponseSchema.parse(await me.json()).user.githubLogin);
console.log('token (for curl):', token);
