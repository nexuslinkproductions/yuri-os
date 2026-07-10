#!/usr/bin/env node
/**
 * runFleet.mjs — quad-substrate fleet conductor (GLM + Ollama + Cline + native plan).
 *
 * DISARMED by default. Plans all pools; dispatches GLM via runSwarm when armed.
 * Ollama and Cline run as parallel sidecars. Native specs returned for Cursor/Opus spawn.
 *
 * OLLAMA SIDECAR WIRING:
 * - Automatically detects bulk roles (scout, artificer) in the plan
 * - Builds ollama-fleet tasks with tier='flash' for eligible roles
 * - Writes tasks to .claude/jobs/<runId>/ollama-tasks.json when --ollama-sidecar is passed
 * - DISARMED by default: requires YURI_OLLAMA_FLEET=1 or _SYSTEM/state/ollama-fleet.enabled to arm
 * - Spawn command documented in plan.ollamaSidecar.command (absolute path to tasks file)
 * - Plan metadata includes: bulkRoles, armEnv, armFlag, tasksFileHint, fullImplementation reference
 *
 * Usage:
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --apply
 *   node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run --ollama-sidecar --cline-sidecar --zai-sidecar
 *
 * To spawn the ollama sidecar after planning:
 *   1. Run with --ollama-sidecar to write tasks file
 *   2. Use the command from plan.ollamaSidecar.command (e.g., node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks-file .claude/jobs/fleet-123/ollama-tasks.json)
 *   3. Arm with YURI_OLLAMA_FLEET=1 to execute (removes --dry-run)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { recordMlpFeedbackStub, recordMlpPredictions } from './fleet-mlp-feedback.mjs';
import { isArmed as isOllamaFleetArmed, OLLAMA_ROSTER } from './ollama-fleet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const BULK_ROLES = new Set(['scout', 'artificer']);
const CLINE_IMPL_ROLES = new Set(['engineer', 'mechanic']);
const ZAI_HEAVY_ROLES = new Set(['architect', 'adjudicator', 'kernelsmith', 'deliberator', 'oracle']);
const ZAI_HEAVY_LANES = new Set(['glm-max', 'glm-sub-orch']);

function collectSidecarLeaves(plan) {
  const leaves = [];
  for (const leaf of plan.glmLeaves ?? []) leaves.push(leaf);
  for (const spec of plan.nativeSpecs ?? []) leaves.push(spec);
  // Current company planning represents self-governable Ollama work in casts rather
  // than a runnable GLM/native leaf. Preserve that route information for sidecar
  // planning without changing the plan or dispatching it.
  for (const cast of plan.casts ?? []) {
    if (cast?.subtaskId && cast?.role && cast?.target) {
      leaves.push({
        id: cast.subtaskId,
        role: cast.role,
        lane: cast.target.lane,
        model: cast.target.model,
        dispatch: cast.target.dispatch,
        affinityApplied: cast.target.affinityApplied,
        substrateHint: cast.substrateHint,
      });
    }
  }
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

const OLLAMA_TIER_KEYS = new Set(Object.keys(OLLAMA_ROSTER));

/** Resolve ollama-fleet tier from subtask metadata, affinity matrix, or router hints. */
export function resolveOllamaTier(leaf, subtaskById = new Map()) {
  const sub = subtaskById.get(leaf.id) || subtaskById.get(String(leaf.id || '').split('-')[0]);
  if (sub?.tier && OLLAMA_TIER_KEYS.has(sub.tier)) return sub.tier;
  if (leaf.tier && OLLAMA_TIER_KEYS.has(leaf.tier)) return leaf.tier;
  if (leaf.lane && OLLAMA_TIER_KEYS.has(leaf.lane)) return leaf.lane;
  if (leaf.affinityApplied === 'ollama-minimax') return 'minimax';
  if (leaf.affinityApplied === 'ollama-flash') return 'flash';
  const rsLane = leaf.routerSuggestion?.lane || '';
  if (rsLane.includes('minimax')) return 'minimax';
  if (rsLane.includes('kimi')) return 'kimi';
  if (rsLane.includes('flash')) return 'flash';
  if (leaf.routerSuggestion?.substrate === 'ollama' && OLLAMA_TIER_KEYS.has(rsLane.replace(/^ollama-/, ''))) {
    return rsLane.replace(/^ollama-/, '');
  }
  return 'flash';
}

function subtaskIndex(task = {}) {
  const map = new Map();
  for (const st of task.subtasks || []) {
    if (st.id) map.set(st.id, st);
  }
  return map;
}

