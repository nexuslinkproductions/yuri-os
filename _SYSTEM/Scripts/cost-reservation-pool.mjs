#!/usr/bin/env node
//
// cost-reservation-pool.mjs — cost-to-completion ADMISSION GATE (reservation pattern, clean-room).
//
// Clean-room re-expression of the capacity-reservation idea (estimate the full cost of a unit of work
// up front, reserve it against a hard budget, and admit ALL-OR-NOTHING so a half-funded task can never
// strand the pool). Studied from TensorRT-LLM's two-stage scheduler discipline — capacity reservation
// is decided BEFORE per-tick selection — and re-imagined for YURI's USD/effective-token lane budget.
// NO upstream code copied; this is a YURI-native mechanism over YURI's own token-cost math.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────
// ARMED STATE: DISARMED BY DEFAULT. This gate GOVERNS NOTHING until the owner DUAL-ARMS it:
//     1. env  YURI_COST_ADMISSION_ENFORCE=1
//     2. flag file  _SYSTEM/state/cost-admission.armed  exists
//     3. a real budget cap is set (env YURI_COST_ADMISSION_CAP_USD=<number> or the flag-file body) —
//        Marcel has NOT provided a cap value yet, so with no cap the gate stays advisory even if the
//        env+flag are present (fail-OPEN on a missing cap: a budget gate with no budget admits).
// While disarmed, admit() ALWAYS returns { admitted:true, enforced:false } and records nothing that
// could block a lane. The dispatch-seam callers (llm-lane.mjs, yuri-slm-worker.mjs) only ADVISE.
// ────────────────────────────────────────────────────────────────────────────────────────────────
//
// CAPABILITY-FIRST: this does NOT duplicate token-ledger's cost math — it IMPORTS the additively-
// exported calculateCostUsd / calculateEffectiveTokens / getPricingPolicy (currency parity: one
// formula, one pricing table). It is a different axis from local-concurrency.mjs (GPU slot count) and
// nano-compact-gate.mjs (single-call context ceiling): this reserves a USD/token BUDGET across a window.
//
// Usage:
//   node cost-reservation-pool.mjs status
//   node cost-reservation-pool.mjs estimate --lane mimo --model "mimo-v2.5-pro[1m]" --prompt-chars 4000 --steps 3
//   node cost-reservation-pool.mjs admit    --lane deepseek --model deepseek-v4-pro --prompt-chars 4000 --steps 3
//   node cost-reservation-pool.mjs arm | disarm
//
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { acquireLease, releaseLease } from './nano-lease.mjs';
import {
  calculateCostUsd,
  calculateEffectiveTokens,
  getPricingPolicy,
} from './token-ledger.mjs';

// @capability: cost-admission-gate
// @serves: cost-to-completion admission | budget reservation | reject or queue a lane task that cannot fit the budget | no-partial-admit | USD spend cap gate
// @does: DISARMED-by-default admission gate — estimates a lane task's full cost-to-completion, reserves it all-or-nothing against a USD budget, and rejects/queues if actuals+reservations+estimate exceed the cap; fail-conservative on missing actuals
// @use: at a dispatch seam (llm-lane / slm-worker) to advise/gate spend; reuses token-ledger cost math (no duplication). Arm only with env YURI_COST_ADMISSION_ENFORCE=1 + flag file + a real cap value
// @exports: estimateTaskCost, admit, release, reacquireWithRollback, actualsToDate, readArmState, resolvePaths, DEFAULT_OVER_ESTIMATE_MULTIPLIER

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_STATE_ROOT = path.join(REPO_ROOT, '_SYSTEM', 'state');
const DEFAULT_RESERVE_DIR = path.join(DEFAULT_STATE_ROOT, 'cost-reservations');
const DEFAULT_ARM_FLAG = path.join(DEFAULT_STATE_ROOT, 'cost-admission.armed');

// Over-estimate multiplier: pad the estimate so a task that runs longer than projected does not blow the
// reservation. The contract DEFAULTS to 1.0 (no padding) because Marcel has NOT set a real multiplier —
// it is a documented owner knob (env YURI_COST_ADMISSION_OVEREST), not a guessed magic number.
export const DEFAULT_OVER_ESTIMATE_MULTIPLIER = 1.0;

