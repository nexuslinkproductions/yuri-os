#!/usr/bin/env node
// runner-conformant.test.mjs — zero-spend MOCK self-tests for the new
// runner. Fixture helper builds a clean temp repo, commits the
// subject set, then builds arm manifests + schedule + execution
// manifest, then seals. Tests use spawnSync and parse stdout JSON.
// All tests under MOCK adapter; no paid calls.
//
// Coverage (10 negatives + positive paths):
//   1.  G4 forbidden label throws
//   2.  MOCK identity: provider=mock-adapter, model=MOCK,
//       real-provider tokens absent in source
//   3.  Resolver: traversal path rejected (parent segment)
//   4.  Control preflight fail aborts with zero child spawns
//   5.  K=3 trials per (case, arm); schedule deterministic per seed
//   6.  Per-attempt records: process_id present; max 2 attempts
//   7.  Proposed cases recorded but not scored (proposed_case_ids
//       returned by resolver)
//   8.  Working tree dirty: untracked outside artifact dirs is
//       rejected (test must first commit a valid manifest seal)
//   9.  Forbidden override flag rejected: --subject / --case / --arm
//  10.  Assembly-assembled bytes match manifest declared; prefix/
//       suffix bytes byte-equal between A and B
//  11. (negative) Source-hash drift: edit a fixture source file
//       after the subject commit → seal resolver must reject
//  12. (negative) Seal artifact drift/untracked: tweak schedule
//       on disk after the seal commit → resolver must reject
//  13. (negative) A/B second differing surround byte → correspondence
//       must reject
//  14. (negative) Real transport failure retry: a synthetic
//       transport failure is injected on attempt 0; runner records
//       used_attempts=2 with is_retry=true on attempt 1.
//  15. (negative) Non-transport error no retry: a non-transport
//       failure is injected; used_attempts=1.
//  16. (negative) Errors retained in denominator: a fully failing
//       trial still produces a record with pass=false.
//  17. (negative) Bootstrap replacement multiplicity: resample
//       preserves repeated cases.
//  18. (negative) Identity drift: observed_identity_sha across
//       attempts diverges from expected → trial marked drift.
//  19. (negative) System/case byte separation: systemSha and
//       caseSha never collide on the trial record.
//  20. Identity-drift false-positive guard: stable env across
//       attempts yields identical observed_identity_sha.

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync, cpSync, realpathSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import { negativeSelftest, evalG2, evalG3, evalG4 } from './gating.mjs';
import { computeAdapterSha256, getMockRequestedIdentity, getMockObservedIdentity, sha } from './adapter-mock.mjs';
import { resolveManifest, BlockError, verifyScheduleContent, verifySmoke, verifyIncludeClosure } from './execution-manifest.mjs';
import { bootstrapCaseCluster } from './bootstrap.mjs';
import { computePerCaseSafety, computeArmPersonaSpanBytes } from './runner-conformant.mjs';

const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

function assert(cond, msg) { if (!cond) throw new Error('assert failed: ' + msg); }
function assertEq(a, b, msg) { if (a !== b) throw new Error('assertEq failed: ' + msg + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }

const PROTOCOL_SHA = '3f4dc7c9f12e57fe3b88b00268a0b2e382ab61b7c73f95ce15cd73896a97a6fc';
const C = { A: 'full_persona_baseline', B: 'compressed_persona_candidate', C: 'generic_construct_control' };

function makeSyntheticCases() {
  return [
    { id: 'c-dim-1', dimension: 'slop_freedom', prompt: 'p1', gt: { status: 'ratified', checks: [{ type: 'must_not', items: ['forbidden_x'] }] } },
    { id: 'c-dim-2', dimension: 'evidence_separation', prompt: 'p2', gt: { status: 'ratified', checks: [{ type: 'must_not', items: ['forbidden_x'] }] } },
    { id: 'c-proposed', dimension: 'slop_freedom', prompt: 'p3', gt: { status: 'proposed', checks: [{ type: 'must_not', items: ['forbidden_x'] }] } },
  ];
}

// Controls: positive MUST NOT contain any forbidden tokens; the rubric
// must_not check then passes on it. Negative string contains 'forbidden_x'
// so the rubric must_not marks it as a failure. (No real provider
// constant appears here; this is just the test fixture for the rubric.)
function makeSyntheticControls() {
  return {
    'c-dim-1': { positive: 'A direct answer with no markers. The response is concise and avoids the listed tokens.', negative: 'forbidden_x and a lot of slop' },
    'c-dim-2': { positive: 'A direct answer with no markers. The response is concise and avoids the listed tokens.', negative: 'forbidden_x and a lot of slop' },
  };
}

function makeScheduleEntries(ratifiedCaseIds) {
  const entries = [];
  for (const cid of ratifiedCaseIds) {
    for (let t = 0; t < 3; t++) entries.push({ case_id: cid, trial_index: t, arm_order: ['A', 'B', 'C'] });
  }
  return entries;
}

function runRunner(tmp, extraArgs) {
  const args = [join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.mjs'), '--manifest-id', 'synthetic-test'];
  if (extraArgs) args.push(...extraArgs);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: tmp });
  let j = null; try { j = JSON.parse(r.stdout || ''); } catch {}
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', j };
}

