// Admin menu: user/team management inside the admin's own org. Every action is a tiny flow
// (pick → input/confirm → result) driven by one `flow` state object; the directory is refetched
// after each success so the pickers never show stale rows.
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { GithubLoginSchema, type Team, type User } from '@secrets/shared';
import { describeError } from '../api.js';
import { identityOf, useNav, useSession } from '../context.js';
import { useAsync } from '../hooks/useAsync.js';
import { CheckList } from '../ui/CheckList.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { ErrorLine, Loading, Notice, Screen } from '../ui/Screen.js';
import { TextInput } from '../ui/TextInput.js';

type Action = 'add-user' | 'promote' | 'reassign' | 'delete-user' | 'create-team' | 'delete-team';

type Flow =
  | { kind: 'menu' }
  | { kind: 'add-user'; login: string; isAdmin: boolean; field: 'login' | 'admin' }
  | { kind: 'promote'; step: 'pick' }
  | { kind: 'reassign'; step: 'pick' } | { kind: 'reassign'; step: 'teams'; user: User }
  | { kind: 'delete-user'; step: 'pick' } | { kind: 'delete-user'; step: 'confirm'; user: User }
  | { kind: 'create-team'; name: string }
  | { kind: 'delete-team'; step: 'pick' } | { kind: 'delete-team'; step: 'confirm'; team: Team }
  | { kind: 'busy'; what: string };

const ACTIONS: MenuItem<Action>[] = [
  { key: 'add-user', label: 'Add user', hint: 'provision a GitHub login so they can log in', value: 'add-user' },
  { key: 'promote', label: 'Promote to admin', hint: 'irreversible here; admins manage people, not secrets', value: 'promote' },
  { key: 'reassign', label: 'Reassign teams', hint: 'replace a user’s team memberships', value: 'reassign' },
  { key: 'delete-user', label: 'Delete user', hint: 'their secrets transfer to you', value: 'delete-user' },
  { key: 'create-team', label: 'Create team', hint: '', value: 'create-team' },
  { key: 'delete-team', label: 'Delete team', hint: 'drops its memberships and grants', value: 'delete-team' },
];

