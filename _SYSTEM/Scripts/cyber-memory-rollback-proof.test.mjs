import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberMemoryRollbackProof,
  validateCyberMemoryRollbackProof,
  writeCyberMemoryRollbackProof,
} from './cyber-memory-rollback-proof.mjs';

test('memory rollback proof resolves the five synthetic rollback cases', () => {
  const proof = buildCyberMemoryRollbackProof();
  const byCase = new Map(proof.cases.map((row) => [row.case_id, row]));

  assert.equal(proof.schema, 'yuri.cyber-memory-rollback-proof.v0');
  assert.equal(proof.validation.ok, true, proof.validation.errors.join('\n'));
  assert.equal(proof.cases.length, 5);
  assert.equal(proof.validation.rolledBack, 3);
  assert.equal(proof.validation.noSnapshot, 1);
  assert.equal(proof.validation.idempotent, 1);

  assert.equal(byCase.get('duplicate-key-rollback').status, 'ROLLED_BACK');
  assert.equal(byCase.get('duplicate-key-rollback').rollback_reason, 'duplicate_key');
  assert.equal(byCase.get('duplicate-key-rollback').final_count, 3);

  assert.equal(byCase.get('no-snapshot-found').status, 'NO_SNAPSHOT_FOUND');
  assert.equal(byCase.get('no-snapshot-found').rollback_reason, 'no_snapshot');
  assert.equal(byCase.get('no-snapshot-found').final_count, 0);

  assert.equal(byCase.get('valid-ingests-then-faulty').status, 'ROLLED_BACK');
  assert.equal(byCase.get('valid-ingests-then-faulty').rollback_reason, 'duplicate_key');
  assert.equal(byCase.get('valid-ingests-then-faulty').final_count, 2);

  assert.equal(byCase.get('idempotent-noop').status, 'NOTHING_TO_ROLLBACK');
  assert.equal(byCase.get('idempotent-noop').rollback_reason, 'duplicate_key');
  assert.equal(byCase.get('idempotent-noop').final_count, 3);

  assert.equal(byCase.get('confidence-threshold-abort').status, 'ROLLED_BACK');
  assert.equal(byCase.get('confidence-threshold-abort').rollback_reason, 'confidence_below_threshold');
  assert.equal(byCase.get('confidence-threshold-abort').final_count, 3);

  assert.ok(proof.cases.every((row) => row.source_is_runtime_authority === false));
  assert.ok(proof.cases.every((row) => row.external_targets_allowed === false));
  assert.ok(proof.cases.every((row) => /rollback proof only/i.test(row.claim)));
});

test('memory rollback validation fails closed on unsafe or malformed proof rows', () => {
  const proof = buildCyberMemoryRollbackProof();
  proof.cases[0].source_is_runtime_authority = true;
  proof.cases[1].external_targets_allowed = true;
  proof.cases[2].ok = false;
  proof.cases[3].claim = 'Production memory safety proof.';
  proof.claim = 'Production memory safety proof.';

  const validation = validateCyberMemoryRollbackProof({
    fixture: {
      boundary: 'owned-local-synthetic-or-explicitly-authorized-only',
      externalTargetsAllowed: false,
    },
    cases: proof.cases,
    claim: proof.claim,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /runtime authority/);
  assert.match(validation.errors.join('\n'), /allows external targets/);
  assert.match(validation.errors.join('\n'), /did not satisfy expected rollback invariant/);
  assert.match(validation.errors.join('\n'), /overclaims/);
  assert.match(validation.errors.join('\n'), /overstates/);
});

test('memory rollback proof writes JSON and markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-memory-rollback-proof-'));
  try {
    const jsonPath = path.join(dir, 'memory-rollback.json');
    const reportPath = path.join(dir, 'memory-rollback.md');
    const result = writeCyberMemoryRollbackProof({ jsonPath, reportPath });
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(json.validation.ok, true);
    assert.match(markdown, /YURI Memory\/RAG Rollback Proof/);
    assert.match(markdown, /duplicate-key-rollback/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