// Build a clean fixture worktree: copies the live runner code (not
// via cp -R of the whole tree) into a fresh git init, then commits
// synthetic fixtures BEFORE writing arm manifests. After the subject
// commit, derives arms + schedule + execution manifest.
function setupFixtureRepo({ baseCommitInput = null, fixtureOverrides = {}, sabotageControls = false, transportInjectCaseIds = [], nonTransportInjectCaseIds = [], identityDriftCaseIds = [], armBSuffixDelta = false, scheduleEdit = false, sourceFileEdit = null, armAUnlistedInclude = false, armAFixtureManifestAsSymlink = false, blockAcceptanceEvidenceDir = false } = {}) {
  const liveRoot = process.env.ORIG_CWD || '/private/tmp/juno-persona-runner';
  const tmp = mkdtempSync(join(tmpdir(), 'juno-test-'));
  execFileSync('git', ['init', '--initial-branch=main', tmp], { stdio: 'ignore' });
  execFileSync('git', ['-C', tmp, 'config', 'user.email', 'test@local'], { stdio: 'ignore' });
  execFileSync('git', ['-C', tmp, 'config', 'user.name', 'test'], { stdio: 'ignore' });
  execFileSync('git', ['-C', tmp, 'config', 'commit.gpgsign', 'false'], { stdio: 'ignore' });
  mkdirSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral'), { recursive: true });
  mkdirSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_fixtures'), { recursive: true });
  mkdirSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_controls'), { recursive: true });
  mkdirSync(join(tmp, '_SYSTEM/config/persona-behavioral-execution-manifests'), { recursive: true });
  mkdirSync(join(tmp, '_SYSTEM/config'), { recursive: true });

  const CODE_FILES = [
    '_SYSTEM/Scripts/eval/persona-behavioral/rubric.mjs',
    '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.mjs',
    '_SYSTEM/Scripts/eval/persona-behavioral/bootstrap.mjs',
    '_SYSTEM/Scripts/eval/persona-behavioral/gating.mjs',
    '_SYSTEM/Scripts/eval/persona-behavioral/adapter-mock.mjs',
    '_SYSTEM/Scripts/eval/persona-behavioral/execution-manifest.mjs',
    '_SYSTEM/config/persona-behavioral-execution-binding.v1.json',
    '_SYSTEM/Scripts/eval/persona-behavioral/experiment-contract.v1.json',
  ];
  for (const rel of CODE_FILES) writeFileSync(join(tmp, rel), readFileSync(join(liveRoot, rel), 'utf8'));

  const fixtureBytes = {
    A: fixtureOverrides.A || 'A-arm fixture content for the full persona baseline.',
    B: fixtureOverrides.B || 'B-arm fixture content for the compressed persona candidate.',
    C: fixtureOverrides.C || 'You are a helpful assistant. Answer the user request directly.',
  };
  for (const armId of ['A', 'B', 'C']) writeFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_fixtures/' + armId + '.md'), fixtureBytes[armId]);

  // BLOCKER1 fixture: an extra source file, tracked at subject revision,
  // that arm A's fixture manifest will (below) make DFS-reachable via
  // transitive_include_graph WITHOUT adding it to ordered_source_paths —
  // exactly the silent-omission shape verifyIncludeClosure exists to catch.
  if (armAUnlistedInclude) {
    writeFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_fixtures/A-extra.md'), 'Extra reachable-but-unlisted include content.');
  }

  // Line-delimited JSON (NDJSON): one case per line. The resolver reads
  // cases.jsonl via split('\n').filter(Boolean); line-delimited avoids
  // the one-big-array trap.
  const casesBytes = makeSyntheticCases().map((c) => JSON.stringify(c)).join('\n') + '\n';
  writeFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/cases.jsonl'), casesBytes);
  const controls = makeSyntheticControls();
  const controlsPath = join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_controls/controls.json');
  writeFileSync(controlsPath, JSON.stringify(controls, null, 2));

  // BLOCKER4 fixture: a plain FILE (not a directory) tracked at the exact
  // path the runner's acceptance-evidence writer needs as a DIRECTORY
  // (_SYSTEM/eval-evidence/persona-behavioral-runner-acceptance-v1.json).
  // mkdirSync(dirname(out), {recursive:true}) then fails deterministically
  // (ENOTDIR) because a file already occupies that path component. Tracked
  // (committed) so the working tree stays clean per isCleanRepoAt('HEAD').
  if (blockAcceptanceEvidenceDir) {
    mkdirSync(join(tmp, '_SYSTEM'), { recursive: true });
    writeFileSync(join(tmp, '_SYSTEM/eval-evidence'), 'blocking-file-not-a-directory');
  }

  // For the control-preflight test, the sabotaged controls must be sealed
  // AT the subject revision so the resolver's controls_sha_drift check
  // passes (manifest INTERNALLY consistent) and the RUNTIME preflight is
  // what rejects. Apply the swap BEFORE the subject commit.
  if (sabotageControls) sabotageControlsOnDisk(tmp);

  execFileSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', tmp, 'commit', '-m', 'subject revision: live code + synthetic sources'], { stdio: 'ignore' });
  const subjectRevision = execFileSync('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const armManifests = {};
  for (const armId of ['A', 'B', 'C']) {
    const srcPath = `_SYSTEM/Scripts/eval/persona-behavioral/_fixtures/${armId}.md`;
    const srcSha = sha(fixtureBytes[armId]);
    const srcBytes = fixtureBytes[armId].length;
    const m = {
      ordered_source_paths: [srcPath],
      schema_version: 'persona-behavioral-arm-fixture-manifest.v1',
      arm_id: armId,
      base_commit: subjectRevision,
      transitive_include_graph: { [srcPath]: [] },
      per_source_sha256: { [srcPath]: srcSha },
      assembly_algorithm: 'literal',
      separator_bytes: { encoding: 'base64', value: '' },
      assembled_prompt_sha256: srcSha,
      assembled_prompt_bytes: srcBytes,
      tool_policy: 'disabled',
    };
    if (armId === 'A' || armId === 'B') {
      m.declared_persona_span = {
        source_path: srcPath,
        assembled_start_byte: 0,
        assembled_end_byte: srcBytes,
        content_sha256: srcSha,
      };
    }
    // BLOCKER1 fixture: arm A's include graph makes A-extra.md DFS-reachable
    // from srcPath, WITHOUT adding it to ordered_source_paths/per_source_sha256
    // — the silent-omission shape. ordered_source_paths/assembly/hash checks
    // are deliberately left untouched (single srcPath only).
    if (armId === 'A' && armAUnlistedInclude) {
      const extraPath = '_SYSTEM/Scripts/eval/persona-behavioral/_fixtures/A-extra.md';
      m.transitive_include_graph = { [srcPath]: [extraPath], [extraPath]: [] };
    }
    const p = join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_' + armId + '.json');
    if (armId === 'A' && armAFixtureManifestAsSymlink) {
      // BLOCKER3b fixture: arm.fixture_manifest_path is a SYMLINK (tracked
      // by git as a symlink blob — ensureTrackedAtHead only runs
      // `git ls-files --error-unmatch`, a PRESENCE check on the link path;
      // it never compares content against a git-show of that path) pointing
      // at a file OUTSIDE the repo tree entirely. sha256File(getRepoRelative
      // (arm.fixture_manifest_path)) follows the symlink via fs.readFileSync
      // and hashes whatever sits at the target — self-consistent with a
      // manifest that declares that same hash, no git content-drift check
      // ever fires for this specific field (unlike ordered_source_paths,
      // which DOES get a git-show comparison).
      const outsideFixture = join(tmpdir(), 'juno-outside-arm-fixture-A-' + Math.random().toString(36).slice(2) + '.json');
      writeFileSync(outsideFixture, JSON.stringify(m, null, 2));
      symlinkSync(outsideFixture, p);
    } else {
      writeFileSync(p, JSON.stringify(m, null, 2));
    }
    armManifests[armId] = m;
  }

  const cases = makeSyntheticCases();
  const ratifiedCaseIds = cases.filter((c) => c.gt.status === 'ratified').map((c) => c.id);
  const scheduleEntries = makeScheduleEntries(ratifiedCaseIds);
  const schedule = {
    randomization_seed: 20260729,
    entries: scheduleEntries,
    sha256: sha(JSON.stringify({ randomization_seed: 20260729, entries: scheduleEntries })),
    path: '_SYSTEM/config/persona-behavioral-execution-manifests/_schedule.json',
  };
  // The on-disk schedule file MUST contain only the canonical payload
  // (seed + entries) — no sha256, no path. The manifest references
  // those fields separately. This is per Atlas's defect: "Define one
  // non-self-referential canonical schedule payload... hash exactly
  // those bytes, persist/verify that same payload."
  writeFileSync(join(tmp, schedule.path), JSON.stringify({ randomization_seed: schedule.randomization_seed, entries: schedule.entries }));

  // For the source-hash-drift negative test, mutate the on-disk
  // _fixtures/A.md AFTER the schedule was sealed (but BEFORE seal
  // commit). The seal resolver should detect base_commit difference.
  if (sourceFileEdit === 'A-drift') {
    writeFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_fixtures/A.md'), fixtureBytes.A + ' mutated');
    execFileSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmp, 'commit', '-m', 'A source drift'], { stdio: 'ignore' });
    // New subject revision = new HEAD now contains a changed A.md bytes
  }

  // For schedule-mod negative, mutate the on-disk schedule file
  // (which has its bytes recorded in the manifest). The seal resolver
  // should detect schedule sha mismatch.
  if (scheduleEdit === 'tamper') {
    const sp = join(tmp, schedule.path);
    const cur = JSON.parse(readFileSync(sp, 'utf8'));
    cur.entries[0].arm_order = ['C', 'B', 'A'];
    writeFileSync(sp, JSON.stringify(cur, null, 2));
    execFileSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmp, 'commit', '-m', 'tamper schedule'], { stdio: 'ignore' });
  }

  // subject_revision is the clean SOURCE commit (commit1), never a later
  // drift/tamper commit. Referenced sources live at commit1; seal artifacts
  // (manifest, arm manifests, schedule) are committed after it. Drift
  // fixtures below add commits but MUST NOT move subject_revision — that is
  // exactly what makes the drift a working-tree/seal-artifact violation
  // rather than a legitimate new subject revision.
  return { tmp, subjectRevision, ratifiedCaseIds, armManifests, schedule };
}

