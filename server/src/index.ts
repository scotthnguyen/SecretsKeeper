import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db/index.js';

if (config.authMode === 'session' && !(config.github.clientId && config.github.clientSecret)) {
  console.error('GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set (server/.env). See server/.env.example.');
  console.error('For header auth without OAuth, start with AUTH_MODE=dev.');
  process.exit(1);
}

const db = openDb(config.dbPath);
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`server listening on http://localhost:${config.port}  auth=${config.authMode}  db=${config.dbPath}`);
  if (config.authMode === 'dev') {
    console.log('DEV AUTH: identify with header  X-Dev-User: <githubLogin>');
  }
});
