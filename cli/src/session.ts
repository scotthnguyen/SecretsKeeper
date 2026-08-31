// Persistent login: ~/.config/secrets-cli/session.json (dir 0700, file 0600).
// Holds the opaque bearer token plus a cached copy of user/org for instant header rendering;
// the cache is refreshed from GET /me on every start, the token is the only thing that matters.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { OrgSchema, UserSchema } from '@secrets/shared';

export const SessionFileSchema = z.object({
  serverUrl: z.string(),
  token: z.string().min(1),
  user: UserSchema,
  org: OrgSchema,
});
export type SessionFile = z.infer<typeof SessionFileSchema>;

export const DEFAULT_SESSION_PATH = path.join(os.homedir(), '.config', 'secrets-cli', 'session.json');

/** Returns the stored session, or null if there is none or the file is unreadable/invalid. */
export function loadSession(file: string = DEFAULT_SESSION_PATH): SessionFile | null {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const parsed = SessionFileSchema.safeParse(safeJson(text));
  if (!parsed.success) {
    // A corrupt session file is indistinguishable from "logged out"; remove it so it stops
    // failing on every start.
    clearSession(file);
    return null;
  }
  return parsed.data;
}

export function saveSession(session: SessionFile, file: string = DEFAULT_SESSION_PATH): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // Write to a sibling temp file and rename so a crash mid-write never leaves a half token.
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function clearSession(file: string = DEFAULT_SESSION_PATH): void {
  try {
    fs.unlinkSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
