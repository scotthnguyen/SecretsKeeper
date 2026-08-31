import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { identityOf, useNav, useSession, type Route } from '../context.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { Screen } from '../ui/Screen.js';

type Action = { kind: 'go'; route: Route } | { kind: 'logout' } | { kind: 'quit' };

export function MainMenu() {
  const { me, mode, logout } = useSession();
  const nav = useNav();
  const [busy, setBusy] = useState(false);

  const items: MenuItem<Action>[] = [
    { key: 'secrets', label: 'Secrets', hint: 'browse, read, edit, share', value: { kind: 'go', route: { name: 'secrets' } } },
    { key: 'create', label: 'New secret', hint: 'create and share', value: { kind: 'go', route: { name: 'create' } } },
    { key: 'directory', label: 'Directory', hint: `people and teams in ${me.org.name}`, value: { kind: 'go', route: { name: 'directory' } } },
  ];
  if (me.user.isAdmin) {
    items.push({ key: 'admin', label: 'Admin', hint: 'users and teams', value: { kind: 'go', route: { name: 'admin' } } });
  }
  items.push(
    mode === 'session'
      ? { key: 'logout', label: 'Log out', hint: 'revoke this session', value: { kind: 'logout' } }
      : { key: 'quit', label: 'Quit', hint: 'dev mode: no session to revoke', value: { kind: 'quit' } },
  );

  const run = (action: Action) => {
    if (busy) return;
    if (action.kind === 'go') nav.push(action.route);
    else if (action.kind === 'quit') nav.quit();
    else {
      setBusy(true);
      void logout();
    }
  };

  return (
    <Screen
      title="menu"
      identity={identityOf(me)}
      hints={[['↑↓', 'move'], ['enter', 'open'], ['q', 'quit']]}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          Signed in as <Text bold>{me.user.githubLogin}</Text> in <Text bold>{me.org.name}</Text>
          {me.teams.length > 0 ? <Text dimColor> · teams: {me.teams.map((t) => t.name).join(', ')}</Text> : <Text dimColor> · no teams</Text>}
          {mode === 'dev' && <Text color="yellow"> · DEV MODE</Text>}
        </Text>
      </Box>
      <Menu
        items={items}
        onSelect={run}
        onKey={(input) => {
          if (input === 'q') nav.quit();
        }}
        labelWidth={14}
        focus={!busy}
      />
      {busy && <Text dimColor>Logging out…</Text>}
    </Screen>
  );
}
