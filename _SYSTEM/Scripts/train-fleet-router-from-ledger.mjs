#!/usr/bin/env node
/**
 * train-fleet-router-from-ledger.mjs
 *
 * Proper training pass for the fleet router MLP.
 * Loads the prediction-ledger, matches predictions to outcomes, and runs
 * multiple update steps (online gradient descent) to improve weights.
 *
 * Usage:
 *   node _SYSTEM/Scripts/train-fleet-router-from-ledger.mjs [--epochs=4] [--lr=0.015] [--dry]
 *
 * @exports trainFleetRouterFromLedger
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { readLedger } from './prediction-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const EPOCHS = Number(args.find((a) => a.startsWith('--epochs='))?.split('=')[1] || 4);
const LR = Number(args.find((a) => a.startsWith('--lr='))?.split('=')[1] || 0.015);
const DRY = args.includes('--dry');

// WS-J-C1 held-out eval (MURE §B.2 companion P0.3)
// Minimum examples to bother splitting. Below this, all go to training.
const EVAL_SPLIT_MIN = 5;
// Fraction reserved for held-out evaluation (time-ordered: last 20% by ts).
const EVAL_FRACTION = 0.2;

/**
 * Squash a raw MLP score to [0,1] via logistic sigmoid for Brier computation.
 * @param {number} x raw forward-pass score
 * @returns {number} probability in (0,1)
 */
function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

/**
 * Compute mean Brier score over held-out eval examples.
 * Brier per example = (sigmoid(score) - target)² where target = success * quality.
 * @param {Array} evalExamples examples with features + outcome
 * @param {object} weights trained weights
 * @param {Function} forwardFn router.forward(features, w)
 * @returns {{ evalMeanBrier: number, evalExampleCount: number }}
 */
function computeHeldOutBrier(evalExamples, weights, forwardFn) {
  if (!evalExamples.length) {
    return { evalMeanBrier: null, evalExampleCount: 0 };
  }
  let brierSum = 0;
  for (const ex of evalExamples) {
    const { score } = forwardFn(ex.features, weights);
    const prob = sigmoid(score);
    const target = (ex.outcome.success ?? (ex.outcome.converged ? 1 : 0)) * (ex.outcome.quality ?? 0.8);
    brierSum += (prob - target) ** 2;
  }
  return {
    evalMeanBrier: brierSum / evalExamples.length,
    evalExampleCount: evalExamples.length,
  };
}

/**
 * Train fleet router from prediction ledger. Returns summary for mlpFeedback.trainSummary.
 *
 * WS-J-C1 (MURE §B.2 P0.3 companion): performs a time-ordered 80/20 train/eval split.
 * The last 20% of examples (by prediction timestamp) are held out; after training on
 * the first 80%, the model is forward-passed over the held-out set and mean Brier is
 * reported as evalMeanBrier. Advisory only.
 *
 * @param {{ epochs?: number, lr?: number, dry?: boolean, ledgerFile?: string, quiet?: boolean, evalFraction?: number }} opts
 * @returns {Promise<{ok, epochs, exampleCount, evalMeanBrier?, evalExampleCount?, ...}>}
 */
