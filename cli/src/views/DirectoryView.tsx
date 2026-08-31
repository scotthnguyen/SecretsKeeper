// Read-only org directory: who is here and which teams they are on. Same data the share
// picker uses, shown as a browsable list.
import React from 'react';
import { Box, Text } from 'ink';
import { identityOf, useNav, useSession } from '../context.js';
import { useAsync } from '../hooks/useAsync.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { ErrorLine, Loading, Screen } from '../ui/Screen.js';

export function DirectoryView() {
  const { api, me } = useSession();
  const nav = useNav();
  const dir = useAsync(async () => {
    const [users, teams] = await Promise.all([api.users(), api.teams()]);
    return { users, teams };
  }, []);

  const items: MenuItem<null>[] = [];
  if (dir.data) {
    const { users, teams } = dir.data;
    const login = (id: number) => users.find((u) => u.id === id)?.githubLogin ?? `#${id}`;
    const teamName = (id: number) => teams.find((t) => t.id === id)?.name ?? `#${id}`;

    items.push({ key: 'h-teams', label: `TEAMS (${teams.length})`, disabled: true, value: null });
    for (const t of teams) {
      items.push({
        key: `t${t.id}`,
        label: t.name,
        hint: t.memberIds.length === 0 ? 'no members' : t.memberIds.map(login).join(', '),
        value: null,
      });
    }
    items.push({ key: 'h-users', label: `PEOPLE (${users.length})`, disabled: true, value: null });
    for (const u of users) {
      const tags = [
        u.isAdmin ? 'admin' : null,
        u.id === me.user.id ? 'you' : null,
        u.teamIds.length > 0 ? u.teamIds.map(teamName).join(', ') : 'no teams',
      ].filter(Boolean);
      items.push({ key: `u${u.id}`, label: u.githubLogin, hint: tags.join(' · '), value: null });
    }
  }

  return (
    <Screen title={`directory · ${me.org.name}`} identity={identityOf(me)} hints={[['↑↓', 'scroll'], ['r', 'refresh'], ['esc', 'back']]}>
      {dir.status === 'loading' && !dir.data && <Loading what="Loading directory" />}
      {dir.status === 'error' && <ErrorLine message={dir.message} />}
      {dir.data && (
        <>
          <Menu
            items={items}
            labelWidth={20}
            maxVisible={18}
            onSelect={() => {}}
            onCancel={nav.pop}
            onKey={(input) => {
              if (input === 'r') dir.reload();
              if (input === 'q') nav.quit();
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>Everyone here is in {me.org.name}; other organizations are invisible to you.</Text>
          </Box>
        </>
      )}
    </Screen>
  );
}
