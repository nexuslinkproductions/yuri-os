#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] || 'help';
const intent = process.argv.slice(3).join(' ').trim();

if (mode === 'help' || !['observe', 'plan'].includes(mode)) {
  console.log([
    'Usage:',
    '  node Scripts/yuri-lifecycle-controller.mjs observe "<intent>"',
    '  node Scripts/yuri-lifecycle-controller.mjs plan "<intent>"',
    '',
    'Observe mode produces the canonical lifecycle bundle without executing lane work.',
  ].join('\n'));
  process.exit(mode === 'help' ? 0 : 1);
}

if (!intent) {
  console.error(`${mode} requires an intent`);
  process.exit(1);
}

const route = routeIntent(intent);
const bundle = {
  schema_version: 1,
  controller_mode: mode === 'observe' ? 'observe_only' : 'plan_only',
  generated_at: new Date().toISOString(),
  advisory_only: false,
  local_truth_claim: true,
  intent: {
    text: intent,
    sha256: crypto.createHash('sha256').update(intent).digest('hex'),
  },
  route,
  artifact: {
    required: ['route-plan.json', 'verification.json', 'learning-summary.json'],
    policy: 'raw lane output remains non-canonical until artifact verification passes',
  },
  verification: {
    required_commands: [
      'npm run yuri:health',
      'npm test',
      'npm run build',
    ],
    gate: 'observe-only records failures; enforce mode is not enabled in this controller version',
  },
  memory: {
    target: '_SYSTEM/OS_KERNEL/memory.db',
    promotion_path: 'Scripts/self-improvement/weekly-comp.mjs',
    rule: 'verified summaries may become lesson candidates; raw outputs must not be promoted directly',
  },
  decision: {
    status: 'OBSERVED',
    enforce: false,
    next_step: 'Run verification and review the bundle before promotion or execution.',
  },
};

console.log(JSON.stringify(bundle, null, 2));

function routeIntent(text) {
  const result = spawnSync('node', ['Scripts/offload-contract.mjs', 'route-plan', text], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 2,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      lane: 'unknown',
      scenario: 'route-plan-failed',
      error: (result.stderr || result.stdout || '').trim(),
    };
  }
  try {
    return {
      ok: true,
      ...JSON.parse(result.stdout),
    };
  } catch {
    return {
      ok: false,
      lane: 'unknown',
      scenario: 'route-plan-non-json',
      raw: result.stdout.trim(),
    };
  }
}
