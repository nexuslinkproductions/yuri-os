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

/**
 * Train fleet router from prediction ledger. Returns summary for mlpFeedback.trainSummary.
 * @param {{ epochs?: number, lr?: number, dry?: boolean, ledgerFile?: string, quiet?: boolean }} opts
 */
export async function trainFleetRouterFromLedger(opts = {}) {
  const epochs = opts.epochs ?? EPOCHS;
  const lr = opts.lr ?? LR;
  const dry = opts.dry ?? DRY;
  const quiet = opts.quiet ?? false;
  const log = (m) => { if (!quiet) console.log(m); };

  const router = await import('./fleet-router-mlp.mjs').catch(() => null);
  if (!router?.updateFromOutcome || !router?.extractFeatures) {
    return { ok: false, reason: 'router unavailable', epochs: 0, exampleCount: 0 };
  }

  const { updateFromOutcome } = router;
  const ledgerOpts = opts.ledgerFile ? { file: opts.ledgerFile } : {};
  const ledger = readLedger(ledgerOpts);
  if (!ledger.length) {
    log('No ledger entries found.');
    return { ok: true, epochs: 0, exampleCount: 0, meanError: null };
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
    });
  }

  if (!examples.length) {
    log('No examples with stored features + outcomes found. Run ingestion first.');
    return { ok: true, epochs: 0, exampleCount: 0, meanError: null };
  }

  log(`Found ${examples.length} trainable examples. epochs=${epochs} lr=${lr} ${dry ? '(dry)' : ''}`);

  let preErr = 0;
  for (const ex of examples) {
    const target = (ex.outcome.success ?? (ex.outcome.converged ? 1 : 0)) * (ex.outcome.quality ?? 0.8);
    preErr += Math.abs(target - 0.5);
  }
  preErr /= examples.length;

  const epochErrors = [];
  for (let epoch = 0; epoch < epochs; epoch++) {
    let epochErr = 0;
    for (const ex of examples) {
      const res = await updateFromOutcome(ex.features, { id: 'train' }, ex.outcome, {
        learningRate: lr / (1 + epoch * 0.5),
        persist: !dry,
      });
      epochErr += Math.abs(res.error || 0);
    }
    epochErr /= examples.length;
    epochErrors.push(epochErr);
    log(`epoch ${epoch + 1}/${epochs}  mean|err|=${epochErr.toFixed(4)}`);
  }

  if (!dry) log('Weights updated and saved.');
  else log('Dry run – weights not persisted.');

  log(`Pre-training neutral error ~${preErr.toFixed(3)} (baseline). Training run complete.`);

  return {
    ok: true,
    epochs,
    exampleCount: examples.length,
    preError: preErr,
    meanError: epochErrors.length ? epochErrors[epochErrors.length - 1] : null,
    epochErrors,
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
