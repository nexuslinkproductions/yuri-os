#!/usr/bin/env node
//
// yuri-slm-worker.mjs — autonomous background local-SLM worker (producer/consumer queue).
//
// Lets the local SLM fire AUTONOMOUSLY in the background "whenever needed": cheap producers ENQUEUE
// bounded jobs (decode/triage/extract/rank/classify/condense/tag); one governed worker DRAINS them
// sequentially. Every job dispatches through llm-lane.mjs <lane> --no-tools, so it is organ-gated
// (energy ΔU + recall on dispatch, evidence ledger + advisory pulse on result, safety-core on any
// tool) EXACTLY like a Claude turn. Output is advisory-until-verified by design.
//
// SAFETY (an autonomous LLM loop is dangerous if naive — these are the rails):
//   · DISARMED by default — drain refuses unless DUAL-ARMED: env YURI_SLM_WORKER_ARMED=1 AND the
//     flag file _SYSTEM/state/slm-worker.armed exist. Enqueue always works (producers can queue
//     while disarmed); only the LLM-firing drain is gated.
//   · SINGLE-FLIGHT lock — one drain at a time (honors the sequential local-GPU lock).
//   · KILL SWITCH — _SYSTEM/state/slm-worker.stop halts drain between jobs.
//   · CAPS — payload size, queue depth (backpressure), max jobs per run, watch-cycle ceiling, interval floor.
//   · SERVER-UP gate — skips/exits cleanly if ollama is down (never spins on a dead server).
//   · FIXED LANE — payload is a prompt only; it cannot choose an arbitrary lane/endpoint/tool.
//
// Usage:
//   node yuri-slm-worker.mjs enqueue --type decode --payload "..." [--sys "..."]
//   node yuri-slm-worker.mjs drain [--max 5] [--watch] [--interval 5] [--lane qwen-local]
//   node yuri-slm-worker.mjs status | arm | disarm | clear
//
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { admit as costAdmit, readArmState as costArmState } from './cost-reservation-pool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const LANE_BIN = path.join(__dirname, 'llm-lane.mjs');
const STATE = path.join(REPO_ROOT, '_SYSTEM/state');
const QUEUE = path.join(STATE, 'slm-queue.jsonl');
const RESULTS = path.join(STATE, 'slm-results.jsonl');
const PROCESSED = path.join(STATE, 'slm-processed.log'); // append-only done-ids (avoids queue-rewrite race)
const LOCK = path.join(STATE, 'slm-worker.lock');
const ARM_FLAG = path.join(STATE, 'slm-worker.armed');
const STOP_FLAG = path.join(STATE, 'slm-worker.stop');
const PRODUCERS_FLAG = path.join(STATE, 'slm-producers.enabled'); // gates the Stop/SessionStart producer hooks

const MAX_PAYLOAD = 8 * 1024;     // 8KB per job — bounded local work, not document dumps
const MAX_QUEUE = 200;            // backpressure: refuse enqueue past this depth
const MAX_PER_RUN = 25;           // hard ceiling on jobs a single drain processes
const MAX_WATCH_CYCLES = 10000;   // watch can't spin forever
const MIN_INTERVAL = 2;           // seconds floor between jobs (no tight loop / GPU hammer)
const LOCK_STALE_MS = 30 * 60 * 1000;
const DEFAULT_LANE = process.env.YURI_SLM_WORKER_LANE || 'qwen-local';

// Job-type -> system prompt. Bounded local roles only. Unknown type -> generic terse.
const SYS = {
  decode: 'Output exactly 5 lines, each "LABEL: text". Labels in order: ACTIVE OBJECTIVE, EVIDENCE, IMPLEMENTATION TASK, PARKED BRANCH, REJECTED-NOISE.',
  triage: 'Return ONLY JSON {"lane":"..."}. Allowed: native, slm-local, cloud-reason, claude.',
  extract: 'Return ONLY a JSON array of the requested items, in order. No prose.',
  rank: 'Return ONLY JSON {"order":[ids most-relevant first]}. No prose.',
  classify: 'Return ONLY JSON {"label":"..."} from the allowed set in the prompt.',
  condense: 'Output at most 3 bullet lines starting with "-". No preamble.',
  tag: 'Return ONLY a JSON array of 3-6 lowercase topic tags.',
  generic: 'You are a bounded YURI local utility lane. Return concise, structured, evidence-aware output.',
};

const [cmd, ...rest] = process.argv.slice(2);
const opt = parseOpts(rest);

