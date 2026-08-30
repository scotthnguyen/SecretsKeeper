/** Default server base URL. CLI overrides with SECRETS_SERVER_URL. */
export const DEFAULT_SERVER_URL = 'http://localhost:4000';

/** Header names (lower-case; Node lower-cases incoming headers anyway). */
export const HEADERS = {
  /** Real auth: `Authorization: Bearer <token>` */
  authorization: 'authorization',
  /** Dev auth (server started with AUTH_MODE=dev): `X-Dev-User: <githubLogin>` */
  devUser: 'x-dev-user',
} as const;

/** Environment variables the CLI reads. */
export const CLI_ENV = {
  /** Base URL of the server. Default DEFAULT_SERVER_URL. */
  serverUrl: 'SECRETS_SERVER_URL',
  /** If set, CLI skips OAuth and sends X-Dev-User with this login. Server must be AUTH_MODE=dev. */
  devUser: 'SECRETS_DEV_USER',
} as const;

/** Session lifetime. Fixed, non-sliding. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Path the CLI's loopback server listens on; the server redirects the browser here. */
export const CLI_LOOPBACK_PATH = '/callback';