/** Build ollama-fleet task list from plan casts (bulk roles + router ollama hints). */
export function buildOllamaSidecar(plan, task = {}) {
  const tasks = [];
  const seen = new Set();
  const subById = subtaskIndex(task);
  // Pull bulk roles from plan metadata if available; fall back to hardcoded set
  const bulkRoles = new Set(plan.ollamaSidecar?.metadata?.bulkRoles || ['scout', 'artificer']);
  const add = (leaf) => {
    const id = leaf.id || leaf.role;
    if (!id || seen.has(id)) return;
    const bulk = bulkRoles.has(leaf.role);
    const routerOllama = leaf.routerSuggestion?.substrate === 'ollama';
    const affinityOllama = leaf.dispatch === 'ollama-sidecar' || leaf.affinityApplied === 'ollama-flash' || leaf.affinityApplied === 'ollama-minimax';
    if (!bulk && !routerOllama && !affinityOllama) return;
    seen.add(id);
    tasks.push({
      label: id,
      tier: resolveOllamaTier(leaf, subById),
      role: leaf.role,
      prompt: leaf.prompt || `${task.summary || 'fleet task'} — ${leaf.role} (${id})`,
    });
  };
  for (const leaf of collectSidecarLeaves(plan)) add(leaf);
  const sidecar = plan.ollamaSidecar || {};
  const metadata = sidecar.metadata || {};
  return {
    discoverable: true,
    armed: false,
    eligibleCount: tasks.length,
    tasks,
    eligible: sidecar.eligible ?? tasks.map((t) => ({ id: t.label, role: t.role })),
    command: tasks.length
      ? 'node _SYSTEM/Scripts/ollama-fleet.mjs --dry-run --tasks-file <ollama-tasks.json>'
      : null,
    // Propagate metadata from plan: bulkRoles, armEnv, armFlag, tasksFileHint
    bulkRoles: Array.from(bulkRoles),
    armEnv: metadata.armEnv || 'YURI_OLLAMA_FLEET',
    armFlag: metadata.armFlag || '_SYSTEM/state/ollama-fleet.enabled',
    tasksFileHint: metadata.tasksFileHint || '.claude/jobs/<runId>/ollama-tasks.json',
    fullImplementation: metadata.fullImplementation || '_SYSTEM/Scripts/runFleet.mjs::buildOllamaSidecar',
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

/** Build zai-tmux-fleet task list (glm-max / heavy roles + router tmux-zai hints). */
export function buildZaiSidecar(plan, task = {}) {
  const tasks = [];
  const seen = new Set();
  const add = (leaf) => {
    const id = leaf.id || leaf.role;
    if (!id || seen.has(id)) return;
    const heavyRole = ZAI_HEAVY_ROLES.has(leaf.role);
    const heavyLane = ZAI_HEAVY_LANES.has(leaf.lane);
    const routerZai = leaf.routerSuggestion?.substrate === 'tmux-zai'
      || leaf.routerSuggestion?.substrate === 'zai-tmux'
      || leaf.routerSuggestion?.id === 'tmux-zai';
    const hintZai = leaf.substrateHint === 'tmux-zai' || leaf.dispatch === 'zai-tmux';
    if (!heavyRole && !heavyLane && !routerZai && !hintZai) return;
    seen.add(id);
    tasks.push({
      label: id,
      model: 'glm-5.2',
      role: leaf.role,
      lane: leaf.lane,
      prompt: leaf.prompt || `${task.summary || 'fleet task'} — ${leaf.role} (${id}) via zai-tmux`,
      tmuxClaudeZai: true,
      showTerminal: false,
    });
  };
  for (const leaf of collectSidecarLeaves(plan)) add(leaf);
  const sidecar = plan.zaiSidecar || {};
  return {
    discoverable: true,
    armed: false,
    provider: 'zai-tmux',
    eligibleCount: tasks.length,
    tasks,
    eligible: sidecar.eligible ?? tasks.map((t) => ({ id: t.label, role: t.role, lane: t.lane })),
    command: tasks.length
      ? 'node _SYSTEM/Scripts/zai-tmux-fleet.mjs --dry-run --tasks-file <zai-tasks.json>'
      : null,
    tasksFileHint: '.claude/jobs/<runId>/zai-tasks.json',
    armEnv: 'YURI_ZAI_TMUX_FLEET',
    armFlag: '_SYSTEM/state/zai-tmux-fleet.enabled',
    note: 'GLM heavy tmux sidecar — manual spawn or pass --zai-sidecar; requires tmux + Z.ai key',
    limitation: 'headless: lane-dispatch glm-max --out; showTerminal: claude-zai send-keys poll',
    fullImplementation: '_SYSTEM/Scripts/runFleet.mjs::buildZaiSidecar',
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
  const zaiSidecar = buildZaiSidecar(plan, task);
  const runId = task.runId || `fleet-${Date.now()}`;

  if (opts.ollamaSidecar) {
    const { path: tasksPath, fallback } = writeSidecarTasksFile(runId, 'ollama-sidecar', 'ollama-tasks.json', ollamaSidecar.tasks);
    if (fallback) ollamaSidecar.tasksFileFallback = true;
    ollamaSidecar.tasksFile = tasksPath;
    ollamaSidecar.written = true;
    if (ollamaSidecar.tasks.length) {
      ollamaSidecar.command = `node _SYSTEM/Scripts/ollama-fleet.mjs ${dryRun ? '--dry-run' : ''} --tasks-file ${tasksPath}`.trim();
      ollamaSidecar.armed = isOllamaFleetArmed();
      if (!ollamaSidecar.armed && !dryRun) {
        ollamaSidecar.skipped = true;
        ollamaSidecar.skipReason = 'ollama-fleet disarmed (YURI_OLLAMA_FLEET=1 or _SYSTEM/state/ollama-fleet.enabled)';
      }
    }
  }

  if (opts.clineSidecar && clineSidecar.tasks.length) {
    const { path: tasksPath, fallback } = writeSidecarTasksFile(runId, 'cline-sidecar', 'cline-tasks.json', clineSidecar.tasks);
    if (fallback) clineSidecar.tasksFileFallback = true;
    clineSidecar.tasksFile = tasksPath;
    clineSidecar.command = `node _SYSTEM/Scripts/cline-fleet.mjs --dry-run --tasks-file ${tasksPath}`;
  }

  if (opts.zaiSidecar && zaiSidecar.tasks.length) {
    const { path: tasksPath, fallback } = writeSidecarTasksFile(runId, 'zai-sidecar', 'zai-tasks.json', zaiSidecar.tasks);
    if (fallback) zaiSidecar.tasksFileFallback = true;
    zaiSidecar.tasksFile = tasksPath;
    zaiSidecar.command = `node _SYSTEM/Scripts/zai-tmux-fleet.mjs ${dryRun ? '--dry-run' : ''} --tasks-file ${tasksPath}`.trim();
  }

  const result = {
    dryRun,
    summary: task.summary,
    casts: plan.casts?.length ?? 0,
    glmLeaves: plan.glmLeaves ?? [],
    nativeSpecs: plan.nativeSpecs ?? [],
    held: plan.held ?? [],
    ollamaSidecar,
    clineSidecar,
    zaiSidecar,
    routerSuggestions: [],
  };

  // Collect router suggestions from both glmLeaves and nativeSpecs
  for (const leaf of plan.glmLeaves ?? []) {
    if (leaf.routerSuggestion) {
      result.routerSuggestions.push({ id: leaf.id, suggestion: leaf.routerSuggestion, confidence: leaf.routerConfidence });
    }
  }
  for (const spec of plan.nativeSpecs ?? []) {
    if (spec.routerSuggestion) {
      result.routerSuggestions.push({ id: spec.id, suggestion: spec.routerSuggestion, confidence: spec.routerConfidence });
    }
  }

  if (dryRun) {
    result.plan = plan;
    // Advisory MLP feedback: calls updateFromOutcome with persist:false (structuredClone, no disk write).
    // Real training path: runFleet.mjs --apply --mlp-learn (armed) → recordMlpFeedbackFromRun →
    // runPostTrainSummary → train-fleet-router-from-ledger.mjs (batch replay from prediction-ledger).
    // Standalone: `node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs --epochs=4 --lr=0.015`
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

  // H1 FIX: Actually spawn zai-tmux-fleet.mjs in armed mode and collect handled leaf IDs
  let zaiSpawnResults = null;
  let zaiHandledLeafIds = [];
  let ollamaSpawnResults = null;
  let ollamaHandledLeafIds = [];
  if (opts.zaiSidecar && zaiSidecar.tasks?.length && zaiSidecar.tasksFile) {
    try {
      const zaiScript = join(__dirname, 'zai-tmux-fleet.mjs');
      const zaiChild = spawn('node', [zaiScript, '--tasks-file', zaiSidecar.tasksFile], {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, YURI_ZAI_TMUX_FLEET: '1' },
      });
      let zaiStdout = '';
      let zaiStderr = '';
      zaiChild.stdout.on('data', (d) => { zaiStdout += d.toString(); });
      zaiChild.stderr.on('data', (d) => { zaiStderr += d.toString(); });
      const zaiExitCode = await new Promise((resolve) => {
        zaiChild.on('close', resolve);
        zaiChild.on('error', () => resolve(1));
      });
      try {
        zaiSpawnResults = JSON.parse(zaiStdout);
      } catch {
        zaiSpawnResults = { ok: false, rawStdout: zaiStdout.slice(0, 500), stderr: zaiStderr.slice(0, 500) };
      }
      zaiHandledLeafIds = (zaiSpawnResults?.results || []).map((r) => r.label).filter(Boolean);
      zaiSidecar.armed = true;
      zaiSidecar.spawned = true;
      zaiSidecar.spawnExitCode = zaiExitCode;
      zaiSidecar.results = zaiSpawnResults?.results || [];
    } catch (e) {
      zaiSidecar.spawnError = String(e?.message || e);
    }
  }

  // P7 (D-11): mirror zai self-spawn for ollama-fleet — armed sidecar spawns olf-* packets in-run
  if (opts.ollamaSidecar && ollamaSidecar.tasks?.length && ollamaSidecar.tasksFile) {
    if (!isOllamaFleetArmed()) {
      ollamaSidecar.skipped = true;
      ollamaSidecar.skipReason = ollamaSidecar.skipReason || 'ollama-fleet disarmed';
    } else {
      try {
        const ollamaScript = join(__dirname, 'ollama-fleet.mjs');
        const ollamaChild = spawn('node', [ollamaScript, '--tasks-file', ollamaSidecar.tasksFile], {
          cwd: REPO_ROOT,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, YURI_OLLAMA_FLEET: '1' },
        });
        let ollamaStdout = '';
        let ollamaStderr = '';
        ollamaChild.stdout.on('data', (d) => { ollamaStdout += d.toString(); });
        ollamaChild.stderr.on('data', (d) => { ollamaStderr += d.toString(); });
        const ollamaExitCode = await new Promise((resolve) => {
          ollamaChild.on('close', resolve);
          ollamaChild.on('error', () => resolve(1));
        });
        try {
          ollamaSpawnResults = JSON.parse(ollamaStdout);
        } catch {
          ollamaSpawnResults = { ok: false, rawStdout: ollamaStdout.slice(0, 500), stderr: ollamaStderr.slice(0, 500) };
        }
        ollamaHandledLeafIds = (ollamaSpawnResults?.results || []).map((r) => r.label).filter(Boolean);
        ollamaSidecar.armed = true;
        ollamaSidecar.spawned = true;
        ollamaSidecar.spawnExitCode = ollamaExitCode;
        ollamaSidecar.results = ollamaSpawnResults?.results || [];
      } catch (e) {
        ollamaSidecar.spawnError = String(e?.message || e);
      }
    }
  }

  const skipLeafIds = [...zaiHandledLeafIds, ...ollamaHandledLeafIds];
  const run = await company.runCompany(task, {
    ...opts,
    armed: opts.armed !== false,
    predictionIds,
    mlpLearn: opts.mlpLearn,
    skipLeafIds,
    zaiSidecarResults: zaiSpawnResults,
    ollamaSidecarResults: ollamaSpawnResults,
  });
  return { ...result, dryRun: false, run, mlpFeedback: run.mlpFeedback };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const tfIdx = args.indexOf('--task-file');
  const taskFile = tfIdx >= 0 ? args[tfIdx + 1] : null;
  if (!taskFile) {
    console.error('Usage: runFleet.mjs --task-file <json> [--dry-run|--apply] [--ollama-sidecar] [--cline-sidecar] [--zai-sidecar] [--mlp-learn]');
    process.exit(1);
  }
  const task = readTask(join(process.cwd(), taskFile));
  const dryRun = !args.includes('--apply');
  runFleet(task, {
    dryRun,
    apply: !dryRun,
    ollamaSidecar: args.includes('--ollama-sidecar'),
    clineSidecar: args.includes('--cline-sidecar'),
    zaiSidecar: args.includes('--zai-sidecar'),
    mlpLearn: args.includes('--mlp-learn'),
  }).then((r) => {
    console.log(JSON.stringify(r, null, 2));
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