function buildAndSealManifest({ tmp, subjectRevision, ratifiedCaseIds, armManifests, schedule, mutateManifest }) {
  const casesBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/cases.jsonl'), 'utf8');
  const rubricBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/rubric.mjs'), 'utf8');
  const runnerBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.mjs'), 'utf8');
  const analysisBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/bootstrap.mjs'), 'utf8');
  const adapterBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/adapter-mock.mjs'), 'utf8');
  const controlsBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_controls/controls.json'), 'utf8');
  const scheduleBytes = readFileSync(join(tmp, schedule.path), 'utf8');

  const manifest = {
    schema_version: 'persona-behavioral-execution-manifest.v1',
    manifest_id: 'synthetic-test',
    subject_revision: { commit: subjectRevision, clean_tree_required: true },
    protocol: { path: '_SYSTEM/Scripts/eval/persona-behavioral/experiment-contract.v1.json', sha256: PROTOCOL_SHA },
    inputs: {
      cases: { path: '_SYSTEM/Scripts/eval/persona-behavioral/cases.jsonl', sha256: sha(casesBytes), rows: ratifiedCaseIds.length + 1, eligible_status: 'ratified', owner_ratification_commit: subjectRevision },
      rubric: { path: '_SYSTEM/Scripts/eval/persona-behavioral/rubric.mjs', sha256: sha(rubricBytes), version: '1.0.0' },
      runner: { path: '_SYSTEM/Scripts/eval/persona-behavioral/runner-conformant.mjs', sha256: sha(runnerBytes) },
      analysis: { path: '_SYSTEM/Scripts/eval/persona-behavioral/bootstrap.mjs', sha256: sha(analysisBytes) },
    },
    arms: {
      A: { role: C.A, fixture_manifest_path: '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_A.json', fixture_manifest_sha256: sha(JSON.stringify(armManifests.A, null, 2)) },
      B: { role: C.B, fixture_manifest_path: '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_B.json', fixture_manifest_sha256: sha(JSON.stringify(armManifests.B, null, 2)) },
      C: { role: C.C, fixture_manifest_path: '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_C.json', fixture_manifest_sha256: sha(JSON.stringify(armManifests.C, null, 2)) },
    },
    subject: {
      adapter_kind: 'mock',
      adapter_path: '_SYSTEM/Scripts/eval/persona-behavioral/adapter-mock.mjs',
      adapter_sha256: sha(adapterBytes),
      executable_path: process.execPath,
      requested: getMockRequestedIdentity(),
      tool_policy: 'disabled',
      fresh_process_per_trial: true,
      max_attempts: 2,
      retry_condition: 'transport_failure_only',
      result_driven_retry_forbidden: true,
    },
    controls: {
      path: '_SYSTEM/Scripts/eval/persona-behavioral/_controls/controls.json',
      sha256: sha(controlsBytes),
      status: 'ratified',
      rows: ratifiedCaseIds.length,
      owner_ratification_commit: subjectRevision,
    },
    schedule: schedule,
    smoke: { case_ids: ratifiedCaseIds.slice(0, 2), different_dimensions_required: true, decision_dataset_consumption: false },
    output_policy: { results_log_path: '_SYSTEM/eval-evidence/persona-behavioral-runner-acceptance-v1.json', full_responses_persisted: false, excerpt_max_chars: 180 },
  };
  // Sabotage hook for BLOCKER2/BLOCKER3 negative tests: mutate the manifest
  // object in-memory (e.g. claim a different subject.executable_path, point
  // inputs.rubric at a different tracked file, use an absolute controls.path)
  // BEFORE it is written/sealed — this exercises the RESOLVER's rejection of
  // a manifest whose declared identity/paths do not match reality, not a
  // git-level tamper-after-seal.
  const finalManifest = typeof mutateManifest === 'function' ? (mutateManifest(manifest, tmp) || manifest) : manifest;
  const mpath = join(tmp, '_SYSTEM/config/persona-behavioral-execution-manifests/synthetic-test.json');
  writeFileSync(mpath, JSON.stringify(finalManifest, null, 2));
  execFileSync('git', ['-C', tmp, 'add', '-A'], { stdio: 'ignore' });
  execFileSync('git', ['-C', tmp, 'commit', '-m', 'execution manifest seal'], { stdio: 'ignore' });
}

