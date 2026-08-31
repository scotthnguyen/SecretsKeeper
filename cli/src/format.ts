// Presentation helpers shared by views.
import type { Org, Principal, Team, User } from '@secrets/shared';

export type Directory = { users: User[]; teams: Team[]; org: Org };

/** "user alice" / "team platform" / "everyone in chipagents" — never a bare id. */
export function describePrincipal(p: Principal, dir: Directory): string {
  switch (p.type) {
    case 'user':
      return `user ${dir.users.find((u) => u.id === p.id)?.githubLogin ?? `#${p.id}`}`;
    case 'team':
      return `team ${dir.teams.find((t) => t.id === p.id)?.name ?? `#${p.id}`}`;
    case 'org':
      return `everyone in ${dir.org.name}`;
  }
}

export function rights(canRead: boolean, canWrite: boolean): string {
  if (canRead && canWrite) return 'read+write';
  if (canRead) return 'read';
  if (canWrite) return 'write';
  return 'none';
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

export function mask(value: string): string {
  return '•'.repeat(Math.min(Math.max(value.length, 4), 24));
}
