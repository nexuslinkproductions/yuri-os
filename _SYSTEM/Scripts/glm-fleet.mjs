#!/usr/bin/env node
// @capability: glm-fleet-dispatch
// @serves: glm fleet | spawn glm agents | z.ai fleet | parallel glm lanes | fan out glm | glm swarm | dual-substrate fleet | opus-fleet glm substrate
// @does: parallel fan-out of N z.ai GLM lanes at --reasoning high through lane-dispatch.mjs (4-attempt EPIPE/429 retry), each lane's text collected via --out into a per-run results dir, wrapped into a labeled JSON result packet (RESULT_LABEL extracted). Concurrency-bounded by a semaphore. DISARMED by default = dry-run (zero spend, zero fan-out); YURI_GLM_FLEET=1 arms the real fire.
// @use: glmFleet([{lane:'glm',label:'R1',prompt:'...'}], {concurrency:3}) — the GLM substrate of the opus-fleet model. Native Claude Agents are the other substrate (Agent tool). CLI: node glm-fleet.mjs --list | --dry-run --tasks '<json>' | --smoke (armed needs YURI_GLM_FLEET=1).
// @exports: glmFleet, buildRunDir, extractResultLabel, aggregatePoolOutputs, validatePacket, defaultTimeoutMsForLane, FLEET_PROTOCOL_PREAMBLE, ARM_ENV
//
// WHY built on lane-dispatch.mjs (not llm-lane directly): lane-dispatch re-invokes llm-lane in a FRESH
// process up to 4× with backoff, treating AggregateError / empty / non-zero exit as transient — the exact
// resilience the z.ai/Anthropic transport needs at concurrency (idle-socket EPIPE, HTTP 429). glm-fleet
// adds ONLY the parallel semaphore + per-lane result aggregation on top. NEVER pipe a lane call through
// `tee` or `>` (a second stream reader triggers transport:EPIPE — fixed root cause, do not reintroduce):
// the lane writes its final text to its OWN --out file, which we read.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const LANE_DISPATCH = path.join(HERE, 'lane-dispatch.mjs');

export const ARM_ENV = 'YURI_GLM_FLEET';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'glm-fleet.enabled');
// Armed via EITHER the session env var OR a local (gitignored) flag file — the YURI energy-enforce/nano-spawn
// arming idiom. Owner-gated to create; reversible by `rm`. Disarmed default = dry-run (zero spend/fan-out).
export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

// Lane Result Grammar — aligned with contract-conformance.mjs LABEL_TOKEN_RE (supports 02B1_, 02R1_, etc.).
const LABEL_TOKEN_RE = /\b\d{2}[A-Z0-9]{1,3}_[A-Z0-9_]*(?:PASS_COMMITTED|COMMITTED|BLOCKED|REPAIR_REQUIRED)\b/g;
export function extractResultLabel(text) {
  const s = String(text || '');
  const marker = s.match(/^[^\n]*\bRESULT_LABEL\b\s*[:=]\s*([0-9][0-9A-Z_]+)/im);
  if (marker) return marker[1];
  const all = s.match(LABEL_TOKEN_RE);
  return all?.length ? all[all.length - 1] : '';
}

export function buildRunDir(runId) {
  return path.join(REPO_ROOT, '.claude', 'jobs', String(runId), 'results');
}