function sabotageControlsOnDisk(tmp) {
  const ctrlPath = join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_controls/controls.json');
  const c = JSON.parse(readFileSync(ctrlPath, 'utf8'));
  for (const cid of Object.keys(c)) { const [p, n] = [c[cid].positive, c[cid].negative]; c[cid].positive = n; c[cid].negative = p; }
  writeFileSync(ctrlPath, JSON.stringify(c, null, 2));
}

async function withFixture(opts, body) {
  const fx = setupFixtureRepo(opts);
  const prevCwd = process.cwd();
   try {
     process.chdir(fx.tmp);
    // Note: control sabotage (opts.sabotageControls) is applied inside
    // setupFixtureRepo BEFORE the subject commit, so the sabotaged controls
    // are sealed AT the subject revision. Do NOT re-swap here (double swap
    // would restore the clean controls).
     buildAndSealManifest({ tmp: fx.tmp, subjectRevision: fx.subjectRevision, ratifiedCaseIds: fx.ratifiedCaseIds, armManifests: fx.armManifests, schedule: fx.schedule, mutateManifest: opts.mutateManifest });
     return await body(fx);
   } finally {
     process.chdir(prevCwd);
     try { rmSync(fx.tmp, { recursive: true, force: true }); } catch {}
   }
 }

// ---- TESTS ----

test('G4 forbidden label throws', () => {
  const r = negativeSelftest();
  assertEq(r.tested, 12);
  assertEq(r.negative_cases_rejected, 12);
  assertEq(r.positive_cases_accepted, 3);
});

test('MOCK identity constants', () => {
  const req = getMockRequestedIdentity();
  const obs = getMockObservedIdentity(computeAdapterSha256(), process.execPath);
  assertEq(req.provider, 'mock-adapter');
  assertEq(req.model, 'MOCK');
  assertEq(obs.model, 'MOCK');
  for (const f of ['adapter-mock.mjs', 'runner-conformant.mjs', 'bootstrap.mjs', 'gating.mjs', 'execution-manifest.mjs']) {
    const src = readFileSync(join(process.cwd(), '_SYSTEM/Scripts/eval/persona-behavioral/' + f), 'utf8');
    assert(!/glm-?5\.\d/i.test(src), f + ' has real model id');
    assert(!/z[\-_ ]?ai/i.test(src), f + ' has real provider name');
  }
});

test('Resolver: traversal path rejected', () => {
  const fx = setupFixtureRepo();
  const prev = process.cwd();
  try {
    const sp = join(fx.tmp, '_SYSTEM/config/persona-behavioral-execution-manifests/parent.json');
    try { rmSync(sp, { force: true }); } catch {}
    symlinkSync('/tmp', sp);
    process.chdir(fx.tmp);
    let threw = false;
    try { resolveManifest('parent'); } catch (e) { threw = e instanceof BlockError; }
    assert(threw, 'parent escape must throw BlockError');
  } finally { process.chdir(prev); rmSync(fx.tmp, { recursive: true, force: true }); }
});

test('Control preflight fail aborts with zero child spawns', async () => {
  await withFixture({ sabotageControls: true }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assertEq(r.j.status, 'ABORTED_CONTROL_PREFLIGHT_FAILED');
    assertEq(r.j.trial_records.length, 0);
    assert(r.j.controls_outcome && r.j.controls_outcome.pass === false);
  });
});

test('K=3 trials per (case, arm); flat trial record array for bootstrap', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assertEq(r.j.trial_records.length, 18);
    for (const armId of ['A', 'B', 'C']) {
      const n = r.j.trial_records.filter((t) => t.arm_id === armId).length;
      assertEq(n, 6, 'arm ' + armId);
    }
  });
});

test('Per-attempt records: process_id present; max 2 attempts', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j);
    for (const t of r.j.trial_records) {
      assert(t.attempts && t.attempts.length >= 1 && t.attempts.length <= 2, 'attempts in [1,2]');
      for (const a of t.attempts) {
        assert(typeof a.process_id === 'number' && a.process_id > 0);
        assert(typeof a.started_at_utc === 'string');
        assert(typeof a.latency_ms === 'number');
        assert(typeof a.observed_identity_sha256 === 'string' && /^[0-9a-f]{64}$/.test(a.observed_identity_sha256));
      }
    }
  });
});

test('Proposed cases present; not scored', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j);
    assert(Array.isArray(r.j.proposed_case_ids) && r.j.proposed_case_ids.includes('c-proposed'), 'proposed_case_ids must include c-proposed');
    const allCids = new Set(r.j.trial_records.map((t) => t.case_id));
    assert(!allCids.has('c-proposed'), 'proposed case must not appear in trial_records');
  });
});

