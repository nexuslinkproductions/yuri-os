#!/usr/bin/env node
/**
 * YURI Cyber Guardrail Proof Matrix v0.
 *
 * Converts cyber lab fixtures into explicit proof states. v0 proves only local
 * synthetic fixture behavior. It must not claim deployment security, external
 * target safety, or production maturity from these deterministic checks.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LAB_ROOT, buildCyberLabHarness } from './cyber-lab-harness.mjs';
import { runCyberLab } from './cyber-lab-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_PROOF_JSON_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'data',
  'cyber-intel',
  'guardrail-proof-matrix.json',
);
export const DEFAULT_PROOF_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_GUARDRAIL_PROOF_MATRIX_2026-05-22.md',
);

const RAIL_CATEGORIES = Object.freeze({
  'input-dialog-rail': 'input-dialog',
  'tool-input-output-rail': 'tool-io',
  'browser-action-boundary-rail': 'browser-action',
  'retrieval-memory-provenance-rail': 'retrieval-memory',
  'owned-lab-research-boundary-rail': 'owned-lab-boundary',
  'runtime-health-rail': 'health-runtime',
});

export function buildGuardrailProofMatrix(options = {}) {
  const labRoot = path.resolve(options.labRoot || DEFAULT_LAB_ROOT);
  const harness = options.harness || loadHarness(labRoot);
  const proofs = harness.labs.map((lab) => {
    const fixturePath = path.join(labRoot, lab.fixture);
    const executable = runCyberLab(lab, { labRoot });
    return {
      lab_id: lab.id,
      title: lab.title,
      proof_target: lab.proofTarget,
      rail_category: RAIL_CATEGORIES[lab.proofTarget] || 'unknown',
      proof_state: executable.state,
      executable_test: executable.executableTest,
      fixture: path.relative(REPO_ROOT, fixturePath),
      related_threats: lab.relatedThreats.map((row) => row.threat_id),
      safety_boundary: lab.boundary,
      external_targets_allowed: lab.externalTargetsAllowed,
      proof_results: executable.results,
      claim: executable.claim,
    };
  });
  const validation = validateGuardrailProofMatrix({ proofs });
  return {
    schema: 'yuri.cyber-guardrail-proof-matrix.v0',
    generatedAt: new Date().toISOString(),
    source: {
      labRoot: path.relative(REPO_ROOT, labRoot),
      labCount: harness.labs.length,
    },
    proofs,
    validation,
  };
}

export function validateGuardrailProofMatrix(model) {
  const errors = [];
  for (const proof of model.proofs || []) {
    if (proof.external_targets_allowed !== false) errors.push(`${proof.lab_id} allows external targets`);
    if (!/owned|local|synthetic|authorized/u.test(proof.safety_boundary || '')) {
      errors.push(`${proof.lab_id} missing safe boundary`);
    }
    if (proof.proof_state === 'proven' && !proof.executable_test) {
      errors.push(`${proof.lab_id} cannot be proven without executable_test`);
    }
    if (proof.proof_state === 'proven') {
      if (!Array.isArray(proof.proof_results) || proof.proof_results.length === 0) {
        errors.push(`${proof.lab_id} cannot be proven without proof_results`);
      } else if (proof.proof_results.some((result) => result.ok !== true)) {
        errors.push(`${proof.lab_id} has failing proof_results`);
      }
      if (!/fixture proof only/i.test(proof.claim || '')) {
        errors.push(`${proof.lab_id} proven claim must stay fixture-scoped`);
      }
    }
    if (proof.proof_state === 'failed') errors.push(`${proof.lab_id} deterministic proof failed`);
    if (proof.rail_category === 'unknown') errors.push(`${proof.lab_id} has unknown rail category`);
    if (!proof.related_threats.length) errors.push(`${proof.lab_id} missing related threat links`);
  }
  return {
    ok: errors.length === 0,
    errors,
    fixtureReady: (model.proofs || []).filter((proof) => proof.proof_state === 'fixture-ready').length,
    proven: (model.proofs || []).filter((proof) => proof.proof_state === 'proven').length,
    failed: (model.proofs || []).filter((proof) => proof.proof_state === 'failed').length,
  };
}

export function writeGuardrailProofArtifacts(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_PROOF_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_PROOF_REPORT_PATH);
  const matrix = buildGuardrailProofMatrix(options);
  if (!matrix.validation.ok) {
    throw new Error(`Guardrail proof matrix validation failed: ${matrix.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(matrix, null, 2)}\n`);
  writeFileSync(reportPath, renderGuardrailProofReport(matrix));
  return { ok: true, jsonPath, reportPath, matrix };
}

export function renderGuardrailProofReport(matrix = buildGuardrailProofMatrix()) {
  const lines = matrix.proofs.map((proof) => [
    `### ${proof.title}`,
    '',
    `- Lab: ${proof.lab_id}`,
    `- Rail: ${proof.proof_target} (${proof.rail_category})`,
    `- State: ${proof.proof_state}`,
    `- Fixture: ${proof.fixture}`,
    `- Executable test: ${proof.executable_test || 'none'}`,
    `- Passed cases: ${proof.proof_results.filter((result) => result.ok).length}/${proof.proof_results.length}`,
    `- Threats: ${proof.related_threats.join(', ')}`,
    `- Claim: ${proof.claim}`,
    '',
    'Case evidence:',
    ...proof.proof_results.map((result) => `- ${result.case_id}: ${result.ok ? 'pass' : 'fail'} - ${result.reason}`),
  ].join('\n')).join('\n\n');
  return [
    '# YURI Cyber Guardrail Proof Matrix v0',
    '',
    `Generated: ${matrix.generatedAt}`,
    '',
    '## Status',
    '',
    `- Fixture-ready rails: ${matrix.validation.fixtureReady}`,
    `- Proven rails: ${matrix.validation.proven}`,
    `- Failed rails: ${matrix.validation.failed}`,
    '',
    'Proven means deterministic local fixture proof only. It does not mean production deployment proof, client-environment proof, malware capability, external target testing, or SOC/MDR maturity.',
    '',
    '## Proof Rows',
    '',
    lines,
    '',
  ].join('\n');
}

function loadHarness(labRoot) {
  const manifestPath = path.join(labRoot, 'lab-manifest.json');
  if (existsSync(manifestPath)) return JSON.parse(readFileSync(manifestPath, 'utf8'));
  return buildCyberLabHarness();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const result = writeGuardrailProofArtifacts();
    process.stdout.write(`guardrail_proof_matrix=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`guardrail_proof_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildGuardrailProofMatrix(), null, 2)}\n`);
  }
}
