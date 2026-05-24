import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberRagConflictProof,
  validateCyberRagConflictProof,
  writeCyberRagConflictProof,
} from './cyber-rag-conflict-proof.mjs';

test('RAG conflict proof resolves the five synthetic conflict cases', () => {
  const proof = buildCyberRagConflictProof();
  const byCase = new Map(proof.resolutions.map((row) => [row.case_id, row]));

  assert.equal(proof.schema, 'yuri.cyber-rag-conflict-proof.v0');
  assert.equal(proof.validation.ok, true, proof.validation.errors.join('\n'));
  assert.equal(proof.resolutions.length, 5);
  assert.equal(proof.validation.ambiguous, 1);
  assert.equal(proof.validation.unverified, 1);

  assert.equal(byCase.get('single-high-winner').resolution, 'adopt_high_confidence');
  assert.equal(byCase.get('single-high-winner').severity, 'Critical');
  assert.equal(byCase.get('single-high-winner').final_source_id, 'xylon-vendor-critical');
  assert.equal(byCase.get('single-high-winner').conflict_log.length, 0);

  assert.equal(byCase.get('two-high-conflict').resolution, 'ambiguous_high_conflict');
  assert.equal(byCase.get('two-high-conflict').severity, 'AMBIGUOUS');
  assert.equal(byCase.get('two-high-conflict').conflict_log.length, 2);

  assert.equal(byCase.get('medium-only-winner').resolution, 'adopt_medium_confidence');
  assert.equal(byCase.get('medium-only-winner').final_source_id, 'xylon-medium-a');

  assert.equal(byCase.get('low-only-unverified').resolution, 'unverified_low_confidence_only');
  assert.equal(byCase.get('low-only-unverified').severity, 'UNVERIFIED');
  assert.equal(byCase.get('low-only-unverified').low_evidence_sources.length, 2);

  assert.equal(byCase.get('unanimous-noop').resolution, 'adopt_unanimous');
  assert.equal(byCase.get('unanimous-noop').severity, 'Medium');
  assert.equal(byCase.get('unanimous-noop').final_source_id, 'zephyr-cisa-copy');

  assert.ok(proof.resolutions.every((row) => row.source_is_runtime_authority === false));
  assert.ok(proof.resolutions.every((row) => row.external_targets_allowed === false));
});

test('RAG conflict validation fails closed on unsafe or malformed proof rows', () => {
  const proof = buildCyberRagConflictProof();
  proof.resolutions[0].source_is_runtime_authority = true;
  proof.resolutions[1].conflict_log = [];
  proof.resolutions[2].external_targets_allowed = true;
  proof.resolutions[3].low_evidence_sources = [];
  proof.claim = 'Production RAG security proof.';

  const validation = validateCyberRagConflictProof(proof);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /runtime authority/);
  assert.match(validation.errors.join('\n'), /ambiguous result missing conflict_log/);
  assert.match(validation.errors.join('\n'), /allows external targets/);
  assert.match(validation.errors.join('\n'), /unverified result missing low evidence/);
  assert.match(validation.errors.join('\n'), /overstates/);
});

test('RAG conflict proof writes JSON and markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-rag-conflict-proof-'));
  try {
    const jsonPath = path.join(dir, 'rag-conflict.json');
    const reportPath = path.join(dir, 'rag-conflict.md');
    const result = writeCyberRagConflictProof({ jsonPath, reportPath });
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(json.validation.ok, true);
    assert.match(markdown, /YURI RAG Conflict Proof/);
    assert.match(markdown, /two-high-conflict/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
