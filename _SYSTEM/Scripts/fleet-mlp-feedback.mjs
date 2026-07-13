#!/usr/bin/env node
/**
 * fleet-mlp-feedback.mjs — MLP learning loop: predict → dispatch → outcome → update.
 *
 * DISARMED by default. Ledger + weight persist only when YURI_MLP_LEARN=1 or
 * _SYSTEM/state/mlp-learn.enabled exists AND not dry-run.
 *
 * @exports shouldPersistMlp, shouldPersistMlpLearn, recordMlpPredictions, recordMlpOutcomesFromRun,
 *          recordMlpFeedbackStub, recordMlpFeedbackDryRun, runMlpFeedbackLoop, recordMlpFeedbackFromRun,
 *          deriveLeafOutcome, runPostTrainSummary, enrichRunResultWithSidecarPools
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { recordPrediction, recordOutcome } from './prediction-ledger.mjs';
import { extractResultLabel } from './glm-fleet.mjs';
import { aggregatePoolOutputs as aggregateOllamaPool } from './ollama-fleet.mjs';
import { appendMemoryEntry, recallEntries } from './memory-kernel.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const MLP_LEARN_ENV = 'YURI_MLP_LEARN';
export const MLP_LEARN_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mlp-learn.enabled');
export const MLP_SHADOW_ENV = 'YURI_MLP_SHADOW';
export const MLP_SHADOW_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mlp-shadow.enabled');
export const COUNTERFACTUAL_SHADOW_FILE = path.join(REPO_ROOT, '_SYSTEM', 'state', 'fleet-router-counterfactual-shadow.jsonl');

/** True when owner has armed MLP learning persist and caller is not dry-run. */
export function shouldPersistMlpLearn(opts = {}) {
  if (opts.dryRun || opts.persist === false) return false;
  if (opts.persist === true || opts.mlpLearn === true) return true;
  if (process.env[MLP_LEARN_ENV] === '1' || process.env.YURI_MLP_LEARN === '1') return true;
  try { return fs.existsSync(MLP_LEARN_FLAG); } catch { return false; }
}

export const shouldPersistMlp = shouldPersistMlpLearn;

async function getRouter() {
  return import('./fleet-router-mlp.mjs').catch(() => null);
}

function leavesFromPlan(plan) {
  return [...(plan.glmLeaves ?? []), ...(plan.nativeSpecs ?? [])];
}

/** P9 shadow: log MLP ranked alternatives vs actual dispatch (no routing change). */
export function isMlpShadowArmed() {
  if (process.env[MLP_SHADOW_ENV] === '1') return true;
  try { return fs.existsSync(MLP_SHADOW_FLAG); } catch { return false; }
}

function actualDispatchSubstrate(leaf) {
  if (leaf.dispatch === 'ollama-sidecar' || leaf.affinityApplied?.startsWith('ollama')) return 'ollama';
  if (leaf.dispatch === 'zai-tmux') return 'tmux-zai';
  if (leaf.dispatch === 'glm-lane') return 'glm';
  if (leaf.model && leaf.model !== 'sonnet' && leaf.model !== 'haiku' && leaf.model !== 'opus') return leaf.model;
  return 'native';
}

/** Append counterfactual shadow rows — advisory only, never changes dispatch. */
export function recordMlpCounterfactualShadow(plan, ctx = {}) {
  if (!isMlpShadowArmed()) return { skipped: true, reason: 'shadow disarmed', count: 0 };
  const ts = new Date().toISOString();
  const records = [];
  for (const leaf of leavesFromPlan(plan)) {
    if (!leaf.routerRanked?.length && !leaf.routerSuggestion) continue;
    const row = {
      type: 'counterfactual-shadow',
      ts,
      leafId: leaf.id || leaf.role,
      role: leaf.role,
      mlpBest: leaf.routerSuggestion || null,
      mlpConfidence: leaf.routerConfidence ?? null,
      actualDispatch: actualDispatchSubstrate(leaf),
      affinityApplied: leaf.affinityApplied || null,
      ranked: (leaf.routerRanked || []).slice(0, 4).map((r) => ({ id: r.id, substrate: r.substrate, score: r.score })),
      quotaPressure: ctx.quotaPressure ?? 0.4,
    };
    try {
      fs.mkdirSync(path.dirname(COUNTERFACTUAL_SHADOW_FILE), { recursive: true });
      fs.appendFileSync(COUNTERFACTUAL_SHADOW_FILE, `${JSON.stringify(row)}\n`);
    } catch { /* fail-open */ }
    records.push(row);
  }
  return { skipped: false, count: records.length, file: COUNTERFACTUAL_SHADOW_FILE, records };
}