export async function trainFleetRouterFromLedger(opts = {}) {
  const epochs = opts.epochs ?? EPOCHS;
  const lr = opts.lr ?? LR;
  const dry = opts.dry ?? DRY;
  const quiet = opts.quiet ?? false;
  const evalFraction = opts.evalFraction ?? EVAL_FRACTION;
  const log = (m) => { if (!quiet) console.log(m); };

  const router = await import('./fleet-router-mlp.mjs').catch(() => null);
  if (!router?.updateFromOutcome || !router?.extractFeatures || typeof router.forward !== 'function') {
    return { ok: false, reason: 'router unavailable', epochs: 0, exampleCount: 0, evalMeanBrier: null, evalExampleCount: 0 };
  }

  const { updateFromOutcome, forward } = router;
  const ledgerOpts = opts.ledgerFile ? { file: opts.ledgerFile } : {};
  const ledger = readLedger(ledgerOpts);
  if (!ledger.length) {
    log('No ledger entries found.');
    return { ok: true, epochs: 0, exampleCount: 0, meanError: null, evalMeanBrier: null, evalExampleCount: 0 };
  }

  const predsById = new Map();
  const outcomes = [];
  for (const row of ledger) {
    if (row.type === 'prediction') predsById.set(row.id, row);
    else if (row.type === 'outcome' && row.predictionId) outcomes.push(row);
  }

  function reconstructFeatures(subject, fallbackCtx = {}) {
    const role = /adjudicator/.test(subject) ? 'adjudicator' : /bulk/.test(subject) ? 'bulk' : 'scout';
    const substrate = /glm/.test(subject) ? 'glm' : /ollama/.test(subject) ? 'ollama' : 'native';
    const task = { id: subject, role, substrate, prompt: subject, blastRadius: 'LOW' };
    const ctx = {
      complexity: /adjudicator/.test(role) ? 0.82 : 0.55,
      quotaPressure: substrate === 'glm' ? 0.38 : 0.25,
      ...fallbackCtx,
    };
    return router.extractFeatures(task, ctx);
  }

  const examples = [];
  for (const out of outcomes) {
    const pred = predsById.get(out.predictionId);
    if (!pred) continue;

    let feats = Array.isArray(pred.features) && pred.features.length > 0 ? pred.features : null;
    if (!feats) feats = reconstructFeatures(pred.subject || '');

    const success = out.observedEffects?.some((e) => e.target === 'success' && Number(e.effect) > 0.5) ? 1 : 0;
    const qualityObs = out.observedEffects?.find((e) => e.target === 'quality');
    const quality = qualityObs ? Math.max(0, Math.min(1, Number(qualityObs.effect))) : (success ? 0.82 : 0.18);

    examples.push({
      features: feats,
      outcome: { success, quality, converged: success === 1 },
      subject: pred.subject,
      id: pred.id,
      ts: pred.ts || '',
    });
  }

  if (!examples.length) {
    log('No examples with stored features + outcomes found. Run ingestion first.');
    return { ok: true, epochs: 0, exampleCount: 0, meanError: null, evalMeanBrier: null, evalExampleCount: 0 };
  }

  // WS-J-C1: time-ordered 80/20 train/eval split.
  // Sort by prediction timestamp ascending, then slice last 20% as held-out eval.
  // This mirrors real deployment: train on history, predict the future.
  examples.sort((a, b) => {
    const ta = a.ts || '';
    const tb = b.ts || '';
    if (ta === tb) return a.id < b.id ? -1 : 1; // stable tiebreak
    return ta < tb ? -1 : 1;
  });

  let trainExamples = examples;
  let evalExamples = [];
  if (examples.length >= EVAL_SPLIT_MIN) {
    const splitIdx = Math.floor(examples.length * (1 - evalFraction));
    // Ensure at least 1 eval example when split is feasible
    if (splitIdx < examples.length) {
      trainExamples = examples.slice(0, splitIdx);
      evalExamples = examples.slice(splitIdx);
    }
  }

  log(`Found ${examples.length} examples. train=${trainExamples.length} eval=${evalExamples.length} epochs=${epochs} lr=${lr} ${dry ? '(dry)' : ''}`);

  let preErr = 0;
  for (const ex of trainExamples) {
    const target = (ex.outcome.success ?? (ex.outcome.converged ? 1 : 0)) * (ex.outcome.quality ?? 0.8);
    preErr += Math.abs(target - 0.5);
  }
  preErr /= trainExamples.length;

  const epochErrors = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochErr = 0;
    for (const ex of trainExamples) {
      const res = await updateFromOutcome(ex.features, { id: 'train' }, ex.outcome, {
        learningRate: lr / (1 + epoch * 0.5),
        persist: !dry,
      });
      epochErr += Math.abs(res.error || 0);
    }
    epochErr /= trainExamples.length;
    epochErrors.push(epochErr);
    log(`epoch ${epoch + 1}/${epochs}  mean|err|=${epochErr.toFixed(4)}`);
  }

  // WS-J-C1: held-out Brier evaluation on the last 20% (time-ordered).
  // DUAL BRIER (Fable 5 C1): report both the persisted singleton AND the
  // post-training scratch. The singleton reads on-disk weights via loadWeights()
  // (frozen across epochs in a dry run — never shows whether training helped); the
  // scratch reads the in-memory weights mutated by updateFromOutcome and so reflects
  // the current training state. Without the scratch pass, eval can never demonstrate
  // generalization gains — it always reads stale weights.
  let evalResult = { evalMeanBrier: null, evalExampleCount: 0 };
  let scratchResult = { evalMeanBrier: null, evalExampleCount: 0 };
  if (evalExamples.length > 0) {
    // Persisted singleton: stable model quality (frozen on dry runs).
    const evalWeights = await router.loadWeights();
    evalResult = computeHeldOutBrier(evalExamples, evalWeights, forward);
    log(`Held-out eval (persisted singleton): ${evalResult.evalExampleCount} examples, meanBrier=${evalResult.evalMeanBrier?.toFixed(4) ?? 'n/a'}`);

    // Post-training scratch: evolving in-memory weights (may be null when no training
    // ran this process, e.g. --epochs=0 or a fresh invocation that never updated).
    const scratchWeights = typeof router.getScratchWeights === 'function' ? router.getScratchWeights() : null;
    if (scratchWeights) {
      scratchResult = computeHeldOutBrier(evalExamples, scratchWeights, forward);
      log(`Held-out eval (post-training scratch): meanBrier=${scratchResult.evalMeanBrier?.toFixed(4) ?? 'n/a'}`);
    } else {
      log(`Held-out eval (post-training scratch): skipped (no scratch weights — training did not run this process)`);
    }
  } else {
    log(`Held-out eval: skipped (insufficient examples for ${evalFraction} split)`);
  }

  if (!dry) log('Weights updated and saved.');
  else log('Dry run – weights not persisted.');

  log(`Pre-training neutral error ~${preErr.toFixed(3)} (baseline). Training run complete.`);

  return {
    ok: true,
    epochs,
    exampleCount: examples.length,
    trainExampleCount: trainExamples.length,
    evalExampleCount: evalResult.evalExampleCount,
    preError: preErr,
    meanError: epochErrors.length ? epochErrors[epochErrors.length - 1] : null,
    epochErrors,
    evalMeanBrier: evalResult.evalMeanBrier,
    evalMeanBrierScratch: scratchResult.evalMeanBrier,
    dry,
  };
}

async function main() {
  const r = await trainFleetRouterFromLedger({ epochs: EPOCHS, lr: LR, dry: DRY });
  if (r.ok === false) {
    console.error(r.reason || 'training failed');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
