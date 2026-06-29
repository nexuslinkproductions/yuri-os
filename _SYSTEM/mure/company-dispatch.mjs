#!/usr/bin/env node
/**
 * company-dispatch.mjs — end-to-end MURE workstream orchestrator.
 *
 * Ordered company-ops dispatch: WS-A → WS-B → WS-F → WS-C → WS-D → WS-G (optional release tail).
 * Respects held-rulings owner lock, visual-plan gates, and MURE arm posture.
 *
 * Usage:
 *   node _SYSTEM/mure/company-dispatch.mjs --dry-run-all
 *   node _SYSTEM/mure/company-dispatch.mjs --dry-run-all --include-release
 *   node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { planCompany, isMureArmed } from './company.mjs';
import { checkVisualPlanGate } from './helmsman-run.mjs';
import { loadHeldRulings } from './held-rulings.mjs';
import { runFleet } from '../Scripts/runFleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '../..');

export const COMPANY_OPS_STREAMS = [
  '02_RESOURCES/TASKS/mure-buildout-ws-a-governance.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-b-fleet.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-f-router.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-c-visual.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-d-knowledge.json',
  '02_RESOURCES/TASKS/mure-buildout-ws-g-cline-pass.json',
];

export const RELEASE_TAIL = '02_RESOURCES/TASKS/yuri-public-release-phase2-8.json';

function readTask(rel) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'));
}

function parseArgs(argv) {
  return {
    dryRunAll: argv.includes('--dry-run-all') || !argv.includes('--apply'),
    apply: argv.includes('--apply'),
    includeRelease: argv.includes('--include-release'),
    forceHeldSkip: argv.includes('--force-held-skip'),
    mlpLearn: argv.includes('--mlp-learn'),
    ollamaSidecar: argv.includes('--ollama-sidecar'),
    clineSidecar: argv.includes('--cline-sidecar'),
    outDir: (() => {
      const i = argv.indexOf('--out');
      return i >= 0 && argv[i + 1]
        ? path.join(REPO_ROOT, argv[i + 1])
        : path.join(REPO_ROOT, '_SYSTEM', 'lane-output', 'dispatch');
    })(),
    taskFiles: (() => {
      const files = [];
      for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--task-file' && argv[i + 1]) files.push(argv[++i]);
      }
      return files;
    })(),
  };
}

/** Build manifest entry for one workstream. */
export async function planWorkstream(rel, opts = {}) {
  const task = readTask(rel);
  const plan = await planCompany(task, { quotaPressure: opts.quotaPressure ?? 0.4 });
  const visualGate = checkVisualPlanGate(task);
  const blockingHeld = (plan.held || []).filter((h) => {
    const sub = task.subtasks?.find((s) => s.id === h.subtaskId);
    return !sub?.finalize;
  });
  return {
    taskFile: rel,
    summary: task.summary,
    held: plan.held?.length ?? 0,
    clearedHeld: plan.clearedHeld?.length ?? 0,
    glm: plan.summary?.glm ?? 0,
    native: plan.summary?.native ?? 0,
    blockingHeld: blockingHeld.length,
    blocked: blockingHeld.length > 0 && !opts.forceHeldSkip,
    visualGate,
    ready: !visualGate.required || visualGate.satisfied,
    heldRulingsSource: plan.heldRulingsSource,
    planSummary: plan.summary,
  };
}

/**
 * Run full company-ops dispatch manifest or apply.
 * @returns {Promise<{runId, dryRun, streams, skipped, errors, manifestPath}>}
 */
export async function companyDispatch(opts = {}) {
  const runId = opts.runId || `dispatch-${Date.now().toString(36)}`;
  const streams = opts.taskFiles?.length
    ? opts.taskFiles.map((f) => (f.startsWith('02_') ? f : path.relative(REPO_ROOT, path.join(REPO_ROOT, f))))
    : [...COMPANY_OPS_STREAMS];
  if (opts.includeRelease) streams.push(RELEASE_TAIL);

  fs.mkdirSync(opts.outDir, { recursive: true });
  const manifest = {
    runId,
    dryRun: opts.dryRunAll !== false && !opts.apply,
    ratifiedAt: new Date().toISOString(),
    heldRulings: loadHeldRulings().source,
    mureArmed: isMureArmed(),
    streams: [],
    skipped: [],
    errors: [],
  };

  for (const rel of streams) {
    let entry;
    try {
      entry = await planWorkstream(rel, opts);
    } catch (e) {
      manifest.errors.push({ taskFile: rel, error: String(e?.message || e) });
      continue;
    }

    if (entry.blocked) {
      manifest.skipped.push({ taskFile: rel, reason: 'unresolved held subtasks', held: entry.blockingHeld });
      manifest.streams.push({ ...entry, status: 'skipped-held' });
      continue;
    }
    if (entry.visualGate.required && !entry.visualGate.satisfied) {
      manifest.skipped.push({ taskFile: rel, reason: 'visual-plan gate unsatisfied' });
      manifest.streams.push({ ...entry, status: 'skipped-visual-gate' });
      continue;
    }

    if (opts.apply && isMureArmed()) {
      const task = readTask(rel);
      task.runId = `${runId}-${path.basename(rel, '.json')}`;
      try {
        const result = await runFleet(task, {
          dryRun: false,
          apply: true,
          ollamaSidecar: opts.ollamaSidecar,
          clineSidecar: opts.clineSidecar,
          mlpLearn: opts.mlpLearn,
          quotaPressure: opts.quotaPressure ?? 0.4,
        });
        entry.status = 'applied';
        entry.mlpFeedback = {
          persisted: result.mlpFeedback?.persisted,
          count: result.mlpFeedback?.count,
          advisory: result.mlpFeedback?.advisory,
        };
        entry.swarm = result.run?.swarm
          ? { runId: result.run.swarm.runId, converged: result.run.swarm.converged }
          : null;
        fs.writeFileSync(
          path.join(opts.outDir, `${path.basename(rel, '.json')}-apply.json`),
          JSON.stringify(result, null, 2),
        );
      } catch (e) {
        entry.status = 'apply-failed';
        manifest.errors.push({ taskFile: rel, error: String(e?.message || e) });
      }
    } else {
      entry.status = opts.apply && !isMureArmed() ? 'skipped-disarmed' : 'planned';
      if (opts.apply && !isMureArmed()) {
        manifest.skipped.push({ taskFile: rel, reason: 'MURE disarmed — use --dry-run-all or arm mure.enabled' });
      }
    }

    manifest.streams.push(entry);
  }

  const manifestPath = path.join(opts.outDir, runId, 'manifest.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return { ...manifest, manifestPath: path.relative(REPO_ROOT, manifestPath) };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  companyDispatch({
    dryRunAll: opts.dryRunAll,
    apply: opts.apply,
    includeRelease: opts.includeRelease,
    forceHeldSkip: opts.forceHeldSkip,
    mlpLearn: opts.mlpLearn,
    ollamaSidecar: opts.ollamaSidecar,
    clineSidecar: opts.clineSidecar,
    outDir: opts.outDir,
    taskFiles: opts.taskFiles,
  }).then((m) => {
    console.log(JSON.stringify(m, null, 2));
    process.exit(m.errors.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