try {
  if (cmd === 'enqueue') cmdEnqueue();
  else if (cmd === 'drain') await cmdDrain();
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'arm') { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(ARM_FLAG, new Date().toISOString()); console.log('ARMED flag set. NOTE: drain ALSO needs env YURI_SLM_WORKER_ARMED=1.'); }
  else if (cmd === 'disarm') { rm(ARM_FLAG); rm(STOP_FLAG); console.log('DISARMED (flag removed).'); }
  else if (cmd === 'stop') { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(STOP_FLAG, new Date().toISOString()); console.log('STOP flag set — a running drain will halt between jobs.'); }
  else if (cmd === 'producers-on') { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(PRODUCERS_FLAG, new Date().toISOString()); console.log('producers ENABLED — Stop + SessionStart hooks will enqueue (drain still gated by dual-arm).'); }
  else if (cmd === 'producers-off') { rm(PRODUCERS_FLAG); console.log('producers DISABLED.'); }
  else if (cmd === 'compact') { if (!acquireLock()) { console.log('busy — compact skipped (drain holds lock)'); } else { try { const n = compact(); console.log(`compacted — ${n} pending job(s) retained, processed log cleared.`); } finally { releaseLock(); } } }
  else if (cmd === 'clear') { rm(QUEUE); rm(PROCESSED); console.log('queue cleared.'); }
  else { help(); process.exit(2); }
} catch (e) {
  process.stderr.write(`SLM_WORKER_FAIL ${String(e?.message || e)}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
function cmdEnqueue() {
  const type = String(opt.type || 'generic');
  const payload = String(opt.payload || '');
  if (!payload.trim()) throw new Error('enqueue: --payload required');
  if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD) throw new Error(`enqueue: payload exceeds ${MAX_PAYLOAD} bytes`);
  if (queueDepth() >= MAX_QUEUE) throw new Error(`enqueue: queue full (${MAX_QUEUE}) — backpressure, drain first`);
  const job = { id: `slm-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, type, payload, sys: opt.sys || null, enqueued_at: new Date().toISOString(), status: 'pending' };
  fs.mkdirSync(STATE, { recursive: true });
  fs.appendFileSync(QUEUE, `${JSON.stringify(job)}\n`);
  console.log(job.id);
}

async function cmdDrain() {
  // DUAL-ARM gate — the ONLY thing that lets the LLM fire autonomously.
  const envArmed = process.env.YURI_SLM_WORKER_ARMED === '1';
  const flagArmed = fs.existsSync(ARM_FLAG);
  if (!envArmed || !flagArmed) {
    process.stderr.write(`SLM_WORKER_DISARMED env=${envArmed} flag=${flagArmed} — drain refused. Arm BOTH: 'node yuri-slm-worker.mjs arm' + YURI_SLM_WORKER_ARMED=1.\n`);
    process.exit(3);
  }
  if (!acquireLock()) { process.stderr.write('SLM_WORKER_BUSY another drain holds the lock — exiting (single-flight).\n'); process.exit(0); }
  let processed = 0;
  try {
    const lane = String(opt.lane || DEFAULT_LANE);
    const maxPerRun = Math.min(MAX_PER_RUN, Math.max(1, Number(opt.max) || 5));
    const interval = Math.max(MIN_INTERVAL, Number(opt.interval) || MIN_INTERVAL);
    const watch = Boolean(opt.watch);
    let cycles = 0;
    do {
      if (fs.existsSync(STOP_FLAG)) { process.stderr.write('SLM_WORKER_STOP kill-switch set — halting.\n'); break; }
      if (!fs.existsSync(ARM_FLAG)) { process.stderr.write('SLM_WORKER_DISARMED arm flag removed mid-run — halting.\n'); break; }
      if (!(await serverUp())) { process.stderr.write('SLM_WORKER_NO_SERVER ollama unreachable — ' + (watch ? 'waiting.\n' : 'exiting.\n')); if (!watch) break; await sleep(interval * 1000); cycles += 1; continue; }
      const pending = readQueue().filter((j) => j.status === 'pending');
      if (!pending.length) { if (!watch) break; await sleep(interval * 1000); cycles += 1; continue; }
      for (const job of pending.slice(0, maxPerRun)) {
        if (fs.existsSync(STOP_FLAG)) break;
        // COST-TO-COMPLETION ADMISSION (DISARMED BY DEFAULT — governs nothing until the owner dual-arms
        // cost-reservation-pool + sets a real cap). The local SLM worker runs a FREE lane (qwen-local,
        // $0), so even when armed the gate exempts it; this is wired forward-safe so a future PAID worker
        // lane is budget-governed without re-plumbing. Advisory only here — never blocks a job; the
        // per-call llm-lane dispatch already carries its own (also-disarmed) cost check. Fail-OPEN.
        try {
          if (costArmState().enforced) {
            const decision = costAdmit({ lane, model: lane, promptChars: (job.payload || '').length, steps: 1, reasoning: 'low' });
            if (!decision.admitted) {
              process.stderr.write(`  SLM_COST_ADMISSION_WARN ${job.id} -> ${decision.decision} (advisory; not blocked)\n`);
            }
          }
        } catch { /* fail-open: cost gate must never break the worker */ }
        const out = await dispatch(lane, job).catch((e) => `__ERR__:${String(e?.message || e).slice(0, 160)}`);
        // Governor backpressure: if the local concurrency cap is full (another lane/machine holds the
        // slots), leave the job PENDING and retry next cycle instead of burning it as an error.
        if (out.startsWith('__ERR__:') && /local_capacity/.test(out)) {
          process.stderr.write(`  capacity full — ${job.id} left pending (retry next cycle)\n`);
          break;
        }
        const ok = !out.startsWith('__ERR__:');
        appendResult({ ...job, status: ok ? 'done' : 'error', lane, finished_at: new Date().toISOString(), output: ok ? out.slice(0, 16000) : '', error: ok ? null : out.slice(8) });
        markDone(job.id);
        processed += 1;
        process.stderr.write(`  drained ${job.id} (${job.type}) -> ${ok ? 'done' : 'error'}\n`);
        await sleep(interval * 1000);
        if (processed >= maxPerRun && !watch) break;
      }
      cycles += 1;
    } while (opt.watch && cycles < MAX_WATCH_CYCLES);
  } finally {
    releaseLock();
  }
  console.log(`drained ${processed} job(s).`);
}

