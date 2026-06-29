#!/usr/bin/env node
/**
 * runFleet.mjs — tri-substrate fleet conductor (GLM + Ollama + native plan).
 *
 * DISARMED by default. Plans all three pools; dispatches GLM via runSwarm when armed.
 * Ollama runs as parallel sidecar. Native specs returned for Cursor/Opus spawn.
 *
 * Usage:
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --apply
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadCompany() {
  return import('../mure/company.mjs');
}

function readTask(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export async function runFleet(task, opts = {}) {
  const company = await loadCompany();
  const dryRun = opts.dryRun ?? !opts.apply;

  const plan = await company.planCompany(task, opts);

  const result = {
    dryRun,
    summary: task.summary,
    casts: plan.casts?.length ?? 0,
    glmLeaves: plan.glmLeaves?.length ?? 0,
    nativeSpecs: plan.nativeSpecs?.length ?? 0,
    held: plan.held ?? [],
    ollamaSidecar: {
      note: 'Run ollama-fleet.mjs in parallel for bulk lanes; not auto-wired in company.mjs yet',
      command: 'node _SYSTEM/Scripts/ollama-fleet.mjs --tasks-file <ollama-tasks.json>',
    },
    routerSuggestions: [],
  };

  for (const leaf of plan.glmLeaves ?? []) {
    if (leaf.routerSuggestion) {
      result.routerSuggestions.push({ id: leaf.id, suggestion: leaf.routerSuggestion, confidence: leaf.routerConfidence });
    }
  }

  if (dryRun) {
    result.plan = plan;
    return result;
  }

  const run = await company.runCompany(task, { ...opts, armed: opts.armed !== false });
  return { ...result, dryRun: false, run };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const tfIdx = args.indexOf('--task-file');
  const taskFile = tfIdx >= 0 ? args[tfIdx + 1] : null;
  if (!taskFile) {
    console.error('Usage: runFleet.mjs --task-file <json> [--dry-run|--apply]');
    process.exit(1);
  }
  const task = readTask(join(process.cwd(), taskFile));
  const dryRun = !args.includes('--apply');
  runFleet(task, { dryRun, apply: !dryRun }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