// Per-reasoning-depth output/reasoning token projections for cost-to-completion. These are deliberately
// generous CEILINGS (admission is about worst-case fit, not average) and are overridable per call.
const DEFAULT_OUTPUT_TOKENS_BY_DEPTH = Object.freeze({
  off: 1024, low: 2048, medium: 4096, high: 16384, xhigh: 65536,
});
// Reasoning tokens are billed separately on reasoning models; project them as a fraction of output ceiling.
const DEFAULT_REASONING_FRACTION = 0.5;
// chars/4 is the same crude estimator token-ledger uses (estimateTokensFromText) — parity, not a new guess.
const CHARS_PER_TOKEN = 4;

export function resolvePaths(overrides = {}) {
  const reserveDir = overrides.reserveDir
    || process.env.YURI_COST_RESERVE_DIR
    || DEFAULT_RESERVE_DIR;
  const armFlag = overrides.armFlag
    || process.env.YURI_COST_ADMISSION_FLAG
    || DEFAULT_ARM_FLAG;
  return {
    reserveDir: path.resolve(reserveDir),
    armFlag: path.resolve(armFlag),
  };
}

// ── ARM STATE (dual-arm + a real cap) ───────────────────────────────────────────────────────────
// enforced === true ONLY when env flag AND flag file AND a finite positive cap are all present.
// A missing cap → enforced:false (fail-OPEN: a budget gate with no budget cannot meaningfully block).
export function readArmState(overrides = {}) {
  const { armFlag } = resolvePaths(overrides);
  const envArmed = process.env.YURI_COST_ADMISSION_ENFORCE === '1';
  const flagArmed = fileExists(armFlag);
  const capUsd = resolveCapUsd(armFlag, overrides);
  const hasCap = Number.isFinite(capUsd) && capUsd > 0;
  return {
    envArmed,
    flagArmed,
    capUsd: hasCap ? capUsd : null,
    windowLabel: resolveWindowLabel(overrides),
    enforced: envArmed && flagArmed && hasCap,
    // surfaced so callers can explain WHY it is inert
    inertReason: !(envArmed && flagArmed)
      ? 'disarmed (need env YURI_COST_ADMISSION_ENFORCE=1 + flag file)'
      : (!hasCap ? 'no cap set (owner has not provided a budget value)' : null),
  };
}

