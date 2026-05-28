#!/usr/bin/env node
/**
 * YURI Energy Experiment Runner — yuri-energy-experiment.mjs
 *
 * A reusable harness for controlled energy-gate experiments (Workstream A.3 of
 * the energy-landscape paper). It loads a scenario module that emits an ordered
 * sequence of state transitions, runs each transition through the energy gate
 * (computeU / computeDeltaU / gateProposal), records each evaluation via the
 * telemetry layer's buildTraceRecord/appendTrace (Privacy-Gate-validated), and
 * emits a compact summary JSON.
 *
 * Same telemetry format as A.1 — controlled-experiment traces and real-dispatch
 * traces are directly comparable.
 *
 * CLI:
 *   node yuri-energy-experiment.mjs run --scenario <id> --out <path> [--state-dir <dir>]
 *
 * Scenario modules live at:
 *   _SYSTEM/Scripts/math/experiments/<id>.mjs
 * and must export a function (named `scenario` or default) returning an ordered
 * array of { stateBefore, stateAfter, label } transitions. Scenario modules are
 * data-like: pure, deterministic, no I/O.
 *
 * Design contract:
 *   - Pure functions where possible. `runExperiment` is the ONLY I/O surface
 *     (it appends trace records and writes the summary file). Everything else
 *     (loadScenario validation, evaluateTransitions, buildSummary) is pure aside
 *     from the dynamic import in loadScenario.
 *   - Privacy: only records that pass validateRecord are written. appendTrace
 *     already validates; this harness also validates explicitly before append
 *     so a malformed record is rejected before any file is touched.
 *   - State-dir resolution: --state-dir overrides YURI_STATE_DIR, which overrides
 *     the default. Traces land under <state-dir>/energy-trace/ via appendTrace's
 *     own resolution (we pass traceDir explicitly so resolution is deterministic).
 *
 * Status: fixture_ready. Supports Workstream B controlled experiments (B.2–B.4).
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs        (gate primitives)
 *   - _SYSTEM/Scripts/math/yuri-energy-trace.mjs  (telemetry + Privacy Gate v3)
 *   - _SYSTEM/Scripts/math/experiments/           (scenario modules)
 *   - _SYSTEM/reports/energy-landscape-paper-2026-07/00-evidence-plan.md §A.3
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  computeU,
  computeDeltaU,
  gateProposal,
  DEFAULT_WEIGHTS,
} from './yuri-energy.mjs';
import {
  buildTraceRecord,
  appendTrace,
  validateRecord,
} from './yuri-energy-trace.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPERIMENTS_DIR = path.join(_HERE, 'experiments');

// Scenario id grammar: lowercase letters, digits, and hyphens only. This both
// documents intent and prevents path traversal (no '/', no '..', no absolute
// paths) when mapping an id to a module file.
const SCENARIO_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ---------------------------------------------------------------------------
// resolveStateDir — pure. Returns the state root that traces hang under.
// Precedence: explicit option (--state-dir) → YURI_STATE_DIR env → default.
// ---------------------------------------------------------------------------

export function resolveStateDir({ stateDir, env = process.env } = {}) {
  if (stateDir) return stateDir;
  if (env.YURI_STATE_DIR) return env.YURI_STATE_DIR;
  // Default mirrors yuri-energy-trace.mjs: <repo-root>/_SYSTEM/state.
  // _HERE = _SYSTEM/Scripts/math → ../../.. = repo root.
  return path.join(_HERE, '..', '..', '..', '_SYSTEM', 'state');
}

export function traceDirFor(stateRoot) {
  return path.join(stateRoot, 'energy-trace');
}

// ---------------------------------------------------------------------------
// loadScenario — locate and import a scenario module by id; validate its shape.
// The dynamic import is the only impurity here; the validation is pure.
// ---------------------------------------------------------------------------

export function resolveScenarioPath(scenarioId, { experimentsDir = EXPERIMENTS_DIR } = {}) {
  if (typeof scenarioId !== 'string' || scenarioId.length === 0) {
    throw new Error('scenario id is required (non-empty string)');
  }
  if (!SCENARIO_ID_RE.test(scenarioId)) {
    throw new Error(
      `invalid scenario id '${scenarioId}': must match ${SCENARIO_ID_RE} ` +
        `(no slashes, no traversal, lowercase/digits/hyphens only)`,
    );
  }
  return path.join(experimentsDir, `${scenarioId}.mjs`);
}

export async function loadScenario(scenarioId, options = {}) {
  const modulePath = resolveScenarioPath(scenarioId, options);
  if (!fs.existsSync(modulePath)) {
    throw new Error(`scenario '${scenarioId}' not found at ${modulePath}`);
  }

  const mod = await import(pathToFileURL(modulePath).href);
  const fn = mod.scenario ?? mod.default;
  if (typeof fn !== 'function') {
    throw new Error(
      `scenario '${scenarioId}' must export a function (named 'scenario' or default)`,
    );
  }

  const transitions = fn();
  validateTransitions(transitions, scenarioId);
  return transitions;
}

// ---------------------------------------------------------------------------
// validateTransitions — pure. Reject malformed scenarios with a precise error.
// ---------------------------------------------------------------------------

function isPlainState(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateTransitions(transitions, scenarioId = '<unknown>') {
  if (!Array.isArray(transitions)) {
    throw new Error(`scenario '${scenarioId}' must return an array of transitions`);
  }
  if (transitions.length === 0) {
    throw new Error(`scenario '${scenarioId}' returned zero transitions`);
  }
  transitions.forEach((t, i) => {
    if (!isPlainState(t)) {
      throw new Error(`scenario '${scenarioId}' transition[${i}] is not an object`);
    }
    if (!isPlainState(t.stateBefore)) {
      throw new Error(`scenario '${scenarioId}' transition[${i}].stateBefore is not an object`);
    }
    if (!isPlainState(t.stateAfter)) {
      throw new Error(`scenario '${scenarioId}' transition[${i}].stateAfter is not an object`);
    }
    if (t.label !== undefined && typeof t.label !== 'string') {
      throw new Error(`scenario '${scenarioId}' transition[${i}].label must be a string when present`);
    }
  });
  return transitions;
}

// ---------------------------------------------------------------------------
// evaluateTransitions — pure. Runs each transition through the gate, builds a
// trace record per transition, validates it, returns per-step results plus the
// records. No I/O — file writes happen only in runExperiment.
// ---------------------------------------------------------------------------

export function evaluateTransitions(transitions, {
  scenario,
  runId,
  lane = 'experiment',
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
} = {}) {
  const steps = [];
  const records = [];

  transitions.forEach((transition, index) => {
    const { stateBefore, stateAfter } = transition;

    const computeUResult = computeU(stateAfter, weights);
    const computeDeltaUResult = computeDeltaU(stateBefore, stateAfter, weights);
    const gateProposalResult = gateProposal({
      stateBefore,
      stateAfter,
      weights,
      threshold,
      allowOverride,
    });

    const stepRunId = `${runId}-${index}`;
    const record = buildTraceRecord({
      lane,
      runId: stepRunId,
      stateBefore,
      stateAfter,
      computeUResult,
      computeDeltaUResult,
      gateProposalResult,
      weights,
      threshold,
      allowOverride,
    });

    // Privacy Gate: refuse to carry any record that would not pass validation.
    // appendTrace re-validates at write time; validating here means a malformed
    // record aborts the whole run before any partial file is written.
    validateRecord(record);

    steps.push({
      index,
      label: typeof transition.label === 'string' ? transition.label : null,
      U_before: computeDeltaUResult.result.uBefore,
      U_after: computeUResult.result.U,
      deltaU: gateProposalResult.result.deltaU,
      accept: gateProposalResult.result.accept,
      dominantTerm: gateProposalResult.result.dominantTerm ?? null,
      componentDeltas: gateProposalResult.result.componentDeltas,
    });
    records.push(record);
  });

  return { steps, records, scenario };
}

// ---------------------------------------------------------------------------
// buildSummary — pure. Reduces per-step results to the summary contract:
//   { scenario, transitionCount, accepted, rejected, deltaUSeries,
//     dominantTerms, finalU }
// ---------------------------------------------------------------------------

export function buildSummary({ scenario, steps }) {
  const accepted = steps.filter((s) => s.accept).length;
  const rejected = steps.length - accepted;
  const deltaUSeries = steps.map((s) => s.deltaU);

  // dominantTerms: frequency of which component drove each rejection. Only
  // rejected steps contribute a dominantTerm (accepted descents have none).
  const dominantTerms = {};
  for (const step of steps) {
    if (!step.accept && step.dominantTerm) {
      dominantTerms[step.dominantTerm] = (dominantTerms[step.dominantTerm] ?? 0) + 1;
    }
  }

  const finalU = steps.length > 0 ? steps[steps.length - 1].U_after : 0;

  return {
    scenario,
    transitionCount: steps.length,
    accepted,
    rejected,
    deltaUSeries,
    dominantTerms,
    finalU,
    advisory_only: true,
    local_truth_claim: false,
  };
}

// ---------------------------------------------------------------------------
// runExperiment — the ONLY I/O surface. Loads a scenario, evaluates it, appends
// each trace record under <state-dir>/energy-trace/, writes the summary to
// `out`, and returns the summary plus the resolved paths.
// ---------------------------------------------------------------------------

export async function runExperiment({
  scenario: scenarioId,
  out,
  stateDir,
  runId,
  lane = 'experiment',
  weights = DEFAULT_WEIGHTS,
  threshold = 0,
  allowOverride = false,
  dateOverride,
  env = process.env,
} = {}) {
  if (!scenarioId) throw new Error('runExperiment requires a scenario id');
  if (!out) throw new Error('runExperiment requires an --out path');

  const transitions = await loadScenario(scenarioId);
  const effectiveRunId = runId ?? `${scenarioId}-${new Date().toISOString()}`;

  const { steps, records } = evaluateTransitions(transitions, {
    scenario: scenarioId,
    runId: effectiveRunId,
    lane,
    weights,
    threshold,
    allowOverride,
  });

  const stateRoot = resolveStateDir({ stateDir, env });
  const traceDir = traceDirFor(stateRoot);

  // Append each validated record. appendTrace validates again (defense in depth)
  // and is the canonical write path that honors the same date-stamped JSONL
  // format as real-dispatch telemetry.
  const traceFiles = new Set();
  for (const record of records) {
    const written = appendTrace(record, { traceDir, ...(dateOverride ? { dateOverride } : {}) });
    traceFiles.add(written);
  }

  const summary = buildSummary({ scenario: scenarioId, steps });

  // Write the summary JSON. mkdir the parent so an --out into a fresh dir works.
  const outPath = path.resolve(out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n', { encoding: 'utf8' });

  return {
    summary,
    outPath,
    traceDir,
    traceFiles: [...traceFiles],
    runId: effectiveRunId,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

const HELP = [
  'YURI Energy Experiment Runner',
  '',
  'Usage:',
  '  node yuri-energy-experiment.mjs run --scenario <id> --out <path> [--state-dir <dir>]',
  '',
  'Options:',
  '  --scenario <id>    scenario module id under experiments/<id>.mjs (required)',
  '  --out <path>       summary JSON output path (required)',
  '  --state-dir <dir>  state root; traces land under <dir>/energy-trace/',
  '                     (overrides YURI_STATE_DIR; default is repo _SYSTEM/state)',
  '  --lane <name>      lane label recorded in traces (default: experiment)',
  '  --run-id <id>      run id prefix for trace records (default: <scenario>-<iso>)',
  '  --help, -h         show this help',
].join('\n');

async function main(argv) {
  const args = parseArgs(argv);

  if (args.help || args.h || argv.length === 0) {
    process.stdout.write(HELP + '\n');
    return 0;
  }

  const command = args._[0];
  if (command !== 'run') {
    process.stderr.write(`unknown command: ${command ?? '<none>'} (expected 'run')\n`);
    return 2;
  }

  if (!args.scenario || args.scenario === true) {
    process.stderr.write('--scenario <id> is required\n');
    return 2;
  }
  if (!args.out || args.out === true) {
    process.stderr.write('--out <path> is required\n');
    return 2;
  }

  try {
    const result = await runExperiment({
      scenario: args.scenario,
      out: args.out,
      stateDir: args['state-dir'] && args['state-dir'] !== true ? args['state-dir'] : undefined,
      lane: args.lane && args.lane !== true ? args.lane : undefined,
      runId: args['run-id'] && args['run-id'] !== true ? args['run-id'] : undefined,
    });
    process.stdout.write(
      JSON.stringify(
        {
          scenario: result.summary.scenario,
          transitionCount: result.summary.transitionCount,
          accepted: result.summary.accepted,
          rejected: result.summary.rejected,
          finalU: result.summary.finalU,
          out: result.outPath,
          traceFiles: result.traceFiles,
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  } catch (err) {
    process.stderr.write(`experiment failed: ${err.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
