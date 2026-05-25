import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  classifyClaimSupport,
  detectHighRiskTerms,
  isClaimGateProtectedPath,
  scanClaimIntegrity,
} from './claim-integrity-gate.mjs';

function tempRepo() {
  return mkdtempSync(path.join(os.tmpdir(), 'yuri-claim-gate-'));
}

function writeFixture(root, relPath, content) {
  const absPath = path.join(root, relPath);
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, content);
  return absPath;
}

test('detects high-risk claim terms without matching substrings', () => {
  assert.deepEqual(detectHighRiskTerms('YURI is a production-ready SOC.'), ['production-ready', 'SOC']);
  assert.deepEqual(detectHighRiskTerms('posture and cost are ordinary words'), []);
});

test('unsupported production and SOC claims fail', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/reports/bad.md', 'YURI is a production-ready SOC for customers.\n');

  const report = scanClaimIntegrity(['_SYSTEM/reports/bad.md'], { repoRoot: root });

  assert.equal(report.ok, false);
  assert.ok(report.findings.some((finding) => finding.term === 'production-ready'));
  assert.ok(report.findings.some((finding) => finding.term === 'SOC'));
});

test('fixture-qualified proof claims pass', () => {
  const root = tempRepo();
  writeFixture(
    root,
    '_SYSTEM/reports/proof.md',
    'The prompt rail is proven only as local fixture proof; executable test: _SYSTEM/Scripts/cyber-lab-runner.test.mjs.\n',
  );

  const report = scanClaimIntegrity(['_SYSTEM/reports/proof.md'], { repoRoot: root });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.ok(report.summary.supported > 0);
});

test('trusted claims require promotion context instead of self-supporting', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/reports/trusted.md', 'YURI is trusted by default.\n');

  const report = scanClaimIntegrity(['_SYSTEM/reports/trusted.md'], { repoRoot: root });

  assert.equal(report.ok, false);
  assert.equal(report.findings[0].term, 'trusted');
});

test('explicit rejection or negation qualifies otherwise dangerous terms', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/reports/boundary.md', 'Rejected identity claim: YURI is not a SOC, SIEM, XDR, or cybersecurity company.\n');

  const report = scanClaimIntegrity(['_SYSTEM/reports/boundary.md'], { repoRoot: root });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
  assert.ok(report.summary.qualified > 0);
});

test('internal YURI OS title does not become a literal OS claim', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/reports/title.md', '# YURI OS Truth Promotion Packet\n\nInternal name only.\n');

  const report = scanClaimIntegrity(['_SYSTEM/reports/title.md'], { repoRoot: root });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test('internal Yuri OS mixed-case brand spelling is qualified', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/reports/title.md', '# Yuri OS Truth Promotion Packet\n\nInternal name only.\n');

  const report = scanClaimIntegrity(['_SYSTEM/reports/title.md'], { repoRoot: root });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test('protected paths are refused before read', () => {
  const root = tempRepo();
  writeFixture(root, '.env', 'VALUE=YURI is a production-ready SOC\n');

  const report = scanClaimIntegrity(['.env'], { repoRoot: root });

  assert.equal(isClaimGateProtectedPath('.env', { repoRoot: root }), true);
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].supportStatus, 'blocked_protected_path');
  assert.equal(report.summary.filesScanned, 0);
});

test('support classifier exposes detected evidence labels', () => {
  const support = classifyClaimSupport({
    term: 'verified',
    line: 'Status: verified by runtime_tested evidence.',
    context: 'Status: verified by runtime_tested evidence. Test: _SYSTEM/Scripts/foo.test.mjs',
    path: '_SYSTEM/reports/example.md',
  });

  assert.equal(support.supportStatus, 'supported');
  assert.ok(support.detectedSupport.includes('canonical_promotion_state'));
  assert.ok(support.detectedSupport.includes('executable_test_reference'));
});
