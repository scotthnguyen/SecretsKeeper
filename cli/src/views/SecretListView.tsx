import React from 'react';
import { Box, Text } from 'ink';
import type { SecretSummary } from '@secrets/shared';
import { identityOf, useNav, useSession } from '../context.js';
import { useAsync } from '../hooks/useAsync.js';
import { Menu, type MenuItem } from '../ui/Menu.js';
import { AccessBadge, ErrorLine, Loading, Screen } from '../ui/Screen.js';

const KEY_W = 26;
const OWNER_W = 16;

export function SecretListView() {
  const { api, me } = useSession();
  const nav = useNav();
  const secrets = useAsync(() => api.listSecrets(), []);

  const items: MenuItem<SecretSummary>[] = (secrets.data ?? []).map((s) => ({
    key: String(s.id),
    label: s.key,
    hint: (
      <Text>
        <Text dimColor>{s.ownerLogin.padEnd(OWNER_W)}</Text>
        <AccessBadge access={s.access} width={12} />
        {s.value === null ? <Text dimColor>(write-only, value hidden)</Text> : <Text dimColor>••••••••</Text>}
      </Text>
    ),
    value: s,
  }));

  return (
    <Screen
      title="secrets"
      identity={identityOf(me)}
      hints={[['↑↓', 'move'], ['enter', 'open'], ['n', 'new'], ['r', 'refresh'], ['esc', 'back']]}
    >
      {secrets.status === 'loading' && !secrets.data && <Loading what="Loading secrets" />}
      {secrets.status === 'error' && <ErrorLine message={secrets.message} />}
      {secrets.data && (
        <>
          <Box>
            <Text dimColor>{'  '}{'KEY'.padEnd(KEY_W)}{'OWNER'.padEnd(OWNER_W)}{'ACCESS'.padEnd(12)}VALUE</Text>
          </Box>
          <Menu
            items={items}
            labelWidth={KEY_W}
            emptyText="No secrets are visible to you. Press n to create one."
            onSelect={(s) => nav.push({ name: 'secret', id: s.id })}
            onCancel={nav.pop}
            onKey={(input) => {
              if (input === 'n') nav.push({ name: 'create' });
              if (input === 'r') secrets.reload();
              if (input === 'q') nav.quit();
            }}
          />
          <Box marginTop={1}>
            <Text dimColor>
              {secrets.data.length} visible · owner = yours · write-only entries show the key but not the value
            </Text>
          </Box>
        </>
      )}
    </Screen>
  );
}
