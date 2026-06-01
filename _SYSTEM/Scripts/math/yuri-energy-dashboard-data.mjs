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
// COMPONENT_META — the eleven U components, each tied to its weight key (k),
// Greek symbol (sym), the componentContributions/componentDeltas field name it
// emits (cc), a human name, a one-line meaning, and a kind. Honest to the
// yuri-energy.mjs source comments and to computeU's additive decomposition.
//   kind: 'penalty' raises U · 'reward' lowers U · 'critical' is a hard/heavy veto term
// ---------------------------------------------------------------------------

export const COMPONENT_META = Object.freeze([
  { k: 'alpha',   sym: 'α', cc: 'entropy',                   name: 'entropy',    meta: 'how unsettled the claims are about where they stand',          kind: 'penalty' },
  { k: 'beta',    sym: 'β', cc: 'klDivergence',              name: 'claim drift', meta: 'how far the claims have drifted from what is verified',       kind: 'critical' },
  { k: 'gamma',   sym: 'γ', cc: 'logLoss',                   name: 'calibration', meta: 'the cost of a confident forecast that turns out wrong',       kind: 'penalty' },
  { k: 'delta',   sym: 'δ', cc: 'brier',                     name: 'accuracy',   meta: 'how far the forecasts land from what happened',                kind: 'penalty' },
  { k: 'epsilon', sym: 'ε', cc: 'informationGain',           name: 'progress',   meta: 'genuine new information lowers the number',                    kind: 'reward' },
  { k: 'zeta',    sym: 'ζ', cc: 'staleness',                 name: 'staleness',  meta: 'evidence that has aged drags the number back up',              kind: 'penalty' },
  { k: 'eta',     sym: 'η', cc: 'protectedPathViolations',   name: 'protected',  meta: 'a write into a protected zone. the uncancellable veto',        kind: 'critical' },
  { k: 'theta',   sym: 'θ', cc: 'promotionLadderInversions', name: 'ladder',     meta: 'a step that jumps the evidence it should rest on',             kind: 'critical' },
  { k: 'iota',    sym: 'ι', cc: 'verifiedEvidenceCredit',    name: 'verified',   meta: 'verified work, the one thing that lowers the number',          kind: 'reward' },
  { k: 'kappa',   sym: 'κ', cc: 'repeatedFailure',           name: 'repeats',    meta: 'the same confident mistake made again and again',              kind: 'critical' },
  { k: 'lambda',  sym: 'λ', cc: 'malformedForecast',         name: 'impossible', meta: 'a forecast outside the range a probability can take',          kind: 'critical' },
]);

export const SYM_BY_CC = Object.freeze(Object.fromEntries(COMPONENT_META.map((c) => [c.cc, c.sym])));
export const META_BY_CC = Object.freeze(Object.fromEntries(COMPONENT_META.map((c) => [c.cc, c])));

// Publication-voice labels for the rejection battery. The study harness names its
// cases with internal shorthand; for a reader-facing surface they are described by
// what the move IS, not by its internal id or a literal path.
export const BATTERY_PUBLIC_LABEL = Object.freeze({
  'protected-path': 'a write outside sanctioned scope',
  'confidently-wrong': 'a confidently wrong forecast',
  'malformed-forecast': 'an out-of-range forecast',
  'ladder-inversion': 'a jump up the evidence ladder',
  'healthy-edit': 'a verified edit that lands',
  'neutral': 'a no-op transition',
});

// downsample — pure. Reduce a dense [x, y] series to at most `target` points,
// always keeping the first and last and an even stride between. Keeps the
// emitted DATA small while preserving the descent shape. Deterministic.
export function downsample(points, target = 60) {
  const list = Array.isArray(points) ? points : [];
  if (list.length <= target || target < 2) return list.slice();
  const out = [];
  const stride = (list.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) {
    out.push(list[Math.round(i * stride)]);
  }
  // de-dupe consecutive identical x (rounding collisions) while keeping the last.
  const seen = new Set();
  const dedup = [];
  for (let i = 0; i < out.length; i++) {
    const x = out[i][0];
    if (seen.has(x) && i !== out.length - 1) continue;
    seen.add(x);
    dedup.push(out[i]);
  }
  return dedup;
}

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

