// Hermetic tests for claim-verify.mjs (S2 — the missing link). All runners injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClaim, verifyGitStatus, verifyModelId, verifyArmState,
  verifyFileExists, verifyCapPresent, verifyTestCount, verifyClaim, verifyAll,
} from './claim-verify.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-verify-'));
const FAKE_FILE = path.join(TMP, 'real.md');
const FAKE_FLAG = path.join(TMP, 'x.enabled');
fs.writeFileSync(FAKE_FILE, 'y');
fs.writeFileSync(FAKE_FLAG, '1');

// gitRunner that returns canned outputs keyed by the sha/arg shape
function gitReturning(map) {
  return (args) => {
    const key = args.join(' ');
    for (const [match, out] of Object.entries(map)) {
      if (key.includes(match)) return { ok: !out.startsWith('FAIL:'), stdout: out.replace(/^FAIL:/, ''), stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'no mock' };
  };
}
// a gitRunner that returns TRUSTWORTHY sub-check responses (depth ok, HEAD on a branch, origin set)
// so the sha-bearing path keeps confidence 0.98. `branches` overrides the branch-r-contains output.
function trustworthyGit(branches = '  origin/main\n') {
  return gitReturning({
    'branch -r --contains': branches,
    'rev-list --count': '142',
    'rev-parse --abbrev-ref': 'main',
    'remote get-url': 'https://github.com/nexuslinkproductions/yuri-os.git',
  });
}

test('classifyClaim: priority order + null for unclassifiable', () => {
  assert.equal(classifyClaim({ claimedStatus: '467/467', _source: { statement: 'tests 467/467 green' } }), 'test_count');
  assert.equal(classifyClaim({ claimType: 'model', claimedStatus: 'glm-4.7', _source: { statement: 'workhorse glm-4.7 lane' } }), 'model_id');
  assert.equal(classifyClaim({ claimedStatus: 'ARMED', _source: { statement: 'fleet ARMED' } }), 'arm_state');
  assert.equal(classifyClaim({ claimedStatus: 'MISSING', _source: { statement: 'foo MISSING' } }), 'file_exists');
  assert.equal(classifyClaim({ claimedStatus: 'UNCOMMITTED', _source: { statement: 'merge UNCOMMITTED' } }), 'git_status');
  assert.equal(classifyClaim({ claimedStatus: 'NOT_IMPLEMENTED', _source: { statement: 'NEURO_CORE NOT_IMPLEMENTED' } }), 'cap_present');
  assert.equal(classifyClaim({ claimedStatus: 'whatever random prose' }), null);
  assert.equal(classifyClaim(null), null);
});

test('verifyGitStatus (sha-bearing): SHIPPED + sha on origin + trustworthy sub-checks → match (true), conf 0.98', () => {
  const r = verifyGitStatus(
    { claimedStatus: 'SHIPPED', _source: { statement: 'SHIPPED cbdca5c0 + pushed origin/main' } },
    { gitRunner: trustworthyGit('  origin/main\n  origin/HEAD-> origin/main\n') }
  );
  assert.equal(r.match, true);
  assert.equal(r.verifiedStatus, 'SHIPPED+PUSHED');
  assert.equal(r.confidence, 0.98);
  assert.equal(r.proposedFix, null);
  assert.match(r.evidence[0], /on origin\/main/);
});

test('verifyGitStatus (sha-bearing): THE MERGE-MEMORY CASE — UNCOMMITTED claim + sha on origin → STALE (mismatch) + fix proposed', () => {
  // exactly the stale state: the file references cbdca5c0 but claims UNCOMMITTED
  const r = verifyGitStatus(
    { claimedStatus: 'UNCOMMITTED', _source: { statement: 'merge wave1 — commit cbdca5c0 UNCOMMITTED pending sign-off' } },
    { gitRunner: trustworthyGit('  origin/main\n') }
  );
  assert.equal(r.match, false, 'must detect the staleness');
  assert.equal(r.verifiedStatus, 'SHIPPED+PUSHED');
  assert.equal(r.proposedFix, 'SHIPPED+PUSHED', 'must propose the fix');
  assert.ok(r.confidence >= 0.9);
});

test('verifyGitStatus (sha-bearing): red-team hardening — shallow clone demotes confidence below the heal floor', () => {
  // sha IS on origin, but rev-list --count errors (shallow/unreachable) -> demoted, NOT auto-healed
  const r = verifyGitStatus(
    { claimedStatus: 'SHIPPED', _source: { statement: 'SHIPPED cbdca5c0' } },
    { gitRunner: gitReturning({ 'branch -r --contains': '  origin/main\n', 'rev-list --count': '', 'rev-parse --abbrev-ref': 'main', 'remote get-url': 'https://x/y.git' }) }
  );
  assert.equal(r.match, true, 'match is still computed (sha is on origin)');
  assert.ok(r.confidence < 0.9, 'confidence demoted below the 0.9 heal floor on shallow clone');
});

test('verifyGitStatus (sha-bearing): detached HEAD (worktree) demotes confidence below the floor', () => {
  const r = verifyGitStatus(
    { claimedStatus: 'SHIPPED', _source: { statement: 'SHIPPED cbdca5c0' } },
    { gitRunner: gitReturning({ 'branch -r --contains': '  origin/main\n', 'rev-list --count': '142', 'rev-parse --abbrev-ref': 'HEAD', 'remote get-url': 'https://x/y.git' }) }
  );
  assert.ok(r.confidence < 0.9, 'detached HEAD demotes below the heal floor');
});

test('verifyGitStatus (sha-bearing): no origin remote demotes confidence below the floor', () => {
  const r = verifyGitStatus(
    { claimedStatus: 'SHIPPED', _source: { statement: 'SHIPPED cbdca5c0' } },
    { gitRunner: gitReturning({ 'branch -r --contains': '  origin/main\n', 'rev-list --count': '142', 'rev-parse --abbrev-ref': 'main', 'remote get-url': '' }) }
  );
  assert.ok(r.confidence < 0.9, 'missing origin demotes below the heal floor');
});

test('verifyGitStatus (sha-bearing): claim says PUSHED but sha NOT on origin → stale', () => {
  const r = verifyGitStatus(
    { claimedStatus: 'PUSHED', _source: { statement: 'shipped abc1234 pushed' } },
    { gitRunner: gitReturning({ 'branch -r --contains': '' }) }   // empty → not on origin
  );
  assert.equal(r.match, false);
  assert.equal(r.verifiedStatus, 'NOT_ON_ORIGIN');
  assert.equal(r.proposedFix, 'NOT_ON_ORIGIN');
});

test('verifyGitStatus (file-level): tracked + clean → COMMITTED match', () => {
  const r = verifyGitStatus(
    { claimedStatus: 'COMMITTED', _source: { filePath: FAKE_FILE, statement: 'no sha here' } },
    { gitRunner: gitReturning({ 'ls-files': 'ok', 'status --short': '' }), fsExists: () => true }
  );
  assert.equal(r.match, true);
  assert.equal(r.verifiedStatus, 'COMMITTED');
});

test('verifyGitStatus: no sha + no file → no_evidence', () => {
  const r = verifyGitStatus({ claimedStatus: 'UNCOMMITTED', _source: { statement: 'merge uncommitted' } }, { gitRunner: () => ({ ok: false, stdout: '' }) });
  assert.equal(r.match, null);
  assert.equal(r.verifier, 'git_status');
});

test('verifyModelId: present in routing → match; absent → stale', () => {
  const lane = path.join(TMP, 'lane.mjs');
  fs.writeFileSync(lane, "const m = 'glm-5.1';");
  const ok = verifyModelId({ claimedStatus: 'glm-5.1', _source: { statement: 'workhorse glm-5.1' } },
    { grepRunner: (_p, _f) => ({ ok: true, count: 1 }) });
  assert.equal(ok.match, true);
  const stale = verifyModelId({ claimedStatus: 'glm-4.7', _source: { statement: 'workhorse glm-4.7' } },
    { grepRunner: () => ({ ok: true, count: 0 }) });
  assert.equal(stale.match, false, 'glm-4.7 no longer in routing = stale');
  assert.match(stale.verifiedStatus, /NOT in routing/);
});

test('verifyArmState: flag exists + claim ARMED → match; flag absent + claim ARMED → stale', () => {
  const ok = verifyArmState({ target: 'x', claimedStatus: 'ARMED' }, { stateDir: TMP });
  assert.equal(ok.match, true);
  assert.equal(ok.verifiedStatus, 'ARMED');
  const stale = verifyArmState({ target: 'x', claimedStatus: 'ARMED' }, { stateDir: path.join(TMP, 'no-such') });
  assert.equal(stale.match, false);
  assert.equal(stale.verifiedStatus, 'DISARMED');
  assert.equal(stale.proposedFix, 'DISARMED');
});

test('verifyFileExists: path missing + claim MISSING → match; claim LIVE but missing → stale', () => {
  const r = verifyFileExists({ target: 'missing/dep.md', claimedStatus: 'MISSING' }, {});
  assert.equal(r.match, true);
  assert.equal(r.verifiedStatus, 'MISSING');
  // claim LIVE but file actually missing -> mismatch (the stale-doc case)
  const stale = verifyFileExists({ target: 'no/such/dep.md', claimedStatus: 'LIVE' }, {});
  assert.equal(stale.verifiedStatus, 'MISSING');
  assert.equal(stale.match, false, 'claim LIVE but file missing -> stale');
  // non-path target (no slash) -> conservative no_evidence, not a false verdict
  const notPath = verifyFileExists({ target: 'realname', claimedStatus: 'MISSING' }, {});
  assert.equal(notPath.match, null);
});

test('verifyCapPresent: cap present + claim BUILT → match', () => {
  const caps = path.join(TMP, 'caps.json');
  fs.writeFileSync(caps, JSON.stringify({ capabilities: [{ id: 'claim-registry' }] }));
  const r = verifyCapPresent({ target: 'claim-registry', claimedStatus: 'BUILT' }, { capPath: caps });
  assert.equal(r.match, true);
  assert.equal(r.verifiedStatus, 'CAP_PRESENT');
  const absent = verifyCapPresent({ target: 'phantom-cap', claimedStatus: 'BUILT' }, { capPath: caps });
  assert.equal(absent.match, false);
});

test('verifyTestCount: cached count matches claim → match; no cache → no_evidence', () => {
  const cache = path.join(TMP, 'last.json');
  fs.writeFileSync(cache, JSON.stringify({ pass: 467, total: 467 }));
  const r = verifyTestCount({ claimedStatus: '467/467', _source: { statement: '467/467 tests' } }, { lastRunPath: cache });
  assert.equal(r.match, true);
  assert.equal(r.confidence, 0.88);
  const noCache = verifyTestCount({ claimedStatus: '467/467' }, { lastRunPath: path.join(TMP, 'nope.json') });
  assert.equal(noCache.match, null);
});

test('verifyClaim: dispatches to the right verifier + no_evidence for unclassifiable', () => {
  const r = verifyClaim({ claimedStatus: 'ARMED', target: 'x', _source: { statement: 'ARMED' } }, { stateDir: TMP });
  assert.equal(r.verifier, 'arm_state');
  assert.equal(r.match, true);
  const none = verifyClaim({ claimedStatus: 'random prose nothing' });
  assert.equal(none.verifier, null);
  assert.equal(none.match, null);
});

test('verifyAll: updates the registry overlay for every classifiable claim', () => {
  const ledger = path.join(TMP, 'ledger.json');
  const registry = path.join(TMP, 'registry.json');
  fs.writeFileSync(ledger, JSON.stringify({
    schema: 'yuri.prose-claim-extractor.v1', claims: [
      { id: 'm:uncommitted', target: 'm', claimType: 'shipped', claimedStatus: 'UNCOMMITTED',
        contentHash: 'h1', _source: { filePath: FAKE_FILE, statement: 'commit cbdca5c0 UNCOMMITTED' }, _seenMs: 1 },
      { id: 'n:noise', target: 'n', claimType: 'note', claimedStatus: 'random prose',
        contentHash: 'h2', _source: { statement: 'nothing checkable' }, _seenMs: 2 },
    ],
  }));
  const { results, registry: updated } = verifyAll({
    ledger, registry,
    runners: { gitRunner: trustworthyGit('  origin/main\n') },
  });
  assert.equal(results.length, 2);
  const m = updated.claims['m:uncommitted'];
  assert.ok(m, 'classifiable claim written to overlay');
  assert.equal(m.match, false, 'the UNCOMMITTED-with-sha-on-origin claim is stale');
  assert.equal(m.verifiedBy, 'git_status');
  assert.equal(m.proposedFix, 'SHIPPED+PUSHED');
  assert.equal(updated.claims['n:noise'], undefined, 'unclassifiable claim left out of overlay');
});
