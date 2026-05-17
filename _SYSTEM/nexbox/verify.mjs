#!/usr/bin/env node
// nexbox/verify — thin wrapper around independence verifier
// Usage: node nexbox/verify [--strict] [--check=<scope>]

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERIFIER = path.join(REPO_ROOT, 'Scripts', 'independence-check.mjs');

const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [VERIFIER, ...args], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: { ...process.env, NUDIMMUD_NO_ANTHROPIC: '1' },
});

process.exit(result.status ?? 1);
