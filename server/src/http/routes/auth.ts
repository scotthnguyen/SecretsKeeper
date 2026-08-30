import { Router } from 'express';
import { AuthStartQuerySchema, ExchangeRequestSchema, HEADERS, ROUTES, type OkResponse } from '@secrets/shared';
import type { Db } from '../../db/index.js';
import * as auth from '../../services/auth.js';
import { deleteSession } from '../../repo/sessions.js';
import { bearerToken } from '../auth.js';
import { ApiError } from '../errors.js';
import { parseBody } from '../validate.js';

/** Browser-facing + pre-session routes. Mounted BEFORE the auth middleware. */
export function publicAuthRoutes(db: Db): Router {
  const r = Router();

  r.get(ROUTES.auth.start, (req, res) => {
    const q = AuthStartQuerySchema.safeParse(req.query);
    if (!q.success) {
      throw new ApiError('validation_error', 'Expected ?state=<16..128 chars>&port=<1024..65535>', q.error.issues);
    }
    res.redirect(auth.startLogin(q.data.state, q.data.port));
  });

  r.get(ROUTES.auth.callback, async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    try {
      res.redirect(await auth.completeLogin(db, { code: q.code, state: q.state, error: q.error }));
    } catch (err) {
      // We don't know the CLI's port, so there is nowhere to redirect: render it.
      if (err instanceof ApiError && err.code === 'invalid_state') {
        res.status(400).type('html').send(page('Login failed', err.message));
        return;
      }
      throw err;
    }
  });

  r.post(ROUTES.auth.exchange, (req, res) => {
    const { code } = parseBody(ExchangeRequestSchema, req.body);
    res.json(auth.exchangeCode(db, code));
  });

  return r;
}

/** Mounted AFTER the auth middleware. Best effort: a missing token is still a successful logout. */
export function logoutRoute(db: Db): Router {
  const r = Router();
  r.post(ROUTES.auth.logout, (req, res) => {
    const token = bearerToken(req.header(HEADERS.authorization));
    if (token) deleteSession(db, token);
    const body: OkResponse = { ok: true };
    res.json(body);
  });
  return r;
}

function page(title: string, message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;line-height:1.5">
<h1>${title}</h1><p>${message}</p><p>You can close this tab.</p>`;
}
