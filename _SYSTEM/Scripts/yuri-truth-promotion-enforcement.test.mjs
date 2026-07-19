#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TRUTH_PROMOTION_RUNTIME_ARTIFACTS,
  enforceCanonicalMemoryImportRuntime,
  validateCanonicalMemoryPromotionGate,
  validateTruthPromotionRegistryRuntime,
} from './yuri-truth-promotion-enforcement.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'yuri-truth-promotion-enforcement.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-truth-promotion-enforcement-test-'));

try {
  const registry = {
    artifacts: TRUTH_PROMOTION_RUNTIME_ARTIFACTS.map((artifact) => ({
      ...artifact,
      owner: 'YURI truth promotion',
      status: 'active',
      protected: false,
    })),
  };
  const registryReport = validateTruthPromotionRegistryRuntime(registry, { checkFiles: false });
  assert.equal(registryReport.ok, true, 'complete truth-promotion registry surface should pass');

  const sparseAwareReport = validateTruthPromotionRegistryRuntime(registry, {
    pathExists: () => true,
  });
  assert.equal(sparseAwareReport.ok, true, 'caller-supplied sparse-aware path presence should satisfy file checks');

  const currentRegistry = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/artifact-registry.json'), 'utf8'));
  const currentRegistryReport = validateTruthPromotionRegistryRuntime(currentRegistry);
  assert.equal(currentRegistryReport.ok, true, currentRegistryReport.errors.join('\n'));

  const missingRegistry = {
    artifacts: registry.artifacts.filter((artifact) => artifact.path !== '_SYSTEM/Scripts/yuri-canonical-memory-import.mjs'),
  };
  const missingReport = validateTruthPromotionRegistryRuntime(missingRegistry, { checkFiles: false });
  assert.equal(missingReport.ok, false, 'missing runtime choke point should fail registry enforcement');
  assert(missingReport.errors.some((error) => error.includes('yuri-canonical-memory-import.mjs')), 'missing import error should name the script');

  const gate = buildGate();
  const gateReport = validateCanonicalMemoryPromotionGate(gate);
  assert.equal(gateReport.ok, true, 'eligible P1 claim with promotion requirements should pass');
  assert.equal(gateReport.counts.eligible, 1, 'eligible count mismatch');

  const badGate = buildGate({
    support_score: 0.1,
    blockers: ['support_score_below_0_35'],
    reference: { tier: 'P2', resolution_precision: 'origin_replacement' },
    promotion_requirements: ['resolve blockers before promotion'],
  });
  const badGateReport = validateCanonicalMemoryPromotionGate(badGate);
  assert.equal(badGateReport.ok, false, 'weak claim must fail runtime gate');
  assert(badGateReport.errors.length >= 4, 'weak claim should expose every runtime blocker');

  const missingProvenanceReport = validateCanonicalMemoryPromotionGate(buildGate({
    content_sha256: '',
    verification_method: '',
    source_file: '',
    source_line: null,
    reference: { tier: 'P1', resolution_precision: 'exact' },
  }));
  assert.equal(missingProvenanceReport.ok, false, 'eligible claim without provenance must fail');
  assert(missingProvenanceReport.errors.some((error) => error.includes('missing source reference URI')));
  assert(missingProvenanceReport.errors.some((error) => error.includes('missing valid content_sha256')));
  assert(missingProvenanceReport.errors.some((error) => error.includes('missing verification_method')));

  const duplicateGate = buildGate();
  duplicateGate.claims.push({ ...duplicateGate.claims[0] });
  const duplicateReport = validateCanonicalMemoryPromotionGate(duplicateGate);
  assert.equal(duplicateReport.ok, false, 'duplicate promotion candidates must fail');
  assert(duplicateReport.errors.some((error) => error.includes('duplicate claim_id')));
  assert(duplicateReport.errors.some((error) => error.includes('duplicate content_sha256')));

  const dryRun = enforceCanonicalMemoryImportRuntime({ gate, dryRun: true, runRoot: tempRoot });
  assert.equal(dryRun.ok, true, 'dry-run should not require operator approval');
  assert.equal(dryRun.decision, 'allow', 'dry-run enforcement decision mismatch');

  const blockedApply = enforceCanonicalMemoryImportRuntime({ gate, dryRun: false, operatorApproved: false, runRoot: tempRoot });
  assert.equal(blockedApply.ok, false, 'live import without operator approval must fail');
  assert(blockedApply.errors.includes('canonical_memory_write_requires_operator_approved_flag'), 'operator approval error missing');

  const approvedApply = enforceCanonicalMemoryImportRuntime({ gate, dryRun: false, operatorApproved: true, runRoot: tempRoot });
  assert.equal(approvedApply.ok, true, 'operator-approved live import should pass runtime enforcement');

  const gatePath = path.join(tempRoot, 'claim-promotion-gate.json');
  fs.writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`);
  const cliDryRun = JSON.parse(execFileSync(
    process.execPath,
    [script, 'gate', '--gate', gatePath, '--dry-run'],
    { encoding: 'utf8' },
  ));
  assert.equal(cliDryRun.ok, true, 'CLI dry-run gate should pass');

  const cliBlocked = spawnSync(
    process.execPath,
    [script, 'gate', '--gate', gatePath],
    { encoding: 'utf8' },
  );
  assert.notEqual(cliBlocked.status, 0, 'CLI live gate should fail without operator approval');
  assert.match(cliBlocked.stdout, /canonical_memory_write_requires_operator_approved_flag/);

  process.stdout.write('yuri-truth-promotion-enforcement: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

function buildGate(claimOverrides = {}) {
  return {
    schema_version: 1,
    advisory_only: true,
    local_truth_claim: true,
    policy: 'Only claims passing this gate may be considered canonical memory candidates. Raw source prose remains tainted.',
    thresholds: {
      support_min_score: 0.35,
      allowed_reference_tiers: ['P0', 'P1'],
      contradiction_review_required: true,
      origin_replacement_blocks_canonical_memory: true,
    },
    claims: [
      {
        claim_id: 'claim-eligible',
        text: 'Runtime-tested claim with primary reference support.',
        classification: 'verified_fact_candidate',
        support_score: 0.72,
        content_sha256: 'a'.repeat(64),
        verification_method: 'test_fixture',
        source_file: '_SYSTEM/reports/source.md',
        source_line: 12,
        canonical_memory_gate: 'eligible_for_canonical_memory_candidate',
        blockers: [],
        reference: {
          tier: 'P1',
          resolution_precision: 'exact',
          normalized_href: 'https://example.com/source',
        },
        promotion_requirements: ['human approve claim text', 'write sanitized canonical summary, not raw source prose'],
        ...claimOverrides,
      },
    ],
  };
}
