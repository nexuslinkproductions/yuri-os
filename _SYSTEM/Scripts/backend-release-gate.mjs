#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const args = parseArgs(process.argv.slice(2));

if (!args.db && !args.allowLiveDb) {
  process.stderr.write(
    releaseGateLine('FAIL', {
      reason: '"implicit live DB check refused"',
      required: '"--db <candidate> or --allow-live-db"',
    })
  );
  process.exit(1);
}

const dbArgs = args.db ? ['--db', args.db] : ['--allow-live-db'];
const steps = [
  {
    name: 'generated-artifact-hygiene',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/generated-artifact-hygiene.test.mjs'],
  },
  {
    name: 'backend-db-check',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-db-check.mjs', ...dbArgs],
  },
  {
    name: 'backend-smoke-cors-readiness',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-cors-hardening.test.mjs'],
  },
  {
    name: 'backend-route-audit',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-route-auth-matrix.test.mjs'],
  },
  {
    name: 'backend-telemetry-truth',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-telemetry-truth.test.mjs'],
  },
  {
    name: 'backend-observability-truth',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-observability-truth.test.mjs'],
  },
  {
    name: 'backend-gitnexus-status-truth',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-gitnexus-status-truth.test.mjs'],
  },
  {
    name: 'backend-db-readiness-migration-status',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-db-readiness-migration-status.test.mjs'],
  },
  {
    name: 'backend-db-readiness-recovery-metadata',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/backend-db-readiness-recovery-metadata.test.mjs'],
  },
  {
    name: 'wiki-rag-health-truth',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/wiki-rag-health-truth.test.mjs'],
  },
  {
    name: 'archive-rag-health-truth',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/archive-rag-health-truth.test.mjs'],
  },
  {
    name: 'rag-db-health-fixtures',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/rag-db-health-fixtures.test.mjs'],
  },
  {
    name: 'gitnexus-mcp-live-probe',
    command: process.execPath,
    args: ['_SYSTEM/Scripts/gitnexus-mcp-check.mjs'],
  },
];

if (args.dryRun) {
  process.stdout.write(releaseGateLine('DRY_RUN'));
  for (const step of steps) {
    process.stdout.write(`${step.name}: ${formatCommand(step.command, step.args)}\n`);
  }
  process.exit(0);
}

for (const step of steps) {
  process.stdout.write(releaseGateLine('STEP_START', { name: step.name }));
  const result = spawnSync(step.command, step.args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.stderr.write(releaseGateLine('FAIL', { step: step.name, status: result.status }));
    process.exit(result.status || 1);
  }

  process.stdout.write(releaseGateLine('STEP_PASS', { name: step.name }));
}

process.stdout.write(releaseGateLine('PASS'));

function parseArgs(argv) {
  const parsed = { dryRun: false, db: null, allowLiveDb: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (argv[index] === '--allow-live-db') {
      parsed.allowLiveDb = true;
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
  return [displayCommand, ...commandArgs.map(formatDisplayArg)].join(' ');
}

function formatDisplayArg(arg) {
  return arg;
}

function releaseGateLine(event, fields = {}) {
  const parts = [`YURI_BACKEND_RELEASE_GATE_${event}`, 'system=YURI_OS'];
  for (const [key, value] of Object.entries(fields)) {
    parts.push(`${key}=${value}`);
  }
  return `${parts.join(' ')}\n`;
}
