#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL_CLI = path.join(REPO_ROOT, 'NEURAL-NETWORK/GitNexus/gitnexus/dist/cli/index.js');
const FALLBACK_PACKAGE = 'gitnexus@1.6.2';

const passthroughArgs = process.argv.slice(2);
const gitnexusArgs = passthroughArgs.length > 0 ? passthroughArgs : ['mcp'];

let command;
let args;

if (fs.existsSync(LOCAL_CLI)) {
  command = process.execPath;
  args = [LOCAL_CLI, ...gitnexusArgs];
} else {
  command = 'npx';
  args = ['--yes', FALLBACK_PACKAGE, ...gitnexusArgs];
}

const child = spawn(command, args, {
  cwd: REPO_ROOT,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`gitnexus wrapper failed: ${error.message}`);
  process.exit(1);
});