/** Merge ollama/zai sidecar result packets into swarm poolOutputs for MLP outcome derivation. */
export function enrichRunResultWithSidecarPools(runResult = {}) {
  const swarm = runResult.swarm ? { ...runResult.swarm } : {};
  const poolOutputs = { ...(swarm.poolOutputs || {}) };

  const mergeSidecar = (sidecar, substrate = 'ollama') => {
    if (!sidecar) return;
    if (sidecar.runDir) {
      const { pool } = aggregateOllamaPool(sidecar.runDir);
      for (const [leafId, pkt] of Object.entries(pool)) {
        poolOutputs[leafId] = { ...pkt, actualSubstrate: substrate, ok: pkt.status === 'ok' };
      }
    }
    for (const r of sidecar.results || []) {
      const leafId = r.label;
      if (!leafId) continue;
      const text = r.text || '';
      const label = r.resultLabel || extractResultLabel(text) || '';
      if (!poolOutputs[leafId] || label || text.length >= 16) {
        poolOutputs[leafId] = {
          label,
          text,
          status: r.ok ? 'ok' : (r.status || 'fail'),
          ok: !!r.ok,
          actualSubstrate: substrate,
        };
      }
    }
  };

  mergeSidecar(runResult.ollamaSidecarResults, 'ollama');
  mergeSidecar(runResult.zaiSidecarResults, 'tmux-zai');

  return { ...runResult, swarm: { ...swarm, poolOutputs } };
}

/** Record prediction-ledger rows at plan time. Returns { ids: leafId → predictionId }. */
export async function recordMlpPredictions(plan, ctx = {}, opts = {}) {
  const router = opts.router ?? await getRouter();
  if (!router?.extractFeatures) return { skipped: true, reason: 'router unavailable', ids: {} };

  const persist = shouldPersistMlpLearn({ ...opts, dryRun: opts.dryRun ?? false });
  const ledgerFile = opts.ledgerFile;
  const quotaPressure = ctx.quotaPressure ?? 0.4;
  const ids = {};
  const records = [];

  for (const leaf of leavesFromPlan(plan)) {
    if (!leaf.routerSuggestion) continue;
    const feats = router.extractFeatures(
      { ...leaf, role: leaf.role, prompt: leaf.prompt || '' },
      { quotaPressure, ...ctx, historicalSubstrate: leaf.routerSuggestion.substrate, ...(ledgerFile ? { historicalLedgerFile: ledgerFile } : {}) },
    );
    const sub = leaf.id || leaf.role;
    const ts = new Date().toISOString();
    const predictionId = createHash('sha256').update(`${sub}:${ts}`).digest('hex').slice(0, 16);

    if (persist) {
      recordPrediction({
        id: predictionId,
        subject: `fleet-route:${sub}`,
        change: `route ${sub} (role=${leaf.role || 'unknown'}) → ${leaf.routerSuggestion.substrate}`,
        predictedEffects: [{
          target: 'substrate',
          effect: leaf.routerSuggestion.substrate || 'glm',
          confidence: leaf.routerConfidence ?? 0.5,
        }],
        features: feats,
        source: 'fleet-router-mlp',
        ts,
      }, ledgerFile ? { file: ledgerFile } : {});
    }

    ids[sub] = predictionId;
    records.push({ id: sub, predictionId, substrate: leaf.routerSuggestion.substrate });
  }

  return { skipped: false, count: Object.keys(ids).length, ids, records, persisted: persist };
}