function cmdStatus() {
  const q = readQueue();
  console.log(JSON.stringify({
    armed_flag: fs.existsSync(ARM_FLAG), armed_env: process.env.YURI_SLM_WORKER_ARMED === '1',
    stop_flag: fs.existsSync(STOP_FLAG), locked: lockHeld(),
    lane: DEFAULT_LANE, queue_depth: q.length, pending: q.filter((j) => j.status === 'pending').length,
    results_total: countLines(RESULTS), caps: { MAX_PAYLOAD, MAX_QUEUE, MAX_PER_RUN, MIN_INTERVAL },
  }, null, 2));
}

function dispatch(lane, job) {
  const sys = job.sys || SYS[job.type] || SYS.generic;
  return new Promise((resolve, reject) => {
    // execFile with an arg ARRAY — no shell, no injection from payload. Tools off, reasoning low.
    execFile('node', [LANE_BIN, lane, '--no-tools', '--reasoning', 'low', '--system', sys, job.payload],
      { cwd: REPO_ROOT, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
      (e, stdout, stderr) => {
        if (e && !stdout) return reject(new Error((stderr || '').split('\n').find((l) => l.includes('LLM_COMPAT_FAIL')) || e.message));
        resolve(String(stdout || '').trim());
      });
  });
}

// ── queue helpers ──
// QUEUE is APPEND-ONLY during normal operation; completion is recorded by appending the id to
// PROCESSED (also append-only). readQueue() hides processed ids. This removes the lost-write race
// between a producer's enqueue-append and a naive drain queue-rewrite. Physical compaction (dropping
// processed lines from QUEUE) happens ONLY in `compact`/`clear`, under the drain lock.
function processedSet() { try { return new Set(fs.readFileSync(PROCESSED, 'utf8').split(/\n/).filter(Boolean)); } catch { return new Set(); } }
function rawQueue() { try { return fs.readFileSync(QUEUE, 'utf8').split(/\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }
function readQueue() { const done = processedSet(); return rawQueue().filter((j) => !done.has(j.id)); }
function queueDepth() { return readQueue().filter((j) => j.status === 'pending').length; }
function markDone(id) { fs.mkdirSync(STATE, { recursive: true }); fs.appendFileSync(PROCESSED, `${id}\n`); }
function compact() { const done = processedSet(); const kept = rawQueue().filter((j) => !done.has(j.id)); fs.writeFileSync(QUEUE, kept.map((j) => JSON.stringify(j)).join('\n') + (kept.length ? '\n' : '')); rm(PROCESSED); return kept.length; }
function appendResult(r) { fs.mkdirSync(STATE, { recursive: true }); fs.appendFileSync(RESULTS, `${JSON.stringify(r)}\n`); }
function countLines(f) { try { return fs.readFileSync(f, 'utf8').split(/\n/).filter(Boolean).length; } catch { return 0; } }

// ── lock (single-flight, stale-aware) ──
function acquireLock() {
  fs.mkdirSync(STATE, { recursive: true });
  if (lockHeld()) return false;
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }));
  return true;
}
function lockHeld() {
  try {
    const { pid, at } = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    if (Date.now() - at > LOCK_STALE_MS) return false;       // stale -> stealable
    try { process.kill(pid, 0); return pid !== process.pid; } catch { return false; } // dead pid -> not held
  } catch { return false; }
}
function releaseLock() { rm(LOCK); }

async function serverUp() {
  const host = coerce(process.env.OLLAMA_HOST || 'http://localhost:11434');
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000); const r = await fetch(`${host}/api/version`, { signal: c.signal }); clearTimeout(t); return r.ok; } catch { return false; }
}
function coerce(h) { h = String(h || '').replace(/\/$/, ''); return /^https?:\/\//.test(h) ? h : `http://${h}`; }
function rm(f) { try { fs.unlinkSync(f); } catch { /* */ } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function parseOpts(a) { const o = {}; for (let i = 0; i < a.length; i++) { const k = a[i]; if (k.startsWith('--')) { const key = k.slice(2); const v = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true; o[key] = v; } } return o; }
function help() { console.log('Usage: yuri-slm-worker.mjs <enqueue|drain|status|arm|disarm|stop|clear> [--type --payload --sys --max --watch --interval --lane]'); }
