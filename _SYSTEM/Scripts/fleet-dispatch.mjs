#!/usr/bin/env node
// @capability: fleet-dispatch-role-pool
// @serves: role pool dispatch | cross-substrate failover | dispatch by role not model | roles are pools | fleet failover | model-agnostic dispatch | no single-provider dependency | spawn by capability | rate-limit failover
// @does: dispatches tasks tagged with a ROLE (not a model) by resolving the role to an ORDERED POOL of
//   candidate lanes across substrates (ollama-cloud / zai-glm / mimo), then dispatching the top candidate
//   through lane-dispatch.mjs and FAILING OVER to the next candidate on 429 / rate-limit / transport failure /
//   empty output / unarmed-substrate. Removes the single-provider dependency that let an Anthropic rate limit
//   block ALL spawns: a role no longer maps to one model, it maps to a pool, and the dispatcher walks it.
// @use: fleetDispatch([{role:'codegen',label:'R1',prompt:'...'}], {concurrency:3}) — role|pool|group per task.
//   CLI: node fleet-dispatch.mjs --tasks '<json>' | --tasks-file <path> [--concurrency 3] [--dry-run] [--list]
// @exports: fleetDispatch, resolvePool, resolveCandidates, dispatchWithFailover, loadPools, buildRunDir, ARM_ENV
//
// WHY built on lane-dispatch.mjs: it is the shared retry+429-detecting wrapper over llm-lane.mjs that BOTH
// glm-fleet and ollama-fleet already ride. This dispatcher adds the layer neither has: role->pool resolution
// and CROSS-SUBSTRATE failover (lane-dispatch retries the SAME lane; this jumps to a different substrate).
//
// SAFETY: DISARMED by default (dry-run, zero spend). A candidate's substrate must be armed for it to fire:
//   ollama-cloud -> _SYSTEM/state/ollama-fleet.enabled (or YURI_OLLAMA_FLEET=1)
//   zai (glm)    -> _SYSTEM/state/glm-fleet.enabled     (or YURI_GLM_FLEET=1)
//   mimo         -> _SYSTEM/state/mimo-fleet.enabled    (or YURI_MIMO_FLEET=1)
//   An unarmed substrate's candidates are SKIPPED (failover to the next), so arming controls the live pool.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { extractResultLabel as ccExtractResultLabel } from './contract-conformance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const LANE_DISPATCH = path.join(HERE, 'lane-dispatch.mjs');
const POOLS_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'role-pools.json');
const ROLES_PATH = path.join(REPO_ROOT, '_SYSTEM', 'config', 'fleet-roles.json');

export const ARM_ENV = 'YURI_FLEET_DISPATCH';

// Per-substrate arm gates. A candidate only fires if its substrate is armed; else it is skipped (failover).
const SUBSTRATE_ARM = Object.freeze({
  'ollama-cloud': { env: 'YURI_OLLAMA_FLEET', flag: path.join(REPO_ROOT, '_SYSTEM', 'state', 'ollama-fleet.enabled') },
  'zai':          { env: 'YURI_GLM_FLEET',    flag: path.join(REPO_ROOT, '_SYSTEM', 'state', 'glm-fleet.enabled') },
  'xiaomi-mimo':  { env: 'YURI_MIMO_FLEET',   flag: path.join(REPO_ROOT, '_SYSTEM', 'state', 'mimo-fleet.enabled') },
});

function substrateArmed(substrate) {
  const g = SUBSTRATE_ARM[substrate];
  if (!g) return false;
  if (process.env[g.env] === '1') return true;
  try { return fs.existsSync(g.flag); } catch { return false; }
}

// Reasoning level per pool tier (heavy pools think harder; bulk stays fast).
const POOL_REASONING = Object.freeze({ heavy: 'high', codegen: 'high', verification: 'medium', research: 'medium', bulk: 'low' });

let _pools = null;
export function loadPools(poolsPath = POOLS_PATH) {
  if (_pools && poolsPath === POOLS_PATH) return _pools;
  const raw = JSON.parse(fs.readFileSync(poolsPath, 'utf8'));
  if (!raw.pools || !raw.substrateLanes) throw new Error('role-pools.json: missing pools/substrateLanes');
  if (poolsPath === POOLS_PATH) _pools = raw;
  return raw;
}