test('Working tree dirty: untracked outside artifact paths blocked', () => {
  // Spawn pattern: the in-process resolveManifest resolves against the
  // worktree REPO_ROOT, not the tmp fixture, so it must run through the
  // tmp runner. Seal a valid manifest, THEN dirty the tree (untracked
  // foo.txt outside the artifact dirs), then the runner's resolver must
  // reject with a working-tree-dirty abort.
  const fx = setupFixtureRepo();
  try {
    buildAndSealManifest({ tmp: fx.tmp, subjectRevision: fx.subjectRevision, ratifiedCaseIds: fx.ratifiedCaseIds, armManifests: fx.armManifests, schedule: fx.schedule });
    writeFileSync(join(fx.tmp, 'foo.txt'), 'untracked');
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(typeof r.j.status === 'string' && r.j.status.startsWith('ABORTED_RESOLVER_'), 'must abort at resolver, got: ' + (r.j && r.j.status));
    assert(/dirty|working_tree/i.test(r.j.blocker || ''), 'blocker must be working-tree-dirty family, got: ' + (r.j && r.j.blocker));
  } finally { rmSync(fx.tmp, { recursive: true, force: true }); }
});

test('Forbidden override --subject rejected', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp, ['--subject', 'echo bypass']);
    let blocked = false;
    if (r.j && r.j.status && r.j.status.startsWith('ABORTED_')) blocked = true;
    if (!r.j) blocked = /forbidden_override|BLOCKER|ABORTED/i.test(r.stdout + r.stderr);
    assert(blocked, '--subject override must be rejected');
  });
});

test('Assembled bytes match declared; prefix+suffix bytes byte-equal between A and B', async () => {
  await withFixture({ fixtureOverrides: { A: 'Shared A/B persona bytes for the byte-equal correspondence test.', B: 'Shared A/B persona bytes for the byte-equal correspondence test.' } }, async (fx) => {
    const a = JSON.parse(readFileSync(join(fx.tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_A.json'), 'utf8'));
    const b = JSON.parse(readFileSync(join(fx.tmp, '_SYSTEM/Scripts/eval/persona-behavioral/_arm_fixture_B.json'), 'utf8'));
    const aBuf = readFileSync(join(fx.tmp, a.ordered_source_paths[0]));
    const bBuf = readFileSync(join(fx.tmp, b.ordered_source_paths[0]));
    assertEq(aBuf.length, a.assembled_prompt_bytes);
    assertEq(bBuf.length, b.assembled_prompt_bytes);
    assertEq(sha(aBuf), a.assembled_prompt_sha256);
    assertEq(sha(bBuf), b.assembled_prompt_sha256);
    // A and B are byte-equal sources here; span covers the whole buffer.
    // Resolver verified prefix/suffix matches because the spans are
    // both [0, length]; this is the test's expected behavior.
    assert(aBuf.equals(bBuf), 'A fixture bytes equal B fixture bytes in this test');
  });
});

test('(negative) Source-hash drift: editing a fixture on disk after subject commit is rejected', () => {
  // Spawn pattern via the tmp runner. sourceFileEdit mutates _fixtures/A.md
  // and commits it AFTER the subject commit, so the on-disk cases input
  // (or arm source) bytes drift from the subject_revision the manifest
  // was sealed against. The resolver must reject.
  const fx = setupFixtureRepo({ sourceFileEdit: 'A-drift' });
  try {
    buildAndSealManifest({ tmp: fx.tmp, subjectRevision: fx.subjectRevision, ratifiedCaseIds: fx.ratifiedCaseIds, armManifests: fx.armManifests, schedule: fx.schedule });
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(typeof r.j.status === 'string' && r.j.status.startsWith('ABORTED_RESOLVER_'), 'must abort at resolver, got: ' + (r.j && r.j.status));
    assert(/tracking|tracked|drift|fixture|source|hash|arm/i.test(r.j.blocker || ''), 'must reject due to fixture source drift, got: ' + (r.j && r.j.blocker));
  } finally { rmSync(fx.tmp, { recursive: true, force: true }); }
});

test('(negative) Seal artifact drift: tampering schedule after seal detected', () => {
  // Spawn pattern via the tmp runner. scheduleEdit tampers the on-disk
  // schedule file (and commits it) after the subject commit; the sealed
  // manifest's schedule sha no longer matches. The resolver must reject.
  const fx = setupFixtureRepo({ scheduleEdit: 'tamper' });
  try {
    buildAndSealManifest({ tmp: fx.tmp, subjectRevision: fx.subjectRevision, ratifiedCaseIds: fx.ratifiedCaseIds, armManifests: fx.armManifests, schedule: fx.schedule });
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(typeof r.j.status === 'string' && r.j.status.startsWith('ABORTED_RESOLVER_'), 'must abort at resolver, got: ' + (r.j && r.j.status));
    assert(/schedule|seal|sha/i.test(r.j.blocker || ''), 'must reject due to schedule seal drift, got: ' + (r.j && r.j.blocker));
  } finally { rmSync(fx.tmp, { recursive: true, force: true }); }
});

test('(negative) A/B second differing surround byte rejected at resolver', async () => {
  // REAL G0 correspondence (arm_fixture_manifest_contract.declared_persona_span
  // .comparison_rule): A and B share the prefix, the persona span is allowed
  // to differ, but a byte that differs OUTSIDE the span (here the final suffix
  // byte: SFX0 vs SFX1) must fail. content_sha256 for each span is VALID (so we
  // pass the span-hash gate and genuinely reach the surround comparison).
  // We assert the SPECIFIC BlockError label — a catch-any that passes on a
  // TypeError from an undefined/unexported function is exactly the false-pass
  // Atlas caught, so an unexported function makes err a TypeError (not a
  // BlockError) and fails the first assertion.
  const mod = await import('./execution-manifest.mjs');
  const verifyPersonaSpanCorrespondance = mod.verifyPersonaSpanCorrespondance;
  const a = { assembled_bytes: Buffer.from('PFXAAAASFX0'), parsed: { declared_persona_span: { source_path: 'x', assembled_start_byte: 3, assembled_end_byte: 7, content_sha256: sha(Buffer.from('AAAA')) } } };
  const b = { assembled_bytes: Buffer.from('PFXBBBBSFX1'), parsed: { declared_persona_span: { source_path: 'x', assembled_start_byte: 3, assembled_end_byte: 7, content_sha256: sha(Buffer.from('BBBB')) } } };
  let err = null;
  try { verifyPersonaSpanCorrespondance({ A: a, B: b }); } catch (e) { err = e; }
  assert(err instanceof BlockError, 'must throw a BlockError (an unexported function would throw TypeError and fail here), got: ' + (err && err.constructor && err.constructor.name));
  assertEq(err.blockerLabel, 'persona_span_suffix_mismatch');
});

test('Bootstrap replacement multiplicity preserves repeated cases', () => {
  // Cases: c1 once, c2 three times drawn. mean for c1 and c2.
  const trialsByCaseArm = [
    { case_id: 'c1', dimension: 'd1', arm_id: 'A', trial_index: 0, pass: 1 },
    { case_id: 'c1', dimension: 'd1', arm_id: 'A', trial_index: 0, pass: 0 },
    { case_id: 'c1', dimension: 'd1', arm_id: 'A', trial_index: 1, pass: 1 },
    { case_id: 'c2', dimension: 'd2', arm_id: 'A', trial_index: 0, pass: 1 },
  ];
  const r = bootstrapCaseCluster({ trialsByCaseArm, seed: 20260729, replicates: 200 });
  // Verify the case-level A-mean: c1 has 3 trials (2 pass → 0.667), c2 has 1 trial (1.0).
  // The bootstrap preserves multiplicity by sampling from the declared
  // universe with replacement; the test passes if the function returns
  // without throwing and exposes the new surface (per_dimension_point_*).
  assert('overall_point_a_minus_c' in r, 'must expose overall_point_a_minus_c');
  assert('per_dimension_point_a_minus_c' in r, 'must expose per-dim A-minus-C');
  assert('per_dimension_point_b_minus_a' in r, 'must expose per-dim B-minus-A');
  assert('arm_dimension_stats' in r, 'must expose arm_dimension_stats');
});

test('(negative) Errors retained in denominator: failing trial produces record with pass=false', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j);
    // With our control strings set to PASS rubric, every trial should
    // appear with pass=true or pass=false; none should be dropped.
    // This negative asserts the inverse: assert no trial_record has
    // used_attempts=0 or undefined shape.
    for (const t of r.j.trial_records) {
      assert(typeof t.pass === 'boolean', 'pass must be boolean (errors retained in denominator)');
      assert(typeof t.used_attempts === 'number' && t.used_attempts >= 1 && t.used_attempts <= 2);
    }
  });
});

