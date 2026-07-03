#!/usr/bin/env node
// @capability: ollama-fleet-dispatch
// @serves: ollama fleet | spawn ollama agents | ollama-cloud fleet | parallel ollama lanes | fan out ollama | cross-family peer swarm | third substrate | nano swarm fan-out | dozens of models
// @does: parallel fan-out of N ollama-cloud PEER lanes (ONE base lane + --model <X>:cloud per task) through lane-dispatch.mjs (4-attempt AggregateError/EPIPE/429 retry in a fresh process), each model's text collected via --out into a per-run results dir, wrapped into a labeled JSON result packet (RESULT_LABEL extracted). Concurrency-bounded by a semaphore (default 3 = Ollama Pro concurrent ceiling). DISARMED by default = dry-run (zero spend, zero fan-out); YURI_OLLAMA_FLEET=1 arms. The THIRD opus-fleet substrate alongside native Claude Agents + the z.ai GLM fleet.
// @use: ollamaFleet([{model:'deepseek-v4-flash:cloud',label:'R1',prompt:'...'}], {concurrency:3}) — or use {tier:'flash'} shorthand. Roster tiers: flash/minimax/kimi/nemotron/deepseek-pro/gemma. CLI: node ollama-fleet.mjs --list | --tasks '<json>' | --smoke (armed needs YURI_OLLAMA_FLEET=1) | --dry-run.
// @exports: ollamaFleet, buildRunDir, extractResultLabel, aggregatePoolOutputs, validatePacket, resolveModel, OLLAMA_ROSTER, DEFAULT_MODEL, FLEET_PROTOCOL_PREAMBLE, ARM_ENV, ARM_FLAG, isArmed
//
// WHY built on lane-dispatch.mjs (not llm-lane directly): lane-dispatch re-invokes llm-lane in a FRESH
// process up to 4× with backoff, treating AggregateError (undici idle-socket reuse) / empty / non-zero exit
// as transient — the exact resilience the ollama.com transport needs at concurrency. ollama-fleet adds ONLY
// the parallel semaphore + per-model result aggregation. NEVER pipe a lane call through `tee` or `>` (a second
// stream reader triggers transport:EPIPE): the lane writes its final text to its OWN --out file, which we read.
// The key is hydrated at the lane layer (models.json keychain_service YURI_OS_MUSUBI:OLLAMA_API_KEY) so a
// spawned lane authenticates WITHOUT the `ai` wrapper or an exported OLLAMA_API_KEY (root-cause fix 2026-06-23).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractResultLabel as ccExtractResultLabel, classifyLaneOutcome } from './contract-conformance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const LANE_DISPATCH = path.join(HERE, 'lane-dispatch.mjs');
const OLLAMA_LANE = 'ollama-cloud';

export const ARM_ENV = 'YURI_OLLAMA_FLEET';
export const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'ollama-fleet.enabled');
// Armed via EITHER the session env var OR a local (gitignored) flag file — the YURI arming idiom. Owner-gated
// to create; reversible by `rm`. Disarmed default = dry-run (zero spend/fan-out).
export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

// Owner-selected ollama-cloud build roster (models.json ollama-cloud lane + FB:OLLAMA-FLASH-PRIMARY-ROUTING).
// flash = primary bulk (best quality-per-usage, blast freely); minimax + kimi = the efficient working trio;
// nemotron = heavy reasoning; deepseek-pro = true-1M heavy (AVOID for bulk ~2x usage); gemma = available.
export const OLLAMA_ROSTER = Object.freeze({
  flash: 'deepseek-v4-flash:cloud',
  minimax: 'minimax-m3:cloud',
  kimi: 'kimi-k2.7-code:cloud',
  nemotron: 'nemotron-3-ultra:cloud',
  'deepseek-pro': 'deepseek-v4-pro:cloud',
  gemma: 'gemma4:31b-cloud',
});
export const DEFAULT_MODEL = OLLAMA_ROSTER.flash; // primary bulk lane

/** Resolve a task's model id: explicit `model` (full :cloud id) wins, else `tier` shorthand, else default. */
export function resolveModel(task = {}) {
  if (task.model && typeof task.model === 'string') return task.model;
  if (task.tier && OLLAMA_ROSTER[task.tier]) return OLLAMA_ROSTER[task.tier];
  return DEFAULT_MODEL;
}

// Lane Result Grammar — DELEGATED to contract-conformance.mjs, the single canonical definition
// (master plan D-3: three drifted copies of this regex each dropped real labels; one source now).
export function extractResultLabel(text) {
  return ccExtractResultLabel(String(text || '')).label || '';
}

