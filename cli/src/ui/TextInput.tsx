// Single-line text input built on useInput (no ink-text-input). Cursor is always at the end;
// paste arrives as one multi-character `input` and is appended verbatim (newlines stripped).
import React from 'react';
import { Text, useInput } from 'ink';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  /** Render as bullets (for secret values). */
  mask?: boolean;
  placeholder?: string;
  /** Only the focused input consumes keys. */
  focus?: boolean;
};

export function TextInput({ value, onChange, onSubmit, onCancel, mask, placeholder, focus = true }: Props) {
  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.(value);
        return;
      }
      if (key.escape) {
        onCancel?.();
        return;
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1));
        return;
      }
      if (key.ctrl && input === 'u') {
        onChange('');
        return;
      }
      // Navigation / modifier chords are not text.
      if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow || key.leftArrow ||
          key.rightArrow || key.pageUp || key.pageDown || key.home || key.end) {
        return;
      }
      if (input.length > 0) onChange(value + input.replace(/[\r\n]+/g, ''));
    },
    { isActive: focus },
  );

  const shown = mask ? '•'.repeat(value.length) : value;
  const cursor = focus ? <Text inverse> </Text> : null;
  if (value.length === 0 && placeholder) {
    return (
      <Text>
        {cursor}
        <Text dimColor>{placeholder}</Text>
      </Text>
    );
  }
  return (
    <Text>
      {shown}
      {cursor}
    </Text>
  );
}