/** Derive per-leaf outcome from swarm pool / native results. */
export function deriveLeafOutcome(leafId, runResult = {}) {
  const swarm = runResult.swarm || runResult;
  const pool = swarm?.poolOutputs || runResult.poolOutputs || {};
  const nativePool = runResult.nativeResults?.pool || {};

  let packet = pool[leafId];
  let actualSubstrate = 'glm';
  if (!packet && nativePool[leafId]) {
    packet = nativePool[leafId];
    actualSubstrate = 'native';
  }
  if (packet?.actualSubstrate) actualSubstrate = packet.actualSubstrate;

  const text = packet?.text || '';
  const label = packet?.label || extractResultLabel(text) || '';

  // WS-J-K1 outcome gate (MURE §B.2): refuse to train on empty outcomes.
  // Empty RESULT_LABEL with no substantive text → garbage router gradients.
  const textLen = text.trim().length;
  const OUTCOME_TEXT_MIN = 16; // substantive floor — below this and no label = no signal
  if (!label && textLen < OUTCOME_TEXT_MIN) {
    return { skipped: true, reason: 'empty-outcome', leafId, actualSubstrate };
  }

  const statusOk = packet?.status === 'ok' || packet?.ok === true;
  const passLabel = /_P_PASS_/.test(label) || /_X_PASS_/.test(label);
  // Explicit failure signals must NOT be caught by the !!label fallback below.
  // F-type pass (lane self-declared failure) or BLOCKED/REPAIR_REQUIRED terminal
  // (work did not complete) are unambiguous routing failures. Without this guard
  // the !!label fallback counts them as success=1, feeding false-positive gradients
  // to the MLP calibrator — the router learns that blocked/failed substrates are good.
  const failLabel = /_F_(?:PASS_COMMITTED|COMMITTED|BLOCKED|REPAIR_REQUIRED)$/.test(label)
    || /(?:_BLOCKED|_REPAIR_REQUIRED)$/.test(label);
  const success = statusOk && !failLabel && (passLabel || !!label);

  return {
    success: success ? 1 : 0,
    quality: failLabel ? 0.2 : passLabel ? 0.9 : statusOk ? 0.65 : 0.2,
    converged: swarm?.converged === true,
    actualSubstrate,
    resultLabel: label,
    status: packet?.status || 'missing',
    dryRun: false,
  };
}

/** Minimum meaningful shift before a new evidence snapshot is worth appending. A rolling mean
 * over <=HISTORICAL_SUCCESS_WINDOW samples moves on nearly every labeled outcome; without a
 * delta gate that would drift into slow-motion per-outcome noise in Track-A (the exact thing
 * constraint #6 forbids), even though content-hash dedup blocks byte-identical resubmits. */
const EVIDENCE_DELTA_THRESHOLD = 0.05;
/** ...or a coarse sample-count step, so "learned meaningfully more" still registers even when
 * the mean itself barely moved. */
const EVIDENCE_SAMPLE_STEP = 5;

/**
 * Bridge historicalSuccess evidence into Track-A memory — AGGREGATED, not per-outcome.
 * Writes at most one durable snapshot per (role, substrate family) per call, only once the
 * prediction-ledger's rolling aggregator has cleared its own minimum-sample threshold
 * (router.historicalSuccess's own fallback gate — never invents evidence from sparse data),
 * AND only when the value/sample-count has moved materially since the last recorded snapshot
 * for this exact key (EVIDENCE_DELTA_THRESHOLD / EVIDENCE_SAMPLE_STEP above). appendMemoryEntry's
 * own content-hash dedup (WP-M.14, memory-kernel.mjs:360-368) is a second, independent guard
 * against byte-identical resubmits. Never writes a raw per-outcome row.
 */
