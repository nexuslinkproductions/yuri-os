#!/usr/bin/env node
// @capability: run-swarm-orchestrator
// @serves: run swarm | orchestrate fleet | governed swarm loop | runSwarm | decompose dispatch aggregate converge finalize | end-to-end multi-agent run | opus-fleet runner | the missing orchestrator binary
// @does: THE missing orchestrator binary — composes the governed loop over the GLM substrate into one runnable entry point, closing the audit's "documented loop, no runtime" gap. Per round: buildObligationLedger → glmFleet dispatch → aggregatePoolOutputs → runAdversarialPass (glm-max "what's missing") → converge (3-layer gate + damping) → finalizeGuard → re-dispatch only the gap leaves (≤rounds). Writes a run manifest. NATIVE Claude Agents are orchestrated separately by the Opus session (Agent tool); this is the GLM-substrate governed runner that pairs with it.
// @use: node runSwarm.mjs --leaves-file leaves.json [--rounds 3] [--concurrency 3]  · programmatic: runSwarm({leaves:[{id,lane,prompt,reasoning}]}, {rounds,concurrency,armed,deps}). Armed end-to-end needs YURI_SWARM_CONVERGENCE + YURI_GLM_FLEET (env or flag). deps injectable for hermetic tests.
// @exports: runSwarm, newRunId, newTraceId
//
// Authority: ADVISORY orchestration. runSwarm produces a converged result + the finalizeGuard verdict + a
// manifest; it NEVER commits/pushes or touches protected surfaces — finalize (git, outward) stays with the
// owner/Opus lane. DISARMED-safe: glmFleet dry-runs unless armed; converge passes through unless armed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { glmFleet, aggregatePoolOutputs, buildRunDir, defaultTimeoutMsForLane } from './glm-fleet.mjs';
import {
  buildObligationLedger, checkObligationFloor, runAdversarialPass, defaultAdversarialRunner,
  converge, finalizeGuard, isArmed as convergenceArmed,
} from './swarm-convergence.mjs';