// P2 live-monitoring seam: append-only spawn lifecycle events at .claude/jobs/<runId>/spawns.jsonl,
// consumed by work-ledger.ingestActiveRuns → dashboard. Fail-open — emission never breaks dispatch.
function appendSpawnEvent(runDir, evt) {
  try { fs.appendFileSync(path.join(runDir, '..', 'spawns.jsonl'), `${JSON.stringify(evt)}\n`); } catch { /* fail-open */ }
}

export function buildRunDir(runId) {
  return path.join(REPO_ROOT, '.claude', 'jobs', String(runId), 'results');
}

function safeLabel(s, i = 0) {
  const v = String(s || `lane${i + 1}`).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
  return v || `lane${i + 1}`;
}

// Compact protocol an ollama-cloud sub-orchestrator (or a native general-purpose Agent) is handed so it can
// itself dispatch peer lanes with the opus-fleet discipline. Inject as a system/context prefix.
export const FLEET_PROTOCOL_PREAMBLE = [
  'YURI opus-fleet protocol — you are a SUB-ORCHESTRATOR, not a grunt.',
  'Operate: decompose -> dispatch peer lanes -> aggregate -> adversarially verify -> finalize. You orchestrate; peers do the work.',
  'Every peer carries the FULL operator harness — read/grep/search/xref AND write_file/edit_file/bash. Peers BUILD directly, NOT read-only. These are cross-family PEERS (not Claude), full operators, grounded in local + cited-online evidence.',
  'Ollama-cloud roster (one base lane `ollama-cloud` + --model <X>:cloud), all selectable per task:',
  '  flash (deepseek-v4-flash:cloud) = PRIMARY bulk: best quality-per-usage, blast freely',
  '  minimax (minimax-m3:cloud)      = efficient generalist',
  '  kimi (kimi-k2.7-code:cloud)     = code specialist (ollama-native full-Claude bridge available)',
  '  nemotron (nemotron-3-ultra:cloud)= heavy reasoning',
  '  deepseek-pro (deepseek-v4-pro:cloud)= true-1M-input heavy (AVOID for bulk ~2x usage)',
  'Dispatch a peer fleet (needs YURI_OLLAMA_FLEET=1):',
  '  node _SYSTEM/Scripts/ollama-fleet.mjs --tasks \'[{"tier":"flash","label":"R1","prompt":"..."}]\'',
  'Each lane writes .claude/jobs/<run>/results/<label>.json — read them all, then verify.',
  'Every result MUST end with an UPPERCASE RESULT_LABEL: NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED (e.g. 01OL_TASK_DONE_X_PASS_COMMITTED).',
  'Discipline: verify every peer claim against LOCAL evidence before trusting (lanes over-claim). Pro plan = 3 concurrent.',
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
 * Returns true iff the packet has the minimum fields required for pool convergence. On failure the packet is
 * still written but status is forced to 'malformed' so the aggregator/floor treats it as non-conforming.
 */
export function validatePacket(packet) {
  return (
    typeof packet === 'object' && packet !== null &&
    typeof packet.laneId === 'string' && packet.laneId.length > 0 &&
    typeof packet.role === 'string' && packet.role.length > 0 &&
    typeof packet.status === 'string' && packet.status.length > 0 &&
    typeof packet.resultLabel === 'string'
  );
}

/**
 * Reads every *.json file in runDir, parses each packet, returns the pool keyed by packet.role (the leafId).
 * Malformed or unreadable files are collected into `skipped` rather than thrown.
 */
export function aggregatePoolOutputs(runDir) {
  const pool = {};
  const skipped = [];
  let files;
  try {
    files = fs.readdirSync(runDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
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
      pool[packet.role] = {
        label: typeof packet.resultLabel === 'string' ? packet.resultLabel : '',
        text: typeof packet.text === 'string' ? packet.text : '',
        status: typeof packet.status === 'string' ? packet.status : 'fail',
        model: typeof packet.model === 'string' ? packet.model : '',
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
    const model = resolveModel(task);
    const reasoning = task.reasoning || 'high';
    const timeoutMs = Number(task.timeoutMs || 600000);
    const args = [LANE_DISPATCH, OLLAMA_LANE, String(task.prompt || ''), '--model', model, '--out', outFile, '--reasoning', reasoning];
    const t0 = Date.now();
    let err = '';
    let child;
    try {
      child = spawn('node', args, {
        cwd: REPO_ROOT,
        // stdout IGNORED on purpose: the lane's text is read from its --out FILE, never the pipe. A piped-but-
        // unread stdout DEADLOCKS lane-dispatch's synchronous writes once output exceeds the ~64KB OS pipe
        // buffer (real on any reasoning-high synthesis). stderr stays piped for error capture.
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, LANE_DISPATCH_TIMEOUT_MS: String(timeoutMs) },
      });
    } catch (e) {
      resolve({ label, model, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false, degraded: false, outcomeReason: 'spawn-error', durationMs: Date.now() - t0, stderr: String(e?.message || e) });
      return;
    }
    appendSpawnEvent(runDir, { label, lane: `${OLLAMA_LANE}:${model}`, pid: child.pid, spawnedAt: new Date().toISOString() });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      let text = '';
      try { text = fs.readFileSync(outFile, 'utf8').trim(); } catch { /* lane failed before writing */ }
      const resultLabel = extractResultLabel(text);
      // OUTPUT-first outcome (shared with glm-fleet): a lane that wrote complete, non-F
      // RESULT_LABEL'd output is a success even on a non-zero exit. Kills the cosmetic exit-1
      // false-failure class (2026-07-03).
      const outcome = classifyLaneOutcome({ code, text });
      const ok = outcome.ok;
      const degraded = outcome.degraded;
      appendSpawnEvent(runDir, { label, pid: child.pid, endedAt: new Date().toISOString(), exitCode: code, status: ok ? (degraded ? 'ok-degraded' : 'ok') : 'fail', reason: outcome.reason });
      const packet = {
        laneId: `${OLLAMA_LANE}:${model}`,
        model,
        role: task.label || label,
        task: String(task.prompt || '').slice(0, 200),
        resultLabel,
        evidence: '',
        status: ok ? 'ok' : 'fail',
        degraded,
        outcomeReason: outcome.reason,
        text,
        durationMs: Date.now() - t0,
        runId,
      };
      if (process.env.YURI_FLEET_TRACE_ID) {
        packet.traceId = process.env.YURI_FLEET_TRACE_ID;
        packet.spanId = task.label || label;
      }
      if (!validatePacket(packet)) packet.status = 'malformed';
      try { fs.writeFileSync(path.join(runDir, `${label}.json`), `${JSON.stringify(packet, null, 2)}\n`); } catch { /* best-effort */ }
      resolve({ label, model, text, exitCode: code, file: outFile, resultLabel, ok, degraded, outcomeReason: outcome.reason, durationMs: Date.now() - t0, stderr: ok ? '' : err.slice(-400) });
    });
    child.on('error', (e) => {
      appendSpawnEvent(runDir, { label, pid: child?.pid ?? null, endedAt: new Date().toISOString(), exitCode: null, status: 'fail' });
      resolve({ label, model, text: '', exitCode: 1, file: outFile, resultLabel: '', ok: false, degraded: false, outcomeReason: 'spawn-error', durationMs: Date.now() - t0, stderr: String(e?.message || e) });
    });
  });
}