async function recordHistoricalSuccessEvidence(router, role, substrateFamily, opts = {}) {
  if (!router?.historicalSuccess) return { skipped: true, reason: 'router unavailable' };
  const hs = router.historicalSuccess(role, substrateFamily, opts.ledgerFile ? { file: opts.ledgerFile } : {});
  if (hs.fallback) return { skipped: true, reason: 'below-min-samples', role, substrateFamily, sampleSize: hs.sampleSize };

  const value = Number(hs.value.toFixed(3));
  const recallOpts = { scope: 'project', maxEntries: 50, ...(opts.memoryLogPath ? { logPath: opts.memoryLogPath } : {}) };
  const recall = recallEntries(`${role} ${substrateFamily} fleet-router-mlp historicalSuccess`, recallOpts);
  const prior = (recall?.entries || []).find((e) => e?.metadata?.source === 'fleet-router-mlp'
    && e.metadata.role === role && e.metadata.substrateFamily === substrateFamily);

  const materialChange = !prior
    || Math.abs(value - Number(prior.metadata.value)) >= EVIDENCE_DELTA_THRESHOLD
    || Math.abs(hs.sampleSize - Number(prior.metadata.sampleSize)) >= EVIDENCE_SAMPLE_STEP;
  if (!materialChange) {
    return {
      skipped: true, reason: 'no-material-change', role, substrateFamily, value, sampleSize: hs.sampleSize,
      priorValue: prior.metadata.value, priorSampleSize: prior.metadata.sampleSize,
    };
  }

  const content = `MLP router historicalSuccess evidence — role=${role} substrateFamily=${substrateFamily} `
    + `value=${value} sampleSize=${hs.sampleSize}`;
  const write = appendMemoryEntry({
    originLane: 'claude',
    type: 'evidence',
    scope: 'project',
    source: 'tool',
    content,
    metadata: { role, substrateFamily, value, sampleSize: hs.sampleSize, source: 'fleet-router-mlp' },
  }, opts.memoryLogPath ? { logPath: opts.memoryLogPath } : {});

  return { skipped: false, role, substrateFamily, value, sampleSize: hs.sampleSize, ...write };
}