// Aggressive MLP router integration (advisory only)
let _routerMod = null;
async function getRouter() {
  if (_routerMod !== null) return _routerMod;
  try {
    _routerMod = await import('./fleet-router-mlp.mjs');
  } catch {
    _routerMod = false;
  }
  return _routerMod || null;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

// Default per-round wall-clock watchdog. A round awaits Promise.all over the fleet dispatch, so without a
// watchdog the slowest lane (30-60min tier ceilings) gates the whole round — the owner's reported hang shape.
// On expiry we do NOT kill children (they self-limit + keep writing packets to results/); we proceed to
// aggregation with whatever landed and re-scan the results dir on subsequent rounds to ingest stragglers.
export const DEFAULT_ROUND_WALL_CLOCK_MS = 900000; // 15min

export function newRunId() { return `swarm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }
export function newTraceId() { return `tr-${crypto.randomBytes(6).toString('hex')}`; }

// ── status.json lifecycle (live-run visibility) ──────────────────────────────────────────────────────
// The manifest is written ONCE after the whole loop exits, so a live run is structurally invisible. status.json
// is the uniform in-flight run artifact: written at start, updated at each round boundary, and given a terminal
// state in a finally block so it lands even on throw. Atomic (write tmp + rename) and fail-open — a status write
// error must NEVER break the run.
function statusPath(runId) { return path.join(REPO_ROOT, '.claude', 'jobs', String(runId), 'status.json'); }

/** Atomic + fail-open status writer. Merges `patch` into the prior status, stamps updatedAt, tmp-writes + renames.
 *  Any error is swallowed (logged via `log` if provided) — status is observability, never a run-blocker. */
function writeStatus(runId, patch, prior = {}, log) {
  try {
    const dir = path.join(REPO_ROOT, '.claude', 'jobs', String(runId));
    fs.mkdirSync(dir, { recursive: true });
    const next = { ...prior, ...patch, runId, updatedAt: new Date().toISOString() };
    const target = statusPath(runId);
    const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    fs.renameSync(tmp, target); // atomic replace on POSIX
    return next;
  } catch (e) {
    if (typeof log === 'function') log(`status write failed (fail-open): ${String(e?.message || e)}`);
    return { ...prior, ...patch, runId }; // return the intended state so in-memory tracking stays consistent
  }
}

/**
 * Run the governed swarm loop over the GLM substrate.
 * @param {{leaves:Array<{id:string,lane?:string,prompt:string,reasoning?:string,timeoutMs?:number}>}} decomposition
 * @param {{rounds?:number,concurrency?:number,armed?:boolean,signals?:Array,adversarialRunner?:Function,runId?:string,traceId?:string,deps?:object,quiet?:boolean,budgetCap?:number,roundWallClockMs?:number}} opts
 *   budgetCap — cumulative lane-call budget; when reached, the converge/damping force-stop fires (default Infinity → unbounded, unchanged behavior).
 *   roundWallClockMs — per-round wall-clock watchdog (default 900000 = 15min). On expiry the round proceeds to
 *     aggregation with whatever packets landed; children are NOT killed (they keep writing; late packets ingest
 *     on the next round's re-scan + a pre-final re-scan).
 * @returns {Promise<{runId,traceId,converged,finalizeOk,finalizeReason,rounds,poolOutputs,verdict,manifestPath,runDir,status,statusPath}>}
 */
export async function runSwarm(decomposition = {}, opts = {}) {
  const leaves = Array.isArray(decomposition.leaves) ? decomposition.leaves : [];
  if (!leaves.length) throw new Error('runSwarm: decomposition.leaves required (non-empty array of {id, prompt})');
  for (const l of leaves) {
    if (!l || typeof l.id !== 'string' || !l.id) throw new Error('runSwarm: every leaf needs a string id');
    if (typeof l.prompt !== 'string' || !l.prompt) throw new Error(`runSwarm: leaf ${l.id} needs a prompt`);
  }

  const runId = opts.runId || newRunId();
  const traceId = opts.traceId || newTraceId();
  const maxRounds = Math.max(1, Number(opts.rounds || 3));
  const concurrency = Math.max(1, Number(opts.concurrency || 3));
  // Arm resolution mirrors converge() exactly: an explicit opts.armed (true OR false) wins; only undefined
  // falls through to the global flag. (red-team H1 + hermetic s3: an explicit armed:false must disarm even
  // when the global swarm-convergence flag is on.)
  const armedNow = (opts.armed !== undefined) ? !!opts.armed : convergenceArmed();
  const runDir = buildRunDir(runId);
  // Budget force-stop: when a cumulative lane-call budget is set, thread it into the converge/damping opts so
  // checkDamping's budget-exhausted branch (structurally unreachable at the default Infinity) becomes reachable.
  // Unset → Infinity → behavior unchanged. Number-coerce + guard against a non-positive / NaN cap.
  const budgetCapRaw = Number(opts.budgetCap);
  const budgetCap = Number.isFinite(budgetCapRaw) && budgetCapRaw > 0 ? budgetCapRaw : Infinity;
  // Per-round wall-clock watchdog window (ms). <=0 / NaN → the default; the watchdog can be disabled with a very
  // large value if a caller genuinely wants to wait out the tier ceiling.
  const rwcRaw = Number(opts.roundWallClockMs);
  const roundWallClockMs = Number.isFinite(rwcRaw) && rwcRaw > 0 ? rwcRaw : DEFAULT_ROUND_WALL_CLOCK_MS;
  // converge() reads its damping opts from the opts object it is handed; give it a merged view that always
  // carries budgetCap without mutating the caller's opts (red-team: no side-effect on the passed object).
  const convergeOpts = { ...opts, budgetCap };

  // === Aggressive router wiring ===
  // Consult MLP router for every leaf. Attach suggestion + confidence.
  // Use router to bias soft params (timeoutMs) for heavy reasoning leaves when confidence is decent.
  // Router is always advisory; hard governance / flags still control arming and dispatch.
  // D-10 fix: an upstream caller (company.mjs::planCompany) already runs the router with a REAL 4-way
  // candidate set (glm/native/ollama/cline) and attaches routerSuggestion/routerRanked to each leaf before
  // handing it to runSwarm. Re-deriving here with a single-item `[{substrate:'glm',...}]` candidate array
  // was an argmax-over-1 (decorative) that also clobbered the real upstream suggestion. Only re-derive for
  // leaves that arrive WITHOUT one (e.g. a standalone runSwarm.mjs CLI call that never went through
  // planCompany) — leaves that already carry a routerSuggestion keep the genuinely multi-candidate one.
  const router = await getRouter();
  const routerSuggestions = [];
  if (router && typeof router.extractFeatures === 'function' && typeof router.predictRoute === 'function') {
    for (const leaf of leaves) {
      if (leaf.routerSuggestion) {
        // Already routed upstream against a real candidate set — just surface it in this run's summary.
        routerSuggestions.push({ id: leaf.id, best: leaf.routerSuggestion, confidence: leaf.routerConfidence ?? null });
      } else {
        const ctx = {
          complexity: (leaf.prompt || '').length > 800 ? 0.8 : 0.55,
          quotaPressure: 0.35,
          evidenceDecidability: 0.85,
          roleHeavy: /adjudicator|architect|deliberator|helmsman/.test(String(leaf.role || leaf.id)),
        };
        const feats = router.extractFeatures(leaf, ctx);
        const candidates = [
          { id: leaf.id, substrate: 'glm', lane: leaf.lane || 'glm', role: leaf.role || leaf.id },
          { id: `${leaf.id}-native`, substrate: 'native', lane: 'sonnet', role: leaf.role || leaf.id },
          { id: `${leaf.id}-ollama`, substrate: 'ollama', lane: 'ollama-flash', role: leaf.role || leaf.id },
          { id: `${leaf.id}-cline`, substrate: 'cline', lane: 'glm-5.2', role: leaf.role || leaf.id },
        ];
        const suggestion = await router.predictRoute(feats, candidates);
        leaf.routerSuggestion = suggestion.best;
        leaf.routerConfidence = suggestion.confidence;
        leaf.routerRanked = suggestion.ranked;
        routerSuggestions.push({ id: leaf.id, best: suggestion.best, confidence: suggestion.confidence });
      }

      // Bias timeout for heavy work when router is reasonably confident — use fleet tier default, never below it.
      const best = leaf.routerSuggestion;
      const confidence = leaf.routerConfidence;
      if (confidence > 0.25 && best && /max|heavy|adjudicator/.test(String(best.lane || ''))) {
        const heavyLane = best.lane || leaf.lane || 'glm-max';
        const suggestedTimeout = Math.max(leaf.timeoutMs || 0, defaultTimeoutMsForLane(heavyLane));
        if (!leaf.timeoutMs || leaf.timeoutMs < suggestedTimeout) {
          leaf.timeoutMs = suggestedTimeout;
        }
      }
    }
  }

  // P9 shadow on standalone runSwarm path (advisory — never changes dispatch).
  try {
    const { recordMlpCounterfactualShadow } = await import('./fleet-mlp-feedback.mjs');
    recordMlpCounterfactualShadow({ glmLeaves: leaves }, { quotaPressure: opts.quotaPressure ?? 0.4 });
  } catch { /* advisory */ }

  // Injectable deps (hermetic tests pass fakes; defaults are the real wired functions).
  const _glmFleet = opts.deps?.glmFleet || glmFleet;
  const _aggregate = opts.deps?.aggregatePoolOutputs || aggregatePoolOutputs;
  const _adversarialRunner = opts.adversarialRunner || opts.deps?.adversarialRunner || defaultAdversarialRunner({});

  // Stamp the trace so each GLM packet carries it (glm-fleet reads YURI_FLEET_TRACE_ID). Save the prior value
  // and ALWAYS set this run's traceId (not guarded) so a multi-call process doesn't inherit a stale id; restore
  // before returning (red-team M3).
  const _prevTraceEnv = process.env.YURI_FLEET_TRACE_ID;
  process.env.YURI_FLEET_TRACE_ID = traceId;

  const ledger = buildObligationLedger({ leaves: leaves.map((l) => ({ id: l.id, role: l.id })) });
  const startedAt = new Date().toISOString();
  const log = (m) => { if (!opts.quiet) process.stderr.write(`[runSwarm ${runId}] ${m}\n`); };

  let round = 0;
  let damping = {};
  let pending = leaves.slice();
  let poolOutputs = {};
  let lastVerdict = null;
  const roundLog = [];
  // Damping FUEL — without populating these, checkDamping's budget-exhausted + marginal-value-cutoff branches
  // are dead code and only maxRounds bounds the loop (GLM-5.2 final-gate finding). budgetUsed = lane calls
  // spent; roundYields = per-round marginal progress (newly-conforming leaves) → a stalled loop force-stops.
  let budgetUsed = 0;
  const roundYields = [];
  let prevConforming = 0;

  // status.json — write the initial RUNNING state so a live run is visible from birth (the manifest only lands
  // after the loop). Fail-open. `status` tracks the last-persisted view so round-boundary patches merge cleanly.
  const totalLeaves = leaves.length;
  let status = writeStatus(runId, {
    status: 'running', round: 0, totalLeaves,
    pending: pending.map((l) => l.id), startedAt,
  }, {}, log);

  // Re-scan the results dir into the accumulating pool (idempotent — aggregate reads the whole dir). Used to
  // ingest straggler packets that landed after a watchdog cutover, both at round start and before final converge.
  const rescanPool = () => {
    const agg = _aggregate(runDir);
    if (agg && agg.pool) poolOutputs = { ...poolOutputs, ...agg.pool };
    if (agg && agg.skipped && agg.skipped.length) log(`aggregate skipped ${agg.skipped.length} malformed file(s)`);
    return agg;
  };
  // A leaf is "already satisfied on disk" iff a conforming packet exists for it in the current pool — used to
  // avoid double-dispatching a straggler whose packet arrived during the next round's planning.
  const conformingLeafIds = () => {
    const floor = checkObligationFloor(ledger, poolOutputs);
    const bad = new Set([...(floor.missing || []), ...(floor.nonConforming || [])]);
    return new Set((ledger.leafTasks || []).map((l) => l.id).filter((id) => !bad.has(id)));
  };

  // Wrap the loop + finalize in try/finally so the TERMINAL status.json lands even on a throw (fail path) — the
  // whole point of a lifecycle artifact is that it never lies about a crashed run. `threw` distinguishes
  // done/failed; env restore also moves into finally so a throw never leaves a stale YURI_FLEET_TRACE_ID.
  let threw = null;
  try {
  while (round < maxRounds) {
    // Ingest any straggler packets that landed since the last round BEFORE deciding what to dispatch, then — on
    // re-dispatch rounds only — drop from this round's pending any gap leaf that now has a conforming packet on
    // disk (no double-dispatch of a straggler that arrived during planning — task req). Round 0 always dispatches
    // its full pending set: in production the results dir is empty at run start, so there is nothing to filter and
    // nothing to double-dispatch yet. Gating on round>0 also keeps the semantics clean (the guard exists to catch
    // a PRIOR round's late packet).
    rescanPool();
    if (round > 0) {
      const satisfied = conformingLeafIds();
      const preFilter = pending.length;
      pending = pending.filter((l) => !satisfied.has(l.id));
      if (pending.length !== preFilter) {
        log(`round ${round}: ${preFilter - pending.length} straggler leaf(s) already satisfied on disk — not re-dispatching`);
      }
      if (!pending.length) { log(`round ${round}: all pending leaves satisfied by stragglers — converging`); }
    }

    log(`round ${round}: dispatch ${pending.length} leaf(s) → ${pending.map((l) => l.id).join(', ')}`);
    status = writeStatus(runId, { status: 'running', round, pending: pending.map((l) => l.id) }, status, log);

    // 1. DISPATCH this round's pending leaves over the GLM substrate — raced against the per-round wall-clock
    // watchdog. On expiry we do NOT kill the fleet (children self-limit + keep writing packets to results/); we
    // flip status to 'running-stragglers' and fall through to aggregation with whatever landed. The detached
    // fleet promise keeps running; its late packets are ingested by the next round's rescanPool() + the pre-final
    // re-scan. A no-op dispatch (empty pending) skips the fleet call entirely.
    const tasks = pending.map((l) => ({
      lane: l.lane || 'glm', label: l.id, reasoning: l.reasoning || 'high',
      prompt: l.prompt, timeoutMs: l.timeoutMs,
    }));
    let fleet = { results: [] };
    if (tasks.length) {
      const fleetPromise = Promise.resolve(_glmFleet(tasks, { concurrency, runId, runDir, armed: opts.armed }));
      let watchdogTimer;
      const STRAGGLER = Symbol('watchdog-expired');
      const watchdog = new Promise((resolve) => { watchdogTimer = setTimeout(() => resolve(STRAGGLER), roundWallClockMs); });
      const raced = await Promise.race([fleetPromise, watchdog]);
      clearTimeout(watchdogTimer);
      if (raced === STRAGGLER) {
        log(`round ${round}: watchdog fired at ${roundWallClockMs}ms — proceeding with stragglers (children not killed)`);
        status = writeStatus(runId, { status: 'running-stragglers', round, pending: pending.map((l) => l.id) }, status, log);
        // Detach the still-running fleet: swallow its eventual result/rejection so it can't become an unhandled
        // rejection, and best-effort ingest any packets it writes after we've moved on.
        fleetPromise.then(() => rescanPool()).catch((e) => log(`detached fleet settled with error: ${String(e?.message || e).slice(0, 120)}`));
        fleet = { results: [] };
      } else {
        fleet = raced || { results: [] };
      }
    }

    // 2. AGGREGATE — merge this round's packets into the accumulating pool (rescanPool logs any skipped files).
    rescanPool();

    // Feed the damping governor: per-round marginal yield (newly-conforming leaves) + cumulative lane spend,
    // so checkDamping can force-stop a stalled (re-dispatching-but-not-progressing) or over-budget loop.
    const floorNow = checkObligationFloor(ledger, poolOutputs);
    const currConforming = (ledger.leafTasks || []).length - floorNow.missing.length - floorNow.nonConforming.length;
    roundYields.push(currConforming - prevConforming);
    prevConforming = currConforming;
    budgetUsed += pending.length + (armedNow ? 1 : 0);
    damping = { ...damping, budgetUsed, roundYields: roundYields.slice() };

    // 3. ADVERSARIAL — glm-max "what's missing?" pass (fail-soft). ONLY when armed: a disarmed converge()
    // ignores adversarialResult, so dispatching glm-max while disarmed is pure wasted spend (red-team H1).
    let adversarialResult = { ok: true, rejections: [] };
    if (armedNow) {
      try {
        adversarialResult = await runAdversarialPass({ poolOutputs, lanes: leaves.map((l) => l.id), runner: _adversarialRunner });
      } catch (e) { log(`adversarial fail-soft: ${String(e?.message || e).slice(0, 120)}`); }
    }

    // 4. CONVERGE — 3-layer gate + damping. convergeOpts carries budgetCap so the damping budget force-stop is
    // reachable (default Infinity → unchanged).
    const verdict = converge({ ledger, poolOutputs, signals: opts.signals || [], adversarialResult, damping, round, opts: convergeOpts });
    damping = verdict.damping || damping;
    lastVerdict = verdict;
    roundLog.push({
      round, dispatched: pending.map((l) => l.id),
      fleet: (fleet?.results || []).map((r) => ({ label: r.label, ok: r.ok })),
      converged: verdict.converged, reason: verdict.reason, blocking: (verdict.blocking || []).length,
      nextRoundWork: (verdict.nextRoundWork || []).length,
    });
    log(`round ${round}: ${verdict.reason} (blocking=${(verdict.blocking || []).length})`);
    if (verdict.converged) break;

    // 5. RE-DISPATCH the gap leaves. Gaps come from BOTH the obligation-floor failures (missing / non-conforming
    // — e.g. a hard lane failure that never enters nextRoundWork; red-team C1) AND the adversarial rejections.
    // An adversarial gap with a null leafId is cross-cutting → re-dispatch ALL leaves rather than dead-stop
    // (red-team H3).
    const blocking = verdict.blocking || [];
    const adv = verdict.nextRoundWork || [];
    const gapIds = new Set([
      ...blocking.filter((b) => b.layer === 'obligation-floor' && b.leafId).map((b) => b.leafId),
      ...adv.map((w) => w.leafId).filter(Boolean),
    ]);
    const hasCrossCutting = adv.some((w) => !w.leafId);
    pending = hasCrossCutting ? leaves.slice() : leaves.filter((l) => gapIds.has(l.id));
    if (!pending.length) { log(`blocked with no actionable re-dispatch (${blocking.length} blocker[s]) — stopping`); break; }
    round += 1;
  }

  // Final straggler ingestion: re-scan the results dir one last time so any packet that landed after the last
  // watchdog cutover is folded into the pool BEFORE the finalize verdict is computed (task req).
  rescanPool();
  // Recompute the verdict against the final (straggler-inclusive) pool when armed, so a late-arriving packet that
  // satisfies the last gap can flip a blocked run to converged. Disarmed/no-prior-verdict → keep lastVerdict.
  if (armedNow && lastVerdict && !lastVerdict.converged) {
    const finalFloor = checkObligationFloor(ledger, poolOutputs);
    if (finalFloor.ok) {
      const finalVerdict = converge({ ledger, poolOutputs, signals: opts.signals || [], adversarialResult: { ok: true, rejections: [] }, damping, round, opts: convergeOpts });
      if (finalVerdict.converged) { lastVerdict = finalVerdict; log('final re-scan: straggler packets satisfied the obligation floor — converged'); }
    }
  }

  const guard = finalizeGuard(lastVerdict || { converged: false });
  const manifest = {
    runId, traceId, startedAt, finishedAt: new Date().toISOString(),
    rounds: Math.min(round + 1, maxRounds), leaves: leaves.map((l) => l.id),
    converged: !!(lastVerdict && lastVerdict.converged), forced: !!(lastVerdict && lastVerdict.forced),
    finalizeOk: guard.ok, finalizeReason: guard.reason,
    convergenceArmed: convergenceArmed(), budgetUsed, roundYields, roundLog, runDir, verdict: lastVerdict,
    routerSuggestions,   // MLP router suggestions attached to leaves (advisory)
  };
  try {
    fs.mkdirSync(path.join(REPO_ROOT, '.claude', 'jobs', runId), { recursive: true });
    fs.writeFileSync(path.join(REPO_ROOT, '.claude', 'jobs', runId, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (e) { log(`manifest write failed: ${String(e?.message || e)}`); }

  return {
    runId, traceId, converged: manifest.converged, finalizeOk: guard.ok, finalizeReason: guard.reason,
    rounds: manifest.rounds, poolOutputs, verdict: lastVerdict,
    manifestPath: path.join(REPO_ROOT, '.claude', 'jobs', runId, 'manifest.json'), runDir,
    status, statusPath: statusPath(runId),
  };
  } catch (e) {
    threw = e;
    throw e;
  } finally {
    // TERMINAL status — lands even on throw. converged reflects the last verdict; a throw is a hard 'failed'.
    const terminal = threw
      ? { status: 'failed', converged: !!(lastVerdict && lastVerdict.converged), error: String(threw?.message || threw).slice(0, 300), endedAt: new Date().toISOString() }
      : { status: 'done', converged: !!(lastVerdict && lastVerdict.converged), endedAt: new Date().toISOString() };
    status = writeStatus(runId, terminal, status, log);
    // Restore the trace env in ALL exit paths (normal return, break, throw) so a multi-call process never leaks
    // this run's traceId into the next.
    if (_prevTraceEnv === undefined) delete process.env.YURI_FLEET_TRACE_ID;
    else process.env.YURI_FLEET_TRACE_ID = _prevTraceEnv;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  let leaves = [];
  try {
    if (val('--leaves-file')) leaves = JSON.parse(fs.readFileSync(val('--leaves-file'), 'utf8'));
    else if (val('--leaves')) leaves = JSON.parse(val('--leaves'));
  } catch (e) { process.stderr.write(`runSwarm: bad --leaves input: ${String(e?.message || e)}\n`); process.exit(2); }
  if (!Array.isArray(leaves) || !leaves.length) {
    process.stderr.write('runSwarm: provide --leaves-file <path> or --leaves \'[{"id","prompt"}]\'\n');
    process.exit(2);
  }
  runSwarm({ leaves }, { rounds: Number(val('--rounds') || 3), concurrency: Number(val('--concurrency') || 3) })
    .then((r) => {
      process.stdout.write(`${JSON.stringify({
        runId: r.runId, traceId: r.traceId, converged: r.converged, finalizeOk: r.finalizeOk,
        finalizeReason: r.finalizeReason, rounds: r.rounds, leaves: Object.keys(r.poolOutputs),
        manifest: r.manifestPath,
      }, null, 2)}\n`);
      process.exit(r.finalizeOk ? 0 : 1);
    })
    .catch((e) => { process.stderr.write(`runSwarm error: ${String(e?.message || e)}\n`); process.exit(1); });
}
