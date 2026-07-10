#!/usr/bin/env node
// @capability: sol-moe-native-intent-runner
// @serves: Sol MoE planning and native sessions_spawn intent compilation
// @does: composes the governed company planner with the pure native dispatch reducer; the parent OpenClaw session executes returned actions through sessions_spawn
// @use: node _SYSTEM/mure/sol-moe-run.mjs --task-file <task.json> [--include-evidence]
// @exports: NativeParentRequiredError, runSolMoeTask

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSolMoeCompany } from './sol-moe-company.mjs';
import { createNativeDispatchState, reduceNativeDispatch } from './sol-moe-native-dispatch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

export class NativeParentRequiredError extends Error {
  constructor() {
    super('Live Sol MoE execution is available only to the parent OpenClaw agent through native sessions_spawn. This Node runner emits dispatch intent and never executes children.');
    this.name = 'NativeParentRequiredError';
    this.code = 'NATIVE_OPENCLAW_PARENT_REQUIRED';
  }
}

/** Plan and compile the first native action without invoking any tool or subprocess. */
export async function runSolMoeTask(task = {}, opts = {}) {
  const plan = await planSolMoeCompany(task, {
    availability: opts.availability,
    availabilityEvidence: opts.availabilityEvidence,
    includeEvidence: opts.includeEvidence === true,
    policy: opts.policy,
    rulings: opts.rulings,
    timestamp: opts.timestamp || new Date().toISOString(),
  });

  if (opts.apply === true || opts.spawn) throw new NativeParentRequiredError();
  const nativeState = createNativeDispatchState(plan, { providerHistory: opts.providerHistory });
  const scheduled = reduceNativeDispatch(nativeState, null, { cwd: opts.cwd || REPO_ROOT });
  return Object.freeze({
    schemaVersion: 'sol-moe-run-v2',
    mode: 'native-dispatch-intent',
    plan,
    nativeState: scheduled.state,
    nextAction: scheduled.action,
  });
}

function parseArgs(argv) {
  const valueAfter = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    taskFile: valueAfter('--task-file'),
    includeEvidence: argv.includes('--include-evidence'),
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskFile) {
    process.stderr.write('Usage: node _SYSTEM/mure/sol-moe-run.mjs --task-file <task.json> [--include-evidence]\n');
    process.exit(2);
  }
  const taskPath = path.resolve(REPO_ROOT, args.taskFile);
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
  runSolMoeTask(task, args)
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.nextAction?.type === 'fail-loud' ? 1 : 0;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error}\n`);
      process.exitCode = error?.code === 'NATIVE_OPENCLAW_PARENT_REQUIRED' ? 2 : 1;
    });
}
