import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { materializeCyberLabHarness } from './cyber-lab-harness.mjs';
import {
  buildGuardrailProofMatrix,
  validateGuardrailProofMatrix,
  writeGuardrailProofArtifacts,
} from './cyber-guardrail-proof.mjs';

test('guardrail proof matrix proves local deterministic fixture cases only', () => {
  const matrix = buildGuardrailProofMatrix();

  assert.equal(matrix.schema, 'yuri.cyber-guardrail-proof-matrix.v0');
  assert.equal(matrix.validation.ok, true);
  assert.ok(matrix.validation.proven >= 7);
  assert.equal(matrix.validation.fixtureReady, 0);
  assert.ok(matrix.proofs.every((proof) => proof.proof_state === 'proven'));
  assert.ok(matrix.proofs.every((proof) => proof.executable_test === '_SYSTEM/Scripts/cyber-lab-runner.test.mjs'));
  assert.ok(matrix.proofs.every((proof) => proof.proof_results.every((result) => result.ok === true)));
  assert.match(matrix.proofs[0].claim, /Deterministic local fixture proof passed/);
  assert.ok(matrix.proofs.every((proof) => /fixture proof only/i.test(proof.claim)));
  assert.ok(matrix.proofs.every((proof) => proof.external_targets_allowed === false));
  assert.ok(matrix.proofs.every((proof) => /owned|local|synthetic|authorized/u.test(proof.safety_boundary)));
});

test('guardrail proof matrix includes executable evidence for each cyber proof lane', () => {
  const matrix = buildGuardrailProofMatrix();
  const byId = new Map(matrix.proofs.map((proof) => [proof.lab_id, proof]));
  const malicious = (proof) => proof.proof_results.filter((result) => result.evidence.expectedThreat === true);
  const benign = (proof) => proof.proof_results.filter((result) => result.evidence.expectedThreat === false);

  assert.equal(byId.get('prompt-injection-replay').proof_results.length, 3);
  assert.ok(malicious(byId.get('prompt-injection-replay')).every((result) => result.evidence.authorityStripped === true));
  assert.ok(malicious(byId.get('prompt-injection-replay')).every((result) => result.evidence.promptInjectionSignals.length > 0));
  assert.ok(benign(byId.get('prompt-injection-replay')).every((result) => result.evidence.promptInjectionSignals.length === 0));
  assert.equal(byId.get('malicious-mcp-tool-schema').proof_results[0].evidence.trustPromotionDenied, true);
  assert.ok(benign(byId.get('malicious-mcp-tool-schema')).every((result) => result.evidence.toolPoisoningSignals.length === 0));
  assert.equal(byId.get('browser-agent-fake-portal').proof_results[0].evidence.noSubmitAction, true);
  assert.ok(benign(byId.get('browser-agent-fake-portal')).every((result) => result.evidence.browserDomPoisoningSignals.length === 0));
  assert.equal(byId.get('memory-poisoning-corpus').proof_results[0].evidence.promotionDenied, true);
  assert.ok(benign(byId.get('memory-poisoning-corpus')).every((result) => result.evidence.memoryPoisoningSignals.length === 0));
  assert.equal(byId.get('rag-poisoning-corpus').proof_results[0].evidence.retrievalRail, 'retrieval');
  assert.ok(benign(byId.get('rag-poisoning-corpus')).every((result) => result.evidence.retrievalPoisoningSignals.length === 0));
  assert.equal(byId.get('vulnerable-api-cases').proof_results[0].evidence.noNetworkExecution, true);
  assert.ok(benign(byId.get('vulnerable-api-cases')).every((result) => result.evidence.ownedApiFlawSignals.length === 0));
  assert.equal(byId.get('local-load-test-plan').proof_results[0].evidence.noExternalTarget, true);
  assert.ok(benign(byId.get('local-load-test-plan')).every((result) => result.evidence.localAvailabilityBoundarySignals.length === 0));
});

test('guardrail proof matrix fails closed on unsafe or premature proven rows', () => {
  const matrix = buildGuardrailProofMatrix();
  const unsafe = structuredClone(matrix);
  unsafe.proofs[0].external_targets_allowed = true;
  unsafe.proofs[1].proof_state = 'proven';
  unsafe.proofs[1].executable_test = null;
  unsafe.proofs[2].claim = 'Production guardrail is proven.';
  unsafe.proofs[3].proof_results[0].ok = false;

  const validation = validateGuardrailProofMatrix(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /external targets/);
  assert.match(validation.errors.join('\n'), /cannot be proven/);
  assert.match(validation.errors.join('\n'), /fixture-scoped/);
  assert.match(validation.errors.join('\n'), /failing proof_results/);
});

test('guardrail proof artifacts write JSON and markdown', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-guardrail-proof-'));
  try {
    materializeCyberLabHarness({ labRoot: path.join(dir, 'labs') });
    const result = writeGuardrailProofArtifacts({
      labRoot: path.join(dir, 'labs'),
      jsonPath: path.join(dir, 'guardrail-proof.json'),
      reportPath: path.join(dir, 'guardrail-proof.md'),
    });
    const report = readFileSync(result.reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(result.jsonPath), true);
    assert.equal(existsSync(result.reportPath), true);
    assert.match(report, /Proven rails:/);
    assert.match(report, /fixture proof only/);
    assert.match(report, /Prompt Injection Replay Lab/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
