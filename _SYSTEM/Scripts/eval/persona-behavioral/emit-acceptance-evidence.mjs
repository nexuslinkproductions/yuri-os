#!/usr/bin/env node
// emit-acceptance-evidence.mjs — BLOCKER 4 fix: produces the durable,
// tracked MOCK acceptance-evidence deliverable required by the frozen
// binding's mock_acceptance clause
// (acceptance_evidence_path + acceptance_evidence_required_fields).
//
// Pre-fix, NO tracked _SYSTEM/eval-evidence/persona-behavioral-runner-
// acceptance-v1.json existed at any committed tip: the per-manifest-run
// writer in runner-conformant.mjs only ever writes that path as a SIDE
// EFFECT of a single ad hoc `--manifest-id <id>` invocation, and its
// test_commands/test_results self-report THAT invocation, never the real
// 24(+)-test acceptance suite. This script is the acceptance harness that
// actually produces the deliverable:
//   1. Runs the REAL unit-test suite (runner-conformant.test.mjs) as a
//      child process and captures its REAL command + REAL {passed,failed}
//      result — not a self-report of this script's own invocation.
//   2. Builds ONE synthetic fixture git repo (mock_acceptance.
//      synthetic_manifest_rule: "create a temporary Git repository, commit
//      synthetic fixtures ... then exercise the same committed-manifest
//      resolver") and runs the real conformant runner end-to-end under
//      MOCK to obtain genuine trial_records / per_attempt_records /
//      subject_identity / subject_revision_commit / manifest_seal_commit
//      evidence — fields no unit-test-suite invocation alone can produce.
//   3. Writes the merged evidence to the REAL repo's fixed acceptance path.
// ZERO paid provider calls anywhere in this file; MOCK adapter only.

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

import { BINDING_SHA, sha256 } from './execution-manifest.mjs';
import { setupFixtureRepo, buildAndSealManifest, runRunner } from './runner-conformant.test.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(here, '..', '..', '..', '..');
const EVIDENCE_REL = '_SYSTEM/eval-evidence/persona-behavioral-runner-acceptance-v1.json';
const BINDING_REL = '_SYSTEM/config/persona-behavioral-execution-binding.v1.json';
const PROTOCOL_REL = '_SYSTEM/Scripts/eval/persona-behavioral/experiment-contract.v1.json';
const TEST_FILE_REL = '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.test.mjs';

function sha256File(p) { return sha256(readFileSync(p)); }

// Runs the REAL 24(+)-test unit suite as a child process (not an in-process
// re-run of TESTS, which would silently diverge from what `node
// runner-conformant.test.mjs` actually executes for a human/CI operator).
function runRealTestSuite() {
  const testPath = pathResolve(REPO_ROOT, TEST_FILE_REL);
  const command = `${process.execPath} ${TEST_FILE_REL}`;
  let stdout = '';
  let exitStatus = 0;
  try {
    stdout = execFileSync(process.execPath, [testPath], { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (e) {
    stdout = String((e && e.stdout) || '');
    exitStatus = typeof e.status === 'number' ? e.status : 1;
  }
  let parsed = null;
  try { parsed = JSON.parse(stdout); } catch { /* leave parsed null; exit_status/command still real evidence */ }
  return {
    command,
    exit_status: exitStatus,
    passed: parsed ? parsed.passed : null,
    failed: parsed ? parsed.failed : null,
    total: parsed ? (parsed.passed + parsed.failed) : null,
  };
}

// Builds one synthetic fixture repo and runs the real conformant runner
// end-to-end under MOCK — the mock_acceptance.synthetic_manifest_rule path.
// Zero paid calls (adapter_kind is forced to 'mock' by the resolver).
function runSyntheticManifestFixture() {
  const fx = setupFixtureRepo();
  try {
    buildAndSealManifest({ tmp: fx.tmp, subjectRevision: fx.subjectRevision, ratifiedCaseIds: fx.ratifiedCaseIds, armManifests: fx.armManifests, schedule: fx.schedule });
    const r = runRunner(fx.tmp);
    return { result: r.j, exit_status: r.status };
  } finally {
    try { execFileSync('rm', ['-rf', fx.tmp]); } catch { /* best-effort cleanup of the temp fixture */ }
  }
}

function main() {
  // setupFixtureRepo (imported from the test file) reads its live-code
  // source root from ORIG_CWD; the test file's own CLI guard sets this
  // before calling main(), but as a library import that side effect never
  // ran, so this harness sets it explicitly to the REAL repo root.
  process.env.ORIG_CWD = REPO_ROOT;
  const suite = runRealTestSuite();
  const fixture = runSyntheticManifestFixture();
  const fixtureRun = fixture.result;

  const bindingBytes = readFileSync(pathResolve(REPO_ROOT, BINDING_REL), 'utf8');
  const binding = JSON.parse(bindingBytes);
  const bindingSha = sha256(bindingBytes);
  const protocolSha = sha256File(pathResolve(REPO_ROOT, PROTOCOL_REL));

  if (bindingSha !== BINDING_SHA) {
    console.error(`ACCEPTANCE_HARNESS_ABORT: binding_sha_mismatch expected ${BINDING_SHA} got ${bindingSha}`);
    process.exit(1);
  }

  const suitePassed = suite.exit_status === 0 && suite.failed === 0 && suite.passed > 0;
  const fixturePassed = !!fixtureRun && fixtureRun.status === 'IMPLEMENTATION_ACCEPTANCE_NOT_EXPERIMENT_RESULT' && fixture.exit_status === 0;
  const acceptancePass = suitePassed && fixturePassed;

  const evidence = {
    schema_version: 'persona-behavioral-runner-acceptance-evidence.v1',
    status: acceptancePass ? binding.mock_acceptance.acceptance_evidence_status : 'ACCEPTANCE_HARNESS_FAILED',
    protocol_sha256: protocolSha,
    binding_sha256: bindingSha,
    subject_revision_commit: fixtureRun ? fixtureRun.subject_revision_commit : null,
    manifest_seal_commit: fixtureRun ? fixtureRun.manifest_seal_commit : null,
    implementation_source_sha256: fixtureRun ? fixtureRun.implementation_source_sha256 : null,
    test_commands: [suite.command],
    test_results: { passed: suite.passed, failed: suite.failed, total: suite.total, exit_status: suite.exit_status },
    subject_identity: fixtureRun ? fixtureRun.subject_identity : null,
    trial_records: fixtureRun ? fixtureRun.trial_records : [],
    per_attempt_records: fixtureRun ? fixtureRun.per_attempt_records : [],
    paid_provider_calls: 0,
    known_execution_blockers: binding.known_execution_blockers || [],
    generated_at_utc: new Date().toISOString(),
    generator: '_SYSTEM/Scripts/eval/persona-behavioral/emit-acceptance-evidence.mjs',
  };

  const out = pathResolve(REPO_ROOT, EVIDENCE_REL);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ written: out, status: evidence.status, suite_passed: suite.passed, suite_failed: suite.failed, suite_exit_status: suite.exit_status, fixture_status: fixtureRun && fixtureRun.status }, null, 2));
  if (!acceptancePass) process.exit(1);
}

main();
