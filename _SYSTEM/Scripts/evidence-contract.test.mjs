import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CYBER_REQUIRED_EVIDENCE_IDS,
  MEMORY_RAG_REQUIRED_EVIDENCE_IDS,
  SHINTAI_REQUIRED_EVIDENCE_IDS,
  requiredEvidenceIdsForTask,
} from './evidence-contract.mjs';

test('evidence contract exposes base and memory/RAG required IDs', () => {
  assert.deepEqual(SHINTAI_REQUIRED_EVIDENCE_IDS, [
    'shintai-roster',
    'yuri-memory-index',
    'extraction-sprint-template',
  ]);
  assert.ok(MEMORY_RAG_REQUIRED_EVIDENCE_IDS.includes('memory-rag-skill-research'));
  assert.ok(MEMORY_RAG_REQUIRED_EVIDENCE_IDS.includes('neurodivergent-engine-handoff'));
  assert.ok(MEMORY_RAG_REQUIRED_EVIDENCE_IDS.includes('msa-readme'));
  assert.ok(CYBER_REQUIRED_EVIDENCE_IDS.includes('cyber-intel-matrix'));
  assert.ok(CYBER_REQUIRED_EVIDENCE_IDS.includes('threat-intel-kernel-source'));
  assert.ok(CYBER_REQUIRED_EVIDENCE_IDS.includes('security-lens-source'));
});

test('task-specific evidence contract upgrades memory/RAG work', () => {
  assert.deepEqual(requiredEvidenceIdsForTask('normal Shintai review'), [...SHINTAI_REQUIRED_EVIDENCE_IDS]);
  assert.deepEqual(requiredEvidenceIdsForTask('critical memory RAG skill recall'), [...MEMORY_RAG_REQUIRED_EVIDENCE_IDS]);
});

test('task-specific evidence contract upgrades cyber intelligence work', () => {
  const required = requiredEvidenceIdsForTask('critical cyber threat intelligence Upgreat sprint');

  assert.ok(required.includes('shintai-roster'));
  assert.ok(required.includes('cyber-company-goal'));
  assert.ok(required.includes('cyber-intel-matrix'));
  assert.ok(required.includes('cyber-intel-ingestion-protocol'));
  assert.ok(required.includes('threat-intel-kernel-source'));
  assert.ok(required.includes('security-lens-source'));
});

test('task-specific evidence contract combines cyber and memory/RAG requirements', () => {
  const required = requiredEvidenceIdsForTask('cyber memory RAG skill threat model');

  assert.ok(required.includes('memory-rag-skill-research'));
  assert.ok(required.includes('cyber-intel-matrix'));
  assert.equal(required.length, new Set(required).size);
});
