#!/usr/bin/env node
/**
 * runFleet.mjs — quad-substrate fleet conductor (GLM + Ollama + Cline + native plan).
 *
 * DISARMED by default. Plans all pools; dispatches GLM via runSwarm when armed.
 * Ollama and Cline run as parallel sidecars. Native specs returned for Cursor/Opus spawn.
 *
 * Usage:
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --apply
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run --ollama-sidecar --cline-sidecar
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordMlpFeedbackStub, recordMlpPredictions } from './fleet-mlp-feedback.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const BULK_ROLES = new Set(['scout', 'artificer']);
const CLINE_IMPL_ROLES = new Set(['engineer', 'mechanic']);

function collectSidecarLeaves(plan) {
  const leaves = [];
  for (const leaf of plan.glmLeaves ?? []) leaves.push(leaf);
  for (const spec of plan.nativeSpecs ?? []) leaves.push(spec);
  return leaves;
}

/** Write sidecar task JSON — primary .claude/jobs, fallback _SYSTEM/lane-output. */
function writeSidecarTasksFile(runId, subdir, filename, payload) {
  const body = JSON.stringify(payload, null, 2);
  const primaryPath = join(REPO_ROOT, '.claude', 'jobs', runId, filename);
  const fallbackPath = join(REPO_ROOT, '_SYSTEM', 'lane-output', subdir, runId, filename);
  try {
    mkdirSync(dirname(primaryPath), { recursive: true });
    writeFileSync(primaryPath, body);
    return { path: primaryPath, fallback: false };
  } catch {
    mkdirSync(dirname(fallbackPath), { recursive: true });
    writeFileSync(fallbackPath, body);
    return { path: fallbackPath, fallback: true };
  }
}

/** Build ollama-fleet task list from plan casts (bulk roles + router ollama hints). */
export function buildOllamaSidecar(plan, task = {}) {
  const tasks = [];
  const seen = new Set();
  const add = (leaf) => {
    const id = leaf.id || leaf.role;
    if (!id || seen.has(id)) return;
    const bulk = BULK_ROLES.has(leaf.role);
    const routerOllama = leaf.routerSuggestion?.substrate === 'ollama';
    if (!bulk && !routerOllama) return;
    seen.add(id);
    tasks.push({
      label: id,
      tier: 'flash',
      role: leaf.role,
      prompt: leaf.prompt || `${task.summary || 'fleet task'} — ${leaf.role} (${id})`,
    });
  };
  for (const leaf of collectSidecarLeaves(plan)) add(leaf);
  const sidecar = plan.ollamaSidecar || {};
  return {
    discoverable: true,
    armed: false,
    eligibleCount: tasks.length,
    tasks,
    eligible: sidecar.eligible ?? tasks.map((t) => ({ id: t.label, role: t.role })),
    command: tasks.length
      ? `node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks '${JSON.stringify(tasks)}'`
      : null,
    tasksFileHint: '.claude/jobs/<runId>/ollama-tasks.json',
    note: 'Parallel bulk sidecar — not auto-dispatched; spawn manually or pass --ollama-sidecar to write tasks file',
  };
}

/** Build cline-fleet task list (bulk + engineer/mechanic + router cline hints). */
export function buildClineSidecar(plan, task = {}) {
  const tasks = [];
  const seen = new Set();
  const add = (leaf) => {
    const id = leaf.id || leaf.role;
    if (!id || seen.has(id)) return;
    const bulk = BULK_ROLES.has(leaf.role);
    const impl = CLINE_IMPL_ROLES.has(leaf.role);
    const routerCline = leaf.routerSuggestion?.substrate === 'cline';
    if (!bulk && !impl && !routerCline) return;
    seen.add(id);
    tasks.push({
      label: id,
      tier: impl ? 'glm' : 'glm',
      model: 'glm-5.2',
      role: leaf.role,
      prompt: leaf.prompt || `${task.summary || 'fleet task'} — ${leaf.role} (${id}) via ClinePass`,
    });
  };
  for (const leaf of collectSidecarLeaves(plan)) add(leaf);
  const sidecar = plan.clineSidecar || {};
  return {
    discoverable: true,
    armed: false,
    provider: 'clinepass',
    eligibleCount: tasks.length,
    tasks,
    eligible: sidecar.eligible ?? tasks.map((t) => ({ id: t.label, role: t.role })),
    command: tasks.length
      ? 'node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file <cline-tasks.json>'
      : null,
    tasksFileHint: '.claude/jobs/<runId>/cline-tasks.json',
    note: 'ClinePass CLI sidecar — manual spawn or pass --cline-sidecar; requires cline auth + cline-fleet.enabled',
    budgetDoc: '_SYSTEM/reports/CLINE_CREDIT_BUDGET.md',
  };
}