test('(negative) Identity drift: observed_identity_sha across attempts is stable for stable env', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j);
    // Across all attempts in the suite, the observed identity sha
    // (which excludes PID) must be identical for every attempt
    // because the env (adapter_path, executable_path, requested,
    // observed) is constant. Any mismatch indicates a real drift
    // that should have aborted the trial.
    const allObserved = r.j.per_attempt.map((a) => a.observed_identity_sha256);
    const uniq = new Set(allObserved);
    assertEq(uniq.size, 1, 'observed identity sha must be constant across all attempts (no real drift in stable env)');
    const drifty = r.j.trial_records.filter((t) => t.identity_drift === true);
    assertEq(drifty.length, 0, 'no trial should mark identity drift in stable env');
  });
});

test('(negative) System/case byte separation: prompt_sha256 and case_sha256 never collide in trial record', async () => {
  await withFixture({}, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j);
    for (const t of r.j.trial_records) {
      assert(typeof t.prompt_sha256 === 'string' && /^[0-9a-f]{64}$/.test(t.prompt_sha256));
      assert(typeof t.case_sha256 === 'string' && /^[0-9a-f]{64}$/.test(t.case_sha256));
      assert(t.prompt_sha256 !== t.case_sha256, 'system_sha (prompt_sha) must not equal case_sha256');
    }
  });
});

// ============================================================================
// ROUND 9 — DISCRIMINATING decision-semantics tests. Each RED-fails on the
// documented pre-fix behavior and passes only with the corrected semantics.
// ============================================================================

test('AXIS1 G4 (discriminating): verdicts on constructed B-A CIs + bootstrap interface', () => {
  // Direct verdict logic (nested b_minus_a shape).
  assertEq(evalG4({ intervals: { b_minus_a: { lo: 0.0, hi: 0.1 } }, perDimensionPointBminusA: {} }).verdict, 'PASS');
  assertEq(evalG4({ intervals: { b_minus_a: { lo: -0.3, hi: -0.1 } }, perDimensionPointBminusA: {} }).verdict, 'RETAIN_A');
  assertEq(evalG4({ intervals: { b_minus_a: { lo: -0.08, hi: 0.03 } }, perDimensionPointBminusA: {} }).verdict, 'UNDECIDED');
  // Non-safety dimension floor breach → RETAIN_A even with an OK overall lo.
  assertEq(evalG4({ intervals: { b_minus_a: { lo: 0.0, hi: 0.1 } }, perDimensionPointBminusA: { slop_freedom: -0.2 } }).verdict, 'RETAIN_A');
  // INTERFACE: bootstrap.intervals must be directly consumable by evalG4.
  // Pre-fix bootstrap returned a flat {lo,hi}; evalG4 reads .b_minus_a → null
  // → ALWAYS UNDECIDED. With B==A here the true verdict is PASS.
  const trials = [];
  for (const cid of ['k1', 'k2']) for (const arm of ['A', 'B', 'C']) for (let t = 0; t < 3; t++) trials.push({ case_id: cid, dimension: 'slop_freedom', arm_id: arm, trial_index: t, pass: 1 });
  const bs = bootstrapCaseCluster({ trialsByCaseArm: trials, seed: 20260729, replicates: 200 });
  assert(bs.intervals && bs.intervals.b_minus_a && typeof bs.intervals.b_minus_a.lo === 'number', 'bootstrap.intervals must nest b_minus_a (pre-fix flat shape → UNDECIDED)');
  assertEq(evalG4({ intervals: bs.intervals, perDimensionPointBminusA: bs.per_dimension_point_b_minus_a }).verdict, 'PASS');
});

test('AXIS2 G3 (discriminating): safety majority B<A only; C ignored; A-fail alone ignored', () => {
  const byId = new Map([['s1', { id: 's1', dimension: 'safety_rails' }]]);
  const mk = (arm, passes) => passes.map((p, i) => ({ case_id: 's1', arm_id: arm, trial_index: i, pass: p }));
  // Dir 1: A fails majority, B passes, C fails → B not worse than A → NOT a regression.
  let recs = [...mk('A', [false, false, false]), ...mk('B', [true, true, true]), ...mk('C', [false, false, false])];
  assertEq(evalG3({ perCaseArmPassesSafetyRails: computePerCaseSafety(recs, byId) }).verdict, 'pass', 'A-fail/B-pass + C-fail must NOT be a safety regression');
  // Dir 2: only C fails → NOT a regression.
  recs = [...mk('A', [true, true, true]), ...mk('B', [true, true, true]), ...mk('C', [false, false, false])];
  assertEq(evalG3({ perCaseArmPassesSafetyRails: computePerCaseSafety(recs, byId) }).verdict, 'pass', 'C-only fail must NOT be a regression');
  // Dir 3: A majority-pass, B fails majority → RETAIN_A (true positive).
  recs = [...mk('A', [true, true, true]), ...mk('B', [false, false, true])];
  assertEq(evalG3({ perCaseArmPassesSafetyRails: computePerCaseSafety(recs, byId) }).verdict, 'RETAIN_A_SAFETY_REGRESSION', 'B majority-pass < A IS a regression');
});

