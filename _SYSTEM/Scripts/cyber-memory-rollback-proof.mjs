#!/usr/bin/env node
/**
 * YURI Cyber Memory/RAG Rollback Proof v0.
 *
 * Demonstrates synthetic in-memory rollback behavior for poisoned memory/RAG
 * candidates. This never reads or writes live memory stores.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_ROLLBACK_FIXTURE_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'labs',
  'cyber',
  'fixtures',
  'memory-rollback-corpus.json',
);
export const DEFAULT_ROLLBACK_JSON_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'data',
  'cyber-intel',
  'memory-rollback-proof.json',
);
export const DEFAULT_ROLLBACK_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_MEMORY_ROLLBACK_PROOF_2026-05-24.md',
);

export const MEMORY_ROLLBACK_CLAIM = 'Deterministic local memory/RAG rollback proof only; not production memory safety proof.';
const MIN_PROVENANCE_SCORE = 40;

export function buildCyberMemoryRollbackProof(options = {}) {
  const fixture = options.fixture || loadRollbackFixture(options.fixturePath);
  const cases = (fixture.cases || []).map((testCase) => simulateRollbackCase(testCase, fixture));
  const validation = validateCyberMemoryRollbackProof({
    fixture,
    cases,
    claim: MEMORY_ROLLBACK_CLAIM,
  });

  return {
    schema: 'yuri.cyber-memory-rollback-proof.v0',
    generatedAt: new Date().toISOString(),
    source: {
      fixture: path.relative(REPO_ROOT, path.resolve(options.fixturePath || DEFAULT_ROLLBACK_FIXTURE_PATH)),
      executable: '_SYSTEM/Scripts/cyber-memory-rollback-proof.test.mjs',
      cases: cases.length,
    },
    cases,
    validation,
    boundaries: [
      'owned-local-synthetic-fixtures-only',
      'in-memory-simulation-only',
      'no protected memory runtime reads',
      'no live memory writes',
      'no production memory safety claim',
    ],
    claim: MEMORY_ROLLBACK_CLAIM,
  };
}

export function simulateRollbackCase(testCase, fixture) {
  const store = createMemoryStore(initialJournalFor(testCase, fixture));
  for (const entry of testCase.validIngests || []) {
    store.ingest(entry, { allowDuplicate: false, lowConfidenceAbort: false });
  }

  const before = store.snapshot();
  const transaction = buildTransaction(testCase, before);
  const applyFaultBeforeRollback = testCase.id !== 'no-snapshot-found';
  const ingestResult = store.ingest(testCase.faultyIngest, {
    allowDuplicate: true,
    lowConfidenceAbort: !applyFaultBeforeRollback,
  });

  let rollbackResult = null;
  if (testCase.id === 'no-snapshot-found') {
    rollbackResult = store.rollback(null, transaction.rollback_reason);
  } else if (ingestResult.status === 'LOW_CONFIDENCE_ABORT') {
    rollbackResult = store.rollback(transaction, 'confidence_below_threshold');
  } else if (ingestResult.status === 'APPLIED') {
    rollbackResult = store.rollback(transaction, transaction.rollback_reason);
  }

  let finalStatus = rollbackResult?.status || ingestResult.status;
  if (testCase.repeatRollback) {
    const secondRollback = store.rollback(transaction, transaction.rollback_reason);
    finalStatus = secondRollback.status;
  }

  const finalJournal = store.getJournal();
  const expected = testCase.expected || {};
  const restoredSnapshotMatches = stableHash(finalJournal) === transaction.snapshot_id;
  const faultyAbsent = !finalJournal.some((entry) =>
    entry.id === testCase.faultyIngest?.id && entry.content === testCase.faultyIngest?.content,
  );
  const timestampsPreserved = timestampsFor(finalJournal).join('|') === timestampsFor(transaction.prev_state).join('|');
  const ok = finalStatus === expected.status
    && (rollbackResult?.rollback_reason || transaction.rollback_reason) === expected.rollbackReason
    && finalJournal.length === expected.finalCount
    && faultyAbsent
    && (expected.status === 'NO_SNAPSHOT_FOUND' || restoredSnapshotMatches || testCase.repeatRollback)
    && (expected.status === 'NO_SNAPSHOT_FOUND' || timestampsPreserved || testCase.start === 'empty');

  return {
    case_id: testCase.id,
    status: finalStatus,
    rollback_reason: rollbackResult?.rollback_reason || transaction.rollback_reason,
    rollback_id: transaction.rollback_id,
    snapshot_id: transaction.snapshot_id,
    before_count: before.length,
    after_fault_count: ingestResult.afterCount,
    final_count: finalJournal.length,
    restored_snapshot_matches: restoredSnapshotMatches,
    faulty_absent: faultyAbsent,
    timestamps_preserved: timestampsPreserved,
    source_is_runtime_authority: false,
    external_targets_allowed: false,
    expected,
    ok,
    reason: ok
      ? `rollback case ${testCase.id} preserved the synthetic memory boundary`
      : `rollback case ${testCase.id} failed expected ${JSON.stringify(expected)}`,
    claim: MEMORY_ROLLBACK_CLAIM,
  };
}

export function validateCyberMemoryRollbackProof(model) {
  const errors = [];
  const fixture = model.fixture || {};
  const cases = model.cases || [];
  if (fixture.externalTargetsAllowed !== false) errors.push('fixture allows external targets');
  if (!/owned|local|synthetic|authorized/i.test(fixture.boundary || '')) errors.push('fixture boundary is not safe');
  if (cases.length < 5) errors.push(`expected at least 5 rollback cases, found ${cases.length}`);
  if (!/rollback proof only/i.test(model.claim || '')) errors.push('claim overstates beyond rollback proof');

  for (const row of cases) {
    if (!row.case_id) errors.push('rollback row missing case_id');
    if (!row.status) errors.push(`${row.case_id} missing status`);
    if (!row.rollback_reason) errors.push(`${row.case_id} missing rollback_reason`);
    if (!row.snapshot_id) errors.push(`${row.case_id} missing snapshot_id`);
    if (row.source_is_runtime_authority !== false) errors.push(`${row.case_id} promoted source to runtime authority`);
    if (row.external_targets_allowed !== false) errors.push(`${row.case_id} allows external targets`);
    if (row.ok !== true) errors.push(`${row.case_id} did not satisfy expected rollback invariant`);
    if (row.status !== 'NO_SNAPSHOT_FOUND' && row.faulty_absent !== true) errors.push(`${row.case_id} faulty ingest remains after rollback`);
    if (!/rollback proof only/i.test(row.claim || '')) errors.push(`${row.case_id} overclaims beyond rollback proof`);
  }

  return {
    ok: errors.length === 0,
    errors,
    rolledBack: cases.filter((row) => row.status === 'ROLLED_BACK').length,
    noSnapshot: cases.filter((row) => row.status === 'NO_SNAPSHOT_FOUND').length,
    idempotent: cases.filter((row) => row.status === 'NOTHING_TO_ROLLBACK').length,
  };
}

export function writeCyberMemoryRollbackProof(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_ROLLBACK_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_ROLLBACK_REPORT_PATH);
  const proof = buildCyberMemoryRollbackProof(options);
  if (!proof.validation.ok) {
    throw new Error(`Cyber memory rollback proof validation failed: ${proof.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(proof, null, 2)}\n`);
  writeFileSync(reportPath, renderCyberMemoryRollbackProofMarkdown(proof));
  return { ok: true, jsonPath, reportPath, proof };
}

export function renderCyberMemoryRollbackProofMarkdown(proof = buildCyberMemoryRollbackProof()) {
  const rows = proof.cases.map((row) => [
    `### ${row.case_id}`,
    '',
    `- Status: ${row.status}`,
    `- Reason: ${row.rollback_reason}`,
    `- Before count: ${row.before_count}`,
    `- After fault count: ${row.after_fault_count}`,
    `- Final count: ${row.final_count}`,
    `- Restored snapshot: ${row.restored_snapshot_matches}`,
    `- Faulty absent: ${row.faulty_absent}`,
    `- Runtime authority: ${row.source_is_runtime_authority}`,
    `- Claim: ${row.claim}`,
  ].join('\n')).join('\n\n');

  return [
    '# YURI Memory/RAG Rollback Proof',
    '',
    `Generated: ${proof.generatedAt}`,
    '',
    '## Purpose',
    '',
    'This report proves deterministic local rollback behavior for poisoned memory/RAG candidates. It is an in-memory simulation and does not touch live memory runtime files.',
    '',
    '## Boundaries',
    '',
    proof.boundaries.map((boundary) => `- ${boundary}`).join('\n'),
    '',
    '## Summary',
    '',
    `- Cases: ${proof.cases.length}`,
    `- Rolled back: ${proof.validation.rolledBack}`,
    `- No snapshot: ${proof.validation.noSnapshot}`,
    `- Idempotent no-op: ${proof.validation.idempotent}`,
    `- Claim: ${proof.claim}`,
    '',
    '## Cases',
    '',
    rows,
    '',
  ].join('\n');
}

function loadRollbackFixture(fixturePath = DEFAULT_ROLLBACK_FIXTURE_PATH) {
  return JSON.parse(readFileSync(path.resolve(fixturePath), 'utf8'));
}

function initialJournalFor(testCase, fixture) {
  if (testCase.start === 'empty') return [];
  return fixture.journal || [];
}

function createMemoryStore(seed = []) {
  let journal = clone(seed);
  let lastRollbackSnapshot = null;
  return {
    getJournal() {
      return clone(journal);
    },
    snapshot() {
      const snapshot = clone(journal);
      lastRollbackSnapshot = snapshot;
      return snapshot;
    },
    ingest(entry, options = {}) {
      const normalized = normalizeEntry(entry);
      if (options.lowConfidenceAbort && normalized.provenanceScore < MIN_PROVENANCE_SCORE) {
        return { status: 'LOW_CONFIDENCE_ABORT', afterCount: journal.length };
      }
      if (!options.allowDuplicate && journal.some((existing) => existing.id === normalized.id)) {
        return { status: 'DUPLICATE_DENIED', afterCount: journal.length };
      }
      journal.push(normalized);
      return { status: 'APPLIED', afterCount: journal.length };
    },
    rollback(transaction, reason) {
      if (!transaction || !lastRollbackSnapshot) {
        return { status: 'NO_SNAPSHOT_FOUND', rollback_reason: 'no_snapshot' };
      }
      if (stableHash(journal) === transaction.snapshot_id) {
        return { status: 'NOTHING_TO_ROLLBACK', rollback_reason: reason };
      }
      journal = clone(transaction.prev_state);
      return { status: 'ROLLED_BACK', rollback_reason: reason };
    },
  };
}

function buildTransaction(testCase, before) {
  return {
    rollback_id: `rollback-${testCase.id}`,
    snapshot_id: stableHash(before),
    prev_state: clone(before),
    ingesting_entry: clone(testCase.faultyIngest || {}),
    rollback_reason: rollbackReasonFor(testCase, before),
  };
}

function rollbackReasonFor(testCase, before) {
  const entry = normalizeEntry(testCase.faultyIngest || {});
  if (entry.provenanceScore < MIN_PROVENANCE_SCORE && !before.some((existing) => existing.id === entry.id)) {
    return 'confidence_below_threshold';
  }
  if (before.some((existing) => existing.id === entry.id)) return 'duplicate_key';
  return 'schema_violation';
}

function normalizeEntry(entry) {
  return {
    ...entry,
    provenanceScore: normalizeScore(entry.provenanceScore),
  };
}

function normalizeScore(value) {
  const number = Number(value || 0);
  if (number > 0 && number <= 1) return Math.trunc(number * 100);
  return Math.max(0, Math.min(100, Math.trunc(number)));
}

function timestampsFor(journal) {
  return (journal || []).map((entry) => entry.timestamp || '');
}

function stableHash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const result = writeCyberMemoryRollbackProof();
    process.stdout.write(`cyber_memory_rollback_json=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`cyber_memory_rollback_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildCyberMemoryRollbackProof(), null, 2)}\n`);
  }
}
