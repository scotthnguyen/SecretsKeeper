/**
 * Authentication. Two middlewares produce the same thing — `req.caller` — so every handler is
 * independent of how the user was identified:
 *
 *   devHeaderAuth  AUTH_MODE=dev   `X-Dev-User: <githubLogin>`    (curl testing, CLI dev mode)
 *   sessionAuth    default         `Authorization: Bearer <token>` (Phase 3)
 */
import type { RequestHandler } from 'express';
import { HEADERS } from '@secrets/shared';
import type { Db } from '../db/index.js';
import type { Caller } from '../permissions.js';
import { getCaller, getUserByLogin } from '../repo/users.js';
import { ApiError, forbidden } from './errors.js';

declare global {
  namespace Express {
    interface Request {
      caller?: Caller;
    }
  }
}

const unauthenticated = (why: string) => new ApiError('unauthenticated', why);

export function devHeaderAuth(db: Db): RequestHandler {
  return (req, _res, next) => {
    const login = req.header(HEADERS.devUser);
    if (!login) {
      throw unauthenticated(`Dev mode: send ${HEADERS.devUser} header`);
    }
    const user = getUserByLogin(db, login);
    if (!user) {
      throw unauthenticated(`Dev mode: no user with GitHub login "${login}"`);
    }
    req.caller = getCaller(db, user.id);
    next();
  };
}

/** Placeholder until Phase 3 lands real sessions. */
export function sessionAuth(_db: Db): RequestHandler {
  return () => {
    throw unauthenticated('Session auth not implemented yet (start with AUTH_MODE=dev)');
  };
}

/** Handlers call this instead of touching req.caller directly; guarantees a Caller. */
export function callerOf(req: { caller?: Caller }): Caller {
  if (!req.caller) {
    throw unauthenticated('Not authenticated');
  }
  return req.caller;
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!callerOf(req).isAdmin) {
    throw forbidden('Admin only');
  }
  next();
};
