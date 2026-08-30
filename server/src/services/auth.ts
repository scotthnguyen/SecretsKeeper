/**
 * GitHub OAuth for a CLI, in three hops:
 *
 *   1. GET /auth/github/start?state&port   CLI-generated state + CLI loopback port are remembered,
 *                                           browser is sent to GitHub.
 *   2. GET /auth/github/callback?code&state GitHub returns. We exchange the code server-side (client
 *                                           secret never leaves the server), fetch the GitHub user,
 *                                           map it to a provisioned user, create a session, and
 *                                           redirect the browser to the CLI loopback with a
 *                                           short-lived ONE-TIME exchange code — not the token.
 *   3. POST /auth/cli/exchange {code}       CLI trades the code for the session token over a direct
 *                                           request. The token never transits a browser URL.
 *
 * Handshake state is in-memory: single process, minutes of lifetime, nothing worth persisting.
 */
import { randomBytes } from 'node:crypto';
import { CLI_LOOPBACK_PATH, SESSION_TTL_MS, type ExchangeResponse } from '@secrets/shared';
import { config } from '../config.js';
import type { Db } from '../db/index.js';
import { ApiError } from '../http/errors.js';
import { getOrg } from '../repo/orgs.js';
import { createSession } from '../repo/sessions.js';
import { listTeams } from '../repo/teams.js';
import { findUserForGithubAccount, getUserById } from '../repo/users.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 60 * 1000;

interface PendingLogin { port: number; createdAt: number }
interface PendingExchange { token: string; userId: number; createdAt: number }

const pendingLogins = new Map<string, PendingLogin>();
const pendingExchanges = new Map<string, PendingExchange>();

function sweep<T extends { createdAt: number }>(map: Map<string, T>, ttl: number): void {
  const cutoff = Date.now() - ttl;
  for (const [k, v] of map) if (v.createdAt < cutoff) map.delete(k);
}

export type LoginFailure = 'unknown_user' | 'invalid_state' | 'oauth_failed';

/** Hop 1. Returns the GitHub authorize URL to redirect the browser to. */
export function startLogin(state: string, port: number): string {
  sweep(pendingLogins, STATE_TTL_MS);
  pendingLogins.set(state, { port, createdAt: Date.now() });
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.github.clientId);
  url.searchParams.set('redirect_uri', `${config.publicUrl}/auth/github/callback`);
  url.searchParams.set('state', state);
  // No scope: the public profile (login + id) is all we need. Least privilege.
  return url.toString();
}

/** Where to send the browser after hop 2, success or failure. */
function loopbackUrl(port: number, state: string, params: Record<string, string>): string {
  const url = new URL(`http://127.0.0.1:${port}${CLI_LOOPBACK_PATH}`);
  url.searchParams.set('state', state);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Hop 2. Always resolves to a redirect URL for the browser; failures are reported to the CLI
 * loopback as `?error=` when we know where the CLI is, else thrown for the route to render.
 */
export async function completeLogin(
  db: Db,
  query: { code?: string; state?: string; error?: string },
): Promise<string> {
  sweep(pendingLogins, STATE_TTL_MS);
  const state = query.state ?? '';
  const pending = pendingLogins.get(state);
  if (!pending) {
    throw new ApiError('invalid_state', 'Login state is unknown or expired. Start again from the CLI.');
  }
  pendingLogins.delete(state); // one shot
  const fail = (error: LoginFailure) => loopbackUrl(pending.port, state, { error });

  if (!query.code || query.error) return fail('oauth_failed');

  const github = await fetchGithubUser(query.code);
  if (!github) return fail('oauth_failed');

  const user = findUserForGithubAccount(db, github);
  if (!user) {
    console.warn(`login rejected: GitHub account ${github.login} (#${github.id}) is not provisioned`);
    return fail('unknown_user');
  }

  const token = createSession(db, user.id, SESSION_TTL_MS);
  const exchangeCode = randomBytes(24).toString('base64url');
  sweep(pendingExchanges, EXCHANGE_TTL_MS);
  pendingExchanges.set(exchangeCode, { token, userId: user.id, createdAt: Date.now() });
  console.log(`login: ${user.githubLogin} (#${github.id})`);
  return loopbackUrl(pending.port, state, { code: exchangeCode });
}

/** Hop 3. One-time: the code is deleted on first use whether or not it was still valid. */
export function exchangeCode(db: Db, code: string): ExchangeResponse {
  sweep(pendingExchanges, EXCHANGE_TTL_MS);
  const pending = pendingExchanges.get(code);
  pendingExchanges.delete(code);
  if (!pending) {
    throw new ApiError('invalid_code', 'Exchange code is unknown, expired, or already used. Log in again.');
  }
  const user = getUserById(db, pending.userId)!;
  return {
    token: pending.token,
    user,
    org: getOrg(db, user.orgId)!,
    teams: listTeams(db, user.orgId).filter((t) => user.teamIds.includes(t.id)),
  };
}

/** Code → access token → /user. Returns undefined on any failure (details go to the server log). */
async function fetchGithubUser(code: string): Promise<{ id: number; login: string } | undefined> {
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: `${config.publicUrl}/auth/github/callback`,
      }),
    });
    const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!tokenBody.access_token) {
      console.warn('github token exchange failed:', tokenBody.error ?? tokenRes.status);
      return undefined;
    }
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenBody.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'secretskeeper',
      },
    });
    if (!userRes.ok) {
      console.warn('github /user failed:', userRes.status);
      return undefined;
    }
    const profile = (await userRes.json()) as { id: number; login: string };
    return { id: profile.id, login: profile.login };
  } catch (err) {
    console.warn('github request failed:', err);
    return undefined;
  }
}
