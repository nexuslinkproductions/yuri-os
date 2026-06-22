#!/usr/bin/env node
/**
 * lane-dispatch.mjs — ROBUST lane dispatch wrapper (the reliable spine for repeated orchestration).
 *
 * llm-lane intermittently fails with a bare "AggregateError" from undici keep-alive socket reuse
 * against api.deepseek.com (the server drops idle connections; undici reuses a now-dead socket). The
 * failure is PER-PROCESS — a fresh node process gets a fresh undici instance with no stale pooled
 * socket. So the bulletproof fix at the orchestration layer is: re-invoke llm-lane in a FRESH process
 * up to N times, treating empty output / AggregateError / non-zero exit as transient and retrying with
 * backoff. (FB:DISPATCH-RETRY-ON-FAILURE — detect + retry, never surface a transport blip to the owner.)
 *
 * Usage: node lane-dispatch.mjs <lane> "<prompt>" [any llm-lane flags...]
 *   env: LANE_DISPATCH_ATTEMPTS (default 4), LANE_DISPATCH_TIMEOUT_MS (default 1320000 = 22min)
 *        LANE_DISPATCH_BACKOFF_MS (default 800)  — base for exponential-with-jitter backoff
 *        LANE_DISPATCH_BACKOFF_CAP_MS (default 20000) — hard cap on computed delay before jitter
 *        LANE_DISPATCH_RL_FACTOR (default 3) — multiplier applied on 429/rate-limit detection
 *        LANE_DISPATCH_IDEMPOTENCY_KEY (optional) — if set, prints a breadcrumb on each attempt
 * Exit 0 + clean output on stdout when a fresh process succeeds; exit 1 after exhausting attempts.
 * Honors --out: when set, the wrapper verifies the out-file is non-empty as the success signal.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANE_SCRIPT = path.join(__dirname, 'llm-lane.mjs');
const ATTEMPTS = Number(process.env.LANE_DISPATCH_ATTEMPTS || 4);
const TIMEOUT_MS = Number(process.env.LANE_DISPATCH_TIMEOUT_MS || 1320000);
const BACKOFF_BASE = Math.max(1, Number(process.env.LANE_DISPATCH_BACKOFF_MS || 800));
const BACKOFF_CAP = Math.max(BACKOFF_BASE, Number(process.env.LANE_DISPATCH_BACKOFF_CAP_MS || 20000));
const RL_FACTOR = Math.max(1, Number(process.env.LANE_DISPATCH_RL_FACTOR || 3));
const IDEMPOTENCY_KEY = process.env.LANE_DISPATCH_IDEMPOTENCY_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Exponential-with-jitter backoff, capped.
 *  delay = min(BASE * 2^(attempt-1), CAP); sleep(delay/2 + random(delay/2))
 *  Guarantees: positive, never NaN, bounded by CAP. */
function backoffMs(attempt, factor = 1) {
  const exp = Math.min(BACKOFF_BASE * Math.pow(2, attempt - 1), BACKOFF_CAP);
  const half = exp / 2;
  return Math.round((half + Math.random() * half) * factor);
}

/** True if child output contains a 429 / rate-limit signal. */
function isRateLimit(out, err) {
  const hay = ((out || '') + (err || '')).toLowerCase();
  return /429/.test(hay) || /rate.?limit/.test(hay);
}

const args = process.argv.slice(2);
if (!args.length) { process.stderr.write('Usage: lane-dispatch <lane> "<prompt>" [llm-lane flags...]\n'); process.exit(2); }

// Resolve --out so we can use the out-file as a robust success signal (independent of stdout capture).
const outIdx = args.indexOf('--out');
const outFile = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : null;

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn('node', [LANE_SCRIPT, ...args], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' });
    let out = ''; let err = '';
    const killer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => { clearTimeout(killer); resolve({ code, out, err }); });
    child.on('error', (e) => { clearTimeout(killer); resolve({ code: 1, out: '', err: String(e?.message || e) }); });
  });
}

function isBad(r) {
  const text = (r.out || '').trim();
  if (r.code !== 0) return true;
  if (/AggregateError/.test(text) || /AggregateError/.test(r.err || '')) return true;
  if (/LLM_COMPAT_FAIL/.test(r.err || '')) return true;
  if (outFile) { try { if (!fs.statSync(outFile).size) return true; } catch { return true; } return false; }
  return !text;
}

let last = null;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  if (IDEMPOTENCY_KEY) {
    process.stderr.write(`LANE_DISPATCH_IDEMPOTENCY key=${IDEMPOTENCY_KEY} attempt=${attempt}\n`);
  }
  last = await runOnce();
  if (!isBad(last)) {
    // fs.writeSync (not process.stdout.write) — a buffered async write to a pipe/file is TRUNCATED by an
    // eager process.exit() before it flushes. Synchronous write completes before exit.
    if ((last.out || '').trim()) fs.writeSync(1, last.out.trim() + '\n');
    process.exit(0);
  }
  const rl = isRateLimit(last.out, last.err);
  const why = rl ? 'rate_limit'
    : last.code !== 0 ? `exit_${last.code}`
    : (/AggregateError/.test((last.out || '') + (last.err || '')) ? 'aggregate_error' : 'empty');
  process.stderr.write(`LANE_DISPATCH_RETRY ${attempt}/${ATTEMPTS} lane=${args[0]} reason=${why}\n`);
  if (attempt < ATTEMPTS) {
    const delay = backoffMs(attempt, rl ? RL_FACTOR : 1);
    await sleep(delay);
  }
}
fs.writeSync(2, `LANE_DISPATCH_FAIL lane=${args[0]} attempts=${ATTEMPTS}\n`);
if ((last?.err || '').trim()) fs.writeSync(2, last.err.trim().slice(-400) + '\n');
process.exit(1);
