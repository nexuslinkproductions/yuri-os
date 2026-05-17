#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultDb = path.join(repoRoot, '_SYSTEM', 'OS_KERNEL', 'memory.db');
const artifactAudit = path.join(__dirname, 'yuri-artifact-audit.mjs');
const canonicalImport = path.join(__dirname, 'yuri-canonical-memory-import.mjs');

const usage = [
  'Usage:',
  '  node _SYSTEM/Scripts/yuri-proving-run-repeatable.mjs --run-root dir [--db file] [--timeout-ms n] [--concurrency n] [--contradictions-reviewed]',
  '',
  'Regenerates reference verification, link cleanup, claim graph, promotion gate, canonical import dry-run, rollback rehearsal against a copied DB, and final report.',
].join('\n');

const options = parseArgs(process.argv.slice(2));

try {
  const result = runProvingRun(options);
  writeJson(result);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(args) {
  const parsed = {
    runRoot: '',
    db: defaultDb,
    timeoutMs: 8000,
    concurrency: 4,
    contradictionsReviewed: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--run-root') parsed.runRoot = path.resolve(requireValue(args, ++index, '--run-root'));
    else if (arg === '--db') parsed.db = path.resolve(requireValue(args, ++index, '--db'));
    else if (arg === '--timeout-ms') parsed.timeoutMs = Number(requireValue(args, ++index, '--timeout-ms'));
    else if (arg === '--concurrency') parsed.concurrency = Number(requireValue(args, ++index, '--concurrency'));
    else if (arg === '--contradictions-reviewed') parsed.contradictionsReviewed = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage}`);
  }
  if (!parsed.runRoot) throw new Error(`--run-root is required\n${usage}`);
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive number');
  if (!Number.isFinite(parsed.concurrency) || parsed.concurrency <= 0) throw new Error('--concurrency must be a positive number');
  parsed.concurrency = Math.min(12, Math.max(1, Math.floor(parsed.concurrency)));
  return parsed;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function runProvingRun({ runRoot, db, timeoutMs, concurrency, contradictionsReviewed }) {
  assertExisting(runRoot, 'run root');
  const artifacts = pathsFor(runRoot);
  for (const [label, file] of Object.entries({
    reference_registry: artifacts.referenceRegistry,
    document_claim_register: artifacts.documentClaims,
    section_manifest: artifacts.sectionManifest,
    event_map: artifacts.eventMap,
  })) {
    assertExisting(file, label);
  }

  const previousGate = readJsonIfExists(artifacts.promotionGate);
  const shouldMarkContradictionsReviewed = contradictionsReviewed
    || previousGate?.contradiction_review_status === 'user_reported_reviewed';

  invoke(artifactAudit, [
    'reference-verify',
    '--registry', artifacts.referenceRegistry,
    '--out', artifacts.referenceVerification,
    '--timeout-ms', String(timeoutMs),
    '--concurrency', String(concurrency),
  ]);

  invoke(artifactAudit, [
    'link-cleanup-report',
    '--registry', artifacts.referenceRegistry,
    '--verification', artifacts.referenceVerification,
    '--out', artifacts.linkCleanupReport,
  ]);

  invoke(artifactAudit, [
    'claim-evidence-graph',
    '--claims', artifacts.documentClaims,
    '--registry', artifacts.referenceRegistry,
    '--verification', artifacts.referenceVerification,
    '--sections', artifacts.sectionManifest,
    '--out', artifacts.claimEvidenceGraph,
    '--verified-out', artifacts.verifiedSourceClaims,
    '--timeout-ms', String(timeoutMs),
    '--concurrency', String(concurrency),
  ]);

  invoke(artifactAudit, [
    'promotion-gate',
    '--graph', artifacts.claimEvidenceGraph,
    '--verified', artifacts.verifiedSourceClaims,
    '--out', artifacts.promotionGate,
    ...(shouldMarkContradictionsReviewed ? ['--contradictions-reviewed'] : []),
  ]);

  const dryImport = JSON.parse(invoke(canonicalImport, [
    'import',
    '--run-root', runRoot,
    '--db', db,
    '--dry-run',
  ]));

  const rollbackRehearsal = runRollbackRehearsal({ runRoot, db });
  const verification = readJson(artifacts.referenceVerification);
  const graph = readJson(artifacts.claimEvidenceGraph);
  const gate = readJson(artifacts.promotionGate);
  const report = renderFinalReport({
    runRoot,
    db,
    timeoutMs,
    concurrency,
    verification,
    graph,
    gate,
    dryImport,
    rollbackRehearsal,
    contradictionsReviewed: shouldMarkContradictionsReviewed,
  });
  fs.writeFileSync(artifacts.finalReport, report);

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    run_root: runRoot,
    status: resultLabel({ verification, gate, dryImport, rollbackRehearsal }),
    command: 'yuri-proving-run-repeatable',
    gates: gatesFor({ verification, gate, dryImport, rollbackRehearsal }),
    artifacts: [
      artifacts.referenceVerification,
      artifacts.linkCleanupReport,
      artifacts.claimEvidenceGraph,
      artifacts.verifiedSourceClaims,
      artifacts.promotionGate,
      artifacts.canonicalDryRunBatch,
      rollbackRehearsal.report,
      artifacts.finalReport,
    ],
  };
  writeFileJson(artifacts.runManifest, manifest);

  return {
    mode: 'repeatable-proving-run',
    run_root: runRoot,
    report: artifacts.finalReport,
    manifest: artifacts.runManifest,
    status: manifest.status,
    gates: manifest.gates,
  };
}

function pathsFor(runRoot) {
  return {
    referenceRegistry: path.join(runRoot, 'reference-registry.json'),
    referenceVerification: path.join(runRoot, 'reference-verification.json'),
    linkCleanupReport: path.join(runRoot, 'link-cleanup-report.md'),
    documentClaims: path.join(runRoot, 'document-claim-register.json'),
    sectionManifest: path.join(runRoot, 'section-manifest.json'),
    claimEvidenceGraph: path.join(runRoot, 'claim-evidence-graph.json'),
    verifiedSourceClaims: path.join(runRoot, 'verified-source-claims.json'),
    promotionGate: path.join(runRoot, 'claim-promotion-gate.json'),
    eventMap: path.join(runRoot, 'canonical-memory-gated-import-event-map.json'),
    canonicalDryRunBatch: path.join(runRoot, 'canonical-memory-gated-import-batch.json'),
    finalReport: path.join(runRoot, 'final-proving-run-report.md'),
    runManifest: path.join(runRoot, 'run-manifest.json'),
  };
}

function runRollbackRehearsal({ runRoot, db }) {
  assertExisting(db, 'memory db');
  const rehearsalRoot = path.join(runRoot, 'rollback-rehearsal', timestampId());
  fs.mkdirSync(rehearsalRoot, { recursive: true });
  fs.copyFileSync(path.join(runRoot, 'canonical-memory-gated-import-event-map.json'), path.join(rehearsalRoot, 'canonical-memory-gated-import-event-map.json'));

  const rehearsalDb = path.join(rehearsalRoot, 'memory.db.copy');
  const productionHashBefore = sha256File(db);
  sqliteBackup(db, rehearsalDb);
  const rollback = JSON.parse(invoke(canonicalImport, [
    'rollback',
    '--run-root', rehearsalRoot,
    '--db', rehearsalDb,
  ]));
  const productionHashAfter = sha256File(db);
  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: 'rollback-rehearsal',
    source_db: db,
    rehearsal_root: rehearsalRoot,
    rehearsal_db: rehearsalDb,
    production_db_hash_before: productionHashBefore,
    production_db_hash_after: productionHashAfter,
    production_db_unchanged: productionHashBefore === productionHashAfter,
    rollback,
  };
  const reportPath = path.join(rehearsalRoot, 'canonical-memory-rollback-rehearsal.json');
  writeFileJson(reportPath, report);
  return { ...report, report: reportPath };
}

function sqliteBackup(sourceDb, targetDb) {
  const python = String.raw`
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
try:
    src.backup(dst)
finally:
    dst.close()
    src.close()
`;
  execFileSync('python3', ['-c', python, sourceDb, targetDb], { encoding: 'utf8' });
}

function renderFinalReport({ runRoot, db, timeoutMs, concurrency, verification, graph, gate, dryImport, rollbackRehearsal, contradictionsReviewed }) {
  const gates = gatesFor({ verification, gate, dryImport, rollbackRehearsal });
  return [
    '# Yuri OS Evidence-First Repeatable Proving Run',
    '',
    `result_label: ${resultLabel({ verification, gate, dryImport, rollbackRehearsal })}`,
    `run_root: ${runRoot}`,
    `db_path: ${db}`,
    '',
    '## Command',
    '',
    `- timeout_ms: ${timeoutMs}`,
    `- concurrency: ${concurrency}`,
    `- contradiction_review_status: ${contradictionsReviewed ? 'user_reported_reviewed' : 'not_reviewed_by_gate'}`,
    '',
    '## Regenerated Evidence',
    '',
    `- checked_unique_references: ${verification.checked_reference_count}`,
    `- reference_counts: ${JSON.stringify(verification.counts || {})}`,
    `- document_claims_checked: ${graph.claim_count}`,
    `- verified_source_claims: ${graph.verified_source_claims?.claim_count || 0}`,
    `- support_edges: ${graph.edge_counts?.supports || 0}`,
    `- contradiction_candidate_edges: ${graph.edge_counts?.contradicts || 0}`,
    `- canonical_memory_eligible_claims: ${gate.counts?.eligible || 0}`,
    `- canonical_memory_blocked_claims: ${gate.counts?.blocked || 0}`,
    '',
    '## Canonical Memory Dry Run',
    '',
    `- mode: ${dryImport.mode}`,
    `- record_count: ${dryImport.record_count}`,
    `- skipped_blocked_claims: ${dryImport.skipped_blocked_claims}`,
    `- batch: ${dryImport.batch}`,
    '',
    '## Rollback Rehearsal',
    '',
    `- rehearsal_root: ${rollbackRehearsal.rehearsal_root}`,
    `- rehearsal_db: ${rollbackRehearsal.rehearsal_db}`,
    `- production_db_unchanged: ${rollbackRehearsal.production_db_unchanged}`,
    `- items_tombstoned_on_copy: ${rollbackRehearsal.rollback.items_tombstoned}`,
    `- skipped_items: ${rollbackRehearsal.rollback.skipped_items?.length || 0}`,
    `- sqlite_integrity_check: ${rollbackRehearsal.rollback.sqlite_integrity_check}`,
    '',
    '## Gates',
    '',
    ...Object.entries(gates).map(([key, value]) => `- ${key}: ${value}`),
    '',
  ].join('\n');
}

function gatesFor({ verification, gate, dryImport, rollbackRehearsal }) {
  const failedReferences = Object.entries(verification.counts || {})
    .filter(([status]) => !['reachable', 'local_skipped'].includes(status))
    .reduce((total, [, count]) => total + count, 0);
  return {
    reference_verification: failedReferences === 0 ? 'PASS' : 'WARN_FAILED_REFERENCES',
    claim_evidence_graph: (gate.counts?.verified_claims || 0) > 0 ? 'PASS' : 'FAIL_NO_VERIFIED_CLAIMS',
    promotion_gate: (gate.counts?.eligible || 0) > 0 ? 'PASS' : 'WARN_NO_ELIGIBLE_CLAIMS',
    canonical_import_dry_run: dryImport.mode === 'dry-run' && dryImport.record_count === gate.counts?.eligible ? 'PASS' : 'FAIL_DRY_RUN_MISMATCH',
    rollback_rehearsal_copy_db: rollbackRehearsal.production_db_unchanged ? 'PASS' : 'FAIL_PRODUCTION_DB_CHANGED',
    rollback_rehearsal_integrity: rollbackRehearsal.rollback.sqlite_integrity_check === 'ok' ? 'PASS' : 'FAIL_SQLITE_INTEGRITY',
  };
}

function resultLabel(input) {
  const gates = gatesFor(input);
  return Object.values(gates).every((gate) => gate === 'PASS')
    ? 'PASS_REPEATABLE_PROVING_RUN_DRY_IMPORT_ROLLBACK_REHEARSED'
    : 'REVIEW_REPEATABLE_PROVING_RUN';
}

function invoke(script, args) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function assertExisting(file, label) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${label}: ${file}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function writeFileJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function timestampId() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
