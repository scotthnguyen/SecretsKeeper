import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the /server workspace (this file lives in /server/src). */
export const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Load /server/.env if present. Node 21.7+ builtin; no dotenv dependency. */
try {
  process.loadEnvFile(path.join(SERVER_ROOT, '.env'));
} catch {
  // no .env — fine in dev-header mode and in tests
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  dbPath: process.env.DB_PATH ?? path.join(SERVER_ROOT, 'data', 'secrets.db'),
  /** 'dev' enables X-Dev-User header auth. Anything else = real sessions. */
  authMode: process.env.AUTH_MODE === 'dev' ? ('dev' as const) : ('session' as const),
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  },
};

if (config.authMode === 'dev' && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_MODE=dev is not allowed with NODE_ENV=production');
}
