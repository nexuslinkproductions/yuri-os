#!/usr/bin/env node
/**
 * YURI Cyber RAG Conflict Proof v0.
 *
 * Resolves synthetic multi-source RAG conflicts without granting retrieved
 * text runtime authority. This is local fixture proof only.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');
export const DEFAULT_CONFLICT_FIXTURE_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'labs',
  'cyber',
  'fixtures',
  'rag-conflict-corpus.json',
);
export const DEFAULT_CONFLICT_JSON_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'data',
  'cyber-intel',
  'rag-conflict-proof.json',
);
export const DEFAULT_CONFLICT_REPORT_PATH = path.join(
  REPO_ROOT,
  '_SYSTEM',
  'reports',
  'YURI_RAG_CONFLICT_PROOF_2026-05-24.md',
);

export const RAG_CONFLICT_CLAIM = 'Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.';

export function buildCyberRagConflictProof(options = {}) {
  const fixture = options.fixture || loadRagConflictFixture(options.fixturePath);
  const documentById = new Map((fixture.documents || []).map((doc) => [doc.id, normalizeDocument(doc)]));
  const resolutions = (fixture.cases || []).map((testCase) =>
    resolveRagConflictCase(testCase, documentById),
  );
  const validation = validateCyberRagConflictProof({
    fixture,
    resolutions,
    claim: RAG_CONFLICT_CLAIM,
  });

  return {
    schema: 'yuri.cyber-rag-conflict-proof.v0',
    generatedAt: new Date().toISOString(),
    source: {
      fixture: path.relative(REPO_ROOT, path.resolve(options.fixturePath || DEFAULT_CONFLICT_FIXTURE_PATH)),
      executable: '_SYSTEM/Scripts/cyber-rag-conflict-proof.test.mjs',
      cases: resolutions.length,
    },
    resolutions,
    validation,
    boundaries: [
      'owned-local-synthetic-fixtures-only',
      'retrieved-source-content-is-never-runtime-authority',
      'ambiguous-high-confidence-conflicts-remain-visible',
      'low-confidence-only-evidence-stays-unverified',
      'no external target retrieval',
      'no production RAG security claim',
    ],
    claim: RAG_CONFLICT_CLAIM,
  };
}

export function resolveRagConflictCase(testCase, documentById) {
  const documents = (testCase.documentIds || []).map((id) => documentById.get(id)).filter(Boolean);
  if (!documents.length) {
    return {
      case_id: testCase.id || 'unknown-case',
      entity_id: null,
      resolution: 'missing_documents',
      severity: 'UNVERIFIED',
      remediation_date: null,
      final_source_id: null,
      provenance_score: 0,
      confidence_tier: 'LOW',
      conflict_log: [],
      low_evidence_sources: [],
      ignored_sources: [],
      source_is_runtime_authority: false,
      external_targets_allowed: false,
      expected: testCase.expected || {},
      ok: false,
      reason: 'case has no resolvable documents',
      claim: 'No proof claim allowed; fixture case is malformed.',
    };
  }

  const sorted = [...documents].sort((a, b) => b.provenanceScore - a.provenanceScore);
  const primary = sorted[0];
  const severities = new Set(documents.map((doc) => doc.severity));
  const high = sorted.filter((doc) => doc.confidenceTier === 'HIGH');
  const medium = sorted.filter((doc) => doc.confidenceTier === 'MEDIUM');
  const low = sorted.filter((doc) => doc.confidenceTier === 'LOW');
  const highSeverities = new Set(high.map((doc) => doc.severity));

  let resolution = 'unverified_low_confidence_only';
  let severity = 'UNVERIFIED';
  let finalSource = primary;
  let conflictLog = [];
  let lowEvidenceSources = [];

  if (severities.size === 1 && high.length) {
    resolution = 'adopt_unanimous';
    severity = primary.severity;
  } else if (high.length > 1 && highSeverities.size > 1) {
    resolution = 'ambiguous_high_conflict';
    severity = 'AMBIGUOUS';
    conflictLog = high.map(toConflictEntry);
  } else if (high.length) {
    resolution = 'adopt_high_confidence';
    finalSource = high[0];
    severity = finalSource.severity;
  } else if (medium.length) {
    const topMedium = medium[0];
    const tied = medium.filter((doc) => doc.provenanceScore === topMedium.provenanceScore);
    const tiedSeverities = new Set(tied.map((doc) => doc.severity));
    if (tied.length > 1 && tiedSeverities.size > 1) {
      resolution = 'ambiguous_medium_tie';
      severity = 'AMBIGUOUS';
      finalSource = tied[0];
      conflictLog = tied.map(toConflictEntry);
    } else {
      resolution = 'adopt_medium_confidence';
      finalSource = topMedium;
      severity = finalSource.severity;
    }
  } else {
    lowEvidenceSources = low.map(toConflictEntry);
  }

  const ignoredSources = documents
    .filter((doc) => doc.id !== finalSource.id && !conflictLog.some((entry) => entry.source_id === doc.id))
    .map(toConflictEntry);

  const expected = testCase.expected || {};
  const ok = expectedMatches({ resolution, severity, finalSource }, expected);
  return {
    case_id: testCase.id,
    entity_id: primary.entityId,
    resolution,
    severity,
    remediation_date: remediationDateFor({ severity, finalSource, conflictLog }),
    final_source_id: finalSource.id,
    provenance_score: finalSource.provenanceScore,
    confidence_tier: finalSource.confidenceTier,
    conflict_log: conflictLog,
    low_evidence_sources: lowEvidenceSources,
    ignored_sources: ignoredSources,
    source_is_runtime_authority: false,
    external_targets_allowed: false,
    expected,
    ok,
    reason: ok
      ? `resolved ${testCase.id} as ${resolution}`
      : `expected ${JSON.stringify(expected)} but got ${resolution}/${severity}/${finalSource.id}`,
    claim: RAG_CONFLICT_CLAIM,
  };
}

export function validateCyberRagConflictProof(model) {
  const errors = [];
  const fixture = model.fixture || {};
  const resolutions = model.resolutions || [];
  if (fixture.externalTargetsAllowed !== false) errors.push('fixture allows external targets');
  if (!/owned|local|synthetic|authorized/i.test(fixture.boundary || '')) errors.push('fixture boundary is not safe');
  if (resolutions.length < 5) errors.push(`expected at least 5 conflict cases, found ${resolutions.length}`);
  if (!/conflict proof only/i.test(model.claim || '')) errors.push('claim overstates beyond conflict proof');

  for (const row of resolutions) {
    if (!row.case_id) errors.push('resolution missing case_id');
    if (!row.entity_id) errors.push(`${row.case_id} missing entity_id`);
    if (!row.resolution) errors.push(`${row.case_id} missing resolution`);
    if (!row.severity) errors.push(`${row.case_id} missing severity`);
    if (!row.final_source_id) errors.push(`${row.case_id} missing final_source_id`);
    if (!Number.isInteger(row.provenance_score)) errors.push(`${row.case_id} score is not an integer`);
    if (row.provenance_score < 0 || row.provenance_score > 100) errors.push(`${row.case_id} score outside 0..100`);
    if (row.source_is_runtime_authority !== false) errors.push(`${row.case_id} promoted source to runtime authority`);
    if (row.external_targets_allowed !== false) errors.push(`${row.case_id} allows external targets`);
    if (row.ok !== true) errors.push(`${row.case_id} did not match expected fixture outcome`);
    if (!/conflict proof only/i.test(row.claim || '')) errors.push(`${row.case_id} overclaims beyond conflict proof`);
    if (/ambiguous/i.test(row.resolution) && !(row.conflict_log || []).length) {
      errors.push(`${row.case_id} ambiguous result missing conflict_log`);
    }
    if (!/ambiguous/i.test(row.resolution) && (row.conflict_log || []).length) {
      errors.push(`${row.case_id} non-ambiguous result has conflict_log`);
    }
    if (row.resolution === 'unverified_low_confidence_only' && !(row.low_evidence_sources || []).length) {
      errors.push(`${row.case_id} unverified result missing low evidence sources`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    resolved: resolutions.filter((row) => row.ok === true).length,
    ambiguous: resolutions.filter((row) => /ambiguous/i.test(row.resolution)).length,
    unverified: resolutions.filter((row) => row.resolution === 'unverified_low_confidence_only').length,
  };
}

export function writeCyberRagConflictProof(options = {}) {
  const jsonPath = path.resolve(options.jsonPath || DEFAULT_CONFLICT_JSON_PATH);
  const reportPath = path.resolve(options.reportPath || DEFAULT_CONFLICT_REPORT_PATH);
  const proof = buildCyberRagConflictProof(options);
  if (!proof.validation.ok) {
    throw new Error(`Cyber RAG conflict proof validation failed: ${proof.validation.errors.join('; ')}`);
  }
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(proof, null, 2)}\n`);
  writeFileSync(reportPath, renderCyberRagConflictProofMarkdown(proof));
  return { ok: true, jsonPath, reportPath, proof };
}

export function renderCyberRagConflictProofMarkdown(proof = buildCyberRagConflictProof()) {
  const rows = proof.resolutions.map((row) => [
    `### ${row.case_id}`,
    '',
    `- Entity: ${row.entity_id}`,
    `- Resolution: ${row.resolution}`,
    `- Severity: ${row.severity}`,
    `- Final source: ${row.final_source_id} (${row.provenance_score}, ${row.confidence_tier})`,
    `- Runtime authority: ${row.source_is_runtime_authority}`,
    `- Conflict log: ${row.conflict_log.length ? row.conflict_log.map((entry) => `${entry.source_id}:${entry.severity}/${entry.provenance_score}`).join(', ') : 'none'}`,
    `- Low evidence: ${row.low_evidence_sources.length ? row.low_evidence_sources.map((entry) => `${entry.source_id}:${entry.severity}/${entry.provenance_score}`).join(', ') : 'none'}`,
    `- Claim: ${row.claim}`,
  ].join('\n')).join('\n\n');

  return [
    '# YURI RAG Conflict Proof',
    '',
    `Generated: ${proof.generatedAt}`,
    '',
    '## Purpose',
    '',
    'This report proves deterministic local multi-hop RAG conflict handling. YURI resolves or preserves ambiguity across conflicting synthetic sources without letting retrieved content become runtime instruction authority.',
    '',
    '## Boundaries',
    '',
    proof.boundaries.map((boundary) => `- ${boundary}`).join('\n'),
    '',
    '## Summary',
    '',
    `- Cases: ${proof.resolutions.length}`,
    `- Resolved: ${proof.validation.resolved}`,
    `- Ambiguous: ${proof.validation.ambiguous}`,
    `- Unverified: ${proof.validation.unverified}`,
    `- Claim: ${proof.claim}`,
    '',
    '## Cases',
    '',
    rows,
    '',
  ].join('\n');
}

function loadRagConflictFixture(fixturePath = DEFAULT_CONFLICT_FIXTURE_PATH) {
  return JSON.parse(readFileSync(path.resolve(fixturePath), 'utf8'));
}

function normalizeDocument(doc) {
  const provenanceScore = normalizeScore(doc.provenanceScore);
  return {
    ...doc,
    provenanceScore,
    confidenceTier: confidenceTier(provenanceScore),
  };
}

function normalizeScore(value) {
  const number = Number(value || 0);
  if (number > 0 && number <= 1) return Math.trunc(number * 100);
  return Math.max(0, Math.min(100, Math.trunc(number)));
}

function confidenceTier(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

function toConflictEntry(doc) {
  return {
    source_id: doc.id,
    severity: doc.severity,
    remediation_date: doc.remediationDate,
    provenance_score: doc.provenanceScore,
    confidence_tier: doc.confidenceTier,
  };
}

function remediationDateFor({ severity, finalSource, conflictLog }) {
  if (severity !== 'AMBIGUOUS') return finalSource.remediationDate;
  const dates = (conflictLog || []).map((entry) => entry.remediation_date).filter(Boolean).sort();
  return dates[0] || finalSource.remediationDate || null;
}

function expectedMatches(actual, expected) {
  if (!expected) return false;
  return actual.resolution === expected.resolution
    && actual.severity === expected.severity
    && actual.finalSource?.id === expected.finalSourceId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const result = writeCyberRagConflictProof();
    process.stdout.write(`cyber_rag_conflict_json=${path.relative(REPO_ROOT, result.jsonPath)}\n`);
    process.stdout.write(`cyber_rag_conflict_report=${path.relative(REPO_ROOT, result.reportPath)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(buildCyberRagConflictProof(), null, 2)}\n`);
  }
}