// role name -> pool tier. Precedence: explicit task.pool > rolePool[role] > groupPool[role's group] > 'research'.
export function resolvePool(sel, pools = loadPools(), roster = null) {
  if (!sel) return 'research';
  if (pools.pools[sel]) return sel;                       // sel IS a pool tier
  if (pools.rolePool && pools.rolePool[sel]) return pools.rolePool[sel];
  // map role -> group via the roster, then group -> pool
  let group = null;
  try {
    const r = roster || JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
    const role = (r.roles || []).find((x) => x.id === sel);
    group = role?.group || null;
  } catch { /* roster optional */ }
  if (group && pools.groupPool && pools.groupPool[group]) return pools.groupPool[group];
  return 'research';
}

// Resolve a task -> ordered candidate list [{key, lane, model, substrate, armed}].
export function resolveCandidates(task, pools = loadPools()) {
  const tier = resolvePool(task.pool || task.role || task.group, pools);
  const keys = pools.pools[tier] || pools.pools.research;
  return keys.map((key) => {
    const sl = pools.substrateLanes[key];
    if (!sl) return null;
    return { key, tier, lane: sl.lane, model: sl.model || null, substrate: sl.substrate, armed: substrateArmed(sl.substrate) };
  }).filter(Boolean);
}

export function buildRunDir(runId) {
  const dir = path.join(REPO_ROOT, '.claude', 'jobs', runId, 'results');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function extractResultLabel(text) {
  try { return ccExtractResultLabel(text) || ''; } catch { return ''; }
}

// Dispatch ONE candidate through lane-dispatch. Resolves { ok, text, exitCode, rateLimited, stderr, durationMs }.
function dispatchCandidate(cand, prompt, outFile, { reasoning, timeoutMs, attempts }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const args = [LANE_DISPATCH, cand.lane, prompt, '--reasoning', reasoning, '--out', outFile];
    if (cand.model) args.push('--model', cand.model);
    const env = { ...process.env, LANE_DISPATCH_TIMEOUT_MS: String(timeoutMs), LANE_DISPATCH_ATTEMPTS: String(attempts) };
    let child, err = '';
    try {
      child = spawn('node', args, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'pipe'], env });
    } catch (e) {
      resolve({ ok: false, text: '', exitCode: 1, rateLimited: false, stderr: String(e?.message || e), durationMs: Date.now() - t0 });
      return;
    }
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      let text = '';
      try { if (fs.existsSync(outFile)) text = fs.readFileSync(outFile, 'utf8'); } catch { /* ignore */ }
      const rateLimited = /\b429\b|rate.?limit|too many requests|quota/i.test(err);
      // lane-dispatch exits 0 on success and writes real text; on failure it may write a STRUCTURED failure
      // record to outFile, so success requires exit 0 AND text that is not the failure record.
      const failRecord = text.startsWith('{') && /"laneDispatchFailure"|"exitCode"|"stderrTail"/.test(text.slice(0, 400));
      const ok = code === 0 && text.trim().length > 0 && !failRecord;
      resolve({ ok, text: ok ? text : '', exitCode: code, rateLimited, stderr: err.slice(-2000), durationMs: Date.now() - t0 });
    });
    child.on('error', (e) => {
      resolve({ ok: false, text: '', exitCode: 1, rateLimited: false, stderr: String(e?.message || e), durationMs: Date.now() - t0 });
    });
  });
}

