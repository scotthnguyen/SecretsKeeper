// Create + share, as a short wizard: key → value → who can see it → save.
// Esc steps back; on the first step it leaves the wizard.
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { SecretKeySchema, SecretValueSchema, type Grant } from '@secrets/shared';
import { ApiError, describeError } from '../api.js';
import { identityOf, useNav, useSession } from '../context.js';
import { describePrincipal, rights, type Directory } from '../format.js';
import { useAsync } from '../hooks/useAsync.js';
import { ShareEditor } from '../ui/ShareEditor.js';
import { ErrorLine, Field, Loading, Screen } from '../ui/Screen.js';
import { TextInput } from '../ui/TextInput.js';

type Step = 'key' | 'value' | 'share' | 'confirm' | 'saving';

export function CreateSecretView() {
  const { api, me } = useSession();
  const nav = useNav();
  const [step, setStep] = useState<Step>('key');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const dirState = useAsync(async (): Promise<Directory> => {
    const [users, teams] = await Promise.all([api.users(), api.teams()]);
    return { users, teams, org: me.org };
  }, []);

  const submitKey = (k: string) => {
    const parsed = SecretKeySchema.safeParse(k);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'invalid key');
      return;
    }
    setError(null);
    setStep('value');
  };

  const submitValue = (v: string) => {
    const parsed = SecretValueSchema.safeParse(v);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'invalid value');
      return;
    }
    setError(null);
    setStep('share');
  };

  const save = async () => {
    setStep('saving');
    setError(null);
    try {
      const created = await api.createSecret({ key, value, grants });
      nav.replace({ name: 'secret', id: created.id }); // land on the new secret, not back in the wizard
    } catch (err) {
      setError(describeError(err));
      // A key collision is fixed at step 1; anything else, stay on confirm so the user can retry.
      setStep(err instanceof ApiError && err.code === 'conflict' ? 'key' : 'confirm');
    }
  };

  useInput(
    (input, key_) => {
      if (step === 'confirm') {
        if (key_.return || input === 'y') void save();
        if (key_.escape || input === 'n') setStep('share');
      }
    },
    { isActive: step === 'confirm' },
  );

  const hints: Array<[string, string]> =
    step === 'key' || step === 'value'
      ? [['enter', 'next'], ['esc', step === 'key' ? 'cancel' : 'back']]
      : step === 'share'
        ? [['space', 'toggle'], ['r', 'read'], ['w', 'write'], ['enter', 'next'], ['esc', 'back']]
        : step === 'confirm'
          ? [['enter', 'create'], ['esc', 'back']]
          : [];

  const dir = dirState.data;

  return (
    <Screen title="new secret" identity={identityOf(me)} hints={hints}>
      <Steps current={step} />
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Box width={10}>
            <Text color={step === 'key' ? 'cyan' : undefined}>key</Text>
          </Box>
          {step === 'key' ? (
            <TextInput value={key} onChange={setKey} onSubmit={submitKey} onCancel={nav.pop} placeholder="e.g. STRIPE_API_KEY (no spaces)" />
          ) : (
            <Text bold>{key}</Text>
          )}
        </Box>
        {step !== 'key' && (
          <Box>
            <Box width={10}>
              <Text color={step === 'value' ? 'cyan' : undefined}>value</Text>
            </Box>
            {step === 'value' ? (
              <TextInput value={value} onChange={setValue} onSubmit={submitValue} onCancel={() => setStep('key')} placeholder="the secret value (shown while typing)" />
            ) : (
              <Text dimColor>{'•'.repeat(Math.min(Math.max(value.length, 1), 24))}</Text>
            )}
          </Box>
        )}
        {step === 'value' && <Text dimColor>          Key is fixed after creation; the value can be changed later by any writer.</Text>}
      </Box>

      {step === 'share' && (
        <Box marginTop={1} flexDirection="column">
          {!dir && dirState.status === 'loading' && <Loading what="Loading directory" />}
          {!dir && dirState.status === 'error' && <ErrorLine message={dirState.message} />}
          {dir && (
            <ShareEditor
              dir={dir}
              ownerId={me.user.id}
              initial={grants}
              onSubmit={(g) => {
                setGrants(g);
                setStep('confirm');
              }}
              onCancel={() => setStep('value')}
            />
          )}
        </Box>
      )}

      {(step === 'confirm' || step === 'saving') && dir && (
        <Box marginTop={1} flexDirection="column">
          <Field label="shared">
            {grants.length === 0 ? <Text dimColor>nobody — only you can see it</Text> : <Text dimColor>({grants.length})</Text>}
          </Field>
          {grants.map((g) => (
            <Text key={`${g.principal.type}:${g.principal.id}`}>
              {'          '}
              {describePrincipal(g.principal, dir).padEnd(28)}
              <Text color={g.canRead ? 'green' : 'blue'}>{rights(g.canRead, g.canWrite)}</Text>
            </Text>
          ))}
          <Box marginTop={1}>
            {step === 'saving' ? <Text dimColor>Creating…</Text> : <Text>Create <Text bold>{key}</Text>? (Enter / Esc)</Text>}
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <ErrorLine message={error} />
      </Box>
    </Screen>
  );
}

function Steps({ current }: { current: Step }) {
  const order: Array<[Step, string]> = [['key', 'key'], ['value', 'value'], ['share', 'share'], ['confirm', 'confirm']];
  const idx = order.findIndex(([s]) => s === current);
  return (
    <Text dimColor>
      {order.map(([s, label], i) => (
        <Text key={s}>
          {i > 0 ? ' › ' : ''}
          <Text color={s === current ? 'cyan' : undefined} bold={s === current} dimColor={i > idx && current !== 'saving'}>
            {label}
          </Text>
        </Text>
      ))}
    </Text>
  );
}
