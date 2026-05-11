#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const dbArgs = args.db ? ['--db', args.db] : [];
const steps = [
  {
    name: 'backend-db-check',
    command: process.execPath,
    args: ['Scripts/backend-db-check.mjs', ...dbArgs],
  },
  {
    name: 'backend-smoke-cors-readiness',
    command: process.execPath,
    args: ['Scripts/backend-cors-hardening.test.mjs'],
  },
  {
    name: 'backend-route-audit',
    command: process.execPath,
    args: ['Scripts/backend-route-auth-matrix.test.mjs'],
  },
  {
    name: 'backend-telemetry-truth',
    command: process.execPath,
    args: ['Scripts/backend-telemetry-truth.test.mjs'],
  },
  {
    name: 'backend-gitnexus-status-truth',
    command: process.execPath,
    args: ['Scripts/backend-gitnexus-status-truth.test.mjs'],
  },
  {
    name: 'backend-db-readiness-migration-status',
    command: process.execPath,
    args: ['Scripts/backend-db-readiness-migration-status.test.mjs'],
  },
  {
    name: 'gitnexus-mcp-live-probe',
    command: process.execPath,
    args: ['Scripts/gitnexus-mcp-check.mjs'],
  },
];

if (args.dryRun) {
  process.stdout.write('BACKEND_RELEASE_GATE_DRY_RUN\n');
  for (const step of steps) {
    process.stdout.write(`${step.name}: ${formatCommand(step.command, step.args)}\n`);
  }
  process.exit(0);
}

for (const step of steps) {
  process.stdout.write(`BACKEND_RELEASE_GATE_STEP_START name=${step.name}\n`);
  const result = spawnSync(step.command, step.args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.stderr.write(`BACKEND_RELEASE_GATE_FAIL step=${step.name} status=${result.status}\n`);
    process.exit(result.status || 1);
  }

  process.stdout.write(`BACKEND_RELEASE_GATE_STEP_PASS name=${step.name}\n`);
}

process.stdout.write('BACKEND_RELEASE_GATE_PASS\n');

function parseArgs(argv) {
  const parsed = { dryRun: false, db: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (argv[index] === '--db') {
      parsed.db = argv[index + 1] || null;
      index += 1;
    }
  }
  return parsed;
}

function formatCommand(command, commandArgs) {
  const displayCommand = command === process.execPath ? 'node' : command;
  return [displayCommand, ...commandArgs].join(' ');
}
