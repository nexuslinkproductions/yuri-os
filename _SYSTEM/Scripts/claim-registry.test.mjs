// Hermetic tests for claim-registry.mjs (S1 of the staleness conscience). All paths injected to tmp.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadClaims, loadRegistry, saveRegistry, joinRegistry, upsertVerification,
  getStale, setPinned, isPinned, sha256, isRegistryArmed, DEFAULTS,
} from './claim-registry.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'claim-reg-'));
const LEDGER = path.join(TMP, 'ledger.json');
const REGISTRY = path.join(TMP, 'registry.json');

const LEDGER_FIXTURE = {
  schema: 'yuri.prose-claim-extractor.v1', updatedMs: 1,
  claims: [
    { id: 'mergemem:shipped', target: 'mergemem', claimType: 'shipped', claimedStatus: 'UNCOMMITTED',
      contentHash: 'h1', _source: { filePath: '/x.md', statement: 'merge UNCOMMITTED', matchedVerb: 'UNCOMMITTED' }, _seenMs: 1 },
    { id: 'svc:verified', target: 'svc', claimType: 'verified', claimedStatus: 'runtime_tested',
      contentHash: 'h2', _source: { filePath: '/y.md', statement: 'verified working', matchedVerb: 'verified' }, _seenMs: 2 },
  ],
};
const OVERLAY_FIXTURE = {
  schema: DEFAULTS.schema, updatedMs: 3,
  claims: {
    'mergemem:shipped': { verifiedStatus: 'SHIPPED', match: false, lastVerifiedMs: 3, verifiedBy: 'git_status',
      evidence: ['git: cbdca5c0 on origin/main'], confidence: 0.99, proposedFix: 'SHIPPED cbdca5c0', pinned: false },
  },
};

test('loadClaims: parses ledger fixture; empty when missing/corrupt', () => {
  fs.writeFileSync(LEDGER, JSON.stringify(LEDGER_FIXTURE));
  const c = loadClaims({ ledger: LEDGER });
  assert.equal(c.length, 2);
  assert.equal(c[0].id, 'mergemem:shipped');
  assert.equal(c[0].claimedStatus, 'UNCOMMITTED');
  assert.deepEqual(loadClaims({ ledger: path.join(TMP, 'nope.json') }), []);
  fs.writeFileSync(path.join(TMP, 'bad.json'), '{not json');
  assert.deepEqual(loadClaims({ ledger: path.join(TMP, 'bad.json') }), []);
});

test('loadRegistry: empty when missing; parses when present', () => {
  assert.deepEqual(loadRegistry({ registry: path.join(TMP, 'no-reg.json') }), { schema: DEFAULTS.schema, updatedMs: null, claims: {} });
  fs.writeFileSync(REGISTRY, JSON.stringify(OVERLAY_FIXTURE));
  const r = loadRegistry({ registry: REGISTRY });
  assert.equal(r.schema, DEFAULTS.schema);
  assert.equal(r.claims['mergemem:shipped'].verifiedStatus, 'SHIPPED');
});

test('sha256: deterministic + sensitive', () => {
  assert.equal(sha256('a'), sha256('a'));
  assert.notEqual(sha256('a'), sha256('b'));
  assert.equal(sha256('a').length, 64);
});

test('joinRegistry: merges ledger + overlay; missing overlay → unverified (match null)', () => {
  fs.writeFileSync(LEDGER, JSON.stringify(LEDGER_FIXTURE));
  fs.writeFileSync(REGISTRY, JSON.stringify(OVERLAY_FIXTURE));
  const j = joinRegistry({ ledger: LEDGER, registry: REGISTRY });
  assert.equal(j.length, 2);
  // claim with overlay
  assert.equal(j[0].id, 'mergemem:shipped');
  assert.equal(j[0].claimedStatus, 'UNCOMMITTED');
  assert.equal(j[0].verifiedStatus, 'SHIPPED');
  assert.equal(j[0].match, false);
  assert.equal(j[0].pinned, false);
  assert.equal(j[0].confidence, 0.99);
  // claim without overlay → unverified
  assert.equal(j[1].id, 'svc:verified');
  assert.equal(j[1].match, null);
  assert.equal(j[1].verifiedStatus, null);
  assert.equal(j[1].evidence.length, 0);
});

test('upsertVerification: sets fields + returns NEW object (immutability) + idempotent', () => {
  const base = loadRegistry({ registry: REGISTRY });
  const next = upsertVerification(base, 'svc:verified', { verifiedStatus: 'runtime_tested', match: true, verifiedBy: 'test_run', confidence: 0.95 });
  assert.notEqual(next, base);                        // new object
  assert.equal(base.claims['svc:verified'], undefined); // original untouched
  assert.equal(next.claims['svc:verified'].match, true);
  const again = upsertVerification(next, 'svc:verified', { lastVerifiedMs: 9 });
  assert.equal(again.claims['svc:verified'].match, true);     // preserved
  assert.equal(again.claims['svc:verified'].lastVerifiedMs, 9); // updated
});

test('getStale: match===false stale; match===true not; includeUnverified surfaces null', () => {
  fs.writeFileSync(LEDGER, JSON.stringify(LEDGER_FIXTURE));
  fs.writeFileSync(REGISTRY, JSON.stringify(OVERLAY_FIXTURE));
  const stale = getStale({ ledger: LEDGER, registry: REGISTRY });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].id, 'mergemem:shipped');
  const withUnverified = getStale({ includeUnverified: true, ledger: LEDGER, registry: REGISTRY });
  assert.equal(withUnverified.length, 2);   // the mismatch + the never-verified svc
});

test('setPinned / isPinned', () => {
  const base = loadRegistry({ registry: REGISTRY });
  const pinned = setPinned(base, 'mergemem:shipped', true);
  assert.equal(isPinned(pinned, 'mergemem:shipped'), true);
  assert.equal(isPinned(base, 'mergemem:shipped'), false);   // original untouched
  assert.equal(isPinned(pinned, 'svc:verified'), false);
});

test('saveRegistry: DISARMED (armed:false) → no file, wouldWrite=true; ARMED → atomic write + reload', () => {
  const out = path.join(TMP, 'out.json');
  // start from a CLEAN registry (isolation: prior tests wrote fixtures into REGISTRY)
  const reg = upsertVerification(loadRegistry({ registry: path.join(TMP, 'nonexistent-clean.json') }), 'x:t', { match: false });
  const dry = saveRegistry(reg, { registry: out, armed: false });
  assert.equal(dry.wrote, false);
  assert.equal(dry.wouldWrite, true);
  assert.equal(dry.staleCount, 1);
  assert.ok(!fs.existsSync(out), 'DISARMED must not write');
  const wet = saveRegistry(reg, { registry: out, armed: true });
  assert.equal(wet.wrote, true);
  assert.ok(fs.existsSync(out), 'ARMED must write');
  const reloaded = loadRegistry({ registry: out });
  assert.equal(reloaded.claims['x:t'].match, false);   // round-trip
  assert.equal(reloaded.schema, DEFAULTS.schema);
});

test('isRegistryArmed: false by default in a clean env', () => {
  // (env/flag not armed in test env)
  assert.equal(isRegistryArmed({ armEnv: 'YURI_NEVER_ARMED_XYZ_TEST', armFlag: path.join(TMP, 'no.flag') }), false);
});
