import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import open from 'open';
import type { ExchangeResponse } from '@secrets/shared';
import { ApiClient, ApiError, describeError } from '../api.js';
import { loginViaBrowser, type LoginHandle } from '../login.js';
import { ErrorLine, Notice, Screen } from '../ui/Screen.js';

type Props = {
  serverUrl: string;
  notice?: string;
  tone?: 'ok' | 'warn';
  initialError?: string;
  onLoggedIn: (result: ExchangeResponse) => void;
  onQuit: () => void;
};

type State =
  | { step: 'idle'; error?: string }
  | { step: 'waiting'; url: string | null }
  | { step: 'exchanging' };

export function LoginView({ serverUrl, notice, tone, initialError, onLoggedIn, onQuit }: Props) {
  const [state, setState] = useState<State>({ step: 'idle', error: initialError });
  const handle = useRef<LoginHandle | null>(null);

  // Cancel an in-flight login if the view unmounts.
  useEffect(() => () => handle.current?.cancel(), []);

  const start = () => {
    const api = new ApiClient({ baseUrl: serverUrl, auth: { kind: 'anonymous' } });
    setState({ step: 'waiting', url: null });
    const h = loginViaBrowser(api, {
      onAuthorizeUrl: (url) => {
        setState({ step: 'waiting', url });
        // Fallback is the printed URL; a failure to spawn a browser is not a login failure.
        open(url).catch(() => {});
      },
    });
    handle.current = h;
    h.result.then(
      (result) => {
        handle.current = null;
        onLoggedIn(result);
      },
      (err: unknown) => {
        handle.current = null;
        const message =
          err instanceof ApiError && err.code === 'invalid_code'
            ? 'The one-time login code expired. Press Enter to try again.'
            : describeError(err);
        setState({ step: 'idle', error: message });
      },
    );
  };

  useInput((input, key) => {
    if (state.step === 'idle') {
      if (key.return) start();
      if (input === 'q' || key.escape) onQuit();
    } else if (state.step === 'waiting') {
      if (key.escape) handle.current?.cancel();
    }
  });

  return (
    <Screen
      title="login"
      hints={state.step === 'idle' ? [['enter', 'log in with GitHub'], ['q', 'quit']] : [['esc', 'cancel']]}
    >
      <Text>
        Server: <Text bold>{serverUrl}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        {state.step === 'idle' && (
          <>
            <Notice message={notice} tone={tone} />
            <ErrorLine message={state.error} />
            <Text>Press <Text bold>Enter</Text> to log in with GitHub. A browser window will open.</Text>
          </>
        )}
        {state.step === 'waiting' && (
          <>
            <Text>Waiting for GitHub in your browser…</Text>
            {state.url && (
              <Text dimColor>
                If nothing opened, visit: <Text underline>{state.url}</Text>
              </Text>
            )}
          </>
        )}
        {state.step === 'exchanging' && <Text>Finishing login…</Text>}
      </Box>
    </Screen>
  );
}
