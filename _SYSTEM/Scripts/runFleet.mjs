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
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run --ollama-sidecar
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const BULK_ROLES = new Set(['scout', 'artificer']);

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
  for (const leaf of plan.glmLeaves ?? []) add(leaf);
  for (const spec of plan.nativeSpecs ?? []) add(spec);
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

/** Advisory MLP feedback stub — computes error but does not persist weights (DISARMED-safe). */
export async function recordMlpFeedbackStub(plan) {
  const router = await import('./fleet-router-mlp.mjs').catch(() => null);
  if (!router?.updateFromOutcome || !router?.extractFeatures) return { skipped: true, reason: 'router unavailable' };
  const ctx = { quotaPressure: 0.4 };
  const records = [];
  for (const leaf of [...(plan.glmLeaves ?? []), ...(plan.nativeSpecs ?? [])]) {
    if (!leaf.routerSuggestion) continue;
    const feats = router.extractFeatures({ ...leaf, role: leaf.role, prompt: leaf.prompt || '' }, ctx);
    const res = await router.updateFromOutcome(
      feats,
      leaf.routerSuggestion,
      { success: 0, quality: 0.5, converged: false, dryRun: true },
      { persist: false, learningRate: 0.02 },
    );
    records.push({ id: leaf.id, substrate: leaf.routerSuggestion.substrate, error: res.error });
  }
  return { advisory: true, persisted: false, count: records.length, records };
}

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

  if (opts.ollamaSidecar && ollamaSidecar.tasks.length) {
    const runId = task.runId || `fleet-${Date.now()}`;
    const outDir = join(REPO_ROOT, '.claude', 'jobs', runId);
    mkdirSync(outDir, { recursive: true });
    const tasksPath = join(outDir, 'ollama-tasks.json');
    writeFileSync(tasksPath, JSON.stringify({ summary: task.summary, tasks: ollamaSidecar.tasks }, null, 2));
    ollamaSidecar.tasksFile = tasksPath;
    ollamaSidecar.command = `node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks-file ${tasksPath}`;
  }

  const result = {
    dryRun,
    summary: task.summary,
    casts: plan.casts?.length ?? 0,
    glmLeaves: plan.glmLeaves?.length ?? 0,
    nativeSpecs: plan.nativeSpecs?.length ?? 0,
    held: plan.held ?? [],
    ollamaSidecar,
    routerSuggestions: [],
  };

  for (const leaf of plan.glmLeaves ?? []) {
    if (leaf.routerSuggestion) {
      result.routerSuggestions.push({ id: leaf.id, suggestion: leaf.routerSuggestion, confidence: leaf.routerConfidence });
    }
  }

  if (dryRun) {
    result.plan = plan;
    result.mlpFeedback = await recordMlpFeedbackStub(plan);
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
    console.error('Usage: runFleet.mjs --task-file <json> [--dry-run|--apply] [--ollama-sidecar]');
    process.exit(1);
  }
  const task = readTask(join(process.cwd(), taskFile));
  const dryRun = !args.includes('--apply');
  runFleet(task, { dryRun, apply: !dryRun, ollamaSidecar: args.includes('--ollama-sidecar') }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
