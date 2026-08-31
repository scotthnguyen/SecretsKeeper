// Arrow-key list. Generic over the item; the parent owns what happens on Enter.
// Long lists scroll inside a window of `maxVisible` rows.
import React, { useEffect, useState, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';

export type MenuItem<T> = {
  key: string;
  label: string;
  /** Text (dim) or any node to the right of the label. */
  hint?: ReactNode;
  /** Rendered dim and skipped by Enter. */
  disabled?: boolean;
  value: T;
};

type Props<T> = {
  items: MenuItem<T>[];
  onSelect: (value: T, item: MenuItem<T>) => void;
  /** Esc / left arrow. */
  onCancel?: () => void;
  /** Extra single-key handlers; receives the highlighted item. */
  onKey?: (input: string, item: MenuItem<T> | undefined) => void;
  focus?: boolean;
  maxVisible?: number;
  emptyText?: string;
  /** Column width of the label so hints line up. */
  labelWidth?: number;
};

export function Menu<T>({
  items,
  onSelect,
  onCancel,
  onKey,
  focus = true,
  maxVisible = 12,
  emptyText = '(nothing here)',
  labelWidth,
}: Props<T>) {
  const [index, setIndex] = useState(0);
  const [top, setTop] = useState(0);

  // Keep the highlight valid when the list shrinks (e.g. after a delete).
  useEffect(() => {
    if (index > items.length - 1) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  // Keep the highlight inside the visible window.
  useEffect(() => {
    if (index < top) setTop(index);
    else if (index >= top + maxVisible) setTop(index - maxVisible + 1);
  }, [index, top, maxVisible]);

  useInput(
    (input, key) => {
      if (items.length > 0) {
        if (key.upArrow || input === 'k') setIndex((i) => (i === 0 ? items.length - 1 : i - 1));
        if (key.downArrow || input === 'j') setIndex((i) => (i === items.length - 1 ? 0 : i + 1));
        if (key.home) setIndex(0);
        if (key.end) setIndex(items.length - 1);
        if (key.pageUp) setIndex((i) => Math.max(0, i - maxVisible));
        if (key.pageDown) setIndex((i) => Math.min(items.length - 1, i + maxVisible));
      }
      const current = items[index];
      if (key.return || key.rightArrow) {
        if (current && !current.disabled) onSelect(current.value, current);
        return;
      }
      if (key.escape || key.leftArrow) {
        onCancel?.();
        return;
      }
      if (input && !key.ctrl && !key.meta && onKey) onKey(input, current);
    },
    { isActive: focus },
  );

  if (items.length === 0) {
    return <Text dimColor>{emptyText}</Text>;
  }

  const visible = items.slice(top, top + maxVisible);
  return (
    <Box flexDirection="column">
      {top > 0 && <Text dimColor>  ↑ {top} more</Text>}
      {visible.map((item, i) => {
        const selected = top + i === index;
        return (
          <Box key={item.key}>
            <Text color={selected ? 'cyan' : undefined} dimColor={item.disabled} bold={selected}>
              {selected ? '❯ ' : '  '}
            </Text>
            <Box width={labelWidth}>
              <Text color={selected ? 'cyan' : undefined} dimColor={item.disabled} bold={selected} wrap="truncate">
                {item.label}
              </Text>
            </Box>
            {item.hint !== undefined && (
              <Text dimColor={typeof item.hint === 'string'} wrap="truncate">
                {labelWidth ? '' : '  '}
                {item.hint}
              </Text>
            )}
          </Box>
        );
      })}
      {top + maxVisible < items.length && <Text dimColor>  ↓ {items.length - top - maxVisible} more</Text>}
    </Box>
  );
}
