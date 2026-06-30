#!/usr/bin/env node
/**
 * MURE Wait-For-Job — replaces blind sleeps with manifest/state polling
 *
 * Ship: WS-H-M0-wait-script
 * Authority: MURE_ENFORCEMENT_MINIMUM_2026-06-30.md §B.4, §G.3 (MURE-S0-01)
 *
 * Polls a swarm/dispatch job manifest until the expected condition is met,
 * or timeout, or the run fails. Orchestrator scripts and Cursor terminal
 * wrappers MUST use this (or Cursor Await with manifest poll) — never a
 * fixed `sleep` for dispatch completion.
 *
 * Manifest location (grounded in runSwarm.mjs:200):
 *   .claude/jobs/<runId>/manifest.json
 *   → { runId, finishedAt, finalizeOk, converged, forced, finalizeReason, ... }
 *
 * Leaf result location (grounded in runFleet.mjs leaf output):
 *   .claude/jobs/<runId>/results/<leafId>.json
 *   → { resultLabel, status, laneId, ... }
 *
 * Usage:
 *   # Wait for swarm finish (manifest written)
 *   node _SYSTEM/Scripts/wait-for-job.mjs \
 *     --run-id swarm-mr0in95e-c5e62b \
 *     --expect finishedAt \
 *     --timeout 7200000 --poll-ms 5000
 *
 *   # Wait for specific leaf PASS label
 *   node _SYSTEM/Scripts/wait-for-job.mjs \
 *     --run-id swarm-mr0in95e-c5e62b \
 *     --leaf WS-C-R2-trends-charts \
 *     --expect resultLabel \
 *     --timeout 1800000
 *
 *   # Wait for convergence honesty
 *   node _SYSTEM/Scripts/wait-for-job.mjs \
 *     --run-id swarm-mr0in95e-c5e62b \
 *     --expect finalizeOk \
 *     --timeout 7200000
 *
 * Exit codes (spec §B.4):
 *   0 — condition met
 *   1 — timeout (condition not met within --timeout ms)
 *   2 — run failed (finishedAt present but finalizeOk === false)
 *
 * When --expect is 'finishedAt' and the run finishes with finalizeOk===false,
 * exit code is 2 (run failed), NOT 0. The only way finishedAt yields exit 0
 * is when the run also has finalizeOk===true. To wait for finalizeOk without
 * caring about failure classification, use --expect finalizeOk directly
 * (which only resolves to true on success).
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const JOBS_DIR = join(REPO_ROOT, '.claude', 'jobs');

// ── Exit codes ──────────────────────────────────────────────────────────────
const EXIT_CONDITION_MET = 0;
const EXIT_TIMEOUT = 1;
const EXIT_RUN_FAILED = 2;

// ── Expect modes ────────────────────────────────────────────────────────────
const VALID_EXPECT = new Set(['finishedAt', 'resultLabel', 'finalizeOk']);

// ── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 7_200_000; // 2 hours
const DEFAULT_POLL_MS = 5_000;        // 5 seconds

// ── CLI parsing ─────────────────────────────────────────────────────────────

/**
 * Minimal argv parser. Accepts --flag value and --flag=value.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        out[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          out[key] = next;
          i += 1;
        } else {
          out[key] = 'true';
        }
      }
    }
  }
  return out;
}

// ── Manifest loading ────────────────────────────────────────────────────────

/**
 * Resolve the job directory for a given runId. The manifest is at
 * `.claude/jobs/<runId>/manifest.json`.
 *
 * @param {string} runId
 * @returns {string} absolute path to the manifest
 */
function manifestPath(runId) {
  return join(JOBS_DIR, runId, 'manifest.json');
}

/**
 * Safely read and parse a manifest JSON file. Returns null if missing or
 * unparseable (manifest may be mid-write during polling).
 *
 * @param {string} mPath
 * @returns {object|null}
 */
