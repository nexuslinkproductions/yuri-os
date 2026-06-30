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
import { fileURLToPath } from 'node:url';
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

export function newRunId() { return `swarm-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`; }
export function newTraceId() { return `tr-${crypto.randomBytes(6).toString('hex')}`; }

/**
 * Run the governed swarm loop over the GLM substrate.
 * @param {{leaves:Array<{id:string,lane?:string,prompt:string,reasoning?:string,timeoutMs?:number}>}} decomposition
 * @param {{rounds?:number,concurrency?:number,armed?:boolean,signals?:Array,adversarialRunner?:Function,runId?:string,traceId?:string,deps?:object,quiet?:boolean}} opts
 * @returns {Promise<{runId,traceId,converged,finalizeOk,finalizeReason,rounds,poolOutputs,verdict,manifestPath,runDir}>}
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

  // === Aggressive router wiring ===
  // Consult MLP router for every leaf. Attach suggestion + confidence.
  // Use router to bias soft params (timeoutMs) for heavy reasoning leaves when confidence is decent.
  // Router is always advisory; hard governance / flags still control arming and dispatch.
  const router = await getRouter();
  const routerSuggestions = [];
  if (router && typeof router.extractFeatures === 'function' && typeof router.predictRoute === 'function') {
    for (const leaf of leaves) {
      const ctx = {
        complexity: (leaf.prompt || '').length > 800 ? 0.8 : 0.55,
        quotaPressure: 0.35,
        evidenceDecidability: 0.85,
        roleHeavy: /adjudicator|architect|deliberator|helmsman/.test(String(leaf.role || leaf.id)),
      };
      const feats = router.extractFeatures(leaf, ctx);
      const suggestion = await router.predictRoute(feats, [{
        id: leaf.id,
        substrate: 'glm',
        lane: leaf.lane || 'glm',
        role: leaf.role || leaf.id,
      }]);
      leaf.routerSuggestion = suggestion.best;
      leaf.routerConfidence = suggestion.confidence;
      routerSuggestions.push({ id: leaf.id, best: suggestion.best, confidence: suggestion.confidence });

      // Bias timeout for heavy work when router is reasonably confident — use fleet tier default, never below it.
      if (suggestion.confidence > 0.25 && suggestion.best && /max|heavy|adjudicator/.test(String(suggestion.best.lane || ''))) {
        const heavyLane = suggestion.best.lane || leaf.lane || 'glm-max';
        const suggestedTimeout = Math.max(leaf.timeoutMs || 0, defaultTimeoutMsForLane(heavyLane));
        if (!leaf.timeoutMs || leaf.timeoutMs < suggestedTimeout) {
          leaf.timeoutMs = suggestedTimeout;
        }
      }
    }
  }

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

  while (round < maxRounds) {
    log(`round ${round}: dispatch ${pending.length} leaf(s) → ${pending.map((l) => l.id).join(', ')}`);
    // 1. DISPATCH this round's pending leaves over the GLM substrate.
    const tasks = pending.map((l) => ({
      lane: l.lane || 'glm', label: l.id, reasoning: l.reasoning || 'high',
      prompt: l.prompt, timeoutMs: l.timeoutMs,
    }));
    const fleet = await _glmFleet(tasks, { concurrency, runId, runDir, armed: opts.armed });

    // 2. AGGREGATE — merge this round's packets into the accumulating pool.
    const agg = _aggregate(runDir);
    poolOutputs = { ...poolOutputs, ...(agg.pool || {}) };
    if (agg.skipped && agg.skipped.length) log(`aggregate skipped ${agg.skipped.length} malformed file(s)`);

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

    // 4. CONVERGE — 3-layer gate + damping.
    const verdict = converge({ ledger, poolOutputs, signals: opts.signals || [], adversarialResult, damping, round, opts });
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

  if (_prevTraceEnv === undefined) delete process.env.YURI_FLEET_TRACE_ID;
  else process.env.YURI_FLEET_TRACE_ID = _prevTraceEnv;
  return {
    runId, traceId, converged: manifest.converged, finalizeOk: guard.ok, finalizeReason: guard.reason,
    rounds: manifest.rounds, poolOutputs, verdict: lastVerdict,
    manifestPath: path.join(REPO_ROOT, '.claude', 'jobs', runId, 'manifest.json'), runDir,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
