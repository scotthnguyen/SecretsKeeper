// Typed HTTP client over the shared contract. One `request()` does auth headers, JSON, the error
// envelope and response validation; every route is a one-line wrapper on top of it.
import type { z } from 'zod';
import {
  type CreateSecretRequest,
  type DeleteUserResponse,
  type ErrorCode,
  type ExchangeResponse,
  type Grant,
  type MeResponse,
  type SecretDetail,
  type SecretSummary,
  type Team,
  type User,
  DeleteUserResponseSchema,
  ExchangeResponseSchema,
  HEADERS,
  isErrorResponse,
  MeResponseSchema,
  OkResponseSchema,
  ROUTES,
  SecretResponseSchema,
  SecretsListResponseSchema,
  TeamResponseSchema,
  TeamsResponseSchema,
  UserResponseSchema,
  UsersResponseSchema,
} from '@secrets/shared';

/** How the client identifies the caller. Mirrors the server's two auth middlewares. */
export type Auth =
  | { kind: 'dev'; login: string }
  | { kind: 'session'; token: string }
  | { kind: 'anonymous' };

/** The server answered with the error envelope. Branch on `code`, not on the HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** fetch() itself failed (server down, wrong URL) or the body was not the contract. */
export class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type ApiClientOptions = {
  baseUrl: string;
  auth: Auth;
  /** Called once per 401 in session mode so the app can drop the session file and show login. */
  onUnauthenticated?: (err: ApiError) => void;
};

export class ApiClient {
  readonly baseUrl: string;
  readonly auth: Auth;
  private readonly onUnauthenticated: ((err: ApiError) => void) | undefined;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.auth = opts.auth;
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  /** Same server, different identity (used after login / before logout). */
  withAuth(auth: Auth): ApiClient {
    return new ApiClient({ baseUrl: this.baseUrl, auth, onUnauthenticated: this.onUnauthenticated });
  }

  async request<T>(schema: z.ZodType<T>, method: Method, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.auth.kind === 'dev') headers[HEADERS.devUser] = this.auth.login;
    if (this.auth.kind === 'session') headers[HEADERS.authorization] = `Bearer ${this.auth.token}`;

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ConnectionError(
        `Cannot reach ${this.baseUrl} (${(err as Error).message}). Is the server running?`,
      );
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      throw new ConnectionError(`${method} ${path}: server returned non-JSON (HTTP ${res.status})`);
    }

    if (isErrorResponse(json)) {
      const err = new ApiError(json.error.code, json.error.message, json.error.details);
      if (err.code === 'unauthenticated') this.onUnauthenticated?.(err);
      throw err;
    }
    if (!res.ok) {
      throw new ConnectionError(`${method} ${path}: HTTP ${res.status} without an error envelope`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Contract drift between server and CLI. Fail loudly rather than render garbage.
      throw new ConnectionError(`${method} ${path}: response did not match the contract`);
    }
    return parsed.data;
  }

  // --- auth ---------------------------------------------------------------

  exchange(code: string): Promise<ExchangeResponse> {
    return this.request(ExchangeResponseSchema, 'POST', ROUTES.auth.exchange, { code });
  }

  async logout(): Promise<void> {
    await this.request(OkResponseSchema, 'POST', ROUTES.auth.logout);
  }

  me(): Promise<MeResponse> {
    return this.request(MeResponseSchema, 'GET', ROUTES.me);
  }

  // --- directory ----------------------------------------------------------

  async users(): Promise<User[]> {
    return (await this.request(UsersResponseSchema, 'GET', ROUTES.users)).users;
  }

  async teams(): Promise<Team[]> {
    return (await this.request(TeamsResponseSchema, 'GET', ROUTES.teams)).teams;
  }

  // --- secrets ------------------------------------------------------------

  async listSecrets(): Promise<SecretSummary[]> {
    return (await this.request(SecretsListResponseSchema, 'GET', ROUTES.secrets)).secrets;
  }

  async getSecret(id: number): Promise<SecretDetail> {
    return (await this.request(SecretResponseSchema, 'GET', ROUTES.secret(id))).secret;
  }

  async createSecret(body: CreateSecretRequest): Promise<SecretDetail> {
    return (await this.request(SecretResponseSchema, 'POST', ROUTES.secrets, body)).secret;
  }

  async updateSecretValue(id: number, value: string): Promise<SecretDetail> {
    return (await this.request(SecretResponseSchema, 'PUT', ROUTES.secret(id), { value })).secret;
  }

  async setGrants(id: number, grants: Grant[]): Promise<SecretDetail> {
    return (await this.request(SecretResponseSchema, 'PUT', ROUTES.secretGrants(id), { grants }))
      .secret;
  }

  async deleteSecret(id: number): Promise<void> {
    await this.request(OkResponseSchema, 'DELETE', ROUTES.secret(id));
  }

  // --- admin --------------------------------------------------------------

  async createUser(githubLogin: string, isAdmin: boolean): Promise<User> {
    return (
      await this.request(UserResponseSchema, 'POST', ROUTES.admin.users, { githubLogin, isAdmin })
    ).user;
  }

  deleteUser(id: number): Promise<DeleteUserResponse> {
    return this.request(DeleteUserResponseSchema, 'DELETE', ROUTES.admin.user(id));
  }

  async promoteUser(id: number): Promise<User> {
    return (await this.request(UserResponseSchema, 'POST', ROUTES.admin.promoteUser(id))).user;
  }

  async setUserTeams(id: number, teamIds: number[]): Promise<User> {
    return (
      await this.request(UserResponseSchema, 'PUT', ROUTES.admin.userTeams(id), { teamIds })
    ).user;
  }

  async createTeam(name: string): Promise<Team> {
    return (await this.request(TeamResponseSchema, 'POST', ROUTES.admin.teams, { name })).team;
  }

  async deleteTeam(id: number): Promise<void> {
    await this.request(OkResponseSchema, 'DELETE', ROUTES.admin.team(id));
  }
}

/** Human-readable one-liner for any error the UI catches. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.message} (${err.code})`;
  if (err instanceof Error) return err.message;
  return String(err);
}