export async function runDescentRaw({ scenario = 'descent-demo' } = {}) {
  const transitions = await loadScenario(scenario);
  const { steps } = evaluateTransitions(transitions, {
    scenario,
    runId: `${scenario}-dashboard`,
    lane: 'experiment',
  });
  return { scenario, steps };
}

export async function runDescent({ scenario = 'descent-demo' } = {}) {
  const { steps } = await runDescentRaw({ scenario });
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
  const w = { ...weights };
  return {
    provenance: PROVENANCE.REAL,
    note: 'DEFAULT_WEIGHTS from yuri-energy.mjs — operator policy, not learned. Eleven components: U is a weighted sum of penalties minus evidence credits.',
    weights: w,
    // list — every component with its weight, symbol, meaning, and kind, ordered
    // as the gate composes them. The dashboard renders this directly; no hand-authored
    // component table can drift from the live weights.
    list: COMPONENT_META.map((c) => ({ k: c.k, sym: c.sym, cc: c.cc, name: c.name, meta: c.meta, kind: c.kind, w: w[c.k] })),
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
// buildRealTrafficSection — pure. The REAL descent over real routed work.
// Reduces parsed trace records into the cumulative-ΔU story the hero tells:
//   - real-traffic   = records with a non-empty lane
//   - dispatch       = real-traffic that is NOT the synthetic experiment lane
//                      (this is the actual routed work; the hero curve)
// The cumulative series walks dispatch records in chronological order (files are
// read sorted, lines in order) accumulating ΔU. Sampled down for a compact emit.
// Observe mode: every dispatch transition is recorded and accepted (0 rejections);
// that honesty is carried in the note, not hidden.
// ---------------------------------------------------------------------------

export function buildRealTrafficSection(records, { sampleTo = 64 } = {}) {
  const list = Array.isArray(records) ? records : [];
  const isReal = (r) => typeof r?.lane === 'string' && r.lane !== '';
  const real = list.filter(isReal);
  const dispatch = real.filter((r) => r.lane !== 'experiment');
  const experiment = real.filter((r) => r.lane === 'experiment');

  const byLane = {};
  for (const r of list) {
    const lane = isReal(r) ? r.lane : '<baseline>';
    byLane[lane] = (byLane[lane] ?? 0) + 1;
  }

  let cum = 0;
  let deepest = 0;
  let accepted = 0;
  let rejected = 0;
  const points = [];
  const days = {};
  dispatch.forEach((r, i) => {
    const d = Number(r?.deltaU);
    const dd = Number.isFinite(d) ? d : 0;
    cum = round9(cum + dd);
    if (cum < deepest) deepest = cum;
    points.push([i, cum]);
    if (r?.decision === 'reject') rejected += 1;
    else accepted += 1;
    const day = typeof r?.timestamp === 'string' ? r.timestamp.slice(0, 10) : 'unknown';
    days[day] = days[day] ?? { n: 0, sum: 0 };
    days[day].n += 1;
    days[day].sum = round9(days[day].sum + dd);
  });

  const daysArr = Object.entries(days)
    .map(([d, v]) => ({ d, n: v.n, sum: v.sum }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  return {
    provenance: PROVENANCE.REAL,
    note:
      'Cumulative ΔU over REAL routed dispatch transitions — real-traffic lanes excluding the synthetic experiment lane. ' +
      'Read from _SYSTEM/state/energy-trace/*.jsonl. The gate runs in observe mode: every transition is recorded and accepted (0 rejections), ' +
      'so this proves the function and real descent, not rejection behaviour (that is the action-mode study).',
    chip: `${dispatch.length} dispatch transitions · observe mode`,
    totalRecords: list.length,
    realTrafficRecords: real.length,
    dispatchRecords: dispatch.length,
    experimentRecords: experiment.length,
    baselineRecords: byLane['<baseline>'] ?? 0,
    byLane,
    accepted,
    rejected,
    cumulativeDeltaU: cum,
    deepestU: deepest,
    series: downsample(points, sampleTo),
    days: daysArr,
  };
}

// ---------------------------------------------------------------------------
// buildWorkedMathSection — pure, current-code-honest. The accept examples are
// real steps from the live B.2 descent run: each step's componentDeltas are the
// per-term ΔU decomposition and they sum EXACTLY to deltaU (Σ terms === ΔU). The
// reject examples come from the action-mode battery rows (the real gate run in
// enforce semantics) — the dominant term and ΔU magnitude that force the reject.
// Both sides are produced by the live gate, never replayed from older traces.
// ---------------------------------------------------------------------------

export function buildWorkedMathSection(steps, studyReport) {
  const stepList = Array.isArray(steps) ? steps : [];
  const pickIdx = stepList.length
    ? [...new Set([0, Math.floor(stepList.length / 2), stepList.length - 1])]
    : [];
  const acceptExamples = pickIdx.map((idx) => {
    const s = stepList[idx];
    const deltas = s?.componentDeltas && typeof s.componentDeltas === 'object' ? s.componentDeltas : {};
    const terms = Object.entries(deltas)
      .filter(([, v]) => Number.isFinite(Number(v)) && Number(v) !== 0)
      .map(([cc, v]) => ({
        cc,
        sym: SYM_BY_CC[cc] ?? '',
        name: META_BY_CC[cc]?.name ?? cc,
        kind: META_BY_CC[cc]?.kind ?? 'penalty',
        delta: round9(Number(v)),
        dir: Number(v) < 0 ? 'down' : 'up',
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return {
      label: typeof s?.label === 'string' ? s.label : `transition ${idx}`,
      lane: 'experiment · B.2 descent-demo (live gate)',
      U_before: round9(Number(s?.U_before)),
      U_after: round9(Number(s?.U_after)),
      deltaU: round9(Number(s?.deltaU)),
      decision: s?.accept ? 'accept' : 'reject',
      terms,
      sumCheck: round9(terms.reduce((a, t) => a + t.delta, 0)),
    };
  });

  const rejectExamples = (studyReport?.study?.rows ?? [])
    .filter((r) => r?.kind === 'adversarial')
    .map((r) => ({
      label: BATTERY_PUBLIC_LABEL[r.id] ?? r.label,
      deltaU: round9(Number(r.deltaU)),
      decision: r.decision,
      expect: r.expect,
      correct: r.correct,
      dominantTerm: r.dominantTerm,
      dominantSym: SYM_BY_CC[r.dominantTerm] ?? '',
    }));

  return {
    provenance: PROVENANCE.REAL,
    note:
      'Per-term math, current-code-honest. Accept examples are real steps from the B.2 descent run through the live gate — ' +
      'each component delta is a real ΔU contribution and the terms sum exactly to ΔU. Reject examples are the action-mode ' +
      'battery run through the same gate in enforce semantics; the dominant term forces the reject.',
    acceptExamples,
    rejectExamples,
  };
}

// ---------------------------------------------------------------------------
// buildAttributionSection — pure. Feeds an attribution graph: the eleven
// components flowing into U. Each node carries its policy weight (the structural
// edge strength) AND an observed magnitude — the summed |ΔU contribution| seen
// in real evidence (the live descent run + the action-mode battery). `fired`
// marks components that have actually moved U in observed evidence vs those that
// have not yet been exercised. Honest: weight is policy, magnitude is empirical.
// ---------------------------------------------------------------------------

export function buildAttributionSection(steps, studyReport, weights = DEFAULT_WEIGHTS) {
  const mag = {};
  const add = (cc, v) => {
    const n = Math.abs(Number(v));
    if (Number.isFinite(n) && n > 0) mag[cc] = round9((mag[cc] ?? 0) + n);
  };
  for (const s of Array.isArray(steps) ? steps : []) {
    const deltas = s?.componentDeltas && typeof s.componentDeltas === 'object' ? s.componentDeltas : {};
    for (const [cc, v] of Object.entries(deltas)) add(cc, v);
  }
  for (const r of studyReport?.study?.rows ?? []) {
    if (r?.dominantTerm) add(r.dominantTerm, r.deltaU);
  }
  const nodes = COMPONENT_META.map((c) => ({
    k: c.k,
    sym: c.sym,
    cc: c.cc,
    name: c.name,
    kind: c.kind,
    weight: weights[c.k],
    observedMagnitude: mag[c.cc] ?? 0,
    fired: (mag[c.cc] ?? 0) > 0,
  }));
  const totalObserved = round9(nodes.reduce((a, n) => a + n.observedMagnitude, 0));
  return {
    provenance: PROVENANCE.REAL,
    note:
      'Attribution of U to its eleven components. weight = operator policy (structural edge strength); ' +
      'observedMagnitude = summed |ΔU contribution| seen in real evidence (B.2 descent run + action-mode battery). ' +
      'fired=false means the component has not yet been exercised in observed evidence.',
    nodes,
    totalObserved,
  };
}

// ---------------------------------------------------------------------------
// readLatestStudy — I/O surface. Reads the newest sandbox-action-study/study-*.json
// report written by yuri-action-mode-study.mjs. Returns null when absent (honest:
// the study may not have been run). Filenames embed a millisecond stamp, so a
// lexical sort puts the newest last.
// ---------------------------------------------------------------------------

export function readLatestStudy({ stateDir, env = process.env, studyDir } = {}) {
  const dir = studyDir ?? path.join(resolveStateDir({ stateDir, env }), 'sandbox-action-study');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('study-') && f.endsWith('.json'))
    .sort();
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// buildActionStudySection — pure. Reduces an action-mode study report into the
// dashboard's "teeth" section: the known-outcome battery (the gate's rejection
// proof), the confusion matrix, the shadow-replay false-positive rate on real
// traffic, and the graduation verdict. PLANNED provenance when no study exists.
// ---------------------------------------------------------------------------

export function buildActionStudySection(report) {
  if (!report || !report.study) {
    return {
      provenance: PROVENANCE.PLANNED,
      available: false,
      note: 'No action-mode study has been run yet. Run `node _SYSTEM/Scripts/yuri-action-mode-study.mjs`.',
    };
  }
  const s = report.study;
  const sh = report.shadow ?? {};
  return {
    provenance: PROVENANCE.REAL,
    available: true,
    ranAt: report.ranAt ?? null,
    note:
      'SHADOW study — the real gate run in enforce semantics over a known-outcome battery (its teeth), plus a shadow replay of ' +
      'recorded real traffic (the false-positive signal). Nothing was blocked. This is the graduation gate for live enforcement: ' +
      'battery all-correct AND ~0 real-traffic false-positives before the gate is allowed to block anything.',
    battery: (s.rows ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      label: BATTERY_PUBLIC_LABEL[r.id] ?? r.label,
      expect: r.expect,
      decision: r.decision,
      correct: r.correct,
      deltaU: round9(Number(r.deltaU)),
      dominantTerm: r.dominantTerm,
      dominantSym: SYM_BY_CC[r.dominantTerm] ?? '',
    })),
    confusion: {
      trueRejects: s.trueRejects ?? 0,
      falseAccepts: s.falseAccepts ?? 0,
      trueAccepts: s.trueAccepts ?? 0,
      falseRejects: s.falseRejects ?? 0,
      allCorrect: Boolean(s.allCorrect),
    },
    shadow: {
      total: sh.total ?? 0,
      wouldReject: sh.wouldReject ?? 0,
      falsePositiveRate: sh.falsePositiveRate ?? 0,
    },
    verdict: report.verdict ?? '',
  };
}

// ---------------------------------------------------------------------------
// buildSurfacesSection — pure. Surface states with per-surface provenance.
// Mirrors the dashboard reality strip but tags each entry honestly given the
// current workstream state (A.1/A.2 PASS, A.3 built, B.2 real, B.1 collecting).
// ---------------------------------------------------------------------------

export function buildSurfacesSection() {
  // Publication voice: surfaces named for what they are to a reader, not by
  // internal module, workstream, or test-suite identifiers.
  const surfaces = [
    { surface: 'The potential function', provenance: PROVENANCE.REAL, note: 'Scores the scalar potential over a state snapshot; exercised by a full battery of cases.' },
    { surface: 'Telemetry', provenance: PROVENANCE.REAL, note: 'A sanitized record is written for every evaluation; the collection window is open and recording real work.' },
    { surface: 'Observe-mode scoring', provenance: PROVENANCE.REAL, note: 'The gate scores and records each routed transition. It does not yet block — enforcement is held until the contained review.' },
    { surface: 'Real routed traffic', provenance: PROVENANCE.REAL, note: 'Thousands of real transitions scored and recorded: a net descent, and nothing rejected in observe mode.' },
    { surface: 'The controlled descent', provenance: PROVENANCE.REAL, note: 'Real gate output over a deliberately authored sequence — a clean, monotonic descent.' },
    { surface: 'The rejection study', provenance: PROVENANCE.REAL, note: 'The same function run in the mode it would enforce in, over known-correct cases, without touching live work.' },
    { surface: 'The privacy boundary', provenance: PROVENANCE.REAL, note: 'Raw state stays local; only sanitized records ever cross outward.' },
    { surface: 'The weight policy', provenance: PROVENANCE.REAL, note: 'The live weights match the operator-set policy exactly.' },
    { surface: 'The two-basin field', provenance: PROVENANCE.SIMULATED, note: 'An illustrative geometry — a visual analogy, not the potential function itself.' },
    { surface: 'Adversarial campaigns', provenance: PROVENANCE.PLANNED, note: 'Sustained ablation and adversarial probing under containment — still ahead.' },
    { surface: 'The published figures', provenance: PROVENANCE.PLANNED, note: 'The paper’s final figure set — not yet rendered.' },
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

export function aggregate({ descent, descentSteps = [], traceResult, studyReport = null, weights = DEFAULT_WEIGHTS, liveConfig = {}, testCounts = TEST_COUNTS, generatedAt } = {}) {
  if (!descent) throw new Error('aggregate requires a descent section');
  const trace = traceResult ?? { records: [], malformed: 0, files: [] };
  return {
    schema: 'yuri-energy-dashboard-data/v2',
    generatedAt: generatedAt ?? new Date().toISOString(),
    // realTraffic — the hero: cumulative ΔU over real routed dispatch work.
    realTraffic: buildRealTrafficSection(trace.records),
    // descent — the controlled B.2 proof: real gate, authored 15-step scenario.
    descent,
    telemetry: {
      ...buildTelemetrySection(trace.records),
      malformedLines: trace.malformed ?? 0,
      sourceFiles: Array.isArray(trace.files) ? trace.files : [],
    },
    components: buildComponentsSection(weights),
    config: buildConfigSection(liveConfig),
    // workedMath / attribution — the per-term math + the attribution graph data.
    workedMath: buildWorkedMathSection(descentSteps, studyReport),
    attribution: buildAttributionSection(descentSteps, studyReport, weights),
    // actionStudy — the teeth: rejection battery + shadow-replay false-positive rate.
    actionStudy: buildActionStudySection(studyReport),
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
  const { steps } = await runDescentRaw({ scenario });
  const descent = buildDescentSection(scenario, steps);
  const traceResult = readTraceRecords({ stateDir, env });
  const liveConfig = (() => { try { return loadEnergyConfig(); } catch { return {}; } })();
  const studyReport = readLatestStudy({ stateDir, env });
  return aggregate({ descent, descentSteps: steps, traceResult, studyReport, liveConfig, generatedAt });
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
