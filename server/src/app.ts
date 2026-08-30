import express from 'express';
import { ROUTES } from '@secrets/shared';
import { config } from './config.js';
import type { Db } from './db/index.js';
import { devHeaderAuth, sessionAuth } from './http/auth.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { adminRoutes } from './http/routes/admin.js';
import { logoutRoute, publicAuthRoutes } from './http/routes/auth.js';
import { meRoutes } from './http/routes/me.js';
import { secretRoutes } from './http/routes/secrets.js';

/** Build the app around an open database. Separated from listen() so tests can mount it. */
export function createApp(db: Db, authMode: 'dev' | 'session' = config.authMode): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get(ROUTES.health, (_req, res) => {
    res.json({ ok: true });
  });

  // Login handshake: the only routes reachable without a Caller.
  app.use(publicAuthRoutes(db));

  // Everything below requires a Caller.
  app.use(authMode === 'dev' ? devHeaderAuth(db) : sessionAuth(db));
  app.use(logoutRoute(db));
  app.use(meRoutes(db));
  app.use(secretRoutes(db));
  app.use(adminRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