/** Record outcomes + optional weight updates after an armed run. */
export async function recordMlpOutcomesFromRun(plan, runResult = {}, predictionIds = {}, opts = {}) {
  const router = opts.router ?? await getRouter();
  if (!router?.updateFromOutcome || !router?.extractFeatures) {
    return { skipped: true, reason: 'router unavailable', persisted: false, count: 0, records: [] };
  }

  const persist = shouldPersistMlpLearn(opts);
  const ids = predictionIds.ids || predictionIds;
  const ledgerFile = opts.ledgerFile;
  const quotaPressure = opts.quotaPressure ?? 0.4;
  const records = [];
  let skippedOutcomes = 0;
  const memoryEvidence = [];
  const evidenceKeysSeen = new Set();

  for (const leaf of leavesFromPlan(plan)) {
    if (!leaf.routerSuggestion) continue;
    const sub = leaf.id || leaf.role;
    const feats = router.extractFeatures(
      { ...leaf, role: leaf.role, prompt: leaf.prompt || '' },
      { quotaPressure, historicalSubstrate: leaf.routerSuggestion.substrate, ...(ledgerFile ? { historicalLedgerFile: ledgerFile } : {}) },
    );
    const outcome = deriveLeafOutcome(sub, runResult);
    const predId = ids[sub];

    // WS-J-K1 outcome gate (MURE §B.2): do NOT call updateFromOutcome on empty outcomes —
    // training on lies produces garbage router gradients.
    if (outcome.skipped) {
      records.push({
        id: sub,
        predictionId: predId,
        substrate: leaf.routerSuggestion.substrate,
        actualSubstrate: outcome.actualSubstrate,
        skipped: true,
        skipReason: outcome.reason,
        persisted: false,
      });
      skippedOutcomes++;
      continue;
    }

    if (persist && predId) {
      recordOutcome({
        predictionId: predId,
        observedEffects: [
          { target: 'substrate', effect: outcome.actualSubstrate },
          { target: 'success', effect: outcome.success },
          { target: 'quality', effect: outcome.quality },
        ],
        ts: new Date().toISOString(),
      }, ledgerFile ? { file: ledgerFile } : {});

      // Aggregated Track-A evidence bridge: keyed by (role, substrate family), deduped within
      // this run — the freshly recorded outcome above is already reflected in the ledger read
      // inside recordHistoricalSuccessEvidence. Only fires when armed (persist===true); never
      // runs during an advisory/dry-run plan.
      const family = router.classifySubstrate ? router.classifySubstrate(leaf.routerSuggestion.substrate) : null;
      const roleKey = String(leaf.role || '').toLowerCase();
      const evidenceKey = `${roleKey}|${family}`;
      if (family && roleKey && !evidenceKeysSeen.has(evidenceKey)) {
        evidenceKeysSeen.add(evidenceKey);
        // Never let the auxiliary memory bridge abort the primary outcome/ledger loop —
        // a validation error, protected-path denial, or ledger IO fault here must degrade
        // to "no evidence snapshot this run", not lose the remaining leaves' outcomes.
        try {
          const snap = await recordHistoricalSuccessEvidence(router, roleKey, family, {
            ledgerFile,
            memoryLogPath: opts.memoryLogPath,
          });
          if (snap) memoryEvidence.push(snap);
        } catch (evidenceErr) {
          memoryEvidence.push({
            skipped: true, reason: 'evidence-bridge-error', role: roleKey, substrateFamily: family,
            error: evidenceErr?.message || String(evidenceErr),
          });
        }
      }
    }

    const res = await router.updateFromOutcome(feats, leaf.routerSuggestion, outcome, {
      persist,
      learningRate: opts.learningRate ?? 0.02,
    });
    records.push({
      id: sub,
      predictionId: predId,
      substrate: leaf.routerSuggestion.substrate,
      actualSubstrate: outcome.actualSubstrate,
      success: outcome.success,
      error: res.error,
      persisted: res.persisted,
    });
  }

  return { advisory: !persist, persisted: persist, count: records.length, records, skippedOutcomes, memoryEvidence };
}

/**
 * Dry-run feedback — compute error, never persist weights or ledger.
 *
 * This is the ADVISORY STUB called by runFleet.mjs in --dry-run mode.
 * It calls fleet-router-mlp.mjs::updateFromOutcome with { persist: false },
 * which operates on a structuredClone of the weights and discards the gradient.
 * The in-memory singleton _weights and the on-disk weights file are never touched.
 *
 * REAL TRAINING PATH:
 *   1. runFleet.mjs --apply --mlp-learn   (armed: YURI_MLP_LEARN=1 or _SYSTEM/state/mlp-learn.enabled)
 *      → recordMlpPredictions (log predictions to prediction-ledger)
 *      → company.runCompany (dispatch real work)
 *      → recordMlpFeedbackFromRun (derive outcomes from run results, call updateFromOutcome with persist:true)
 *      → runPostTrainSummary → trainFleetRouterFromLedger (batch replay from ledger with held-out Brier eval)
 *
 *   2. Standalone batch training:
 *      node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs [--epochs=4] [--lr=0.015] [--dry]
 *      Loads prediction-ledger, matches predictions→outcomes, runs multi-epoch online gradient descent
 *      with updateFromOutcome(persist:true), time-ordered 80/20 train/eval split, reports held-out Brier.
 *
 * Key invariant: persist:false (this stub) is purely advisory — gradient error is computed for
 * diagnostics but never written. persist:true (armed path) mutates _weights + saves to disk.
 */
