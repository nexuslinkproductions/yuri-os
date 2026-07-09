#!/usr/bin/env node
// @capability: sol-moe-openclaw-runner
// @serves: end-to-end Sol MoE planning and owner-confirmed OpenClaw execution
// @does: composes the governed company planner, deterministic router, fail-closed executor, and non-delivering OpenClaw adapter behind an explicit owner-confirmation gate
// @use: node _SYSTEM/mure/sol-moe-run.mjs --task-file <task.json> [--apply --owner-confirmed] [--include-evidence]
// @exports: OwnerConfirmationRequiredError, runSolMoeTask

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSolMoeCompany } from './sol-moe-company.mjs';
import { executeSolMoePlan } from './sol-moe-executor.mjs';
import { createOpenClawSpawn } from './sol-moe-openclaw-adapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export class OwnerConfirmationRequiredError extends Error {
  constructor() {
    super('Live Sol MoE execution requires both apply:true and ownerConfirmed:true. Plan-only mode remains available.');
    this.name = 'OwnerConfirmationRequiredError';
    this.code = 'OWNER_CONFIRMATION_REQUIRED';
  }
}

/** Plan by default; execute only through the explicit owner-confirmed effect gate. */
export async function runSolMoeTask(task = {}, opts = {}) {
  const plan = await planSolMoeCompany(task, {
    availability: opts.availability,
    includeEvidence: opts.includeEvidence === true,
    policy: opts.policy,
    rulings: opts.rulings,
    timestamp: opts.timestamp || new Date().toISOString(),
  });

  if (opts.apply !== true) {
    return Object.freeze({
      schemaVersion: 'sol-moe-run-v1',
      mode: 'plan-only-disarmed',
      plan,
      execution: null,
    });
  }
  if (opts.ownerConfirmed !== true) throw new OwnerConfirmationRequiredError();

  const spawn = opts.spawn || createOpenClawSpawn({
    apply: true,
    ownerConfirmed: true,
    executionId: opts.executionId,
    timeoutMs: opts.timeoutMs,
    maxPromptChars: opts.maxPromptChars,
  });
  const execution = await executeSolMoePlan(plan, {
    spawn,
    maxConcurrency: opts.maxConcurrency,
  });
  return Object.freeze({
    schemaVersion: 'sol-moe-run-v1',
    mode: 'owner-confirmed-live',
    plan,
    execution,
  });
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    taskFile: valueAfter('--task-file'),
    apply: argv.includes('--apply'),
    ownerConfirmed: argv.includes('--owner-confirmed'),
    includeEvidence: argv.includes('--include-evidence'),
    maxConcurrency: valueAfter('--max-concurrency'),
    timeoutMs: valueAfter('--timeout-ms'),
    executionId: valueAfter('--execution-id'),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskFile) {
    process.stderr.write('Usage: node _SYSTEM/mure/sol-moe-run.mjs --task-file <task.json> [--apply --owner-confirmed] [--include-evidence]\n');
    process.exit(2);
  }
  const taskPath = path.resolve(REPO_ROOT, args.taskFile);
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
  runSolMoeTask(task, args)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.execution?.status === 'fail-loud' ? 1 : 0;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error}\n`);
      process.exitCode = error?.code === 'OWNER_CONFIRMATION_REQUIRED' ? 2 : 1;
    });
}
