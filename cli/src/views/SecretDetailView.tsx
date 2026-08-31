import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Grant, SecretDetail } from '@secrets/shared';
import { describeError } from '../api.js';
import { identityOf, useNav, useSession } from '../context.js';
import { describePrincipal, mask, rights, shortDate, type Directory } from '../format.js';
import { useAsync } from '../hooks/useAsync.js';
import { ShareEditor } from '../ui/ShareEditor.js';
import { AccessBadge, ErrorLine, Field, Loading, Notice, Screen } from '../ui/Screen.js';
import { TextInput } from '../ui/TextInput.js';

type Mode =
  | { kind: 'view' }
  | { kind: 'edit-value'; draft: string }
  | { kind: 'edit-grants' }
  | { kind: 'confirm-delete' }
  | { kind: 'saving'; what: string };

export function SecretDetailView({ id }: { id: number }) {
  const { api, me } = useSession();
  const nav = useNav();
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [revealed, setRevealed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One override so a successful save shows immediately without a refetch round-trip.
  const [local, setLocal] = useState<SecretDetail | null>(null);

  const loaded = useAsync(
    async () => {
      const [secret, users, teams] = await Promise.all([api.getSecret(id), api.users(), api.teams()]);
      return { secret, dir: { users, teams, org: me.org } satisfies Directory };
    },
    [id],
  );
  useEffect(() => setLocal(null), [loaded.data]);

  const secret = local ?? loaded.data?.secret ?? null;
  const dir = loaded.data?.dir ?? null;

  const save = async (what: string, fn: () => Promise<SecretDetail | null>) => {
    setMode({ kind: 'saving', what });
    setError(null);
    try {
      const updated = await fn();
      if (updated) setLocal(updated);
      setNotice(what);
      setMode({ kind: 'view' });
    } catch (err) {
      setError(describeError(err));
      setMode({ kind: 'view' });
    }
  };

  useInput(
    (input, key) => {
      if (!secret) {
        if (key.escape) nav.pop();
        return;
      }
      if (mode.kind === 'view') {
        if (key.escape) nav.pop();
        if (input === 'v' && secret.access.canRead) setRevealed((r) => !r);
        if (input === 'e' && secret.access.canWrite) {
          setNotice(null);
          setMode({ kind: 'edit-value', draft: secret.value ?? '' });
        }
        if (input === 's' && secret.access.isOwner) {
          setNotice(null);
          setMode({ kind: 'edit-grants' });
        }
        if (input === 'd' && secret.access.isOwner) setMode({ kind: 'confirm-delete' });
        if (input === 'r') loaded.reload();
        if (input === 'q') nav.quit();
      } else if (mode.kind === 'confirm-delete') {
        if (input === 'y') {
          void save('Deleted', async () => {
            await api.deleteSecret(secret.id);
            nav.pop();
            return null;
          });
        } else if (input === 'n' || key.escape) setMode({ kind: 'view' });
      }
    },
    { isActive: mode.kind !== 'edit-value' && mode.kind !== 'edit-grants' },
  );

  const hints: Array<[string, string]> = [];
  if (secret && mode.kind === 'view') {
    if (secret.access.canRead) hints.push(['v', revealed ? 'hide value' : 'reveal value']);
    if (secret.access.canWrite) hints.push(['e', 'edit value']);
    if (secret.access.isOwner) hints.push(['s', 'sharing'], ['d', 'delete']);
    hints.push(['r', 'refresh'], ['esc', 'back']);
  } else if (mode.kind === 'edit-value') hints.push(['enter', 'save'], ['esc', 'cancel']);
  else if (mode.kind === 'confirm-delete') hints.push(['y', 'delete'], ['n', 'keep']);
  else if (mode.kind === 'edit-grants') hints.push(['space', 'read'], ['w', 'write'], ['enter', 'save'], ['esc', 'cancel']);

  return (
    <Screen title={secret ? secret.key : 'secret'} identity={identityOf(me)} hints={hints}>
      {!secret && loaded.status === 'loading' && <Loading what="Loading secret" />}
      {!secret && loaded.status === 'error' && <ErrorLine message={loaded.message} />}
      {secret && dir && (
        <>
          <Field label="key">
            <Text bold>{secret.key}</Text>
          </Field>
          <Field label="owner">
            {secret.ownerLogin}
            {secret.access.isOwner ? <Text dimColor> (you)</Text> : null}
          </Field>
          <Field label="access">
            <AccessBadge access={secret.access} />
          </Field>
          <Field label="updated">
            <Text dimColor>{shortDate(secret.updatedAt)}</Text>
          </Field>

          <Box marginTop={1} flexDirection="column">
            {mode.kind === 'edit-value' ? (
              <Box>
                <Box width={10}>
                  <Text color="cyan">new value</Text>
                </Box>
                <TextInput
                  value={mode.draft}
                  onChange={(draft) => setMode({ kind: 'edit-value', draft })}
                  onSubmit={(draft) => void save('Value updated', () => api.updateSecretValue(secret.id, draft))}
                  onCancel={() => setMode({ kind: 'view' })}
                  placeholder="type the new value, Enter to save"
                />
              </Box>
            ) : (
              <Field label="value">
                {secret.value === null ? (
                  <Text dimColor>hidden — you have write access but not read</Text>
                ) : revealed ? (
                  <Text color="green">{secret.value}</Text>
                ) : (
                  <Text dimColor>{mask(secret.value)}  (v to reveal)</Text>
                )}
              </Field>
            )}
          </Box>

          <Box marginTop={1} flexDirection="column">
            {mode.kind === 'edit-grants' ? (
              <ShareEditor
                dir={dir}
                ownerId={secret.ownerId}
                initial={secret.grants ?? []}
                onSubmit={(grants: Grant[]) => void save('Sharing updated', () => api.setGrants(secret.id, grants))}
                onCancel={() => setMode({ kind: 'view' })}
              />
            ) : (
              <GrantList secret={secret} dir={dir} />
            )}
          </Box>

          {mode.kind === 'confirm-delete' && (
            <Box marginTop={1}>
              <Text color="red">Delete {secret.key}? This removes it for everyone it is shared with. (y/N)</Text>
            </Box>
          )}
          {mode.kind === 'saving' && <Text dimColor>{mode.what}…</Text>}
          <Box marginTop={1} flexDirection="column">
            <Notice message={notice} />
            <ErrorLine message={error} />
          </Box>
        </>
      )}
    </Screen>
  );
}

function GrantList({ secret, dir }: { secret: SecretDetail; dir: Directory }) {
  if (secret.grants === null) {
    return <Text dimColor>Sharing: only the owner can see who else has access.</Text>;
  }
  return (
    <Box flexDirection="column">
      <Text>
        Shared with{' '}
        {secret.grants.length === 0 ? <Text dimColor>nobody (only you)</Text> : <Text dimColor>({secret.grants.length})</Text>}
      </Text>
      {secret.grants.map((g) => (
        <Box key={`${g.principal.type}:${g.principal.id}`}>
          <Text>
            {'  '}
            {describePrincipal(g.principal, dir).padEnd(28)}
            <Text color={g.canRead ? 'green' : 'blue'}>{rights(g.canRead, g.canWrite)}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  );
}
