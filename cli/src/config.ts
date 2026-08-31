// Everything the CLI reads from the environment, resolved once at startup.
import { CLI_ENV, DEFAULT_SERVER_URL } from '@secrets/shared';

export type Config = {
  /** Base URL of the API server (no trailing slash). */
  serverUrl: string;
  /** If set, skip OAuth and send `X-Dev-User: <login>`. Server must run with AUTH_MODE=dev. */
  devUser: string | undefined;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const raw = env[CLI_ENV.serverUrl]?.trim();
  const serverUrl = (raw && raw.length > 0 ? raw : DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const devUser = env[CLI_ENV.devUser]?.trim();
  return { serverUrl, devUser: devUser && devUser.length > 0 ? devUser : undefined };
}