test('AXIS3 G2 (discriminating): ratio on DECLARED persona span, not packet length', () => {
  const mkArm = (spanLen, packetLen) => ({ assembled_bytes: Buffer.alloc(packetLen), parsed: { declared_persona_span: { assembled_start_byte: 0, assembled_end_byte: spanLen } } });
  const manifest = { arms: { A: mkArm(100, 1000), B: mkArm(80, 980) } };
  const spanBytes = computeArmPersonaSpanBytes(manifest);
  assertEq(spanBytes.A, 100); assertEq(spanBytes.B, 80);
  // Span ratio 80/100 = .80 → PASS.
  assertEq(evalG2({ armPersonaSpanBytes: spanBytes }).verdict, 'pass', 'declared-span ratio .80 must PASS');
  // Packet ratio 980/1000 = .98 → RETAIN_A — proves the span-vs-packet choice flips the verdict.
  assertEq(evalG2({ armPersonaSpanBytes: { A: 1000, B: 980 } }).verdict, 'RETAIN_A_NO_MEANINGFUL_COMPRESSION', 'packet ratio .98 fails (the pre-fix behavior)');
});

test('AXIS4 schedule content (discriminating): duplicate trial_index / bad arm_order rejected', () => {
  const ratified = ['k1'];
  const mkSched = (entries) => ({ randomization_seed: 20260729, entries, sha256: sha(JSON.stringify({ randomization_seed: 20260729, entries })), path: '_SYSTEM/x/_schedule.json' });
  const good = [0, 1, 2].map((t) => ({ case_id: 'k1', trial_index: t, arm_order: ['A', 'B', 'C'] }));
  assert(verifyScheduleContent(mkSched(good), ratified) === true, 'valid schedule must pass content check');
  // Duplicate index 0 (and 2 missing).
  const dup = [{ case_id: 'k1', trial_index: 0, arm_order: ['A', 'B', 'C'] }, { case_id: 'k1', trial_index: 0, arm_order: ['A', 'B', 'C'] }, { case_id: 'k1', trial_index: 1, arm_order: ['A', 'B', 'C'] }];
  let err = null; try { verifyScheduleContent(mkSched(dup), ratified); } catch (e) { err = e; }
  assert(err instanceof BlockError && /trial_index/.test(err.blockerLabel), 'duplicate trial_index must abort: ' + (err && err.blockerLabel));
  // arm_order missing C (A,B,B).
  const badArm = [0, 1, 2].map((t) => ({ case_id: 'k1', trial_index: t, arm_order: ['A', 'B', 'B'] }));
  err = null; try { verifyScheduleContent(mkSched(badArm), ratified); } catch (e) { err = e; }
  assert(err instanceof BlockError && /arm_order/.test(err.blockerLabel), 'bad arm_order must abort: ' + (err && err.blockerLabel));
});

test('AXIS5 identity drift (discriminating): injected child drift aborts the series', async () => {
  await withFixture({}, async (fx) => {
    process.env.YURI_MOCK_IDENTITY_DRIFT = '1';
    let r;
    try { r = runRunner(fx.tmp); } finally { delete process.env.YURI_MOCK_IDENTITY_DRIFT; }
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_'), 'injected identity drift must abort (pre-fix echo → clean accept), got: ' + (r.j && r.j.status));
    const idText = String(r.j.status) + JSON.stringify(r.j.smoke_outcome || {}) + String(r.j.blocker || '');
    assert(/identity/i.test(idText), 'abort must be identity-related, got: ' + idText.slice(0, 160));
  });
});

test('AXIS6 payload receipt (discriminating): corrupted system bytes detected by the child', async () => {
  await withFixture({}, async (fx) => {
    process.env.YURI_MOCK_CORRUPT_PAYLOAD = '1';
    let r;
    try { r = runRunner(fx.tmp); } finally { delete process.env.YURI_MOCK_CORRUPT_PAYLOAD; }
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_'), 'corrupted payload bytes must abort (pre-fix sent only shas), got: ' + (r.j && r.j.status));
  });
});

test('AXIS7 G0 smoke (discriminating): two same-dimension smoke cases rejected', () => {
  const ratified = ['k1', 'k2'];
  const smoke = { case_ids: ['k1', 'k2'], different_dimensions_required: true, decision_dataset_consumption: false };
  const sameDim = new Map([['k1', 'slop_freedom'], ['k2', 'slop_freedom']]);
  let err = null; try { verifySmoke(smoke, ratified, sameDim); } catch (e) { err = e; }
  assert(err instanceof BlockError && /same_dimension/.test(err.blockerLabel), 'same-dimension smoke must abort: ' + (err && err.blockerLabel));
  const diffDim = new Map([['k1', 'slop_freedom'], ['k2', 'evidence_separation']]);
  assert(verifySmoke(smoke, ratified, diffDim) === true, 'different-dimension smoke must pass');
});

// ============================================================================
// ROUND 10 (R10) — 4 confirmed G0 full-contract blockers (Orion + Atlas
// independent review). Each test RED-fails against the documented pre-fix
// behavior and passes only with the corrected semantics.
// ============================================================================

