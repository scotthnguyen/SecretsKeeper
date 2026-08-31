// Every view renders inside Screen: title bar with identity, body, then a footer of key hints.
import React, { type ReactNode } from 'react';
import { Box, Text } from 'ink';

type Props = {
  title: string;
  /** e.g. "alice @ chipagents · admin" */
  identity?: string;
  /** Pairs of [key, action] shown in the footer. */
  hints?: Array<[string, string]>;
  children: ReactNode;
};

export function Screen({ title, identity, hints = [], children }: Props) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text bold color="magenta">secrets</Text>
          <Text dimColor> › </Text>
          <Text bold>{title}</Text>
        </Text>
        {identity && <Text dimColor>{identity}</Text>}
      </Box>
      <Box flexDirection="column" marginY={1}>{children}</Box>
      {hints.length > 0 && (
        <Text dimColor>
          {hints.map(([k, action], i) => (
            <Text key={k + action}>
              {i > 0 ? '   ' : ''}
              <Text bold>{k}</Text> {action}
            </Text>
          ))}
        </Text>
      )}
    </Box>
  );
}

export function ErrorLine({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Text color="red">
      ✖ {message}
    </Text>
  );
}

export function Notice({ message, tone = 'ok' }: { message: string | null | undefined; tone?: 'ok' | 'warn' }) {
  if (!message) return null;
  return (
    <Text color={tone === 'ok' ? 'green' : 'yellow'}>
      {tone === 'ok' ? '✔' : '!'} {message}
    </Text>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <Text dimColor>{what}…</Text>;
}

/** Simple "label: value" row with aligned labels. */
export function Field({ label, children, width = 10 }: { label: string; children: ReactNode; width?: number }) {
  return (
    <Box>
      <Box width={width}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text>{children}</Text>
    </Box>
  );
}

/** Access badge: owner / read / write / read+write. `width` pads so columns line up. */
export function AccessBadge({ access, width = 0 }: { access: { isOwner: boolean; canRead: boolean; canWrite: boolean }; width?: number }) {
  if (access.isOwner) return <Text color="yellow">{'owner'.padEnd(width)}</Text>;
  const parts: string[] = [];
  if (access.canRead) parts.push('read');
  if (access.canWrite) parts.push('write');
  return <Text color={access.canRead ? 'green' : 'blue'}>{(parts.join('+') || 'none').padEnd(width)}</Text>;
}
