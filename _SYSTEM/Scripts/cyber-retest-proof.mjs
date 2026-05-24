#!/usr/bin/env node
/**
 * YURI Cyber Retest Proof v0.
 *
 * Turns local cyber lab fixture pairs into a client-safe before/after proof:
 * threat-shaped fixture is detected before remediation, benign/remediated
 * control passes after. This is deterministic local fixture proof only.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCyberLabs } from './cyber-lab-runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_RETEST_JSON_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'data',
  'cyber-intel',
  'retest-proof-matrix.json',
);
export const DEFAULT_RETEST_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_CYBER_RETEST_PROOF_2026-05-24.md',
);

export const RETEST_PROOF_CLAIM = 'Deterministic local before/after fixture proof passed; retest proof only, not production remediation proof.';

export function buildCyberRetestProof(options = {}) {
  const runs = options.runs || runCyberLabs(options);
  const retests = runs.map(buildRetestRow);
  const validation = validateCyberRetestProof({ retests });

  return {
    schema: 'yuri.cyber-retest-proof.v0',
    generatedAt: new Date().toISOString(),
    source: {
      executable: '_SYSTEM/Scripts/cyber-lab-runner.test.mjs',
      labRuns: runs.length,
    },
    retests,
    validation,
    boundaries: [
      'owned-local-synthetic-or-explicitly-authorized-only',
      'before-after-fixture-proof-not-production-proof',
      'no external target scanning or exploitation',
      'no client remediation guarantee',
    ],
  };
}

export function validateCyberRetestProof(model) {
  const errors = [];
  const retests = model.retests || [];
  if (retests.length < 7) errors.push(`expected at least 7 retest rows, found ${retests.length}`);
  for (const retest of retests) {
    if (!retest.lab_id) errors.push('retest row missing lab_id');
    if (retest.external_targets_allowed !== false) errors.push(`${retest.lab_id} allows external targets`);
    if (!retest.before?.cases?.length) errors.push(`${retest.lab_id} missing before cases`);
    if (!retest.after?.cases?.length) errors.push(`${retest.lab_id} missing after cases`);
    if (retest.before?.pass !== true) errors.push(`${retest.lab_id} before detection did not pass`);
    if (retest.after?.pass !== true) errors.push(`${retest.lab_id} after control did not pass`);
    if (!/fixture proof only|retest proof only/i.test(retest.claim || '')) {
      errors.push(`${retest.lab_id} overclaims beyond fixture/retest proof`);
    }
    if (containsForbiddenClaim(retest)) errors.push(`${retest.lab_id} contains forbidden maturity claim`);
  }
  return {
    ok: errors.length === 0,
    errors,
    proven: retests.filter((retest) => retest.state === 'retest-proven').length,
    failed: retests.filter((retest) => retest.state !== 'retest-proven').length,
  };
}

export function writeCyberRetestProof(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_RETEST_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_RETEST_REPORT_PATH);
  const proof = buildCyberRetestProof(options);
  if (!proof.validation.ok) {
    throw new Error(`Cyber retest proof validation failed: ${proof.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(proof, null, 2)}\n`);
  writeFileSync(reportPath, renderCyberRetestProofMarkdown(proof));
  return { ok: true, jsonPath, reportPath, proof };
}

export function renderCyberRetestProofMarkdown(proof = buildCyberRetestProof()) {
  const rows = proof.retests.map((retest) => [
    `### ${retest.title}`,
    '',
    `- Lab: ${retest.lab_id}`,
    `- State: ${retest.state}`,
    `- Before: ${retest.before.passed}/${retest.before.total} threat-shaped cases detected safely`,
    `- After: ${retest.after.passed}/${retest.after.total} benign/remediated controls passed`,
    `- Claim: ${retest.claim}`,
    `- Boundary: ${retest.boundary}`,
    '',
    'Before cases:',
    ...retest.before.cases.map((item) => `- ${item.id}: ${item.reason}`),
    '',
    'After cases:',
    ...retest.after.cases.map((item) => `- ${item.id}: ${item.reason}`),
  ].join('\n')).join('\n\n');

  return [
    '# YURI Cyber Retest Proof',
    '',
    `Generated: ${proof.generatedAt}`,
    '',
    '## Purpose',
    '',
    'This report proves a client-safe before/after motion: YURI detects a threat-shaped local fixture before remediation and accepts the benign/remediated control after. It is not production proof and does not touch external targets.',
    '',
    '## Boundaries',
    '',
    proof.boundaries.map((boundary) => `- ${boundary}`).join('\n'),
    '',
    '## Retest Rows',
    '',
    rows,
    '',
  ].join('\n');
}

function buildRetestRow(run) {
  const beforeCases = (run.results || []).filter((result) => result.evidence?.expectedThreat === true);
  const afterCases = (run.results || []).filter((result) => result.evidence?.expectedThreat === false);
  const beforePass = beforeCases.length > 0 && beforeCases.every((result) => result.ok === true);
  const afterPass = afterCases.length > 0 && afterCases.every((result) => result.ok === true);
  const state = beforePass && afterPass ? 'retest-proven' : 'retest-failed';
  return {
    lab_id: run.lab_id,
    title: titleForLab(run.lab_id),
    state,
    executable_test: run.executableTest,
    external_targets_allowed: false,
    before: summarizeSide(beforeCases, beforePass),
    after: summarizeSide(afterCases, afterPass),
    claim: state === 'retest-proven'
      ? RETEST_PROOF_CLAIM
      : 'Deterministic local retest proof failed; no proof claim allowed.',
    boundary: 'owned-local-synthetic-or-explicitly-authorized-only',
  };
}

function summarizeSide(cases, pass) {
  return {
    pass,
    passed: cases.filter((result) => result.ok === true).length,
    total: cases.length,
    cases: cases.map((result) => ({
      id: result.case_id,
      ok: result.ok,
      reason: result.reason,
    })),
  };
}

function titleForLab(labId) {
  return String(labId || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function containsForbiddenClaim(value) {
  return /\b(?:production[- ]ready|soc|siem|xdr|mdr|autonomous pentest|guarantee|breach-proof|deployment proof)\b/i
    .test(JSON.stringify(value));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const result = writeCyberRetestProof();
    process.stdout.write(`cyber_retest_json=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`cyber_retest_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildCyberRetestProof(), null, 2)}\n`);
  }
}
