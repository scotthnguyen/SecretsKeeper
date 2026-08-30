import type { Org } from '@secrets/shared';
import type { Db } from '../db/index.js';

export function createOrg(db: Db, name: string): Org {
  const id = Number(db.prepare('INSERT INTO organizations (name) VALUES (?)').run(name).lastInsertRowid);
  return { id, name };
}

export function getOrg(db: Db, id: number): Org | undefined {
  return db.prepare('SELECT id, name FROM organizations WHERE id = ?').get(id) as Org | undefined;
}