/** @deprecated use recordMlpFeedbackStub from fleet-mlp-feedback.mjs */
export { recordMlpFeedbackStub } from './fleet-mlp-feedback.mjs';

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
  const ollamaSidecar = buildOllamaSidecar(plan, task);
  const clineSidecar = buildClineSidecar(plan, task);
  const runId = task.runId || `fleet-${Date.now()}`;

  if (opts.ollamaSidecar && ollamaSidecar.tasks.length) {
    const { path: tasksPath, fallback } = writeSidecarTasksFile(runId, 'ollama-sidecar', 'ollama-tasks.json', {
      summary: task.summary,
      tasks: ollamaSidecar.tasks,
    });
    if (fallback) ollamaSidecar.tasksFileFallback = true;
    ollamaSidecar.tasksFile = tasksPath;
    ollamaSidecar.command = `node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks-file ${tasksPath}`;
  }

  if (opts.clineSidecar && clineSidecar.tasks.length) {
    const { path: tasksPath, fallback } = writeSidecarTasksFile(runId, 'cline-sidecar', 'cline-tasks.json', {
      summary: task.summary,
      tasks: clineSidecar.tasks,
    });
    if (fallback) clineSidecar.tasksFileFallback = true;
    clineSidecar.tasksFile = tasksPath;
    clineSidecar.command = `node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file ${tasksPath}`;
  }

  const result = {
    dryRun,
    summary: task.summary,
    casts: plan.casts?.length ?? 0,
    glmLeaves: plan.glmLeaves?.length ?? 0,
    nativeSpecs: plan.nativeSpecs?.length ?? 0,
    held: plan.held ?? [],
    ollamaSidecar,
    clineSidecar,
    routerSuggestions: [],
  };

  for (const leaf of plan.glmLeaves ?? []) {
    if (leaf.routerSuggestion) {
      result.routerSuggestions.push({ id: leaf.id, suggestion: leaf.routerSuggestion, confidence: leaf.routerConfidence });
    }
  }

  if (dryRun) {
    result.plan = plan;
    result.mlpFeedback = await recordMlpFeedbackStub(plan, { quotaPressure: opts.quotaPressure ?? 0.4 });
    return result;
  }

  const mlpOpts = {
    dryRun: false,
    mlpLearn: opts.mlpLearn,
    quotaPressure: opts.quotaPressure ?? 0.4,
    ledgerFile: opts.ledgerFile,
    trainEpochs: opts.trainEpochs,
  };
  const { ids: predictionIds } = await recordMlpPredictions(plan, { quotaPressure: mlpOpts.quotaPressure }, mlpOpts);

  const run = await company.runCompany(task, { ...opts, armed: opts.armed !== false, predictionIds, mlpLearn: opts.mlpLearn });
  return { ...result, dryRun: false, run, mlpFeedback: run.mlpFeedback };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const tfIdx = args.indexOf('--task-file');
  const taskFile = tfIdx >= 0 ? args[tfIdx + 1] : null;
  if (!taskFile) {
    console.error('Usage: runFleet.mjs --task-file <json> [--dry-run|--apply] [--ollama-sidecar] [--cline-sidecar] [--mlp-learn]');
    process.exit(1);
  }
  const task = readTask(join(process.cwd(), taskFile));
  const dryRun = !args.includes('--apply');
  runFleet(task, {
    dryRun,
    apply: !dryRun,
    ollamaSidecar: args.includes('--ollama-sidecar'),
    clineSidecar: args.includes('--cline-sidecar'),
    mlpLearn: args.includes('--mlp-learn'),
  }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
