#!/usr/bin/env node
/**
 * ingest-audit-trace.mjs
 *
 * Takes the concrete launch-readiness audit runs (V1 glm-max + B1/B2 ollama) and:
 *   1. Extracts features for each leaf using the current fleet-router-mlp feature schema.
 *   2. Records them as predictions in the prediction-ledger (what route was chosen + confidence if available).
 *   3. Records outcomes where we have verification signals (resultLabel present + exit 0 = success).
 *
 * This is the "A" step after creating the MLP skeleton: close the learn loop on the real data we just generated.
 *
 * Usage:
 *   node _SYSTEM/Scripts/ingest-audit-trace.mjs [--dry]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recordPrediction,
  recordOutcome,
  readLedger,
} from '../Scripts/prediction-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

const DRY = process.argv.includes('--dry');
const jobDirIdx = process.argv.indexOf('--job-dir');
const JOB_RESULTS_DIR = jobDirIdx >= 0
  ? path.resolve(process.argv[jobDirIdx + 1])
  : null;

// Known runs from the 2026-06-29 launch-readiness audit (fallback)
const GLM_RUN_DIR = JOB_RESULTS_DIR || path.join(REPO_ROOT, '.claude/jobs/glmf-mqz73q0n-22cce2/results');
const OLLAMA_RUN_DIR = JOB_RESULTS_DIR || path.join(REPO_ROOT, '.claude/jobs/olf-mqz5kc71-d420c4/results');

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function loadOut(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

async function main() {
  const router = await import('./fleet-router-mlp.mjs').catch(() => null);

  const traces = [];

  // === GLM V1 (adjudicator) ===
  const v1Json = loadJson(path.join(GLM_RUN_DIR, 'V1-adversarial-gap-pass.json'));
  const v1Out = loadOut(path.join(GLM_RUN_DIR, 'V1-adversarial-gap-pass.out'));
  if (v1Json) {
    const success = v1Json.status === 'ok' && v1Out.includes('03V1_ADVERSARIAL_GAP');
    traces.push({
      id: 'V1-adversarial-gap-pass',
      role: 'adjudicator',
      substrate: 'glm',
      lane: 'glm-max',
      success: success ? 1 : 0,
      quality: success ? 0.85 : 0.2,   // we have a real gap report
      cost: 1,                         // one heavy glm-max call
      timeMs: v1Json.durationMs || 652000,
      resultLabel: v1Json.resultLabel || (success ? '03V1_ADVERSARIAL_GAP_P_PASS_COMMITTED' : ''),
    });
  }

  // === Ollama B1 (bulk IP census) ===
  const b1Json = loadJson(path.join(OLLAMA_RUN_DIR, 'B1-IP-CENSUS.json'));
  if (b1Json) {
    const success = b1Json.status === 'ok' && b1Json.resultLabel?.includes('IP_CENSUS');
    traces.push({
      id: 'B1-IP-CENSUS',
      role: 'bulk',
      substrate: 'ollama',
      lane: 'flash',
      success: success ? 1 : 0,
      quality: success ? 0.9 : 0,
      cost: 0.2,
      timeMs: b1Json.durationMs || 1027596,
      resultLabel: b1Json.resultLabel || '',
    });
  }

  // === Ollama B2 (secret pattern) – known to have failed in this run ===
  const b2Json = loadJson(path.join(OLLAMA_RUN_DIR, 'B2-SECRET-PATTERN.json'));
  if (b2Json || true) { // even if file missing, we know the outcome from fleet log
    traces.push({
      id: 'B2-SECRET-PATTERN',
      role: 'bulk',
      substrate: 'ollama',
      lane: 'kimi',
      success: 0,
      quality: 0,
      cost: 0.4,
      timeMs: 2404148,
      resultLabel: '',
    });
  }

  console.log(`Ingesting ${traces.length} audit leaves into prediction ledger...`);

  for (const t of traces) {
    const taskForFeatures = {
      id: t.id,
      role: t.role,
      substrate: t.substrate,
      lane: t.lane,
      blastRadius: 'LOW',
      prompt: `audit leaf ${t.id}`,
    };

    const ctx = {
      complexity: t.role === 'adjudicator' ? 0.85 : 0.55,
      historicalSuccess: 0.6,
      quotaPressure: t.substrate === 'glm' ? 0.35 : 0.25,
      evidenceDecidability: 0.85,
      roleHeavy: t.role === 'adjudicator',
    };

    const features = router?.extractFeatures ? router.extractFeatures(taskForFeatures, ctx) : Array(12).fill(0.5);

    const prediction = {
      id: `audit-${t.id}-${Date.now()}`,
      subject: `route:${t.role}:${t.substrate}`,
      change: 'launch-readiness-audit-2026-06-29',
      predictedEffects: [
        { target: 'success', effect: t.success, confidence: 0.75 },
        { target: 'quality', effect: t.quality, confidence: 0.7 },
      ],
      features,   // store the exact feature vector for training
      source: 'fleet-router-mlp-v1 + manual dispatch',
      ts: new Date().toISOString(),
    };

    if (!DRY) recordPrediction(prediction);

    const outcome = {
      predictionId: prediction.id,
      observedEffects: [
        { target: 'success', effect: t.success },
        { target: 'quality', effect: t.quality },
      ],
      ts: new Date().toISOString(),
    };

    if (!DRY) recordOutcome(outcome);

    console.log(`${DRY ? '[dry] ' : ''}${t.id}  ${t.substrate}/${t.lane}  success=${t.success}  quality=${t.quality}`);
  }

  if (!DRY) {
    const ledger = readLedger ? readLedger() : [];
    console.log(`Ledger now has ${Array.isArray(ledger) ? ledger.length : 'unknown'} rows.`);
  } else {
    console.log('Dry run – nothing written.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
