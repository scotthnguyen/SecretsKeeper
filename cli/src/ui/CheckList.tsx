// Multi-select list (space toggles, Enter submits). Used for team membership in the admin menu.
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type CheckItem<T> = { key: string; label: string; hint?: string; value: T };

type Props<T> = {
  items: CheckItem<T>[];
  initialSelected: Set<string>;
  onSubmit: (selected: T[]) => void;
  onCancel: () => void;
  focus?: boolean;
  emptyText?: string;
};

export function CheckList<T>({ items, initialSelected, onSubmit, onCancel, focus = true, emptyText = '(nothing to choose from)' }: Props<T>) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  useInput(
    (input, key) => {
      if (items.length > 0) {
        if (key.upArrow || input === 'k') setIndex((i) => (i === 0 ? items.length - 1 : i - 1));
        if (key.downArrow || input === 'j') setIndex((i) => (i === items.length - 1 ? 0 : i + 1));
        if (input === ' ') {
          const k = items[index]?.key;
          if (k !== undefined) {
            setSelected((s) => {
              const next = new Set(s);
              if (next.has(k)) next.delete(k);
              else next.add(k);
              return next;
            });
          }
        }
      }
      if (key.return) onSubmit(items.filter((it) => selected.has(it.key)).map((it) => it.value));
      if (key.escape) onCancel();
    },
    { isActive: focus },
  );

  if (items.length === 0) return <Text dimColor>{emptyText}</Text>;
  return (
    <Box flexDirection="column">
      {items.map((it, i) => {
        const cur = i === index;
        const on = selected.has(it.key);
        return (
          <Text key={it.key} color={cur ? 'cyan' : undefined} bold={cur}>
            {cur ? '❯ ' : '  '}
            <Text color={on ? 'green' : undefined}>{on ? '[x]' : '[ ]'}</Text> {it.label}
            {it.hint ? <Text dimColor>  {it.hint}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
