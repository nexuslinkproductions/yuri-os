import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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
});

test('task-specific evidence contract upgrades memory/RAG work', () => {
  assert.deepEqual(requiredEvidenceIdsForTask('normal Shintai review'), [...SHINTAI_REQUIRED_EVIDENCE_IDS]);
  assert.deepEqual(requiredEvidenceIdsForTask('critical memory RAG skill recall'), [...MEMORY_RAG_REQUIRED_EVIDENCE_IDS]);
});