export async function recordMlpFeedbackDryRun(plan, ctx = {}) {
  const router = await getRouter();
  if (!router?.updateFromOutcome || !router?.extractFeatures) {
    return { skipped: true, reason: 'router unavailable', advisory: true, persisted: false, count: 0, records: [] };
  }
  const quotaPressure = ctx.quotaPressure ?? 0.4;
  const records = [];
  for (const leaf of leavesFromPlan(plan)) {
    if (!leaf.routerSuggestion) continue;
    const feats = router.extractFeatures({ ...leaf, role: leaf.role, prompt: leaf.prompt || '' }, { quotaPressure });
    const res = await router.updateFromOutcome(
      feats,
      leaf.routerSuggestion,
      { success: 0, quality: 0.5, converged: false, dryRun: true },
      { persist: false, learningRate: 0.02 },
    );
    records.push({ id: leaf.id, substrate: leaf.routerSuggestion.substrate, error: res.error });
  }
  return { advisory: true, persisted: false, count: records.length, records, trainSummary: null, predictionIds: {} };
}

/** Advisory stub alias used by runFleet.mjs dry-run. See recordMlpFeedbackDryRun for full contract. */
export const recordMlpFeedbackStub = recordMlpFeedbackDryRun;

/** Full apply-path feedback (predictions should already be logged). */
export async function recordMlpFeedbackFromRun(plan, runResult, opts = {}) {
  const predictions = opts.predictionIds
    ? { ids: opts.predictionIds }
    : await recordMlpPredictions(plan, opts, { ...opts, dryRun: false });
  if (predictions.skipped) {
    return { skipped: true, reason: predictions.reason, advisory: true, persisted: false, count: 0, records: [] };
  }
  const outcomes = await recordMlpOutcomesFromRun(plan, runResult, predictions, opts);
  let trainSummary = null;
  if (shouldPersistMlpLearn(opts)) {
    trainSummary = await runPostTrainSummary(opts);
  }
  return { ...outcomes, predictionIds: predictions.ids, trainSummary };
}

/** Apply-path loop with optional pre-recorded predictionIds. */
export async function runMlpFeedbackLoop(plan, runResult, opts = {}) {
  if (opts.dryRun ?? true) return recordMlpFeedbackDryRun(plan, opts);
  return recordMlpFeedbackFromRun(plan, runResult, { ...opts, dryRun: false, predictionIds: opts.predictionIds });
}

/** Post-run advisory training from ledger. JS train + Python sidecar Brier compare. */
export async function runPostTrainSummary(opts = {}) {
  let jsSummary = { skipped: true, reason: 'train-fleet-router-from-ledger unavailable' };
  try {
    const mod = await import('./train-fleet-router-from-ledger.mjs');
    if (mod?.trainFleetRouterFromLedger) {
      jsSummary = await mod.trainFleetRouterFromLedger({
        epochs: opts.trainEpochs ?? opts.epochs ?? 2,
        lr: opts.learningRate ?? opts.lr ?? 0.015,
        dry: opts.dry ?? false,
        ledgerFile: opts.ledgerFile,
        quiet: opts.quiet ?? true,
      });
    }
  } catch { /* optional */ }

  // Python numpy sidecar for cross-provider Brier + feature importance (advisory only)
  let pySummary = null;
  try {
    const ledgerPath = opts.ledgerFile || '_SYSTEM/state/prediction-ledger.jsonl';
    const py = spawnSync('python3', [
      path.join(REPO_ROOT, '_SYSTEM', 'ml', 'fleet_router_train.py'),
      '--ledger', ledgerPath,
      '--epochs', String(opts.epochs ?? 200),
      '--lr', String(opts.lr ?? 0.01),
    ], { encoding: 'utf8', timeout: 180000, cwd: REPO_ROOT });
    if (py.status === 0 && py.stdout?.trim()) {
      pySummary = JSON.parse(py.stdout);
    }
  } catch { /* sidecar optional */ }

  return {
    ...jsSummary,
    pythonCompare: pySummary,
    note: pySummary
      ? 'Brier comparison + feature importance from Python numpy available (advisory)'
      : 'Python sidecar unavailable or errored — JS MLP remains authority',
  };
}