function loadManifest(mPath) {
  if (!existsSync(mPath)) return null;
  try {
    const raw = readFileSync(mPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    // Mid-write partial JSON — treat as not-ready, next poll will retry
    return null;
  }
}

/**
 * Read a leaf result JSON from `.claude/jobs/<runId>/results/<leafId>.json`.
 * Returns null if missing or unparseable.
 *
 * @param {string} runId
 * @param {string} leafId
 * @returns {object|null}
 */
function loadLeafResult(runId, leafId) {
  const leafPath = join(JOBS_DIR, runId, 'results', `${leafId}.json`);
  if (!existsSync(leafPath)) return null;
  try {
    const raw = readFileSync(leafPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Condition evaluation ────────────────────────────────────────────────────

/**
 * Evaluate whether the expected condition is met, and whether the run has
 * definitively failed.
 *
 * @param {object} manifest - parsed manifest (may be null if not yet written)
 * @param {string} expect   - 'finishedAt' | 'resultLabel' | 'finalizeOk'
 * @param {string?} leaf    - leafId when expect === 'resultLabel'
 * @param {string} [runId]  - the CLI --run-id (directory key for leaf lookups;
 *                            falls back to manifest.runId if omitted)
 * @returns {{
 *   met: boolean,
 *   failed: boolean,
 *   reason: string,
 *   detail: string
 * }}
 */
function evaluate(manifest, expect, leaf, runId) {
  // No manifest yet — not met, not failed
  if (!manifest) {
    return { met: false, failed: false, reason: 'no-manifest', detail: 'manifest.json not yet written' };
  }

  const finishedAt = manifest.finishedAt ?? null;
  const finalizeOk = manifest.finalizeOk ?? null;

  // ── expect: finishedAt ──
  if (expect === 'finishedAt') {
    if (!finishedAt) {
      return { met: false, failed: false, reason: 'pending', detail: 'run still in progress (no finishedAt)' };
    }
    // Run finished — classify success vs failure
    if (finalizeOk === false) {
      return {
        met: false,
        failed: true,
        reason: 'run-failed',
        detail: `finishedAt=${finishedAt} but finalizeOk=false (${manifest.finalizeReason ?? 'unknown'})`,
      };
    }
    return { met: true, failed: false, reason: 'finished-ok', detail: `finishedAt=${finishedAt}, finalizeOk=${finalizeOk}` };
  }

  // ── expect: finalizeOk ──
  if (expect === 'finalizeOk') {
    // finalizeOk is only set when the run finishes; a null value means still running
    if (finalizeOk === true) {
      return { met: true, failed: false, reason: 'finalize-ok', detail: `finalizeOk=true (${manifest.finalizeReason ?? 'ok'})` };
    }
    if (finalizeOk === false) {
      // The run finished and honesty says it failed
      return {
        met: false,
        failed: true,
        reason: 'run-failed',
        detail: `finalizeOk=false (${manifest.finalizeReason ?? 'unknown'})`,
      };
    }
    return { met: false, failed: false, reason: 'pending', detail: 'finalizeOk not yet set (run in progress)' };
  }

  // ── expect: resultLabel ──
  if (expect === 'resultLabel') {
    if (!leaf) {
      // This should have been caught in arg validation, but guard anyway
      return { met: false, failed: false, reason: 'config-error', detail: '--expect resultLabel requires --leaf' };
    }
    const leafRunId = runId || manifest.runId || '';
    const leafResult = loadLeafResult(leafRunId, leaf);
    if (!leafResult) {
      return { met: false, failed: false, reason: 'pending', detail: `leaf result ${leaf}.json not yet written` };
    }
    const label = leafResult.resultLabel ?? '';
    if (!label) {
      return { met: false, failed: false, reason: 'pending', detail: `leaf ${leaf} has no resultLabel yet` };
    }
    // A PASS label contains _PASS_COMMITTED; a FAIL label contains _F_PASS_COMMITTED (failed).
    // Per spec, exit 0 = condition met. For resultLabel, the condition is "label present".
    // A failed leaf has a label too — we surface it but still exit 0 (condition "label exists" met).
    // However, if the label contains _F_ (failed pass type), we classify as run-failed → exit 2.
    const isFail = /_F_PASS_COMMITTED\b/.test(label);
    if (isFail) {
      return {
        met: false,
        failed: true,
        reason: 'leaf-failed',
        detail: `leaf ${leaf} resultLabel=${label} (PASS type F = failed)`,
      };
    }
    return { met: true, failed: false, reason: 'leaf-label-ok', detail: `leaf ${leaf} resultLabel=${label}` };
  }

  return { met: false, failed: false, reason: 'unknown-expect', detail: `unhandled expect=${expect}` };
}

// ── Poll loop ───────────────────────────────────────────────────────────────

/**
 * Main async poll loop.
 *
 * @param {object} opts
 * @param {string} opts.runId
 * @param {string} opts.expect
 * @param {string?} opts.leaf
 * @param {number} opts.timeoutMs
 * @param {number} opts.pollMs
 * @param {object} [opts._deps] - injectable deps for testing (loadManifest, loadLeafResult)
 * @returns {Promise<{exitCode: number, reason: string, detail: string, polls: number, elapsedMs: number}>}
 */
async function waitForJob(opts) {
  const { runId, expect, leaf } = opts;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  // Injectable manifest/leaf loaders (for hermetic testing)
  const mLoader = opts._deps?.loadManifest ?? loadManifest;
  const mPath = opts._deps?.manifestPath?.(runId) ?? manifestPath(runId);

  const startMs = Date.now();
  const deadlineMs = startMs + timeoutMs;
  let polls = 0;

  // Immediate first poll (no initial delay — check right away)
  for (;;) {
    polls += 1;
    const manifest = mLoader(mPath);
    const result = evaluate(manifest, expect, leaf, runId);

    if (result.met) {
      const elapsedMs = Date.now() - startMs;
      return { exitCode: EXIT_CONDITION_MET, reason: result.reason, detail: result.detail, polls, elapsedMs };
    }

    if (result.failed) {
      const elapsedMs = Date.now() - startMs;
      return { exitCode: EXIT_RUN_FAILED, reason: result.reason, detail: result.detail, polls, elapsedMs };
    }

    // Check timeout before sleeping
    const now = Date.now();
    if (now >= deadlineMs) {
      const elapsedMs = now - startMs;
      return { exitCode: EXIT_TIMEOUT, reason: 'timeout', detail: `condition not met within ${timeoutMs}ms`, polls, elapsedMs };
    }

    // Sleep for poll interval (but don't overshoot deadline)
    const remaining = deadlineMs - now;
    const sleepMs = Math.min(pollMs, remaining);
    await sleep(sleepMs);
  }
}

// ── CLI entry ───────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --help
  if (args.help) {
    console.error(`Usage: wait-for-job.mjs --run-id <id> --expect <finishedAt|resultLabel|finalizeOk> [--leaf <id>] [--timeout <ms>] [--poll-ms <ms>]

Exit codes:
  0  condition met
  1  timeout
  2  run failed (finishedAt present, finalizeOk false)`);
    process.exit(0);
  }

  const runId = args['run-id'] ?? '';
  const expect = args.expect ?? '';
  const leaf = args.leaf ?? null;
  const timeoutMs = args.timeout ? parseInt(args.timeout, 10) : DEFAULT_TIMEOUT_MS;
  const pollMs = args['poll-ms'] ? parseInt(args['poll-ms'], 10) : DEFAULT_POLL_MS;

  // Validation
  if (!runId) {
    console.error('wait-for-job: --run-id is required');
    process.exit(EXIT_TIMEOUT);
  }
  if (!VALID_EXPECT.has(expect)) {
    console.error(`wait-for-job: --expect must be one of: ${[...VALID_EXPECT].join(', ')}`);
    process.exit(EXIT_TIMEOUT);
  }
  if (expect === 'resultLabel' && !leaf) {
    console.error('wait-for-job: --expect resultLabel requires --leaf <leafId>');
    process.exit(EXIT_TIMEOUT);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    console.error(`wait-for-job: --timeout must be a positive integer (got ${args.timeout})`);
    process.exit(EXIT_TIMEOUT);
  }
  if (!Number.isFinite(pollMs) || pollMs <= 0) {
    console.error(`wait-for-job: --poll-ms must be a positive integer (got ${args['poll-ms']})`);
    process.exit(EXIT_TIMEOUT);
  }

  const mPath = manifestPath(runId);
  const exists = existsSync(mPath);

  if (!exists) {
    console.error(`wait-for-job: manifest not found at ${mPath} (job may not have started yet)`);
    process.exit(EXIT_TIMEOUT);
  }

  // Run the poll loop
  const result = await waitForJob({ runId, expect, leaf, timeoutMs, pollMs });

  const elapsedS = (result.elapsedMs / 1000).toFixed(1);
  switch (result.exitCode) {
    case EXIT_CONDITION_MET:
      console.log(`wait-for-job: CONDITION MET — ${result.detail} (${result.polls} polls, ${elapsedS}s)`);
      break;
    case EXIT_TIMEOUT:
      console.error(`wait-for-job: TIMEOUT — ${result.detail} (${result.polls} polls, ${elapsedS}s)`);
      break;
    case EXIT_RUN_FAILED:
      console.error(`wait-for-job: RUN FAILED — ${result.detail} (${result.polls} polls, ${elapsedS}s)`);
      break;
    default:
      console.error(`wait-for-job: UNKNOWN exit ${result.exitCode} — ${result.detail}`);
  }

  process.exit(result.exitCode);
}

// Export for testing; run main only when invoked directly
export { waitForJob, evaluate, parseArgs, manifestPath, loadManifest, loadLeafResult, EXIT_CONDITION_MET, EXIT_TIMEOUT, EXIT_RUN_FAILED, VALID_EXPECT, DEFAULT_TIMEOUT_MS, DEFAULT_POLL_MS };

// CLI entry guard
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`wait-for-job: fatal — ${err.message}`);
    process.exit(EXIT_TIMEOUT);
  });
}
