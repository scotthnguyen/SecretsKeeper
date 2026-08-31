// Root component: decides between login and the authenticated app, owns the session + nav state.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, useApp, useInput } from 'ink';
import type { MeResponse } from '@secrets/shared';
import { ApiClient, ApiError, describeError } from './api.js';
import type { Config } from './config.js';
import { NavContext, SessionContext, type Nav, type Route, type Session } from './context.js';
import { clearSession, loadSession, saveSession } from './session.js';
import { LoginView } from './views/LoginView.js';
import { MainMenu } from './views/MainMenu.js';
import { SecretListView } from './views/SecretListView.js';
import { SecretDetailView } from './views/SecretDetailView.js';
import { CreateSecretView } from './views/CreateSecretView.js';
import { DirectoryView } from './views/DirectoryView.js';
import { AdminView } from './views/AdminView.js';
import { Screen, ErrorLine } from './ui/Screen.js';

type Phase =
  | { kind: 'booting' }
  | { kind: 'login'; notice?: string; tone?: 'ok' | 'warn'; error?: string }
  | { kind: 'ready'; api: ApiClient; me: MeResponse }
  | { kind: 'fatal'; message: string };

export function App({ config }: { config: Config }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: 'booting' });
  const mode: Session['mode'] = config.devUser ? 'dev' : 'session';

  /** Any 401 while using the app in session mode: the token is dead, back to login. */
  const onUnauthenticated = useCallback(() => {
    clearSession();
    setPhase({ kind: 'login', notice: 'Your session expired or was revoked. Log in again.', tone: 'warn' });
  }, []);

  const boot = useCallback(async () => {
    setPhase({ kind: 'booting' });
    if (config.devUser) {
      const api = new ApiClient({ baseUrl: config.serverUrl, auth: { kind: 'dev', login: config.devUser } });
      try {
        setPhase({ kind: 'ready', api, me: await api.me() });
      } catch (err) {
        const hint =
          err instanceof ApiError && err.code === 'unauthenticated'
            ? ' (dev mode: is the server running with AUTH_MODE=dev, and is this login seeded?)'
            : '';
        setPhase({ kind: 'fatal', message: describeError(err) + hint });
      }
      return;
    }
    const stored = loadSession();
    if (!stored) {
      setPhase({ kind: 'login' });
      return;
    }
    const api = new ApiClient({
      baseUrl: config.serverUrl,
      auth: { kind: 'session', token: stored.token },
      onUnauthenticated,
    });
    try {
      setPhase({ kind: 'ready', api, me: await api.me() });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthenticated') return; // handled by callback
      setPhase({ kind: 'fatal', message: describeError(err) });
    }
  }, [config, onUnauthenticated]);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (phase.kind === 'booting') {
    return (
      <Screen title="starting">
        <Text dimColor>Connecting to {config.serverUrl}…</Text>
      </Screen>
    );
  }

  if (phase.kind === 'fatal') {
    return <Fatal message={phase.message} onRetry={() => void boot()} onQuit={exit} />;
  }

  if (phase.kind === 'login') {
    return (
      <LoginView
        serverUrl={config.serverUrl}
        notice={phase.notice}
        tone={phase.tone}
        initialError={phase.error}
        onLoggedIn={(result) => {
          saveSession({ serverUrl: config.serverUrl, token: result.token, user: result.user, org: result.org });
          const api = new ApiClient({
            baseUrl: config.serverUrl,
            auth: { kind: 'session', token: result.token },
            onUnauthenticated,
          });
          setPhase({ kind: 'ready', api, me: { user: result.user, org: result.org, teams: result.teams } });
        }}
        onQuit={exit}
      />
    );
  }

  return (
    <Authenticated
      api={phase.api}
      me={phase.me}
      mode={mode}
      setMe={(me) => setPhase({ kind: 'ready', api: phase.api, me })}
      onLoggedOut={() => setPhase({ kind: 'login', notice: 'Logged out.' })}
    />
  );
}

function Fatal({ message, onRetry, onQuit }: { message: string; onRetry: () => void; onQuit: () => void }) {
  useInput((input) => {
    if (input === 'r') onRetry();
    if (input === 'q') onQuit();
  });
  return (
    <Screen title="error" hints={[['r', 'retry'], ['q', 'quit']]}>
      <ErrorLine message={message} />
    </Screen>
  );
}

type AuthenticatedProps = {
  api: ApiClient;
  me: MeResponse;
  mode: Session['mode'];
  setMe: (me: MeResponse) => void;
  onLoggedOut: () => void;
};

function Authenticated({ api, me, mode, setMe, onLoggedOut }: AuthenticatedProps) {
  const { exit } = useApp();
  const [stack, setStack] = useState<Route[]>([{ name: 'menu' }]);

  const nav = useMemo<Nav>(
    () => ({
      route: stack[stack.length - 1] ?? { name: 'menu' },
      push: (route) => setStack((s) => [...s, route]),
      replace: (route) => setStack((s) => [...s.slice(0, -1), route]),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      quit: exit,
    }),
    [stack, exit],
  );

  const session = useMemo<Session>(
    () => ({
      api,
      me,
      mode,
      refreshMe: async () => setMe(await api.me()),
      logout: async () => {
        if (mode === 'dev') {
          exit();
          return;
        }
        try {
          await api.logout(); // best effort: a dead token is already logged out
        } catch {
          /* ignore */
        }
        clearSession();
        onLoggedOut();
      },
    }),
    [api, me, mode, setMe, exit, onLoggedOut],
  );

  return (
    <SessionContext.Provider value={session}>
      <NavContext.Provider value={nav}>
        <Router route={nav.route} />
      </NavContext.Provider>
    </SessionContext.Provider>
  );
}

function Router({ route }: { route: Route }) {
  switch (route.name) {
    case 'menu':
      return <MainMenu />;
    case 'secrets':
      return <SecretListView />;
    case 'secret':
      return <SecretDetailView key={route.id} id={route.id} />;
    case 'create':
      return <CreateSecretView />;
    case 'directory':
      return <DirectoryView />;
    case 'admin':
      // Admin is hidden from the menu for non-admins; the server enforces it regardless.
      return <AdminView />;
  }
}