function resolveCapUsd(armFlag, overrides = {}) {
  if (overrides.capUsd !== undefined) return Number(overrides.capUsd);
  const envCap = Number(process.env.YURI_COST_ADMISSION_CAP_USD);
  if (Number.isFinite(envCap) && envCap > 0) return envCap;
  // Optional: the flag file body MAY carry JSON { capUsd, window } the owner sets when arming.
  try {
    const body = fs.readFileSync(armFlag, 'utf8').trim();
    if (body) {
      const parsed = JSON.parse(body);
      const n = Number(parsed.capUsd ?? parsed.cap_usd);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /* no JSON body / unreadable → no cap */ }
  return NaN;
}

function resolveWindowLabel(overrides = {}) {
  if (overrides.windowLabel) return String(overrides.windowLabel);
  const env = process.env.YURI_COST_ADMISSION_WINDOW;
  if (env) return String(env);
  // Default window = the current UTC day (matches token-ledger's daily rollup grain).
  return new Date().toISOString().slice(0, 10);
}

// ── COST-TO-COMPLETION ESTIMATE ──────────────────────────────────────────────────────────────────
// Project the FULL cost of a task: prompt input (re-sent each step in a tool loop), plus output +
// reasoning ceilings per step, over `steps` steps, priced through token-ledger's exported math.
export function estimateTaskCost({
  model,
  promptChars = 0,
  inputTokens,
  steps = 1,
  reasoning = 'medium',
  outputTokensPerStep,
  reasoningTokensPerStep,
  overEstimateMultiplier,
  policy = getPricingPolicy(),
} = {}) {
  const nSteps = Math.max(1, Math.floor(Number(steps) || 1));
  const mult = resolveMultiplier(overEstimateMultiplier);

  const perStepInput = Number.isFinite(Number(inputTokens)) && Number(inputTokens) > 0
    ? Math.ceil(Number(inputTokens))
    : Math.max(1, Math.ceil(Number(promptChars || 0) / CHARS_PER_TOKEN));

  const outPerStep = Number.isFinite(Number(outputTokensPerStep)) && Number(outputTokensPerStep) >= 0
    ? Math.ceil(Number(outputTokensPerStep))
    : (DEFAULT_OUTPUT_TOKENS_BY_DEPTH[String(reasoning)] ?? DEFAULT_OUTPUT_TOKENS_BY_DEPTH.medium);

  const reasonPerStep = Number.isFinite(Number(reasoningTokensPerStep)) && Number(reasoningTokensPerStep) >= 0
    ? Math.ceil(Number(reasoningTokensPerStep))
    : Math.ceil(outPerStep * DEFAULT_REASONING_FRACTION);

  // Worst-case shape: each step re-sends the (growing, but ceiling-bounded by per-step) input + full output.
  const usage = {
    input_tokens: perStepInput * nSteps,
    output_tokens: outPerStep * nSteps,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: reasonPerStep * nSteps,
    response_model: model || 'default',
    request_model: model || 'default',
  };

  const rawCostUsd = calculateCostUsd(usage, policy);
  const rawEffectiveTokens = calculateEffectiveTokens(usage, policy);
  return {
    model: model || 'default',
    steps: nSteps,
    overEstimateMultiplier: mult,
    perStep: { input_tokens: perStepInput, output_tokens: outPerStep, reasoning_tokens: reasonPerStep },
    usage,
    costUsd: round6(rawCostUsd * mult),
    effectiveTokens: Math.ceil(rawEffectiveTokens * mult),
    // a free lane (price table all-zero, e.g. mimo flat-plan / local ollama) costs $0 — recorded so the
    // caller can apply a free-lane exemption (an OWNER decision: exempt free lanes from the cap or not).
    free: rawCostUsd === 0,
  };
}

function resolveMultiplier(override) {
  if (override !== undefined && Number.isFinite(Number(override)) && Number(override) > 0) return Number(override);
  const env = Number(process.env.YURI_COST_ADMISSION_OVEREST);
  if (Number.isFinite(env) && env > 0) return env;
  return DEFAULT_OVER_ESTIMATE_MULTIPLIER;
}

// ── ACTUALS-TO-DATE (FAIL CONSERVATIVE) ────────────────────────────────────────────────────────
// Sum the already-spent USD for the active window from the token-ledger daily rollup. This MUST fail
// CONSERVATIVE: if the ledger is unreadable (better-sqlite3 absent) OR the rollup is TRUNCATED at the
// 100-row LIMIT (getRollups caps at 100), we CANNOT prove the true spend is low — so we return
// reliable:false with a +Infinity actuals sentinel. An armed admit() treats unreliable actuals as
// "assume the budget is already blown" → REJECT, never actuals=0 (which would silently admit everything).
export function actualsToDate(overrides = {}) {
  const windowLabel = resolveWindowLabel(overrides);
  // getRollups touches better-sqlite3, which may be absent in a worktree and is async-only to import in
  // ESM. The SYNC actualsToDate path therefore needs a bound getRollups: either an explicit override, or
  // an injected stub (tests / pre-bound by actualsToDateAsync). With nothing bound it CANNOT prove spend
  // is low → fail conservative (NOT actuals=0). Armed callers should use actualsToDateAsync, which binds
  // the real ledger before delegating here.
  const getRollups = overrides.getRollups
    || (globalThis.__COST_RESERVATION_LEDGER_STUB && globalThis.__COST_RESERVATION_LEDGER_STUB.getRollups);
  if (typeof getRollups !== 'function') {
    return conservativeActuals('rollup_not_bound_use_async', windowLabel);
  }
  let rows;
  try {
    rows = getRollups({ ...overrides, limit: ROLLUP_LIMIT });
  } catch (e) {
    // BETTER_SQLITE3_UNAVAILABLE or any DB error → cannot read spend → conservative.
    return conservativeActuals(e?.code === 'BETTER_SQLITE3_UNAVAILABLE' ? 'better_sqlite3_unavailable' : 'rollup_read_failed', windowLabel, e);
  }
  if (!Array.isArray(rows)) {
    return conservativeActuals('rollup_not_array', windowLabel);
  }
  // TRUNCATION CHECK: if the rollup returned exactly the LIMIT, there may be more rows we did not see —
  // the true spend is UNDERCOUNTED → unreliable → conservative.
  if (rows.length >= ROLLUP_LIMIT) {
    return conservativeActuals('rollup_truncated_at_limit', windowLabel, null, { observedRows: rows.length });
  }
  let spentUsd = 0;
  let spentEffective = 0;
  let matchedRows = 0;
  for (const r of rows) {
    if (windowLabel && String(r.day || '') !== windowLabel) continue;
    matchedRows += 1;
    spentUsd += Number(r.cost_usd || 0);
    spentEffective += Number(r.effective_tokens || 0);
  }
  return {
    reliable: true,
    windowLabel,
    spentUsd: round6(spentUsd),
    spentEffectiveTokens: Math.ceil(spentEffective),
    matchedRows,
    reason: null,
  };
}

const ROLLUP_LIMIT = 100; // mirrors token-ledger getRollups default LIMIT — the truncation boundary.

function conservativeActuals(reason, windowLabel, err, extra = {}) {
  return {
    reliable: false,
    windowLabel,
    spentUsd: Number.POSITIVE_INFINITY,   // forces rejection under an armed cap — never silently 0
    spentEffectiveTokens: Number.POSITIVE_INFINITY,
    matchedRows: 0,
    reason,
    error: err ? String(err.message || err) : undefined,
    ...extra,
  };
}

// Async actuals path that genuinely reads the ledger rollup (for the CLI / armed callers that can await).
export async function actualsToDateAsync(overrides = {}) {
  const windowLabel = resolveWindowLabel(overrides);
  try {
    const mod = await import('./token-ledger.mjs');
    globalThis.__COST_RESERVATION_LEDGER_STUB = { getRollups: mod.getRollups };
    const res = actualsToDate(overrides);
    delete globalThis.__COST_RESERVATION_LEDGER_STUB;
    return res;
  } catch (e) {
    return conservativeActuals('token_ledger_import_failed', windowLabel, e);
  }
}

// ── ACTIVE RESERVATIONS (on-disk, window-scoped) ─────────────────────────────────────────────────
export function sumActiveReservations(overrides = {}) {
  const { reserveDir } = resolvePaths(overrides);
  const windowLabel = resolveWindowLabel(overrides);
  let files = [];
  try {
    files = fs.readdirSync(reserveDir).filter((f) => f.endsWith('.json'));
  } catch { return { reservedUsd: 0, reservedEffectiveTokens: 0, count: 0 }; }
  let reservedUsd = 0;
  let reservedEffectiveTokens = 0;
  let count = 0;
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(reserveDir, f), 'utf8'));
      if (r.released) continue;
      if (windowLabel && r.windowLabel && r.windowLabel !== windowLabel) continue;
      reservedUsd += Number(r.costUsd || 0);
      reservedEffectiveTokens += Number(r.effectiveTokens || 0);
      count += 1;
    } catch { /* skip corrupt reservation file */ }
  }
  return { reservedUsd: round6(reservedUsd), reservedEffectiveTokens: Math.ceil(reservedEffectiveTokens), count };
}

