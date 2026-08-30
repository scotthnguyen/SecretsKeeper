import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

const db = openDb(config.dbPath);
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}  auth=${config.authMode}  db=${config.dbPath}`);
  if (config.authMode === 'dev') {
    console.log('DEV AUTH: identify with header  X-Dev-User: <githubLogin>');
  }
});
