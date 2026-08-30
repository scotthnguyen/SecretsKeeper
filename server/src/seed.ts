// `npm run seed -w server` — RESETS the database file and loads the fixture from seed-data.ts.
import fs from 'node:fs';
import { config } from './config.js';
import { openDb } from './db/index.js';
import { seedDatabase } from './seed-data.js';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(config.dbPath + suffix, { force: true });
}
const db = openDb(config.dbPath);
seedDatabase(db);
db.close();
console.log(`seeded ${config.dbPath}`);
