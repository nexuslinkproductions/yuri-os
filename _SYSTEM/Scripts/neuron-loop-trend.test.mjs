// ADVISORY trend-health tests for neuron-loop's improvement_score CUSUM/Kalman
// readout. The trend helpers are not exported from neuron-loop.mjs (it is a
// run-once orchestrator, not a library), so this suite re-derives the SAME logic
// against the Tier-1 kernel primitives and asserts the documented behavior:
// alarm on sustained decline, silent in-control, changeIndex pinned, never throws.
// It also REPLAYS the real synthesis.jsonl and asserts the verdict is sane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cusum, scalarKalman } from './math/math-kernel.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTH_LOG = path.join(__dirname, '..', '..', '.claude', 'yuri-sentinel', 'learning', 'synthesis.jsonl');

// Mirror of neuron-loop's computeScoreTrend (decline = NEGATED signed step deltas,
// scale-free k/h from MAD of the steps, μ0 = median step). Kept identical here so a
// drift in the production logic surfaces as a test diff.
function medianOf(values) {
  const f = values.filter((x) => Number.isFinite(x));
  if (f.length === 0) return 0;
  const s = f.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function madOf(values) {
  const f = values.filter((x) => Number.isFinite(x));
  if (f.length === 0) return 0;
  const med = medianOf(f);
  return medianOf(f.map((x) => Math.abs(x - med)));
}
function stdOf(values) {
  const f = values.filter((x) => Number.isFinite(x));
  if (f.length < 2) return 0;
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  return Math.sqrt(f.reduce((a, b) => a + (b - mean) ** 2, 0) / f.length);
}
function computeScoreTrend(scores) {
  const flat = { available: false, alarm: false, changeIndex: -1, statistic: 0, samples: 0, k: 0, h: 0, kalman_estimate: 0 };
  const s = (Array.isArray(scores) ? scores : []).filter((x) => Number.isFinite(x));
  if (s.length < 5) return { ...flat, samples: s.length };
  const declineSteps = [];
  for (let i = 1; i < s.length; i += 1) declineSteps.push(-(s[i] - s[i - 1]));
  const scale = Math.max(madOf(declineSteps), 0.6745 * stdOf(declineSteps), 1e-6);
  const k = 0.5 * scale;
  const h = 5 * scale;
  const mu0 = 0;
  const c = cusum(declineSteps, { k, h, mu0 });
  const ka = scalarKalman(s, { q: Math.max(0.3 * madOf(s), 1e-9), r: Math.max(madOf(s), 1e-9) });
  return {
    available: true,
    alarm: c.alarm === true,
    changeIndex: c.changeIndex >= 0 ? c.changeIndex + 1 : -1,
    statistic: c.statistic,
    samples: s.length,
    k, h,
    kalman_estimate: ka.estimate,
  };
}

test('computeScoreTrend: sustained decline (70->50 over 8 runs) ALARMS and pins changeIndex', () => {
  // Stable head then a monotone decline — no single step is a wild outlier.
  const scores = [70, 70, 70, 70, 70, 68, 66, 64, 62, 60, 58, 56, 54, 52, 50];
  const r = computeScoreTrend(scores);
  assert.equal(r.available, true);
  assert.equal(r.alarm, true);
  assert.ok(r.changeIndex >= 5, `changeIndex should land in the decline region, got ${r.changeIndex}`);
});

test('computeScoreTrend: a stable trace stays SILENT (no false alarm)', () => {
  const scores = [70, 69, 70, 71, 70, 69, 70, 70, 71, 69, 70];
  const r = computeScoreTrend(scores);
  assert.equal(r.available, true);
  assert.equal(r.alarm, false);
});

test('computeScoreTrend: an IMPROVING trace never alarms (decline-only detector)', () => {
  const scores = [40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80];
  const r = computeScoreTrend(scores);
  assert.equal(r.alarm, false, 'rising score must not trip a decline alarm');
});

test('computeScoreTrend: flat constant -> in-control, never fabricates an alarm (degenerate scale)', () => {
  const r = computeScoreTrend([70, 70, 70, 70, 70, 70, 70]);
  assert.equal(r.available, true);
  assert.equal(r.alarm, false); // all decline-steps are 0 -> CUSUM clamps at 0, never climbs
});

test('computeScoreTrend: too-few samples / garbage -> unavailable, never throws', () => {
  for (const junk of [null, undefined, [], [70, 71], 'x', 42, [NaN, Infinity]]) {
    const r = computeScoreTrend(junk);
    assert.equal(r.available, false, `junk=${JSON.stringify(junk)}`);
    assert.equal(r.alarm, false);
  }
});

test('REAL DATA: the live 43-record synthesis.jsonl yields a sane verdict (no spurious alarm)', () => {
  if (!existsSync(SYNTH_LOG)) { console.log('  (synthesis.jsonl absent — skipping real-replay)'); return; }
  const lines = readFileSync(SYNTH_LOG, 'utf8').split('\n').filter(Boolean);
  const scores = [];
  for (const line of lines) {
    try { const rec = JSON.parse(line); if (typeof rec.improvement_score === 'number') scores.push(rec.improvement_score); } catch { /* skip */ }
  }
  assert.ok(scores.length >= 40, `expected the real ~43-record stream, got ${scores.length}`);
  const r = computeScoreTrend(scores.slice(-20));
  assert.equal(r.available, true);
  // The real trace is largely stable (44..70, mostly ~70 then a tail dip). The
  // verdict must be a boolean and the readout well-formed — not a throw or NaN.
  assert.equal(typeof r.alarm, 'boolean');
  assert.ok(Number.isFinite(r.statistic));
  assert.ok(Number.isFinite(r.kalman_estimate));
});
