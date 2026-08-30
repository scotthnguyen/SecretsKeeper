import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = new URL('./schema.sql', import.meta.url);

export type Db = Database.Database;

/**
 * Open (or create) the database at `file`, set pragmas, and apply schema.sql idempotently.
 * Pass ':memory:' for tests.
 */
export function openDb(file: string): Db {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  if (file !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  // Per-connection in SQLite; must be set every time.
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}
