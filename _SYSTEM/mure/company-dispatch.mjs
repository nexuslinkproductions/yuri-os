#!/usr/bin/env node
/**
 * company-dispatch.mjs — thin workstream driver over runFleet / runCompany.
 *
 * Ordered company-ops dispatch: WS-A → WS-B → WS-F → WS-C → WS-D → WS-G (optional release tail).
 * All gating delegates to planCompany + runFleet — no parallel orchestration layer (P3.2 demotion).
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
 * Derive apply-status from a runFleet result.
 *
 * Exported for focused regression testing of the swarm-present / swarm-absent lifecycle.
 *
 * @param {object} result  the runFleet return value
 *   ({ run?: { swarm?, nativeResults?, inlineResults? }, zaiSidecar?, ollamaSidecar? })
 * @returns {{ status: string, ok: boolean, error: string|null }}
 */
export function deriveApplyOutcome(result) {
  const swarm = result?.run?.swarm;
  // A successful GLM swarm is necessary but not sufficient: native and inline
  // substrates run only after runSwarm returns, so swarm.finalizeOk cannot include
  // their terminal outcomes. Sidecar failures are intentionally omitted here when
  // the swarm ran: the swarm is the fallback path for sidecar leaves that failed.
  if (swarm) {
    const errors = [];
    if (swarm.finalizeOk !== true) {
      errors.push(`swarm.finalizeOk=${swarm.finalizeOk}: ${swarm.finalizeReason || 'unknown'}`);
    }
    errors.push(...collectNativeInlineErrors(result, { swarmPresent: true }));
    const ok = errors.length === 0;
    return { status: ok ? 'applied' : 'applied-with-failures', ok, error: ok ? null : errors.join('; ') };
  }
  // swarm absent — every GLM leaf was handled by sidecars (glmLeavesToDispatch was
  // empty inside runCompany) or there were no GLM leaves.  Classify from aggregate
  // sidecar / native / inline outcomes, NOT from an undefined swarm.finalizeOk.
  const errors = collectSwarmAbsentErrors(result);
  const ok = errors.length === 0;
  return { status: ok ? 'applied' : 'applied-with-failures', ok, error: ok ? null : errors.join('; ') };
}

/**
 * Collect genuine failures from sidecar / native / inline outcomes when swarm is absent.
 * Sidecar results require ok===true (strict). Native and inline terminal outcomes are
 * delegated to collectNativeInlineErrors. Returns [] when clean.
 */
function collectSwarmAbsentErrors(result) {
  const errors = [];
  const run = result?.run || {};
  // Sidecar outcomes (zai + ollama). A spawned sidecar is terminal only when
  // every task it accepted produced an explicitly successful result.
  for (const [sidecarName, sc] of [
    ['zai', result?.zaiSidecar],
    ['ollama', result?.ollamaSidecar],
  ]) {
    if (!sc) continue;
    if (sc.spawnError) errors.push(`${sidecarName} sidecar spawn error: ${sc.spawnError}`);
    if (sc.spawned && sc.spawnExitCode != null && sc.spawnExitCode !== 0) {
      errors.push(`${sidecarName} sidecar non-zero exit (${sc.spawnExitCode})`);
    }
    const results = Array.isArray(sc.results) ? sc.results : [];
    for (const r of results) {
      if (r?.ok !== true) errors.push(`${sidecarName} sidecar leaf ${r?.label || '(unlabeled)'} failed`);
    }
    if (sc.spawned === true) {
      const returnedLabels = new Set(results.map((r) => r?.label).filter(Boolean));
      for (const task of Array.isArray(sc.tasks) ? sc.tasks : []) {
        const expectedLabel = task?.label;
        if (expectedLabel && !returnedLabels.has(expectedLabel)) {
          errors.push(`${sidecarName} sidecar missing terminal result for ${expectedLabel}`);
        }
      }
    }
  }
  errors.push(...collectNativeInlineErrors(result, { swarmPresent: false }));
  return errors;
}

/**
 * Collect terminal failures from native and inline substrates. These substrates run
 * after runSwarm returns, so their outcomes must be checked independently whether a
 * swarm exists or not.
 */
function collectNativeInlineErrors(result, { swarmPresent }) {
  const errors = [];
  const run = result?.run || {};
  const nativeSpecs = run.plan?.nativeSpecs || run.nativeSpecs || [];
  const nativePool = run.nativeResults?.pool || {};
  for (const spec of nativeSpecs) {
    const key = spec.id || spec.role || 'native';
    const entry = nativePool[key];
    if (!entry) {
      const reason = swarmPresent ? 'dispatch missing' : 'dispatch skipped — no swarm.runDir';
      errors.push(`native ${spec.role || key}: no result (${reason})`);
    } else if (entry.status !== 'ok') {
      errors.push(`native ${spec.role || key}: ${entry.status}`);
    }
  }

  // Inline 'skipped' is a designed fail-open for environmental unavailability.
  const inlineSpecs = run.plan?.inlineSpecs || [];
  const inlinePool = run.inlineResults?.pool || {};
  for (const spec of inlineSpecs) {
    const role = spec.role || 'inline';
    const id = spec.id || role;
    const key = `inline:${role}:${id}`;
    const entry = inlinePool[key];
    if (!entry) errors.push(`inline ${role}: no result (dispatch missing)`);
    else if (entry.status === 'error' || entry.status === 'fail') errors.push(`inline ${role}: ${entry.status}`);
  }
  return errors;
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
        const result = await (opts.runFleet || runFleet)(task, {
          dryRun: false,
          apply: true,
          ollamaSidecar: opts.ollamaSidecar,
          clineSidecar: opts.clineSidecar,
          zaiSidecar: opts.zaiSidecar,
          mlpLearn: opts.mlpLearn,
          quotaPressure: opts.quotaPressure ?? 0.4,
        });
        const outcome = deriveApplyOutcome(result);
        entry.status = outcome.status;
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
        if (!outcome.ok) {
          manifest.errors.push({
            taskFile: rel,
            error: outcome.error,
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
