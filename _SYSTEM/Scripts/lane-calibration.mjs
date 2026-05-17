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
import { fileURLToPath } from 'node:url';
import { readFeedback } from './lane-feedback-record.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const OUTPUT_PATH = path.join(STATE_DIR, 'lane-calibration.json');
const WINDOW_PER_LANE = 200;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function computeTrend(records) {
  // Bucket last 7 chunks of ~equal size, compute success rate per bucket
  if (records.length < 14) return 'flat';
  const bucketCount = 7;
  const bucketSize = Math.floor(records.length / bucketCount);
  const rates = [];
  for (let i = 0; i < bucketCount; i++) {
    const slice = records.slice(i * bucketSize, (i + 1) * bucketSize);
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

export function computeCalibration() {
  const allRecords = readFeedback();
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