/**
 * Fan out an ollama-cloud fleet. DISARMED by default (dry-run, zero spend/fan-out); YURI_OLLAMA_FLEET=1 arms.
 * @param {Array<{model?,tier?,label,prompt,reasoning?,timeoutMs?}>} tasks
 * @param {{concurrency?:number, runId?:string, runDir?:string, armed?:boolean}} opts
 * @returns {Promise<{runId,runDir,armed,concurrency,results?,dryRun?,plan?}>}
 */
export async function ollamaFleet(tasks = [], opts = {}) {
  const armed = opts.armed != null ? !!opts.armed : isArmed();
  const runId = opts.runId || `olf-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = opts.runDir || buildRunDir(runId);
  const cRaw = Number(opts.concurrency);
  const concurrency = Number.isFinite(cRaw) && cRaw >= 1 ? Math.floor(cRaw) : 3; // Pro plan = 3 concurrent
  const seenLabels = new Set();
  const labels = tasks.map((t, i) => {
    let l = safeLabel(t.label, i);
    if (seenLabels.has(l)) l = `${l}_${i}`;
    seenLabels.add(l);
    return l;
  });
  const plan = tasks.map((t, i) => ({ label: labels[i], model: resolveModel(t), reasoning: t.reasoning || 'high', prompt: String(t.prompt || '') }));

  if (!armed) {
    return { runId, runDir, armed: false, dryRun: true, concurrency, plan };
  }

  fs.mkdirSync(runDir, { recursive: true });
  const results = await runPool(tasks, concurrency, (t, i) => fireTask(t, labels[i], runDir, runId));
  return { runId, runDir, armed: true, concurrency, results };
}

function listRoster() {
  let lane = {};
  try {
    const m = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude/config/models.json'), 'utf8'));
    lane = (m.llm_compat_lanes || {})['ollama-cloud'] || {};
  } catch { /* */ }
  const armed = isArmed();
  const how = process.env[ARM_ENV] === '1' ? 'env YURI_OLLAMA_FLEET=1' : (fs.existsSync(ARM_FLAG) ? 'flag _SYSTEM/state/ollama-fleet.enabled' : '');
  const out = [];
  out.push(`ollama-fleet — ${armed ? `ARMED (${how})` : 'DISARMED (dry-run; arm via YURI_OLLAMA_FLEET=1 or: touch _SYSTEM/state/ollama-fleet.enabled)'}`);
  out.push(`base lane: ollama-cloud (ctx=${lane.context_window || '?'}, key=keychain ${lane.keychain_service || 'UNSET — run the keychain fix'}); Pro plan = 3 concurrent`);
  out.push('roster (tier -> model):');
  for (const [tier, model] of Object.entries(OLLAMA_ROSTER)) out.push(`  ${tier.padEnd(13)} ${model}${model === DEFAULT_MODEL ? '   (default/bulk)' : ''}`);
  out.push('Usage: node ollama-fleet.mjs --tasks \'[{"tier":"flash","label":"R1","prompt":"..."}]\' [--concurrency 3] [--dry-run]');
  out.push('       node ollama-fleet.mjs --smoke   (3-model live smoke: flash+minimax+kimi; needs YURI_OLLAMA_FLEET=1)');
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--list') || argv.length === 0) {
    process.stdout.write(`${listRoster()}\n`);
    process.exit(0);
  }
  const forceDry = argv.includes('--dry-run');
  let tasks = [];
  if (argv.includes('--smoke')) {
    // The owner's working trio: flash + minimax + kimi (deepseek-v4-flash/minimax-m3/kimi-k2.7-code).
    tasks = [
      { tier: 'flash', label: 'SMOKE_FLASH', reasoning: 'low', prompt: 'Reply with EXACTLY one short line confirming you are a live ollama-cloud peer lane, then on a NEW line emit exactly: 01OL_OLLAMA_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
      { tier: 'minimax', label: 'SMOKE_MINIMAX', reasoning: 'low', prompt: 'Reply with EXACTLY one short line confirming you are a live ollama-cloud peer lane, then on a NEW line emit exactly: 02OL_OLLAMA_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
      { tier: 'kimi', label: 'SMOKE_KIMI', reasoning: 'low', prompt: 'Reply with EXACTLY one short line confirming you are a live ollama-cloud peer lane, then on a NEW line emit exactly: 03OL_OLLAMA_FLEET_SMOKE_X_PASS_COMMITTED . No other text.' },
    ];
  } else if (flagVal('--tasks-file') || flagVal('--tasks')) {
    try {
      tasks = flagVal('--tasks-file')
        ? JSON.parse(fs.readFileSync(flagVal('--tasks-file'), 'utf8'))
        : JSON.parse(flagVal('--tasks'));
    } catch (e) {
      process.stderr.write(`ollama-fleet: bad --tasks input: ${String(e?.message || e)}\n`);
      process.exit(2);
    }
    if (!Array.isArray(tasks) || !tasks.length) {
      process.stderr.write('ollama-fleet: --tasks must be a non-empty JSON array\n');
      process.exit(2);
    }
  } else {
    process.stderr.write('ollama-fleet: provide --tasks <json> | --tasks-file <path> | --smoke | --list\n');
    process.exit(2);
  }
  const opts = { concurrency: Number(flagVal('--concurrency') || 3) };
  if (forceDry) opts.armed = false;
  ollamaFleet(tasks, opts).then((r) => {
    const summary = r.dryRun
      ? { runId: r.runId, armed: false, dryRun: true, runDir: r.runDir, lanes: r.plan.map((p) => ({ label: p.label, model: p.model, reasoning: p.reasoning })) }
      : { runId: r.runId, armed: true, runDir: r.runDir, concurrency: r.concurrency, results: r.results.map((x) => ({ label: x.label, model: x.model, ok: x.ok, degraded: !!x.degraded, reason: x.outcomeReason, exitCode: x.exitCode, resultLabel: x.resultLabel, ms: x.durationMs, chars: x.text.length })) };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    // Exit reflects WORK outcome, not raw child exit codes (see classifyLaneOutcome):
    // 0 = every lane produced usable, labeled output; 1 = a genuine lane failure. 2026-07-03.
    process.exit(r.dryRun ? 0 : (r.results.every((x) => x.ok) ? 0 : 1));
  }).catch((e) => { process.stderr.write(`ollama-fleet error: ${String(e?.message || e)}\n`); process.exit(1); });
}