export function AdminView() {
  const { api, me, refreshMe } = useSession();
  const nav = useNav();
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dir = useAsync(async () => {
    const [users, teams] = await Promise.all([api.users(), api.teams()]);
    return { users, teams };
  }, []);
  const users = dir.data?.users ?? [];
  const teams = dir.data?.teams ?? [];
  const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

  /** Run a mutation; on success show `done`, refetch the directory and /me, return to the menu. */
  const run = async (what: string, fn: () => Promise<string>) => {
    setFlow({ kind: 'busy', what });
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
      dir.reload();
      await refreshMe().catch(() => {}); // own teams/role may have changed
    } catch (err) {
      setError(describeError(err));
    } finally {
      setFlow({ kind: 'menu' });
    }
  };

  const back = () => setFlow({ kind: 'menu' });

  // Keys for the confirm / toggle steps that do not have their own input component.
  useInput(
    (input, key) => {
      if (flow.kind === 'delete-user' && flow.step === 'confirm') {
        if (input === 'y') {
          const u = flow.user;
          void run('Deleting user', async () => {
            const r = await api.deleteUser(u.id);
            return `Deleted ${u.githubLogin}; ${r.transferredSecrets} secret${r.transferredSecrets === 1 ? '' : 's'} transferred to you.`;
          });
        } else if (input === 'n' || key.escape) back();
      } else if (flow.kind === 'delete-team' && flow.step === 'confirm') {
        if (input === 'y') {
          const t = flow.team;
          void run('Deleting team', async () => {
            await api.deleteTeam(t.id);
            return `Deleted team ${t.name}.`;
          });
        } else if (input === 'n' || key.escape) back();
      } else if (flow.kind === 'add-user' && flow.field === 'admin') {
        if (input === 'y' || input === 'n' || input === ' ' || key.leftArrow || key.rightArrow) {
          setFlow({ ...flow, isAdmin: input === 'y' ? true : input === 'n' ? false : !flow.isAdmin });
        } else if (key.return) {
          const f = flow;
          void run('Adding user', async () => {
            const u = await api.createUser(f.login, f.isAdmin);
            return `Added ${u.githubLogin}${u.isAdmin ? ' as admin' : ''}. They can log in with GitHub now.`;
          });
        } else if (key.escape) setFlow({ ...flow, field: 'login' });
      }
    },
    {
      isActive:
        (flow.kind === 'delete-user' && flow.step === 'confirm') ||
        (flow.kind === 'delete-team' && flow.step === 'confirm') ||
        (flow.kind === 'add-user' && flow.field === 'admin'),
    },
  );

  const userItems = (filter: (u: User) => boolean): MenuItem<User>[] =>
    users.filter(filter).map((u) => ({
      key: String(u.id),
      label: u.githubLogin,
      hint: [u.isAdmin ? 'admin' : null, u.teamIds.length ? u.teamIds.map(teamName).join(', ') : 'no teams'].filter(Boolean).join(' · '),
      value: u,
    }));
  const teamItems: MenuItem<Team>[] = teams.map((t) => ({
    key: String(t.id),
    label: t.name,
    hint: `${t.memberIds.length} member${t.memberIds.length === 1 ? '' : 's'}`,
    value: t,
  }));

  const title = flow.kind === 'menu' || flow.kind === 'busy' ? 'admin' : `admin · ${ACTIONS.find((a) => a.value === flow.kind)?.label.toLowerCase()}`;
  const hints: Array<[string, string]> =
    flow.kind === 'menu' ? [['↑↓', 'move'], ['enter', 'choose'], ['esc', 'back']]
    : flow.kind === 'busy' ? []
    : flow.kind === 'reassign' && flow.step === 'teams' ? [['space', 'toggle'], ['enter', 'save'], ['esc', 'back']]
    : (flow.kind === 'delete-user' || flow.kind === 'delete-team') && flow.step === 'confirm' ? [['y', 'confirm'], ['n', 'cancel']]
    : flow.kind === 'add-user' && flow.field === 'admin' ? [['y/n', 'admin?'], ['enter', 'add'], ['esc', 'back']]
    : [['enter', 'next'], ['esc', 'back']];

  return (
    <Screen title={title} identity={identityOf(me)} hints={hints}>
      {dir.status === 'loading' && !dir.data && <Loading what="Loading directory" />}
      {dir.status === 'error' && <ErrorLine message={dir.message} />}
      {dir.data && (
        <>
          {flow.kind === 'menu' && (
            <>
              <Text dimColor>Managing {me.org.name}: {users.length} people, {teams.length} teams. Admins get no secret access.</Text>
              <Box marginTop={1}>
                <Menu
                  items={ACTIONS}
                  labelWidth={18}
                  onCancel={nav.pop}
                  onKey={(input) => {
                    if (input === 'q') nav.quit();
                  }}
                  onSelect={(a) => {
                    setNotice(null);
                    setError(null);
                    if (a === 'add-user') setFlow({ kind: 'add-user', login: '', isAdmin: false, field: 'login' });
                    else if (a === 'create-team') setFlow({ kind: 'create-team', name: '' });
                    else setFlow({ kind: a, step: 'pick' });
                  }}
                />
              </Box>
            </>
          )}

          {flow.kind === 'add-user' && (
            <Box flexDirection="column">
              <Box>
                <Box width={14}><Text color={flow.field === 'login' ? 'cyan' : undefined}>GitHub login</Text></Box>
                {flow.field === 'login' ? (
                  <TextInput
                    value={flow.login}
                    onChange={(login) => setFlow({ ...flow, login })}
                    onCancel={back}
                    placeholder="exact GitHub username"
                    onSubmit={(login) => {
                      const p = GithubLoginSchema.safeParse(login);
                      if (!p.success) setError(p.error.issues[0]?.message ?? 'invalid login');
                      else {
                        setError(null);
                        setFlow({ ...flow, login, field: 'admin' });
                      }
                    }}
                  />
                ) : (
                  <Text bold>{flow.login}</Text>
                )}
              </Box>
              {flow.field === 'admin' && (
                <Box>
                  <Box width={14}><Text color="cyan">Admin?</Text></Box>
                  <Text>
                    <Text color={flow.isAdmin ? 'green' : undefined} bold={flow.isAdmin}>{flow.isAdmin ? '[x] yes' : '[ ] yes'}</Text>
                    <Text dimColor>   (y / n, Enter to add)</Text>
                  </Text>
                </Box>
              )}
              <Box marginTop={1}><Text dimColor>Only provisioned logins can sign in. The account is bound to its GitHub id on first login.</Text></Box>
            </Box>
          )}

          {flow.kind === 'promote' && (
            <Picker label="Promote whom?" items={userItems((u) => !u.isAdmin)} empty="Everyone is already an admin." onCancel={back}
              onPick={(u) => void run('Promoting', async () => `${(await api.promoteUser(u.id)).githubLogin} is now an admin.`)} />
          )}

          {flow.kind === 'reassign' && flow.step === 'pick' && (
            <Picker label="Whose teams?" items={userItems(() => true)} onCancel={back} onPick={(user) => setFlow({ kind: 'reassign', step: 'teams', user })} />
          )}
          {flow.kind === 'reassign' && flow.step === 'teams' && (
            <Box flexDirection="column">
              <Text>Teams for <Text bold>{flow.user.githubLogin}</Text> <Text dimColor>(replaces current memberships)</Text></Text>
              <CheckList
                items={teams.map((t) => ({ key: String(t.id), label: t.name, hint: `${t.memberIds.length} members`, value: t.id }))}
                initialSelected={new Set(flow.user.teamIds.map(String))}
                emptyText="No teams exist yet — create one first."
                onCancel={() => setFlow({ kind: 'reassign', step: 'pick' })}
                onSubmit={(teamIds) => {
                  const u = flow.user;
                  void run('Saving teams', async () => {
                    const updated = await api.setUserTeams(u.id, teamIds);
                    return `${updated.githubLogin} is now on: ${updated.teamIds.length ? updated.teamIds.map(teamName).join(', ') : 'no teams'}.`;
                  });
                }}
              />
            </Box>
          )}

          {flow.kind === 'delete-user' && flow.step === 'pick' && (
            <Picker label="Delete whom?" items={userItems((u) => u.id !== me.user.id)} onCancel={back}
              onPick={(user) => setFlow({ kind: 'delete-user', step: 'confirm', user })} />
          )}
          {flow.kind === 'delete-user' && flow.step === 'confirm' && (
            <Text color="red">
              Delete <Text bold>{flow.user.githubLogin}</Text>? Their secrets become yours (existing shares kept); grants naming them are dropped. (y/N)
            </Text>
          )}

          {flow.kind === 'create-team' && (
            <Box>
              <Box width={14}><Text color="cyan">Team name</Text></Box>
              <TextInput value={flow.name} onChange={(name) => setFlow({ kind: 'create-team', name })} onCancel={back} placeholder="e.g. infra"
                onSubmit={(name) => {
                  if (name.trim().length === 0) return;
                  void run('Creating team', async () => `Created team ${(await api.createTeam(name.trim())).name}.`);
                }} />
            </Box>
          )}

          {flow.kind === 'delete-team' && flow.step === 'pick' && (
            <Picker label="Delete which team?" items={teamItems} empty="No teams." onCancel={back}
              onPick={(team) => setFlow({ kind: 'delete-team', step: 'confirm', team })} />
          )}
          {flow.kind === 'delete-team' && flow.step === 'confirm' && (
            <Text color="red">
              Delete team <Text bold>{flow.team.name}</Text> ({flow.team.memberIds.length} members)? Secrets shared with it stop being shared. (y/N)
            </Text>
          )}

          {flow.kind === 'busy' && <Text dimColor>{flow.what}…</Text>}

          <Box marginTop={1} flexDirection="column">
            <Notice message={notice} />
            <ErrorLine message={error} />
          </Box>
        </>
      )}
    </Screen>
  );
}

function Picker<T>({ label, items, empty, onPick, onCancel }: { label: string; items: MenuItem<T>[]; empty?: string; onPick: (v: T) => void; onCancel: () => void }) {
  return (
    <Box flexDirection="column">
      <Text>{label}</Text>
      <Menu items={items} labelWidth={18} onSelect={onPick} onCancel={onCancel} emptyText={empty} />
    </Box>
  );
}
