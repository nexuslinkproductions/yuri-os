#!/usr/bin/env node
/**
 * lane-feedback-record.mjs — Per-lane outcome telemetry capture
 *
 * Appends a single JSON line to .claude/state/lane-feedback.jsonl.
 * Called by dispatchers (pulse-lane-dispatch.mjs, llm-compat.sh, etc.) after
 * each lane invocation to record what happened.
 *
 * CLI:
 *   node _SYSTEM/Scripts/lane-feedback-record.mjs --record '<json>'
 *   node _SYSTEM/Scripts/lane-feedback-record.mjs --tail [N]   (default 20)
 *   node _SYSTEM/Scripts/lane-feedback-record.mjs --stats
 *
 * Programmatic:
 *   import { recordLaneOutcome } from './lane-feedback-record.mjs';
 *   recordLaneOutcome({ lane, prompt_tokens, output_tokens, latency_ms, exit_code, self_reported_success, downstream_verified_ok, prompt_hash });
 *
 * Record schema (all fields optional except `lane`):
 *   {
 *     ts: <ISO>,
 *     lane: <string>,             // e.g. "@deepseek-flash"
 *     prompt_hash: <16-hex>,      // sha256 first 16 chars
 *     prompt_tokens: <number>,
 *     output_tokens: <number>,
 *     latency_ms: <number>,
 *     exit_code: <number>,
 *     self_reported_success: <boolean>,
 *     downstream_verified_ok: <boolean | null>,
 *     verifier_pass_token: <string | null>
 *   }
 *
 * Rotation: if .claude/state/lane-feedback.jsonl > 10 MB, the file is
 * moved to lane-feedback-<ts>.jsonl.gz (gzip) and a fresh file is started.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const FEEDBACK_PATH = path.join(STATE_DIR, 'lane-feedback.jsonl');
const ROTATION_BYTES = 10 * 1024 * 1024; // 10 MB

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function maybeRotate() {
  try {
    const stat = fs.statSync(FEEDBACK_PATH);
    if (stat.size < ROTATION_BYTES) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(STATE_DIR, `lane-feedback-${ts}.jsonl.gz`);
    const raw = fs.readFileSync(FEEDBACK_PATH);
    fs.writeFileSync(archivePath, gzipSync(raw));
    fs.unlinkSync(FEEDBACK_PATH);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

export function hashPrompt(prompt) {
  if (!prompt) return null;
  return createHash('sha256').update(String(prompt)).digest('hex').slice(0, 16);
}

export function recordLaneOutcome(record) {
  if (!record || typeof record !== 'object' || !record.lane) {
    throw new Error('recordLaneOutcome: record.lane is required');
  }
  ensureStateDir();
  maybeRotate();
  const enriched = {
    ts: record.ts || new Date().toISOString(),
    lane: record.lane,
    prompt_hash: record.prompt_hash ?? null,
    prompt_tokens: record.prompt_tokens ?? null,
    output_tokens: record.output_tokens ?? null,
    latency_ms: record.latency_ms ?? null,
    exit_code: record.exit_code ?? null,
    self_reported_success: record.self_reported_success ?? null,
    downstream_verified_ok: record.downstream_verified_ok ?? null,
    verifier_pass_token: record.verifier_pass_token ?? null,
  };
  fs.appendFileSync(FEEDBACK_PATH, JSON.stringify(enriched) + '\n');
  return enriched;
}

export function readFeedback({ tail = null } = {}) {
  if (!fs.existsSync(FEEDBACK_PATH)) return [];
  const lines = fs.readFileSync(FEEDBACK_PATH, 'utf8').split('\n').filter(Boolean);
  const records = [];
  for (const line of lines) {
    try { records.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  if (tail && tail > 0) return records.slice(-tail);
  return records;
}

function cli() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  lane-feedback-record.mjs --record \'<json>\'');
    console.log('  lane-feedback-record.mjs --tail [N]');
    console.log('  lane-feedback-record.mjs --stats');
    process.exit(0);
  }
  if (args[0] === '--record') {
    let record;
    try { record = JSON.parse(args[1] || '{}'); }
    catch (e) { console.error('invalid JSON:', e.message); process.exit(1); }
    const enriched = recordLaneOutcome(record);
    console.log(JSON.stringify(enriched));
    return;
  }
  if (args[0] === '--tail') {
    const n = parseInt(args[1] || '20', 10);
    const records = readFeedback({ tail: n });
    for (const r of records) console.log(JSON.stringify(r));
    return;
  }
  if (args[0] === '--stats') {
    const records = readFeedback();
    const byLane = {};
    for (const r of records) {
      byLane[r.lane] = (byLane[r.lane] || 0) + 1;
    }
    console.log(JSON.stringify({ total: records.length, by_lane: byLane }, null, 2));
    return;
  }
  console.error('unknown args:', args);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli();
}
