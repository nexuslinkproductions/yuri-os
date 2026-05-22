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

test('guardrail proof matrix records fixture readiness without proven claims', () => {
  const matrix = buildGuardrailProofMatrix();

  assert.equal(matrix.schema, 'yuri.cyber-guardrail-proof-matrix.v0');
  assert.equal(matrix.validation.ok, true);
  assert.equal(matrix.validation.proven, 0);
  assert.ok(matrix.validation.fixtureReady >= 7);
  assert.ok(matrix.proofs.every((proof) => proof.proof_state === 'fixture-ready'));
  assert.ok(matrix.proofs.every((proof) => proof.executable_test === null));
});

test('guardrail proof matrix fails closed on unsafe or premature proven rows', () => {
  const matrix = buildGuardrailProofMatrix();
  const unsafe = structuredClone(matrix);
  unsafe.proofs[0].external_targets_allowed = true;
  unsafe.proofs[1].proof_state = 'proven';
  unsafe.proofs[1].executable_test = null;

  const validation = validateGuardrailProofMatrix(unsafe);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /external targets/);
  assert.match(validation.errors.join('\n'), /cannot be proven/);
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
    assert.match(report, /No rail in this matrix is marked proven/);
    assert.match(report, /Prompt Injection Replay Lab/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
