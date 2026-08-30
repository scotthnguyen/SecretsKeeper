import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/index.js';

/**
 * Tokens are 32 random bytes (256 bits of entropy). Only the SHA-256 of the token is stored:
 * a fast hash is the right tool because there is nothing to brute-force — bcrypt/argon2 exist to
 * slow down guessing of low-entropy passwords. Hashing here protects against database disclosure.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates a session and returns the raw token — the only time it exists in the clear. */
export function createSession(db: Db, userId: number, ttlMs: number): string {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    hashToken(token),
    expiresAt,
  );
  return token;
}

/** Returns the user id for a live token, or undefined if unknown or expired (fixed, non-sliding). */
export function findSessionUser(db: Db, token: string): number | undefined {
  const row = db
    .prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?')
    .get(hashToken(token), new Date().toISOString()) as { user_id: number } | undefined;
  return row?.user_id;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}
