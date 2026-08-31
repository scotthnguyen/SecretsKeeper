// Grant editor used by the create flow and by the owner's "sharing" action on a secret.
// Rows = every principal in the org (everyone / each team / each user except the owner).
// Two keys, two bits: space toggles read, w toggles write. The model keeps them independent
// (write does not imply read), so write-only is a legal, visible state.
import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Grant, Principal } from '@secrets/shared';
import { describePrincipal, type Directory } from '../format.js';

type Row = { principal: Principal; label: string; canRead: boolean; canWrite: boolean };

type Props = {
  dir: Directory;
  /** Excluded from the list: the owner always has full access. */
  ownerId: number;
  initial: Grant[];
  onSubmit: (grants: Grant[]) => void;
  onCancel: () => void;
  focus?: boolean;
  maxVisible?: number;
};

const sameId = (a: Principal, b: Principal) => a.type === b.type && a.id === b.id;

export function ShareEditor({ dir, ownerId, initial, onSubmit, onCancel, focus = true, maxVisible = 12 }: Props) {
  const principals = useMemo<Principal[]>(
    () => [
      { type: 'org', id: dir.org.id },
      ...dir.teams.map((t): Principal => ({ type: 'team', id: t.id })),
      ...dir.users.filter((u) => u.id !== ownerId).map((u): Principal => ({ type: 'user', id: u.id })),
    ],
    [dir, ownerId],
  );

  const [rows, setRows] = useState<Row[]>(() =>
    principals.map((principal) => {
      const g = initial.find((x) => sameId(x.principal, principal));
      return {
        principal,
        label: describePrincipal(principal, dir),
        canRead: g?.canRead ?? false,
        canWrite: g?.canWrite ?? false,
      };
    }),
  );
  const [index, setIndex] = useState(0);
  const top = Math.max(0, Math.min(index - maxVisible + 1, rows.length - maxVisible));

  const update = (fn: (r: Row) => Row) =>
    setRows((rs) => rs.map((r, i) => (i === index ? fn(r) : r)));

  useInput(
    (input, key) => {
      if (key.upArrow || input === 'k') setIndex((i) => (i === 0 ? rows.length - 1 : i - 1));
      if (key.downArrow || input === 'j') setIndex((i) => (i === rows.length - 1 ? 0 : i + 1));
      if (input === ' ' || input === 'r') update((r) => ({ ...r, canRead: !r.canRead }));
      if (input === 'w') update((r) => ({ ...r, canWrite: !r.canWrite }));
      if (key.return) {
        onSubmit(
          rows
            .filter((r) => r.canRead || r.canWrite)
            .map((r) => ({ principal: r.principal, canRead: r.canRead, canWrite: r.canWrite })),
        );
      }
      if (key.escape) onCancel();
    },
    { isActive: focus },
  );

  const selectedCount = rows.filter((r) => r.canRead || r.canWrite).length;
  const visible = rows.slice(top, top + maxVisible);

  return (
    <Box flexDirection="column">
      <Text>
        Share with <Text dimColor>({selectedCount} selected · space = read, w = write)</Text>
      </Text>
      <Text dimColor>  write does not include read: a write-only principal can change the value but never see it</Text>
      {top > 0 && <Text dimColor>  ↑ {top} more</Text>}
      {visible.map((row, i) => {
        const selected = top + i === index;
        const on = row.canRead || row.canWrite;
        return (
          <Box key={`${row.principal.type}:${row.principal.id}`}>
            <Text color={selected ? 'cyan' : undefined} bold={selected}>
              {selected ? '❯ ' : '  '}
              <Text color={on ? 'green' : undefined}>{on ? '[x]' : '[ ]'}</Text> {row.label.padEnd(28)}
            </Text>
            <Text color={row.canRead ? 'green' : undefined} dimColor={!row.canRead}>
              {row.canRead ? '[r]' : '[ ]'}
            </Text>
            <Text> </Text>
            <Text color={row.canWrite ? 'green' : undefined} dimColor={!row.canWrite}>
              {row.canWrite ? '[w]' : '[ ]'}
            </Text>
          </Box>
        );
      })}
      {top + maxVisible < rows.length && <Text dimColor>  ↓ {rows.length - top - maxVisible} more</Text>}
    </Box>
  );
}
