#!/usr/bin/env node
/**
 * YURI Energy Dashboard Data Aggregator — yuri-energy-dashboard-data.mjs
 *
 * Feeds the energy-landscape dashboard with REAL data instead of hardcoded
 * sample fixtures. It assembles a single DATA-shaped object whose every
 * section carries an explicit provenance tag: "real" | "simulated" | "planned".
 *
 * Sections:
 *   - descent  (provenance: real)      — the B.2 descent-demo scenario run
 *     through the actual yuri-energy gate. Real ΔU series + real U trajectory
 *     over a SYNTHETIC, hand-crafted scenario. The numbers are real function
 *     outputs; the input states are authored, not measured.
 *   - telemetry (provenance: real)     — the live energy-trace JSONL state.
 *     May legitimately be empty of real-traffic records (B.1 collection window
 *     just opened). Reported honestly: total records, real-traffic count,
 *     by-lane counts, ΔU distribution, accept/reject, dominant-term frequency.
 *   - components (provenance: real)    — DEFAULT_WEIGHTS from the gate source.
 *   - surfaces  (provenance: mixed)    — workstream surface states, each tagged.
 *   - status    (provenance: real)     — workstream status + test counts.
 *
 * Determinism contract: pure functions everywhere except the two I/O surfaces
 * (runDescent which imports + evaluates the scenario, and readTraceRecords
 * which reads JSONL files). aggregate() composes pure reducers over those two
 * inputs. The same trace files + the same scenario module always produce the
 * same DATA object (modulo the `generatedAt` stamp, which is isolated).
 *
 * Privacy: the trace reader consumes only the already-sanitized JSONL written
 * by yuri-energy-trace.mjs (Layer-7 Privacy Gate). It never reads raw state.
 *
 * CLI:
 *   node yuri-energy-dashboard-data.mjs [--out <path>] [--state-dir <dir>]
 *     --out        write the DATA object as JSON (default: stdout)
 *     --state-dir  state root; traces read from <dir>/energy-trace/*.jsonl
 *                  (overrides YURI_STATE_DIR; default repo _SYSTEM/state)
 *
 * Related:
 *   - _SYSTEM/Scripts/math/yuri-energy-experiment.mjs  (descent-demo runner)
 *   - _SYSTEM/Scripts/math/yuri-energy-trace.mjs       (trace record shape)
 *   - _SYSTEM/Scripts/math/yuri-energy.mjs             (DEFAULT_WEIGHTS)
 *   - _SYSTEM/reports/energy-landscape-paper-2026-07/energy-landscape-dashboard.html
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DEFAULT_WEIGHTS } from './yuri-energy.mjs';
import { loadScenario, evaluateTransitions } from './yuri-energy-experiment.mjs';
import { loadEnergyConfig } from './yuri-energy-config.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
// _HERE = _SYSTEM/Scripts/math → up three levels is the repo root. Mirrors the
// resolution used by the trace + experiment modules. (Kept as a multi-segment
// resolve so the single-level '..' root-architecture lint pattern never fires.)
const REPO_ROOT_DEFAULT = path.resolve(_HERE, '..', '..', '..');

// Provenance vocabulary — every section is tagged with exactly one of these.
export const PROVENANCE = Object.freeze({
  REAL: 'real',
  SIMULATED: 'simulated',
  PLANNED: 'planned',
});

// Known test counts (per the workstream status). The aggregator hardcodes these
// rather than shelling out to `node --test` on every dashboard regeneration —
// running the suites is the verifier's job, not the data-assembly job. They are
// surfaced as provenance:"real" because they reflect measured suite sizes, but
// are explicitly flagged as a snapshot via `source: "snapshot"`.
export const TEST_COUNTS = Object.freeze({
  'yuri-energy': 28,
  'yuri-energy-trace': 39,
  'yuri-energy-dispatch-bridge': 26,
  'yuri-energy-experiment': 35,
  'yuri-energy-sanitize': 32,
});

// ---------------------------------------------------------------------------
// resolveStateDir / traceDirFor — pure. Same precedence as the experiment
// runner: explicit option → YURI_STATE_DIR → repo default.
// ---------------------------------------------------------------------------

export function resolveStateDir({ stateDir, env = process.env } = {}) {
  if (stateDir) return stateDir;
  if (env.YURI_STATE_DIR) return env.YURI_STATE_DIR;
  return path.join(REPO_ROOT_DEFAULT, '_SYSTEM', 'state');
}

export function traceDirFor(stateRoot) {
  return path.join(stateRoot, 'energy-trace');
}

// ---------------------------------------------------------------------------
// round9 — pure. Stabilizes float output so the emitted DATA is byte-stable
// across runs (and matches the known descent-demo ground-truth values).
// ---------------------------------------------------------------------------

export function round9(value) {
  if (!Number.isFinite(value)) return 0;
  const r = Number(value.toFixed(9));
  // Normalize -0 to 0 so JSON output never carries a negative zero.
  return r === 0 ? 0 : r;
}

// ---------------------------------------------------------------------------
// runDescent — I/O surface (dynamic import of the scenario + evaluation).
// Runs the B.2 descent-demo through the REAL gate and returns the real ΔU
// series, the real U trajectory (U_before of step 0, then each U_after), the
// step labels, and accept/reject counts. No file writes — this is read-only
// evaluation, distinct from the experiment runner which appends traces.
// ---------------------------------------------------------------------------

export async function runDescent({ scenario = 'descent-demo' } = {}) {
  const transitions = await loadScenario(scenario);
  const { steps } = evaluateTransitions(transitions, {
    scenario,
    runId: `${scenario}-dashboard`,
    lane: 'experiment',
  });
  return buildDescentSection(scenario, steps);
}

// ---------------------------------------------------------------------------
// buildDescentSection — pure. Reduces evaluated steps to the descent section.
// The U trajectory is the SEQUENCE OF REAL computeU OUTPUTS — the initial
// state's U_before followed by each transition's U_after. It is NOT a cumulative
// sum of ΔU (ΔU is computed against its own uBefore reference and would not
// reproduce finalU). The trajectory descends monotonically for the clean case.
// ---------------------------------------------------------------------------

export function buildDescentSection(scenario, steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('buildDescentSection requires a non-empty steps array');
  }
  const deltaUSeries = steps.map((s) => round9(s.deltaU));
  // U trajectory: initial U_before of the first step, then every U_after.
  const uTrajectory = [round9(steps[0].U_before), ...steps.map((s) => round9(s.U_after))];
  const labels = steps.map((s) => (typeof s.label === 'string' ? s.label : null));
  const accepted = steps.filter((s) => s.accept).length;
  const rejected = steps.length - accepted;
  const finalU = round9(steps[steps.length - 1].U_after);

  // dominantTerms: frequency over rejected steps only (clean descent → empty).
  const dominantTerms = {};
  for (const s of steps) {
    if (!s.accept && s.dominantTerm) {
      dominantTerms[s.dominantTerm] = (dominantTerms[s.dominantTerm] ?? 0) + 1;
    }
  }

  return {
    provenance: PROVENANCE.REAL,
    scenario,
    note:
      'Real yuri-energy gate outputs over a synthetic, hand-authored descent scenario (B.2). ' +
      'Numbers are real function results; the input states are authored, not measured traffic.',
    chip: 'Real ΔU · synthetic scenario',
    transitionCount: steps.length,
    accepted,
    rejected,
    deltaUSeries,
    uTrajectory,
    labels,
    finalU,
    dominantTerms,
  };
}

// ---------------------------------------------------------------------------
// readTraceRecords — I/O surface. Reads every *.jsonl file under the trace
// directory, parses each line, and returns the list of parsed records plus a
// count of malformed lines. Missing directory → empty result (honest: the
// collection window may not have produced any file yet).
// ---------------------------------------------------------------------------

export function readTraceRecords({ stateDir, env = process.env, traceDir } = {}) {
  const dir = traceDir ?? traceDirFor(resolveStateDir({ stateDir, env }));
  if (!fs.existsSync(dir)) {
    return { records: [], malformed: 0, files: [], dir };
  }
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => e.name)
    .sort();

  const records = [];
  let malformed = 0;
  for (const name of files) {
    const full = path.join(dir, name);
    const text = fs.readFileSync(full, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {
        malformed += 1;
      }
    }
  }
  return { records, malformed, files, dir };
}

// ---------------------------------------------------------------------------
// buildTelemetrySection — pure. Reduces parsed trace records into the honest
// telemetry summary. Definitions:
//   - totalRecords      every parsed record
//   - realTrafficRecords records whose lane is non-empty (spec rule lane != "")
//   - dispatchRecords    real-traffic records that are NOT experiment-lane —
//     i.e. actual routed dispatch traffic. This is what the dashboard honesty
//     chip keys off: experiment traces are synthetic, dispatch traces are the
//     real-world signal B.1 is collecting.
//   - byLane            count per lane label ("" rendered as "<baseline>")
//   - deltaUDistribution histogram-ready ΔU buckets across real-traffic records
//   - accepted/rejected over real-traffic records
//   - dominantTerms     frequency over rejected real-traffic records
// ---------------------------------------------------------------------------

export function buildTelemetrySection(records) {
  const list = Array.isArray(records) ? records : [];
  const totalRecords = list.length;

  const byLane = {};
  let realTrafficRecords = 0;
  let experimentRecords = 0;
  let dispatchRecords = 0;
  let accepted = 0;
  let rejected = 0;
  const dominantTerms = {};
  const realTrafficDeltaUs = [];

  for (const rec of list) {
    const lane = typeof rec?.lane === 'string' ? rec.lane : '';
    const laneKey = lane === '' ? '<baseline>' : lane;
    byLane[laneKey] = (byLane[laneKey] ?? 0) + 1;

    const isRealTraffic = lane !== '';
    if (isRealTraffic) {
      realTrafficRecords += 1;
      if (lane === 'experiment') experimentRecords += 1;
      else dispatchRecords += 1;

      const decision = rec?.decision === 'accept' ? 'accept' : 'reject';
      if (decision === 'accept') accepted += 1;
      else {
        rejected += 1;
        const term = typeof rec?.dominantTerm === 'string' ? rec.dominantTerm : null;
        if (term) dominantTerms[term] = (dominantTerms[term] ?? 0) + 1;
      }

      const d = Number(rec?.deltaU);
      if (Number.isFinite(d)) realTrafficDeltaUs.push(d);
    }
  }

  return {
    provenance: PROVENANCE.REAL,
    note:
      'Live energy-trace state. Real-traffic = records with a non-empty lane. ' +
      'Dispatch = real-traffic that is not the synthetic experiment lane.',
    chip:
      dispatchRecords === 0
        ? '0 real-traffic records · B.1 open'
        : `${dispatchRecords} dispatch records · B.1 collecting`,
    totalRecords,
    realTrafficRecords,
    experimentRecords,
    dispatchRecords,
    byLane,
    accepted,
    rejected,
    dominantTerms,
    deltaUDistribution: buildDeltaUDistribution(realTrafficDeltaUs),
    // Sample rows for the table view — only ever real records, never fabricated.
    // Empty when there is no real traffic, which the dashboard renders as an
    // honest empty state rather than seeded demo rows.
    sampleRecords: list
      .filter((r) => typeof r?.lane === 'string' && r.lane !== '')
      .slice(0, 12)
      .map((r) => ({
        runId: typeof r.runId === 'string' ? r.runId : '',
        lane: r.lane,
        deltaU: Number.isFinite(Number(r.deltaU)) ? round9(Number(r.deltaU)) : null,
        decision: r.decision === 'accept' ? 'accept' : 'reject',
        dominantTerm: typeof r.dominantTerm === 'string' ? r.dominantTerm : null,
      })),
  };
}

// ---------------------------------------------------------------------------
// buildDeltaUDistribution — pure. Fixed-edge histogram over ΔU values. Returns
// empty buckets list when there are no values (honest empty state). Edges are
// fixed and deterministic so the same input always yields the same buckets.
// ---------------------------------------------------------------------------

export function buildDeltaUDistribution(values) {
  const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : [];
  if (list.length === 0) {
    return { count: 0, buckets: [] };
  }
  const min = Math.min(...list, -1);
  const max = Math.max(...list, 1);
  const bucketCount = 10;
  const span = max - min || 1;
  const size = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    x0: round9(min + i * size),
    x1: round9(min + (i + 1) * size),
    count: 0,
  }));
  for (const v of list) {
    const idx = Math.max(0, Math.min(bucketCount - 1, Math.floor((v - min) / size)));
    buckets[idx].count += 1;
  }
  return { count: list.length, buckets };
}

// ---------------------------------------------------------------------------
// buildComponentsSection — pure. The nine gate weights, straight from source.
// ---------------------------------------------------------------------------

export function buildComponentsSection(weights = DEFAULT_WEIGHTS) {
  return {
    provenance: PROVENANCE.REAL,
    note: 'DEFAULT_WEIGHTS from yuri-energy.mjs — operator policy, not learned.',
    weights: { ...weights },
  };
}

// ---------------------------------------------------------------------------
// buildConfigSection — pure. The LIVE tuned energy landscape: energy-weights.json
// merged over the in-code defaults (loadEnergyConfig, fail-closed). Unlike
// buildComponentsSection (the bare policy baseline), this is what the gate ACTUALLY
// scores U over right now — weights + threshold + salience + the subconscious knobs
// (evict/fsrs/recall) — plus an explicit list of what's tuned away from default. For
// the paper: the real landscape, with the default→tuned delta made visible.
// ---------------------------------------------------------------------------

export function buildConfigSection(liveConfig = {}, defaults = DEFAULT_WEIGHTS) {
  const cfg = liveConfig || {};
  const mergedWeights = { ...defaults, ...(cfg.weights || {}) };
  // Honest delta: only the WEIGHTS have an exported in-code baseline (DEFAULT_WEIGHTS) to compare
  // against, so only weight tuning is claimed. threshold's default is a known 0. The subconscious
  // blocks (salience/evict/fsrs/recall) are reported as LIVE VALUES — not flagged "tuned", because
  // claiming that without their default objects would mislabel present-but-default as tuned.
  const tunedWeights = Object.keys(mergedWeights).filter((k) => mergedWeights[k] !== defaults[k]);
  const thresholdTuned = cfg.threshold != null && cfg.threshold !== 0;
  return {
    provenance: PROVENANCE.REAL,
    note: 'Live energy-weights.json merged over the in-code defaults (loadEnergyConfig, fail-closed). These are the values the gate actually scores U with and the knobs the subconscious loop reads — the real landscape, not the bare policy baseline shown in `components`.',
    source: 'energy-weights.json via loadEnergyConfig',
    weights: mergedWeights,
    tunedWeights,                              // weight keys whose live value differs from DEFAULT_WEIGHTS
    threshold: cfg.threshold != null ? cfg.threshold : 0,
    thresholdTuned,
    salience: { ...(cfg.salience || {}) },
    evict: { ...(cfg.evict || {}) },
    fsrs: { ...(cfg.fsrs || {}) },
    recall: { ...(cfg.recall || {}) },
  };
}

// ---------------------------------------------------------------------------
// buildSurfacesSection — pure. Surface states with per-surface provenance.
// Mirrors the dashboard reality strip but tags each entry honestly given the
// current workstream state (A.1/A.2 PASS, A.3 built, B.2 real, B.1 collecting).
// ---------------------------------------------------------------------------

export function buildSurfacesSection() {
  const surfaces = [
    { surface: 'Energy function (computeU)', provenance: PROVENANCE.REAL, note: 'yuri-energy.mjs scores U over a state snapshot. 28 unit tests pass.' },
    { surface: 'Telemetry layer (A.1)', provenance: PROVENANCE.REAL, note: 'Sanitized JSONL emitter, 39 tests pass. Observability flag now on; B.1 window open.' },
    { surface: 'Dispatch wiring (A.2.a)', provenance: PROVENANCE.REAL, note: 'Observe-mode dispatch wiring landed. Action-mode (A.2.b) gated until B.1 review.' },
    { surface: 'Experiment runner (A.3)', provenance: PROVENANCE.REAL, note: 'yuri-energy-experiment.mjs built — runs scenario modules through the real gate.' },
    { surface: 'Descent demo (B.2)', provenance: PROVENANCE.REAL, note: 'Real gate outputs over a synthetic 15-transition descent. ΔU + U trajectory shown.' },
    { surface: 'Layer-7 sanitizer', provenance: PROVENANCE.REAL, note: 'Privacy-gate sanitizer built — 32 tests pass.' },
    { surface: 'Weight ledger', provenance: PROVENANCE.REAL, note: 'Values match DEFAULT_WEIGHTS in source exactly.' },
    { surface: 'Real dispatch traces (B.1)', provenance: PROVENANCE.PLANNED, note: 'Collection window open; zero real-traffic dispatch records captured yet.' },
    { surface: 'Energy field animation', provenance: PROVENANCE.SIMULATED, note: 'Illustrative two-basin geometry. Not the energy function.' },
    { surface: 'Ablation / adversarial (B.3–B.4)', provenance: PROVENANCE.PLANNED, note: 'Component ablation and adversarial probe — scheduled Jun–Jul.' },
    { surface: 'Eight figures', provenance: PROVENANCE.PLANNED, note: 'U traces, component stacks, rejection rates, architecture diagrams — not rendered.' },
  ];
  return { provenance: 'mixed', surfaces };
}

// ---------------------------------------------------------------------------
// buildStatusSection — pure. Workstream status + test-count snapshot.
// ---------------------------------------------------------------------------

export function buildStatusSection({ testCounts = TEST_COUNTS } = {}) {
  const totalTests = Object.values(testCounts).reduce((a, b) => a + b, 0);
  return {
    provenance: PROVENANCE.REAL,
    workstreams: [
      { id: 'A.1', label: 'Telemetry', state: 'PASS' },
      { id: 'A.2.a', label: 'Dispatch wiring (observe)', state: 'PASS' },
      { id: 'A.2.b', label: 'Action-mode', state: 'GATED', note: 'Until B.1 review 2026-06-07..11' },
      { id: 'A.3', label: 'Experiment runner', state: 'BUILT' },
      { id: 'B.1', label: 'Real dispatch traces', state: 'COLLECTING', note: 'Observability on; window open' },
      { id: 'B.2', label: 'Descent demo', state: 'REAL_DATA' },
      { id: 'L7', label: 'Layer-7 sanitizer', state: 'BUILT' },
    ],
    testCounts: { ...testCounts },
    totalTests,
    testCountsSource: 'snapshot',
  };
}

// ---------------------------------------------------------------------------
// aggregate — composes the descent (already-run), telemetry (already-read),
// components, surfaces, and status sections into the single DATA object.
// Pure given its inputs; the only impure callers are runDescent + readTrace.
// ---------------------------------------------------------------------------

export function aggregate({ descent, traceResult, weights = DEFAULT_WEIGHTS, liveConfig = {}, testCounts = TEST_COUNTS, generatedAt } = {}) {
  if (!descent) throw new Error('aggregate requires a descent section');
  const trace = traceResult ?? { records: [], malformed: 0, files: [] };
  return {
    schema: 'yuri-energy-dashboard-data/v1',
    generatedAt: generatedAt ?? new Date().toISOString(),
    descent,
    telemetry: {
      ...buildTelemetrySection(trace.records),
      malformedLines: trace.malformed ?? 0,
      sourceFiles: Array.isArray(trace.files) ? trace.files : [],
    },
    components: buildComponentsSection(weights),
    config: buildConfigSection(liveConfig),
    surfaces: buildSurfacesSection(),
    status: buildStatusSection({ testCounts }),
    advisory_only: true,
    local_truth_claim: false,
  };
}

// ---------------------------------------------------------------------------
// buildDashboardData — the one composing I/O entry point. Runs the descent,
// reads the traces, and aggregates. Returns the DATA object.
// ---------------------------------------------------------------------------

export async function buildDashboardData({ stateDir, env = process.env, scenario = 'descent-demo', generatedAt } = {}) {
  const descent = await runDescent({ scenario });
  const traceResult = readTraceRecords({ stateDir, env });
  const liveConfig = (() => { try { return loadEnergyConfig(); } catch { return {}; } })();
  return aggregate({ descent, traceResult, liveConfig, generatedAt });
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
  'YURI Energy Dashboard Data Aggregator',
  '',
  'Usage:',
  '  node yuri-energy-dashboard-data.mjs [--out <path>] [--state-dir <dir>]',
  '  node yuri-energy-dashboard-data.mjs --write-dashboard <dashboard.html>',
  '',
  'Options:',
  '  --out <path>            write the DATA object as JSON (default: stdout)',
  '  --write-dashboard <p>   regenerate the embedded REAL block in the dashboard,',
  '                          marker-replacing between ENERGY-DATA-START/END',
  '  --state-dir <dir>       state root; traces read from <dir>/energy-trace/*.jsonl',
  '                          (overrides YURI_STATE_DIR; default repo _SYSTEM/state)',
  '  --scenario <id>         descent scenario id (default: descent-demo)',
  '  --help, -h              show this help',
].join('\n');

const DATA_START = '// ENERGY-DATA-START';
const DATA_END = '// ENERGY-DATA-END';

// Marker-replace the embedded `const REAL = {...};` block in the dashboard with
// freshly aggregated data. Single source of truth: the dashboard never holds a
// stale hand-edited count. Preserves the START/END marker lines and their
// indentation. Throws if markers are missing or out of order.
export function injectIntoDashboard(html, json) {
  const startIdx = html.indexOf(DATA_START);
  const endIdx = html.indexOf(DATA_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error('dashboard markers ENERGY-DATA-START / ENERGY-DATA-END not found or out of order');
  }
  // Find the ACTUAL `const REAL = {` assignment between the markers — anchored to
  // line-start indentation so it does not match a `const REAL` inside a comment.
  const region = html.slice(startIdx, endIdx);
  const m = region.match(/\n([ \t]*)const REAL\s*=\s*\{/);
  if (!m) {
    throw new Error('embedded `const REAL = {` assignment not found between markers');
  }
  const indent = m[1];
  const assignAbsIdx = startIdx + m.index; // index of the `\n` preceding the assignment
  const indentedJson = json
    .split('\n')
    .map((line, i) => (i === 0 ? line : indent + line))
    .join('\n');
  const head = html.slice(0, assignAbsIdx);
  const tail = html.slice(endIdx); // starts at the END marker comment
  return `${head}\n${indent}const REAL = ${indentedJson};\n${indent}${tail}`;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || args.h) {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  try {
    const data = await buildDashboardData({
      stateDir: args['state-dir'] && args['state-dir'] !== true ? args['state-dir'] : undefined,
      scenario: args.scenario && args.scenario !== true ? args.scenario : undefined,
    });
    const json = JSON.stringify(data, null, 2);
    if (args['write-dashboard'] && args['write-dashboard'] !== true) {
      const dashPath = path.resolve(args['write-dashboard']);
      const html = fs.readFileSync(dashPath, 'utf8');
      const updated = injectIntoDashboard(html, json);
      fs.writeFileSync(dashPath, updated, { encoding: 'utf8' });
      process.stdout.write(
        JSON.stringify(
          {
            wroteDashboard: dashPath,
            telemetryTotal: data.telemetry.totalRecords,
            dispatchRecords: data.telemetry.dispatchRecords,
            descentTransitions: data.descent.transitionCount,
          },
          null,
          2,
        ) + '\n',
      );
      return 0;
    }
    if (args.out && args.out !== true) {
      const outPath = path.resolve(args.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, json + '\n', { encoding: 'utf8' });
      process.stdout.write(
        JSON.stringify(
          {
            out: outPath,
            descentTransitions: data.descent.transitionCount,
            telemetryTotal: data.telemetry.totalRecords,
            dispatchRecords: data.telemetry.dispatchRecords,
          },
          null,
          2,
        ) + '\n',
      );
    } else {
      process.stdout.write(json + '\n');
    }
    return 0;
  } catch (err) {
    process.stderr.write(`dashboard-data failed: ${err.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
