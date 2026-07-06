#!/usr/bin/env node
/**
 * lane-calibration.mjs — Per-lane calibration computer
 *
 * Reads .claude/state/lane-feedback.jsonl (the rolling outcome log
 * written by lane-feedback-record.mjs) and computes per-lane:
 *   - actual_success_rate    = downstream_verified_ok=true / total
 *   - claimed_success_rate   = self_reported_success=true / total
 *   - overconfidence_gap     = claimed - actual  (positive = lane lies about success)
 *   - median_latency_ms
 *   - p90_latency_ms
 *   - total_calls
 *   - trend_7s              ("improving" | "flat" | "degrading")  based on last 7 windowed buckets
 *
 * Output: .claude/state/lane-calibration.json
 *   {
 *     computed_at: <ISO>,
 *     feedback_count: <n>,
 *     window_size_per_lane: 200,
 *     lanes: {
 *       "@deepseek-flash": { total_calls, actual_success_rate, ... },
 *       ...
 *     }
 *   }
 *
 * Idempotent. Safe to run with empty feedback (returns lanes: {}).
 * Intended to run via LaunchAgent com.yuri-os-musubi.lane-health (already
 * scheduled). Also runnable on-demand:
 *   node _SYSTEM/Scripts/lane-calibration.mjs
 *   node _SYSTEM/Scripts/lane-calibration.mjs --print   (also prints to stdout)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { median as kernelMedian, percentile as kernelPercentile } from './math/math-kernel.mjs';
import { readFeedback } from './lane-feedback-record.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const OUTPUT_PATH = path.join(STATE_DIR, 'lane-calibration.json');
const WINDOW_PER_LANE = 200;

// Boundary wrappers over the kernel primitives (registry axes 8/9): the kernel is
// strict (throws on non-finite entries / empty input); this boundary PRE-FILTERS
// with Number.isFinite — one NaN latency_ms must never crash the LaunchAgent run —
// and keeps the null-on-empty contract.
export function median(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? kernelMedian(finite) : null;
}

// Nearest-rank (ceil) via the kernel: p90 of 10 latencies is sorted[8] (the 9th
// value), not sorted[9] (= max = p100, the old off-by-one). NOTE: nearest-rank
// returns an actual SAMPLE, so p50 of [1,2,3,4] = 2 while median() interpolates
// (2.5) — inherent convention divergence, documented, never "fixed" to agree.
export function percentile(values, p) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? kernelPercentile(finite, p) : null;
}

export function computeTrend(records) {
  // Bucket last 7 chunks of ~equal size, compute success rate per bucket.
  if (records.length < 14) return 'flat';
  const bucketCount = 7;
  const bucketSize = Math.floor(records.length / bucketCount);
  // Anchor buckets at the NEW end: the dropped n-mod-7 remainder is the OLDEST
  // records, never the newest — a trend must see its newest data.
  const start = records.length - bucketCount * bucketSize;
  const rates = [];
  for (let i = 0; i < bucketCount; i++) {
    const slice = records.slice(start + i * bucketSize, start + (i + 1) * bucketSize);
    const ok = slice.filter(r => r.downstream_verified_ok === true).length;
    rates.push(ok / Math.max(slice.length, 1));
  }
  const first = rates.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const last = rates.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const delta = last - first;
  if (delta > 0.1) return 'improving';
  if (delta < -0.1) return 'degrading';
  return 'flat';
}

// wave-3 L.5b (D-L3-B): lane-feedback.jsonl has NO live producer — nothing calls
// lane-feedback-record.mjs --record. readFeedback() reads a permanently-empty log,
// so calibration returns neutral values. Wire --record into a route-plan consumer
// only after the calibration signal is validated as useful.
export function computeCalibration(allRecords = readFeedback()) {
  const byLane = {};
  for (const r of allRecords) {
    if (!r.lane) continue;
    (byLane[r.lane] = byLane[r.lane] || []).push(r);
  }

  const lanes = {};
  for (const [lane, records] of Object.entries(byLane)) {
    const window = records.slice(-WINDOW_PER_LANE);
    const verifiedRecords = window.filter(r => r.downstream_verified_ok !== null);
    const claimedRecords = window.filter(r => r.self_reported_success !== null);
    const latencies = window.map(r => r.latency_ms).filter(x => typeof x === 'number');

    const actual_success_rate = verifiedRecords.length
      ? verifiedRecords.filter(r => r.downstream_verified_ok === true).length / verifiedRecords.length
      : null;
    const claimed_success_rate = claimedRecords.length
      ? claimedRecords.filter(r => r.self_reported_success === true).length / claimedRecords.length
      : null;
    const overconfidence_gap = (actual_success_rate !== null && claimed_success_rate !== null)
      ? +(claimed_success_rate - actual_success_rate).toFixed(4)
      : null;

    lanes[lane] = {
      total_calls: window.length,
      verified_count: verifiedRecords.length,
      actual_success_rate: actual_success_rate === null ? null : +actual_success_rate.toFixed(4),
      claimed_success_rate: claimed_success_rate === null ? null : +claimed_success_rate.toFixed(4),
      overconfidence_gap,
      median_latency_ms: median(latencies),
      p90_latency_ms: percentile(latencies, 90),
      trend_7s: computeTrend(window),
      degraded: actual_success_rate !== null && actual_success_rate < 0.5 && verifiedRecords.length >= 50,
      overconfident: overconfidence_gap !== null && overconfidence_gap > 0.15,
    };
  }

  return {
    computed_at: new Date().toISOString(),
    feedback_count: allRecords.length,
    window_size_per_lane: WINDOW_PER_LANE,
    lanes,
  };
}

function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const calibration = computeCalibration();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(calibration, null, 2));
  if (process.argv.includes('--print')) {
    console.log(JSON.stringify(calibration, null, 2));
  } else {
    console.log(`lane-calibration: wrote ${OUTPUT_PATH} (lanes=${Object.keys(calibration.lanes).length}, feedback_count=${calibration.feedback_count})`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
