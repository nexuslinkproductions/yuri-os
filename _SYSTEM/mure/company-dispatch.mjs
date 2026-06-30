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
 *   node _SYSTEM/mure/company-dispatch.mjs --apply --mlp-learn --ollama-sidecar --cline-sidecar --zai-sidecar
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
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
    zaiSidecar: argv.includes('--zai-sidecar'),
    detach: argv.includes('--detach'),
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

/** Extract blocking leaf IDs from runSwarm roundLog. */
export function extractBlockingLeaves(roundLog) {
  const blocking = new Set();
  for (const round of roundLog || []) {
    const verdict = round.verdict;
    if (verdict?.blocking) {
      for (const b of verdict.blocking) {
        if (b.leafId) blocking.add(b.leafId);
      }
    }
  }
  return Array.from(blocking);
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
  const castable = (plan.summary?.glm ?? 0) + (plan.summary?.native ?? 0) + (plan.summary?.inline ?? 0);
  return {
    taskFile: rel,
    summary: task.summary,
    held: plan.held?.length ?? 0,
    clearedHeld: plan.clearedHeld?.length ?? 0,
    glm: plan.summary?.glm ?? 0,
    native: plan.summary?.native ?? 0,
    blockingHeld: blockingHeld.length,
    blocked: castable === 0 && blockingHeld.length > 0 && !opts.forceHeldSkip,
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
          zaiSidecar: opts.zaiSidecar,
          mlpLearn: opts.mlpLearn,
          quotaPressure: opts.quotaPressure ?? 0.4,
        });
        const finalizeOk = result.run?.swarm?.finalizeOk === true;
        entry.status = finalizeOk ? 'applied' : 'applied-with-failures';
        entry.mlpFeedback = {
          persisted: result.mlpFeedback?.persisted,
          count: result.mlpFeedback?.count,
          advisory: result.mlpFeedback?.advisory,
          // WS-J-C1 (MURE §B.2 P0.3): held-out Brier from train-fleet-router-from-ledger.
          // Advisory only — surfaces router calibration quality on the manifest.
          evalMeanBrier: result.mlpFeedback?.trainSummary?.evalMeanBrier ?? null,
          evalExampleCount: result.mlpFeedback?.trainSummary?.evalExampleCount ?? 0,
          skippedOutcomes: result.mlpFeedback?.skippedOutcomes ?? 0,
        };
        entry.swarm = result.run?.swarm
          ? {
            runId: result.run.swarm.runId,
            converged: result.run.swarm.converged,
            finalizeOk: result.run.swarm.finalizeOk,
            finalizeReason: result.run.swarm.finalizeReason,
            forced: result.run.swarm.verdict?.forced === true,
            blockingLeaves: extractBlockingLeaves(result.run.swarm.roundLog || []),
          }
          : null;
        if (!finalizeOk) {
          manifest.errors.push({
            taskFile: rel,
            error: `swarm.finalizeOk=${result.run?.swarm?.finalizeOk}: ${result.run?.swarm?.finalizeReason || 'unknown'}`,
          });
        }
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
  const hasFailures = manifest.streams.some((s) => s.status === 'applied-with-failures');
  return { ...manifest, manifestPath: path.relative(REPO_ROOT, manifestPath), hasFailures };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));

  // Detach mode: spawn self without --detach as a detached child, then exit immediately.
  // The child runs the real dispatch independently; wait-for-job.mjs polls the manifest.
  if (opts.detach && opts.apply) {
    const childArgs = process.argv.slice(2).filter((a) => a !== '--detach');
    const outDir = opts.outDir;
    fs.mkdirSync(outDir, { recursive: true });
    const logPath = path.join(outDir, 'run.log');
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...childArgs], {
      cwd: REPO_ROOT,
      stdio: ['ignore', logFd, logFd],
      detached: true,
      env: { ...process.env, YURI_DETACHED_CHILD: '1' },
    });
    child.unref();
    fs.writeFileSync(path.join(outDir, 'dispatch.pid'), String(child.pid));
    console.log(JSON.stringify({
      detached: true,
      pid: child.pid,
      outDir: path.relative(REPO_ROOT, outDir),
      logFile: path.relative(REPO_ROOT, logPath),
      monitor: `node _SYSTEM/Scripts/wait-for-job.mjs --run-id <swarm-run-id> --expect finishedAt --timeout 7200000 --poll-ms 10000`,
      note: 'Parent exited. Child runs independently. Tail run.log or poll manifest with wait-for-job.mjs.',
    }, null, 2));
    process.exit(0);
  }

  companyDispatch({
    dryRunAll: opts.dryRunAll,
    apply: opts.apply,
    includeRelease: opts.includeRelease,
    forceHeldSkip: opts.forceHeldSkip,
    mlpLearn: opts.mlpLearn,
    ollamaSidecar: opts.ollamaSidecar,
    clineSidecar: opts.clineSidecar,
    zaiSidecar: opts.zaiSidecar,
    outDir: opts.outDir,
    taskFiles: opts.taskFiles,
  }).then((m) => {
    console.log(JSON.stringify(m, null, 2));
    process.exit(m.hasFailures || m.errors.length ? 1 : 0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
