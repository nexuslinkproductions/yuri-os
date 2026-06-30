#!/usr/bin/env node
/**
 * fleet-mlp-feedback.mjs — MLP learning loop: predict → dispatch → outcome → update.
 *
 * DISARMED by default. Ledger + weight persist only when YURI_MLP_LEARN=1 or
 * _SYSTEM/state/mlp-learn.enabled exists AND not dry-run.
 *
 * @exports shouldPersistMlp, shouldPersistMlpLearn, recordMlpPredictions, recordMlpOutcomesFromRun,
 *          recordMlpFeedbackStub, recordMlpFeedbackDryRun, runMlpFeedbackLoop, recordMlpFeedbackFromRun,
 *          deriveLeafOutcome, runPostTrainSummary
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordPrediction, recordOutcome } from './prediction-ledger.mjs';
import { extractResultLabel } from './glm-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const MLP_LEARN_ENV = 'YURI_MLP_LEARN';
export const MLP_LEARN_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mlp-learn.enabled');

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

/** Record prediction-ledger rows at plan time. Returns { ids: leafId → predictionId }. */
export async function recordMlpPredictions(plan, ctx = {}, opts = {}) {
  const router = await getRouter();
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
      { quotaPressure, ...ctx },
    );
    const sub = leaf.id || leaf.role;
    const ts = new Date().toISOString();
    const predictionId = createHash('sha256').update(`${sub}:${ts}`).digest('hex').slice(0, 16);

    if (persist) {
      recordPrediction({
        id: predictionId,
        subject: `fleet-route:${sub}`,
        change: `route ${sub} → ${leaf.routerSuggestion.substrate}`,
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
  const success = statusOk && (passLabel || !!label);

  return {
    success: success ? 1 : 0,
    quality: passLabel ? 0.9 : statusOk ? 0.65 : 0.2,
    converged: swarm?.converged === true,
    actualSubstrate,
    resultLabel: label,
    status: packet?.status || 'missing',
    dryRun: false,
  };
}

/** Record outcomes + optional weight updates after an armed run. */
export async function recordMlpOutcomesFromRun(plan, runResult = {}, predictionIds = {}, opts = {}) {
  const router = await getRouter();
  if (!router?.updateFromOutcome || !router?.extractFeatures) {
    return { skipped: true, reason: 'router unavailable', persisted: false, count: 0, records: [] };
  }

  const persist = shouldPersistMlpLearn(opts);
  const ids = predictionIds.ids || predictionIds;
  const ledgerFile = opts.ledgerFile;
  const quotaPressure = opts.quotaPressure ?? 0.4;
  const records = [];
  let skippedOutcomes = 0;

  for (const leaf of leavesFromPlan(plan)) {
    if (!leaf.routerSuggestion) continue;
    const sub = leaf.id || leaf.role;
    const feats = router.extractFeatures(
      { ...leaf, role: leaf.role, prompt: leaf.prompt || '' },
      { quotaPressure },
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

  return { advisory: !persist, persisted: persist, count: records.length, records, skippedOutcomes };
}

/** Dry-run feedback — compute error, never persist weights or ledger. */
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

/** Post-run advisory training from ledger. */
export async function runPostTrainSummary(opts = {}) {
  try {
    const mod = await import('./train-fleet-router-from-ledger.mjs');
    if (mod?.trainFleetRouterFromLedger) {
      return mod.trainFleetRouterFromLedger({
        epochs: opts.trainEpochs ?? opts.epochs ?? 2,
        lr: opts.learningRate ?? opts.lr ?? 0.015,
        dry: opts.dry ?? false,
        ledgerFile: opts.ledgerFile,
        quiet: opts.quiet ?? true,
      });
    }
  } catch { /* optional */ }
  return { skipped: true, reason: 'train-fleet-router-from-ledger unavailable' };
}
