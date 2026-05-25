#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendRoot = path.join(root, '_SYSTEM', 'backend');
const tsNode = path.join(backendRoot, 'node_modules/.bin/ts-node');
const script = path.join(backendRoot, 'src/scripts/ollamaContextBench.ts');

const result = spawnSync(tsNode, [script, ...process.argv.slice(2)], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs' }),
  },
});

process.exit(result.status ?? 1);