function safeLabel(s, i = 0) {
  const v = String(s || `lane${i + 1}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return v || `lane${i + 1}`;
}

// Tier-aware outer timeout for lane-dispatch (LANE_DISPATCH_TIMEOUT_MS). The old flat 5min default
// SIGKILL'd glm-max tool loops before --out was written (V1 adversarial audit, 2026-06-29).
const LANE_TIMEOUT_MS = Object.freeze({
  'glm-max': 1800000,      // 30min — heavy multi-tool orchestration (WS-G audit 2026-06-30: 22min×2 attempts SIGKILL'd before --out)
  'glm-sub-orch': 1800000,
  glm: 900000,             // 15min — workhorse code-gen / judgment
  'glm-turbo': 600000,
  'glm-flash': 600000,     // align with ollama-fleet default
  'glm-flashx': 600000,
  'glm-vision': 600000,
  'glm-ocr': 600000,
});
const LANE_DISPATCH_ATTEMPTS_HEAVY = 2; // glm-max/sub-orch: fewer retries, longer per-attempt budget

/** Resolve outer lane-dispatch timeout from explicit task.timeoutMs or lane tier. */
export function defaultTimeoutMsForLane(lane) {
  const key = String(lane || 'glm');
  return LANE_TIMEOUT_MS[key] ?? 600000;
}

function dispatchAttemptsForLane(lane) {
  const key = String(lane || '');
  if (key === 'glm-max' || key === 'glm-sub-orch') return LANE_DISPATCH_ATTEMPTS_HEAVY;
  return undefined; // lane-dispatch default (4)
}

// Compact protocol a glm-5.2 sub-orchestrator (or a native general-purpose Agent) is handed so it can
// itself dispatch peer lanes with the opus-fleet discipline. Inject as a system/context prefix.
export const FLEET_PROTOCOL_PREAMBLE = [
  'YURI opus-fleet protocol — you are a SUB-ORCHESTRATOR, not a grunt.',
  'Operate: decompose -> dispatch peer lanes -> aggregate -> adversarially verify -> finalize. You orchestrate; peers do the work.',
  'Every peer carries the FULL operator harness — read/grep/search/xref AND write_file/edit_file/bash. Peers BUILD directly (design, code, write, run, self-verify), NOT read-only. glm-5.2 is an Opus-peer.',
  'GLM tier roster (z.ai), all at --reasoning high:',
  '  glm-max (glm-5.2)   = heavy orchestrator / synthesis / final review (1M ctx, premium)',
  '  glm (glm-4.7)       = workhorse: code-gen, analysis, judgment',
  '  glm-flash (=glm-turbo via llm-lane)= fast build: census, scan, fast edits, test-runs',
  '  glm-sub-orch (5.1)  = overflow when glm-max is quota-gated',
  '  glm-vision (4.6v)   = image/screenshot   ·   glm-ocr = document extraction',
  'Dispatch a peer fleet (needs YURI_GLM_FLEET=1):',
  '  node _SYSTEM/Scripts/glm-fleet.mjs --tasks \'[{"lane":"glm","label":"R1","prompt":"..."}]\'',
  'Each lane writes .claude/jobs/<run>/results/<label>.json — read them all, then verify.',
  'Every result MUST end with an UPPERCASE RESULT_LABEL: NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED (e.g. 01GL_TASK_DONE_X_PASS_COMMITTED).',
  'Discipline: verify every peer claim against LOCAL evidence before trusting (lanes over-claim).',
  'Caps: concurrency <=3, rounds <=3. Never tee/redirect a lane call (use --out). Protected paths off-limits.',
  'Finalize (commit/push, irreversible/outward calls) is reserved for the owner/Opus lane — never a peer.',
].join('\n');

// Bounded-concurrency pool — index-preserving. No external dep.
async function runPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    const i = cursor;
    cursor += 1;
    if (i >= items.length) return;
    results[i] = await Promise.resolve(worker(items[i], i)).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    return next();
  }
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => next());
  await Promise.all(lanes);
  return results;
}

/**
 * Returns true iff the packet has the minimum fields required for pool convergence.
 * Called before writing each result packet; on failure the packet is still written but
 * status is forced to 'malformed' so the aggregator/floor treats it as non-conforming.
 * @param {object} packet
 * @returns {boolean}
 */
export function validatePacket(packet) {
  return (
    typeof packet === 'object' && packet !== null &&
    typeof packet.laneId === 'string' && packet.laneId.length > 0 &&
    typeof packet.role === 'string' && packet.role.length > 0 &&
    typeof packet.status === 'string' && packet.status.length > 0 &&
    typeof packet.resultLabel === 'string'  // may be '' (empty is allowed); must exist
  );
}

/**
 * Reads every *.json file in runDir (the per-run results dir returned by glmFleet),
 * parses each packet, and returns the pool keyed by packet.role (the leafId).
 * Malformed or unreadable files are collected into `skipped` rather than thrown.
 * @param {string} runDir  absolute path to the results directory
 * @returns {{ pool: { [leafId: string]: { label: string, text: string, status: string } }, skipped: Array<{file:string,error:string}> }}
 */
export function aggregatePoolOutputs(runDir) {
  const pool = {};
  const skipped = [];
  let files;
  try {
    files = fs.readdirSync(runDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
    // runDir doesn't exist or isn't readable — return empty rather than throw
    return { pool, skipped: [{ file: runDir, error: String(e?.message || e) }] };
  }
  for (const f of files) {
    const full = path.join(runDir, f);
    try {
      const raw = fs.readFileSync(full, 'utf8');
      const packet = JSON.parse(raw);
      if (typeof packet !== 'object' || packet === null || typeof packet.role !== 'string' || !packet.role) {
        skipped.push({ file: f, error: 'missing or invalid packet.role' });
        continue;
      }
      let label = typeof packet.resultLabel === 'string' ? packet.resultLabel : '';
      const text = typeof packet.text === 'string' ? packet.text : '';
      if (!label && text) label = extractResultLabel(text);
      pool[packet.role] = {
        label,
        text,
        status: typeof packet.status === 'string' ? packet.status : 'fail',
      };
    } catch (e) {
      skipped.push({ file: f, error: String(e?.message || e) });
    }
  }
  return { pool, skipped };
}

function fireTask(task, label, runDir, runId) {
  return new Promise((resolve) => {
    const outFile = path.join(runDir, `${label}.out`);
    const reasoning = task.reasoning || 'high';
    const timeoutMs = Number(task.timeoutMs) > 0 ? Number(task.timeoutMs) : defaultTimeoutMsForLane(task.lane);
    const dispatchAttempts = dispatchAttemptsForLane(task.lane);
    const args = [LANE_DISPATCH, task.lane, String(task.prompt || ''), '--out', outFile, '--reasoning', reasoning];
    const t0 = Date.now();
    let err = '';
    let child;
    try {
      const dispatchEnv = { ...process.env, LANE_DISPATCH_TIMEOUT_MS: String(timeoutMs) };
      if (dispatchAttempts != null) dispatchEnv.LANE_DISPATCH_ATTEMPTS = String(dispatchAttempts);
      child = spawn('node', args, {
        cwd: REPO_ROOT,
        // stdout IGNORED on purpose: the lane's text is read from its --out FILE, never the pipe. A piped-but-
        // unread stdout DEADLOCKS lane-dispatch's synchronous fs.writeSync(1,...) once output exceeds the
        // ~64KB OS pipe buffer (real on any reasoning-high synthesis). stderr stays piped for error capture.
        stdio: ['ignore', 'ignore', 'pipe'],
        env: dispatchEnv,
      });
    } catch (e) {
      resolve({ label, lane: task.lane, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false, durationMs: Date.now() - t0, stderr: String(e?.message || e) });
      return;
    }
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      let text = '';
      try { text = fs.readFileSync(outFile, 'utf8').trim(); } catch { /* lane failed before writing */ }
      const durationMs = Date.now() - t0;
      const stderrTail = err.trim().slice(-800);
      // Surface dispatch failure when --out is empty (SIGKILL timeout, exhausted retries, etc.).
      if (!text && (stderrTail || code !== 0)) {
        const hint = durationMs >= timeoutMs * 0.95 ? 'likely_timeout' : 'dispatch_fail';
        text = [
          `[GLM_FLEET_${hint.toUpperCase()}] lane=${task.lane} exit=${code} durationMs=${durationMs} timeoutMs=${timeoutMs}`,
          stderrTail ? `stderr: ${stderrTail}` : '',
        ].filter(Boolean).join('\n');
      }
      const resultLabel = extractResultLabel(text);
      const ok = code === 0 && text.length > 0 && !/^(?:\[GLM_FLEET_|LANE_DISPATCH_FAIL)/.test(text);
      const packet = {
        laneId: task.lane,
        role: task.label || label,
        task: String(task.prompt || '').slice(0, 200),
        resultLabel,
        evidence: ok ? '' : stderrTail.slice(-400),
        status: ok ? 'ok' : 'fail',
        text,
        durationMs,
        runId,
      };
      // Cross-run tracing: inject traceId/spanId when the fleet session sets YURI_FLEET_TRACE_ID.
      if (process.env.YURI_FLEET_TRACE_ID) {
        packet.traceId = process.env.YURI_FLEET_TRACE_ID;
        packet.spanId = task.label || label;
      }
      // Validate conformance — on failure mark malformed (still write for diagnostics; do not throw).
      if (!validatePacket(packet)) {
        packet.status = 'malformed';
      }
      try { fs.writeFileSync(path.join(runDir, `${label}.json`), `${JSON.stringify(packet, null, 2)}\n`); } catch { /* best-effort */ }
      resolve({ label, lane: task.lane, text, exitCode: code, file: outFile, resultLabel, ok, durationMs: Date.now() - t0, stderr: ok ? '' : err.slice(-400) });
    });
    child.on('error', (e) => {
      resolve({ label, lane: task.lane, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false, durationMs: Date.now() - t0, stderr: String(e?.message || e) });
    });
  });
}

/**
 * Fan out a GLM fleet. DISARMED by default (dry-run, zero spend/fan-out); YURI_GLM_FLEET=1 arms.
 * @param {Array<{lane,label,prompt,reasoning?,timeoutMs?}>} tasks
 * @param {{concurrency?:number, runId?:string, runDir?:string, armed?:boolean}} opts
 * @returns {Promise<{runId,runDir,armed,concurrency,results?,dryRun?,plan?}>}
 */
export async function glmFleet(tasks = [], opts = {}) {
  const armed = opts.armed != null ? !!opts.armed : isArmed();
  const runId = opts.runId || `glmf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = opts.runDir || buildRunDir(runId);
  const cRaw = Number(opts.concurrency);
  const concurrency = Number.isFinite(cRaw) && cRaw >= 1 ? Math.floor(cRaw) : 3;
  // Dedupe collided labels (two tasks sanitizing to the same filename would silently overwrite each other).
  const seenLabels = new Set();
  const labels = tasks.map((t, i) => {
    let l = safeLabel(t.label, i);
    if (seenLabels.has(l)) l = `${l}_${i}`;
    seenLabels.add(l);
    return l;
  });
  const plan = tasks.map((t, i) => ({ label: labels[i], lane: t.lane, reasoning: t.reasoning || 'high', prompt: String(t.prompt || '') }));

  if (!armed) {
    return { runId, runDir, armed: false, dryRun: true, concurrency, plan };
  }

  fs.mkdirSync(runDir, { recursive: true });
  const results = await runPool(tasks, concurrency, (t, i) => fireTask(t, labels[i], runDir, runId));
  return { runId, runDir, armed: true, concurrency, results };
}

function listRoster() {
  let lanes = {};
  try {
    const m = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude/config/models.json'), 'utf8'));
    lanes = m.llm_compat_lanes || {};
  } catch { /* */ }
  const glm = Object.keys(lanes).filter((k) => k.startsWith('glm-'));
  const armed = isArmed();
  const how = process.env[ARM_ENV] === '1' ? 'env YURI_GLM_FLEET=1' : (fs.existsSync(ARM_FLAG) ? 'flag _SYSTEM/state/glm-fleet.enabled' : '');
  const out = [];
  out.push(`glm-fleet — ${armed ? `ARMED (${how})` : 'DISARMED (dry-run; arm via YURI_GLM_FLEET=1 or: touch _SYSTEM/state/glm-fleet.enabled)'}`);
  out.push('GLM lanes registered in models.json:');
  for (const k of glm) out.push(`  ${k}  ctx=${lanes[k].context_window}`);
  out.push('Aliases (llm-lane.mjs): glm-max=5.2 · glm=4.7 · glm-flash→5-turbo (4.7-flash unstable) · glm-flashx · glm-sub-orch=5.1 · glm-turbo=5-turbo · glm-vision=4.6v · glm-ocr');
  out.push('Usage: node glm-fleet.mjs --tasks \'[{"lane":"glm","label":"R1","prompt":"..."}]\' [--concurrency 3] [--dry-run]');
  out.push('       node glm-fleet.mjs --smoke   (3-lane live smoke; needs YURI_GLM_FLEET=1)');
  return out.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--list') || argv.length === 0) {
    process.stdout.write(`${listRoster()}\n`);
    process.exit(0);
  }
  const forceDry = argv.includes('--dry-run');
  let tasks = [];
  if (argv.includes('--smoke')) {
    tasks = [
      { lane: 'glm-flash', label: 'SMOKE_FLASH', reasoning: 'high', prompt: 'Reply with EXACTLY one short line confirming you are a live z.ai GLM lane, then on a NEW line emit exactly: 01GL_GLM_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
      { lane: 'glm', label: 'SMOKE_SONNET', reasoning: 'high', prompt: 'Reply with EXACTLY one short line confirming you are a live z.ai GLM lane, then on a NEW line emit exactly: 02GL_GLM_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
      { lane: 'glm-turbo', label: 'SMOKE_TURBO', reasoning: 'high', prompt: 'Reply with EXACTLY one short line confirming you are a live z.ai GLM lane, then on a NEW line emit exactly: 03GL_GLM_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
    ];
  } else if (flagVal('--tasks-file') || flagVal('--tasks')) {
    try {
      tasks = flagVal('--tasks-file')
        ? JSON.parse(fs.readFileSync(flagVal('--tasks-file'), 'utf8'))
        : JSON.parse(flagVal('--tasks'));
    } catch (e) {
      process.stderr.write(`glm-fleet: bad --tasks input: ${String(e?.message || e)}\n`);
      process.exit(2);
    }
    if (!Array.isArray(tasks) || !tasks.length) {
      process.stderr.write('glm-fleet: --tasks must be a non-empty JSON array\n');
      process.exit(2);
    }
  } else {
    process.stderr.write('glm-fleet: provide --tasks <json> | --tasks-file <path> | --smoke | --list\n');
    process.exit(2);
  }
  const opts = { concurrency: Number(flagVal('--concurrency') || 3) };
  if (forceDry) opts.armed = false;
  glmFleet(tasks, opts).then((r) => {
    const summary = r.dryRun
      ? { runId: r.runId, armed: false, dryRun: true, runDir: r.runDir, lanes: r.plan.map((p) => ({ label: p.label, lane: p.lane, reasoning: p.reasoning })) }
      : { runId: r.runId, armed: true, runDir: r.runDir, concurrency: r.concurrency, results: r.results.map((x) => ({ label: x.label, lane: x.lane, ok: x.ok, exitCode: x.exitCode, resultLabel: x.resultLabel, ms: x.durationMs, chars: x.text.length })) };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exit(r.dryRun ? 0 : (r.results.every((x) => x.ok) ? 0 : 1));
  }).catch((e) => { process.stderr.write(`glm-fleet error: ${String(e?.message || e)}\n`); process.exit(1); });
}