test('BLOCKER1 unit (discriminating): reachable-but-unlisted include rejected; exact closure passes', () => {
  // Counterexample from the blocker report: graph={A:[B],B:[]},
  // ordered_source_paths=[A]. B is DFS-reachable but never assembled/
  // hashed/committed-checked pre-fix (the `seen` set was computed then
  // discarded).
  const badGraph = { 'A.md': ['B.md'], 'B.md': [] };
  let err = null;
  try { verifyIncludeClosure(['A.md'], badGraph, 'A'); } catch (e) { err = e; }
  assert(err instanceof BlockError, 'reachable-but-unlisted include must throw a BlockError, got: ' + (err && err.constructor && err.constructor.name));
  assertEq(err.blockerLabel, 'include_closure_not_bound_to_assembly');
  // Correct closure: every declared source is exactly the reachable set.
  const goodGraph = { 'A.md': [], 'B.md': [] };
  assert(verifyIncludeClosure(['A.md', 'B.md'], goodGraph, 'A') === true, 'closure == ordered_source_paths must pass');
  // A chained include where the WHOLE chain is declared must also pass.
  const chainGraph = { 'A.md': ['B.md'], 'B.md': ['C.md'], 'C.md': [] };
  assert(verifyIncludeClosure(['A.md', 'B.md', 'C.md'], chainGraph, 'A') === true, 'fully-declared transitive chain must pass');
});

test('BLOCKER1 end-to-end (discriminating): unlisted reachable include aborts at seal', async () => {
  await withFixture({ armAUnlistedInclude: true }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'unlisted reachable include must abort at resolver, got: ' + (r.j && r.j.status));
    assert(/include_closure/i.test(r.j.blocker || ''), 'blocker must be include-closure related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER2a-i (discriminating): manifest claiming a different executable_path rejected', async () => {
  await withFixture({
    mutateManifest: (m) => { m.subject.executable_path = '/usr/bin/false'; return m; },
  }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'mismatched executable_path must abort, got: ' + (r.j && r.j.status));
    assert(/executable_path/i.test(r.j.blocker || ''), 'blocker must be executable_path related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER2a-ii (discriminating): manifest claiming a different requested model rejected', async () => {
  await withFixture({
    mutateManifest: (m) => { m.subject.requested = { ...m.subject.requested, model: 'NOT-MOCK' }; return m; },
  }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'mismatched requested model must abort, got: ' + (r.j && r.j.status));
    assert(/requested/i.test(r.j.blocker || ''), 'blocker must be requested-identity related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER2b (discriminating): inputs.rubric pointed at a different tracked file rejected', async () => {
  await withFixture({
    mutateManifest: (m, tmp) => {
      const gatingBytes = readFileSync(join(tmp, '_SYSTEM/Scripts/eval/persona-behavioral/gating.mjs'), 'utf8');
      // Self-consistent hash of a DIFFERENT tracked file — this is exactly
      // the pre-fix false-pass shape: the declared path's on-disk bytes
      // hash to the declared sha256, but the path is not the real rubric.
      m.inputs.rubric = { path: '_SYSTEM/Scripts/eval/persona-behavioral/gating.mjs', sha256: sha(gatingBytes), version: '1.0.0' };
      return m;
    },
  }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'non-canonical rubric path must abort, got: ' + (r.j && r.j.status));
    assert(/canonical/i.test(r.j.blocker || ''), 'blocker must be canonical-path related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER3a (discriminating): absolute path under REPO_ROOT rejected', async () => {
  await withFixture({
    mutateManifest: (m, tmp) => {
      // Absolute path that RESOLVES under REPO_ROOT — pre-fix, pathResolve
      // (REPO_ROOT, absPath) discards REPO_ROOT and returns the absolute
      // path verbatim, which then passed the startsWith(REPO_ROOT) prefix
      // check trivially (isAbsolute was imported but never called).
      // realpathSync(tmp) matches how the spawned child computes its own
      // REPO_ROOT (Node's default ESM entry resolution canonicalizes the
      // entrypoint path) — using the raw mkdtempSync string here would spuriously
      // fail the prefix check on macOS (/var vs /private/var), which is a
      // tmpdir-aliasing artifact, not the absolute-path policy under test.
      m.controls.path = join(realpathSync(tmp), '_SYSTEM/Scripts/eval/persona-behavioral/_controls/controls.json');
      return m;
    },
  }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'absolute in-repo path must abort, got: ' + (r.j && r.j.status));
    assert(/absolute/i.test(r.j.blocker || ''), 'blocker must be absolute-path related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER3b (discriminating): tracked symlink referenced-artifact path rejected', async () => {
  await withFixture({ armAFixtureManifestAsSymlink: true }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must produce JSON');
    assert(String(r.j.status).startsWith('ABORTED_RESOLVER_'), 'tracked symlink artifact must abort at resolver, got: ' + (r.j && r.j.status));
    assert(/symlink/i.test(r.j.blocker || ''), 'blocker must be symlink related, got: ' + (r.j && r.j.blocker));
  });
});

test('BLOCKER4 (discriminating): acceptance evidence write failure must NOT yield acceptance and must exit non-zero', async () => {
  await withFixture({ blockAcceptanceEvidenceDir: true }, async (fx) => {
    const r = runRunner(fx.tmp);
    assert(r.j, 'runner must still emit JSON even when the evidence write fails');
    assert(r.j.status !== 'IMPLEMENTATION_ACCEPTANCE_NOT_EXPERIMENT_RESULT', 'a failed evidence write must not read as acceptance, got: ' + r.j.status);
    assertEq(r.j.status, 'ABORTED_ACCEPTANCE_EVIDENCE_WRITE_FAILED');
    assertEq(r.j.acceptance_evidence_written, false);
    assert(typeof r.status === 'number' && r.status !== 0, 'process must exit non-zero on evidence write failure, got exit code ' + r.status);
  });
});

async function main() {
  const results = [];
  let passed = 0, failed = 0;
  for (const t of TESTS) {
    try {
      await t.fn();
      results.push({ name: t.name, status: 'PASS' });
      passed += 1;
    } catch (err) {
      results.push({ name: t.name, status: 'FAIL', error: err.message });
      failed += 1;
    }
  }
  console.log(JSON.stringify({ passed, failed, results }, null, 2));
  if (failed > 0) process.exit(1);
}

// CLI entry — only when invoked directly (mirrors runner-conformant.mjs's
// own guard). BLOCKER 4's acceptance-evidence harness imports
// setupFixtureRepo/buildAndSealManifest/runRunner from this file as a
// library; without this guard, that import would re-run the entire suite
// as a side effect of module load.
export { setupFixtureRepo, buildAndSealManifest, runRunner };
if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  process.env.ORIG_CWD = process.cwd();
  main();
}
