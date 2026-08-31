// The CLI side of the GitHub OAuth handshake. Same shape as server/scripts/login.ts:
//   loopback on 127.0.0.1:<random> → browser → server → GitHub → server → browser → loopback
//   loopback receives a one-time exchange code (never the token) → POST /auth/cli/exchange
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { CLI_LOOPBACK_PATH, LoginCallbackQuerySchema, ROUTES, type ExchangeResponse } from '@secrets/shared';
import type { ApiClient } from './api.js';

export type LoginFailure = 'unknown_user' | 'invalid_state' | 'oauth_failed' | 'timeout' | 'cancelled';

export class LoginError extends Error {
  constructor(readonly reason: LoginFailure) {
    super(LOGIN_MESSAGES[reason]);
    this.name = 'LoginError';
  }
}

const LOGIN_MESSAGES: Record<LoginFailure, string> = {
  unknown_user:
    'Your GitHub account is not provisioned in any organization. Ask an admin to add your GitHub login.',
  invalid_state: 'Login state expired or did not match. Try again.',
  oauth_failed: 'GitHub denied the request or the code exchange failed. Try again.',
  timeout: 'Timed out waiting for the browser. Try again.',
  cancelled: 'Login cancelled.',
};

export type LoginOptions = {
  /** Receives the URL to open in the browser (the caller decides how — `open` package + printed fallback). */
  onAuthorizeUrl: (url: string) => void;
  /** Whole flow deadline; the loopback is closed when it fires. Default 5 minutes. */
  timeoutMs?: number;
};

const LOOPBACK_PAGE = `<!doctype html><meta charset="utf-8"><title>Secrets CLI</title>
<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;text-align:center">
<h1>Logged in</h1><p>You can close this tab and return to the terminal.</p></body>`;
const LOOPBACK_ERROR_PAGE = (why: string) => `<!doctype html><meta charset="utf-8"><title>Secrets CLI</title>
<body style="font-family:system-ui;margin:4rem auto;max-width:32rem;text-align:center">
<h1>Login failed</h1><p>${why}</p><p>Return to the terminal.</p></body>`;

export type LoginHandle = {
  /** Resolves with token + user + org + teams. Rejects with LoginError for the callback error
   *  codes / timeout / cancel, or ApiError('invalid_code') if the one-time code was already spent
   *  (caller should just start over). */
  result: Promise<ExchangeResponse>;
  /** Tear down the loopback (Esc in the UI). */
  cancel: () => void;
};

export function loginViaBrowser(api: ApiClient, opts: LoginOptions): LoginHandle {
  const state = randomBytes(24).toString('base64url'); // 32 chars, within schema's 16–128
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  let cancel: () => void = () => {};

  const callback = new Promise<{ code?: string; error?: LoginFailure }>((resolve, reject) => {
    const loopback = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== CLI_LOOPBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      const q = LoginCallbackQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!q.success || q.data.state !== state) {
        // Login CSRF guard: a callback we did not initiate is ignored, the flow keeps waiting.
        res.writeHead(400).end('state mismatch');
        return;
      }
      const body = q.data.error ? LOOPBACK_ERROR_PAGE(LOGIN_MESSAGES[q.data.error]) : LOOPBACK_PAGE;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
      finish();
      resolve(q.data);
    });

    const timer = setTimeout(() => {
      finish();
      reject(new LoginError('timeout'));
    }, timeoutMs);

    const finish = () => {
      clearTimeout(timer);
      loopback.close();
      // Keep-alive connections from the browser must not hold the process open.
      loopback.closeAllConnections();
    };
    cancel = () => {
      finish();
      reject(new LoginError('cancelled'));
    };
    // If the UI unmounts (Ctrl+C) while we wait, the loopback alone must not keep the process alive.
    loopback.unref();

    loopback.once('error', (err) => {
      finish();
      reject(err);
    });
    loopback.listen(0, '127.0.0.1', () => {
      const { port } = loopback.address() as { port: number };
      const params = new URLSearchParams({ state, port: String(port) });
      opts.onAuthorizeUrl(`${api.baseUrl}${ROUTES.auth.start}?${params}`);
    });
  });

  const result = callback.then((r) => {
    if (r.error) throw new LoginError(r.error);
    if (!r.code) throw new LoginError('oauth_failed');
    return api.exchange(r.code);
  });
  return { result, cancel: () => cancel() };
}
