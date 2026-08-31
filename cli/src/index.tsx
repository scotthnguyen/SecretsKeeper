import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import { loadConfig } from './config.js';

if (!process.stdin.isTTY) {
  console.error('secrets: this is an interactive TUI and needs a terminal (stdin is not a TTY).');
  process.exit(1);
}

const config = loadConfig();
render(<App config={config} />);
