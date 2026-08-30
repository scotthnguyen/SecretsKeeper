// Phase 0 placeholder: proves Ink 7 + React 19 + tsx work together. The CLI session replaces this.
import React from 'react';
import { render, Box, Text } from 'ink';
import { DEFAULT_SERVER_URL } from '@secrets/shared';

function App() {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold>SecretsKeeper</Text>
      <Text dimColor>scaffold OK — server: {DEFAULT_SERVER_URL}</Text>
    </Box>
  );
}

render(<App />);
