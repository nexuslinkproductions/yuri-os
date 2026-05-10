#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'yuri-council-claim-evidence.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-council-claims-test-'));

try {
  const advisory = path.join(tempRoot, 'advisory.md');
  fs.writeFileSync(advisory, [
    '# ADVISORY_CLAUDE_COUNCIL_OUTPUT',
    '# NOT_LOCAL_TRUTH',
    '',
    '**findings:**',
    '- Artifact: /tmp/run/final-report.md passed local verification.',
    '- Exact matcher may miss unicode path tricks.',
    '',
    '**risks:**',
    '- Risk: raw output could contaminate memory without gates.',
    '',
    '**upgrade_candidates:**',
    '- Add schema_version fields to benchmark outputs.',
    '',
    '**tests_needed:**',
    '- Test 0, 79, 80, and 81 line council outputs.',
    '',
    '**reject_or_accept_reasoning:**',
    '- Conditional accept; future live run needs container isolation.',
    '',
  ].join('\n'));

  const register = JSON.parse(execFileSync(process.execPath, [script, 'split', advisory], { encoding: 'utf8' }));
  assert.equal(register.schema_version, 1, 'schema version mismatch');
  assert.equal(register.local_truth_claim, false, 'council splitter must not claim local truth');
  assert.equal(register.source_count, 1, 'source count mismatch');
  assert(register.counts.verified_fact >= 1, 'verified fact should be detected');
  assert(register.counts.risk >= 1, 'risk should be detected');
  assert(register.counts.upgrade_candidate >= 1, 'upgrade candidate should be detected');
  assert(register.counts.test_candidate >= 1, 'test candidate should be detected');
  assert(register.claims.every((claim) => claim.promotion !== 'eligible_after_local_verification' || claim.evidence_required.includes('test result')), 'verified claims need evidence requirements');
  assert.equal(register.promotion_policy.hypothesis, 'direct_check_required_or_record_blocker', 'hypotheses should be checked directly, not parked in backlog');
  assert.equal(register.promotion_policy.upgrade_candidate, 'direct_check_required_before_ranking', 'upgrade candidates should require direct checking');
  assert(register.claims.some((claim) => claim.classification === 'hypothesis' && claim.promotion === 'direct_check_required_or_record_blocker'), 'hypothesis claim should become direct-check work');
  assert(register.claims.some((claim) => claim.classification === 'test_candidate' && claim.promotion === 'execute_test_or_record_blocker'), 'test candidate should become executable work');

  const out = path.join(tempRoot, 'claims.json');
  execFileSync(process.execPath, [script, 'split', '--out', out, advisory], { encoding: 'utf8' });
  assert(fs.existsSync(out), 'out file missing');

  process.stdout.write('yuri-council-claim-evidence: pass\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
