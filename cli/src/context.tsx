// Two contexts every view uses: who am I (session) and where am I (nav).
import { createContext, useContext } from 'react';
import type { MeResponse } from '@secrets/shared';
import type { ApiClient } from './api.js';

export type Session = {
  api: ApiClient;
  me: MeResponse;
  /** 'dev' = X-Dev-User (no session file, "logout" just quits); 'session' = bearer token. */
  mode: 'dev' | 'session';
  /** Re-fetch /me (after admin edits that may change the caller's own teams/role). */
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
};

export type Route =
  | { name: 'menu' }
  | { name: 'secrets' }
  | { name: 'secret'; id: number }
  | { name: 'create' }
  | { name: 'directory' }
  | { name: 'admin' };

export type Nav = {
  route: Route;
  push: (route: Route) => void;
  replace: (route: Route) => void;
  /** Go back one view; at the root this is a no-op. */
  pop: () => void;
  quit: () => void;
};

export const SessionContext = createContext<Session | null>(null);
export const NavContext = createContext<Nav | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionContext');
  return s;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavContext');
  return n;
}

export function identityOf(me: MeResponse): string {
  return `${me.user.githubLogin} @ ${me.org.name}${me.user.isAdmin ? ' · admin' : ''}`;
}
