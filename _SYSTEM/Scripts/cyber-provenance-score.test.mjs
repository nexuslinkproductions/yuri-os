import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildCyberProvenanceScore,
  validateCyberProvenanceScore,
  writeCyberProvenanceScore,
} from './cyber-provenance-score.mjs';

test('cyber provenance score builds deterministic memory and RAG rows', () => {
  const proof = buildCyberProvenanceScore();
  const byCase = new Map(proof.rows.map((row) => [row.case_id, row]));

  assert.equal(proof.schema, 'yuri.cyber-provenance-score.v0');
  assert.equal(proof.validation.ok, true);
  assert.equal(proof.rows.length, 4);
  assert.equal(proof.validation.quarantined, 2);
  assert.equal(proof.validation.allowed, 2);

  assert.equal(byCase.get('gradual-drift').source_type, 'memory');
  assert.equal(byCase.get('gradual-drift').decision, 'quarantine_memory_promotion');
  assert.equal(byCase.get('gradual-drift').usable_as_evidence, false);
  assert.ok(byCase.get('gradual-drift').provenance_score < 50);
  assert.ok(byCase.get('gradual-drift').signals.includes('memory-evidence-gate-bypass'));

  assert.equal(byCase.get('hostile-doc').source_type, 'rag');
  assert.equal(byCase.get('hostile-doc').decision, 'quarantine_retrieval_authority_claim');
  assert.equal(byCase.get('hostile-doc').source_is_runtime_authority, false);
  assert.ok(byCase.get('hostile-doc').signals.includes('retrieved-authority-claim'));

  assert.equal(byCase.get('normal-memory-note').decision, 'allow_audited_memory_review');
  assert.equal(byCase.get('normal-memory-note').usable_as_evidence, true);
  assert.equal(byCase.get('normal-source-note').decision, 'allow_content_citation_review');
  assert.ok(byCase.get('normal-source-note').provenance_score >= 80);
});

test('cyber provenance validation fails closed on authority promotion and bad scores', () => {
  const proof = buildCyberProvenanceScore();
  const byCase = new Map(proof.rows.map((row) => [row.case_id, row]));
  byCase.get('gradual-drift').source_is_runtime_authority = true;
  byCase.get('gradual-drift').provenance_score = 90;
  byCase.get('hostile-doc').decision = 'allow_unreviewed_source';
  byCase.get('normal-source-note').signals = ['unexpected-benign-signal'];
  proof.claim = 'Production RAG security proof.';

  const validation = validateCyberProvenanceScore(proof);

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join('\n'), /runtime authority/);
  assert.match(validation.errors.join('\n'), /hostile fixture score is too high/);
  assert.match(validation.errors.join('\n'), /hostile fixture is not quarantined/);
  assert.match(validation.errors.join('\n'), /benign fixture has poisoning signals/);
  assert.match(validation.errors.join('\n'), /overstates/);
});

test('cyber provenance score writes JSON and markdown artifacts', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yuri-cyber-provenance-score-'));
  try {
    const jsonPath = path.join(dir, 'provenance.json');
    const reportPath = path.join(dir, 'provenance.md');
    const result = writeCyberProvenanceScore({ jsonPath, reportPath });
    const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const markdown = readFileSync(reportPath, 'utf8');

    assert.equal(result.ok, true);
    assert.equal(existsSync(jsonPath), true);
    assert.equal(json.validation.ok, true);
    assert.match(markdown, /YURI Provenance Score Matrix/);
    assert.match(markdown, /Quarantined: 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