// Walk a task's candidate pool, failing over on unarmed/429/failure. Returns the winning packet + attempt trail.
export async function dispatchWithFailover(task, runDir, opts = {}) {
  const pools = opts.pools || loadPools();
  const candidates = resolveCandidates(task, pools);
  const tier = candidates[0]?.tier || resolvePool(task.pool || task.role || task.group, pools);
  const reasoning = task.reasoning || POOL_REASONING[tier] || 'medium';
  const timeoutMs = Number(task.timeoutMs || opts.timeoutMs || 900000);
  const attempts = Number(opts.attemptsPerCandidate || 2);
  const label = task.label || task.id || crypto.randomBytes(3).toString('hex');
  const trail = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const cand = candidates[i];
    if (!cand.armed) { trail.push({ key: cand.key, substrate: cand.substrate, skipped: 'unarmed' }); continue; }
    if (opts.dryRun) {
      trail.push({ key: cand.key, substrate: cand.substrate, dryRun: true });
      return { label, tier, ok: true, dryRun: true, chosen: cand.key, chosenSubstrate: cand.substrate, model: cand.model || cand.lane, trail, resultLabel: '', text: '' };
    }
    const outFile = path.join(runDir, `${label}.${cand.key.replace(/[^a-z0-9]+/gi, '-')}.out`);
    const r = await dispatchCandidate(cand, task.prompt, outFile, { reasoning, timeoutMs, attempts });
    trail.push({ key: cand.key, substrate: cand.substrate, ok: r.ok, exitCode: r.exitCode, rateLimited: r.rateLimited, durationMs: r.durationMs });
    if (r.ok) {
      return { label, tier, ok: true, chosen: cand.key, chosenSubstrate: cand.substrate, model: cand.model || cand.lane,
               failedOver: i > 0, trail, resultLabel: extractResultLabel(r.text), text: r.text, file: outFile, durationMs: r.durationMs };
    }
    // else: fail over to the next candidate in the pool
  }
  return { label, tier, ok: false, chosen: null, trail, resultLabel: '', text: '',
           reason: candidates.every((c) => !c.armed) ? 'no-armed-substrate' : 'pool-exhausted' };
}

// Bounded-concurrency fan-out over tasks; each task fails over its own pool independently.
export async function fleetDispatch(tasks = [], opts = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('fleetDispatch: tasks[] required');
  const pools = loadPools();
  const dryRun = opts.dryRun || !(process.env[ARM_ENV] === '1' || fs.existsSync(path.join(REPO_ROOT, '_SYSTEM', 'state', 'fleet-dispatch.enabled')));
  const concurrency = Math.max(1, Number(opts.concurrency || 3));
  const runId = `fld-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const runDir = buildRunDir(runId);
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next; next += 1;
      if (i >= tasks.length) return;
      results[i] = await dispatchWithFailover(tasks[i], runDir, { ...opts, pools, dryRun });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

  const summary = {
    runId, runDir, dryRun, armed: !dryRun, concurrency, taskCount: tasks.length,
    ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length,
    failedOver: results.filter((r) => r.failedOver).length, results,
  };
  try { fs.writeFileSync(path.join(runDir, '_dispatch-summary.json'), JSON.stringify(summary, null, 2)); } catch { /* ignore */ }
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--list') || argv.length === 0) {
    const p = loadPools();
    const out = ['role-pools (ordered candidates, non-Anthropic-first, failover top->down):'];
    for (const [tier, keys] of Object.entries(p.pools)) {
      out.push(`  ${tier.padEnd(13)} -> ${keys.map((k) => `${k}${substrateArmed(p.substrateLanes[k]?.substrate) ? '' : '(disarmed)'}`).join(' -> ')}`);
    }
    out.push('groups:'); for (const [g, t] of Object.entries(p.groupPool)) out.push(`  ${g.padEnd(13)} -> ${t}`);
    out.push('Arm: touch _SYSTEM/state/fleet-dispatch.enabled + per-substrate ollama-fleet.enabled / glm-fleet.enabled / mimo-fleet.enabled');
    out.push('Usage: node fleet-dispatch.mjs --tasks \'[{"role":"codegen","label":"R1","prompt":"..."}]\' [--concurrency 3] [--dry-run]');
    process.stdout.write(out.join('\n') + '\n');
    process.exit(0);
  }
  let tasks = [];
  const tf = flagVal('--tasks-file');
  const tj = flagVal('--tasks');
  if (tf) tasks = JSON.parse(fs.readFileSync(path.resolve(tf), 'utf8'));
  else if (tj) tasks = JSON.parse(tj);
  else { process.stderr.write('fleet-dispatch: --tasks or --tasks-file required\n'); process.exit(2); }
  const opts = { concurrency: Number(flagVal('--concurrency') || 3), dryRun: argv.includes('--dry-run') };
  fleetDispatch(tasks, opts)
    .then((s) => { process.stdout.write(JSON.stringify(s, null, 2) + '\n'); process.exit(0); })
    .catch((e) => { process.stderr.write(`fleet-dispatch error: ${e?.message || e}\n`); process.exit(1); });
}