// ── ADMIT (all-or-nothing) ───────────────────────────────────────────────────────────────────────
// Returns { admitted, enforced, reservationId|null, decision, ... }. DISARMED → admitted:true,enforced:false
// (advises only). ARMED → admits ONLY if actuals + activeReservations + thisEstimate <= cap, writing a
// reservation file on admit (no-partial: either the whole estimate fits and is reserved, or it is rejected).
export function admit(taskSpec = {}, overrides = {}) {
  const arm = readArmState(overrides);
  const estimate = estimateTaskCost({ ...taskSpec, policy: taskSpec.policy });

  if (!arm.enforced) {
    return {
      admitted: true,
      enforced: false,
      reservationId: null,
      decision: 'advisory_pass',
      reason: arm.inertReason,
      estimate,
      arm,
    };
  }

  // Free-lane exemption is an OWNER decision; default = exempt free ($0) lanes from the cap (they cannot
  // consume USD budget). Set YURI_COST_ADMISSION_EXEMPT_FREE=0 to count them (e.g. to govern token budget).
  const exemptFree = process.env.YURI_COST_ADMISSION_EXEMPT_FREE !== '0';
  if (estimate.free && exemptFree) {
    return { admitted: true, enforced: true, reservationId: null, decision: 'free_lane_exempt', estimate, arm };
  }

  // B1-ext-1 (race-class kill): the armed read→check→write below is a TOCTOU — two concurrent
  // admits can both read the same active-reservation sum, both see "fits", and both writeReservation
  // → double-spend past the cap. CAPABILITY-FIRST: reuse nano-lease to serialize the critical section,
  // scoped to the reservations dir so isolated (test) pools never cross-serialize with the live one.
  // admit() is sync with one dispatch-path caller, so we do NOT block: on lease contention we REJECT
  // CONSERVATIVE (same spirit as the unreliable-actuals reject) — rejecting a rare concurrent admit
  // beats risking a double-spend. (Cost admission ships DISARMED/watcher; this hardens the armed path.)
  const leaseId = `cost-pool-admit:${resolvePaths(overrides).reserveDir}`;
  const nanoId = `cost-admit-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const lease = acquireLease(leaseId, nanoId, { ttlMs: 10_000 });
  if (!lease || !lease.ok) {
    return {
      admitted: false,
      enforced: true,
      reservationId: null,
      decision: 'reject_conservative_lease_contention',
      reason: 'another admission holds the budget lease — reject rather than risk a double-spend (TOCTOU guard)',
      estimate,
      arm,
    };
  }
  try {
    const actuals = overrides.actuals || actualsToDate(overrides);
    const active = sumActiveReservations(overrides);
    const projectedTotal = actuals.spentUsd + active.reservedUsd + estimate.costUsd;
    const fits = Number.isFinite(projectedTotal) && projectedTotal <= arm.capUsd;

    const accounting = {
      capUsd: arm.capUsd,
      actualsUsd: actuals.spentUsd,
      actualsReliable: actuals.reliable,
      actualsReason: actuals.reason,
      activeReservedUsd: active.reservedUsd,
      estimateUsd: estimate.costUsd,
      projectedTotalUsd: Number.isFinite(projectedTotal) ? round6(projectedTotal) : 'Infinity',
      headroomUsd: Number.isFinite(projectedTotal) ? round6(arm.capUsd - projectedTotal) : 'Infinity',
    };

    if (!fits) {
      return {
        admitted: false,
        enforced: true,
        reservationId: null,
        decision: actuals.reliable ? 'reject_over_budget' : 'reject_conservative_unreliable_actuals',
        reason: actuals.reliable
          ? 'projected actuals+reservations+estimate exceeds cap'
          : `actuals unreliable (${actuals.reason}) — fail conservative, reject`,
        estimate,
        accounting,
        arm,
      };
    }

    const reservation = writeReservation(estimate, arm, overrides, taskSpec);
    return {
      admitted: true,
      enforced: true,
      reservationId: reservation.id,
      decision: 'admit_reserved',
      estimate,
      accounting,
      reservation,
      arm,
    };
  } finally {
    releaseLease(leaseId, nanoId);
  }
}

function writeReservation(estimate, arm, overrides, taskSpec) {
  const { reserveDir } = resolvePaths(overrides);
  fs.mkdirSync(reserveDir, { recursive: true });
  const id = `res-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const record = {
    id,
    windowLabel: arm.windowLabel,
    lane: taskSpec.lane || null,
    model: estimate.model,
    costUsd: estimate.costUsd,
    effectiveTokens: estimate.effectiveTokens,
    steps: estimate.steps,
    reserved_at: new Date().toISOString(),
    released: false,
  };
  const file = path.join(reserveDir, `${id}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file); // atomic publish
  return record;
}

// ── RELEASE ────────────────────────────────────────────────────────────────────────────────────
// Free a held reservation (task finished or failed). Idempotent. Marks released:true and (by default)
// removes the file so it stops counting against the budget. Safe to call with an unknown id.
export function release(reservationId, overrides = {}) {
  if (!reservationId) return { released: false, reason: 'no_reservation_id' };
  const { reserveDir } = resolvePaths(overrides);
  const file = path.join(reserveDir, `${reservationId}.json`);
  try {
    if (!fileExists(file)) return { released: false, reason: 'not_found', reservationId };
    fs.rmSync(file, { force: true });
    return { released: true, reservationId };
  } catch (e) {
    return { released: false, reason: 'rm_failed', error: String(e.message || e), reservationId };
  }
}

// ── R3: RELEASE-AND-REACQUIRE WITH ROLLBACK (FORWARD-SAFE PRIMITIVE — NO LIVE CALLER) ─────────────
// PHANTOM/FORWARD-WIRING: this exists for a FUTURE multi-step local-tools lane that must release its
// reservation between steps (so a long task does not deadlock the pool by holding the whole budget) and
// then reacquire for the next step. NO live caller invokes this today — the current dispatch seams
// (llm-lane / slm-worker) reserve once per task and release at the end. Shipped as a tested primitive,
// NOT sold as a live fix. If reacquire FAILS (budget no longer fits), it ROLLS BACK by re-reserving the
// ORIGINAL estimate so the caller is never left holding nothing, and signals reacquired:false.
export function reacquireWithRollback(reservationId, nextTaskSpec = {}, overrides = {}) {
  const { reserveDir } = resolvePaths(overrides);
  const file = path.join(reserveDir, `${reservationId}.json`);
  let original = null;
  try {
    if (fileExists(file)) original = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { original = null; }

  // Step 1: release the current hold so its budget is available to the reacquire attempt.
  release(reservationId, overrides);

  // Step 2: attempt to admit the next step.
  const next = admit(nextTaskSpec, overrides);
  if (next.admitted) {
    return { reacquired: true, released: reservationId, reservation: next.reservation || null, decision: next.decision, accounting: next.accounting };
  }

  // Step 3: ROLLBACK — re-reserve the ORIGINAL hold so the caller does not lose its place. Only possible
  // if we captured the original record AND it still fits; if even the rollback cannot fit, report it
  // truthfully (the caller must abort the task, not silently proceed unfunded).
  if (original && !original.released) {
    const rollbackArm = readArmState(overrides);
    const rb = restoreReservation(original, reserveDir);
    return {
      reacquired: false,
      released: reservationId,
      rolledBack: rb.ok,
      rollbackReservationId: rb.ok ? rb.id : null,
      reason: next.reason || 'reacquire_rejected',
      decision: next.decision,
      enforced: rollbackArm.enforced,
    };
  }
  return { reacquired: false, released: reservationId, rolledBack: false, reason: next.reason || 'reacquire_rejected_no_rollback_record', decision: next.decision };
}

function restoreReservation(original, reserveDir) {
  try {
    fs.mkdirSync(reserveDir, { recursive: true });
    const id = `res-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const record = { ...original, id, released: false, reserved_at: new Date().toISOString(), rolledBackFrom: original.id };
    const file = path.join(reserveDir, `${id}.json`);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
function fileExists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function round6(n) { return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : n; }

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = parseOpts(rest);
  const overrides = {};
  if (opt['reserve-dir']) overrides.reserveDir = opt['reserve-dir'];

  if (cmd === 'status') {
    const arm = readArmState(overrides);
    const active = sumActiveReservations(overrides);
    console.log(JSON.stringify({ arm, active, paths: resolvePaths(overrides) }, null, 2));
    return;
  }
  if (cmd === 'estimate') {
    console.log(JSON.stringify(estimateTaskCost(cliTaskSpec(opt)), null, 2));
    return;
  }
  if (cmd === 'actuals') {
    console.log(JSON.stringify(await actualsToDateAsync(overrides), null, 2));
    return;
  }
  if (cmd === 'admit') {
    // The CLI admit uses the async actuals path so an armed decision reflects the real ledger.
    const arm = readArmState(overrides);
    const actuals = arm.enforced ? await actualsToDateAsync(overrides) : undefined;
    const res = admit(cliTaskSpec(opt), { ...overrides, actuals });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.admitted ? 0 : 1);
  }
  if (cmd === 'arm') {
    const { armFlag } = resolvePaths(overrides);
    fs.mkdirSync(path.dirname(armFlag), { recursive: true });
    const body = opt.cap ? JSON.stringify({ capUsd: Number(opt.cap), window: opt.window || null }) : new Date().toISOString();
    fs.writeFileSync(armFlag, body);
    console.log(`ARM flag written: ${armFlag}\nNOTE: drain ALSO needs env YURI_COST_ADMISSION_ENFORCE=1 AND a cap (env YURI_COST_ADMISSION_CAP_USD or --cap when arming).`);
    return;
  }
  if (cmd === 'disarm') {
    const { armFlag } = resolvePaths(overrides);
    try { fs.rmSync(armFlag, { force: true }); } catch { /* */ }
    console.log(`DISARMED (flag removed): ${armFlag}`);
    return;
  }
  help();
  process.exit(2);
}

function cliTaskSpec(opt) {
  return {
    lane: opt.lane,
    model: opt.model,
    promptChars: opt['prompt-chars'] !== undefined ? Number(opt['prompt-chars']) : undefined,
    inputTokens: opt['input-tokens'] !== undefined ? Number(opt['input-tokens']) : undefined,
    steps: opt.steps !== undefined ? Number(opt.steps) : undefined,
    reasoning: opt.reasoning,
    overEstimateMultiplier: opt.overest !== undefined ? Number(opt.overest) : undefined,
  };
}

function parseOpts(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k.startsWith('--')) {
      const key = k.slice(2);
      const v = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true;
      o[key] = v;
    }
  }
  return o;
}

function help() {
  console.log('Usage: cost-reservation-pool.mjs <status|estimate|actuals|admit|arm|disarm> [--lane --model --prompt-chars --input-tokens --steps --reasoning --overest --cap --window --reserve-dir]');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { process.stderr.write(`COST_RESERVATION_FAIL ${String(e?.message || e)}\n`); process.exit(1); });
}
