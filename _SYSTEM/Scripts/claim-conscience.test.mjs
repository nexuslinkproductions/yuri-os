// Hermetic tests for claim-conscience.mjs (S4 sweep entry point). verify is injected — no git/fs/spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sweep, formatSummary } from './claim-conscience.mjs';

// 2 claims: a = healable (UNCOMMITTED, conf 0.98), b = below floor (ARMED, conf 0.5 → surfaced)
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conscience-'));
  const f1 = path.join(dir, 'a.md'); fs.writeFileSync(f1, 'Status: UNCOMMITTED.\n');
  const f2 = path.join(dir, 'b.md'); fs.writeFileSync(f2, 'Lane: ARMED.\n');
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, JSON.stringify({ claims: [
    { id: 'a:git_status', target: 'a', claimType: 'git_status', claimedStatus: 'UNCOMMITTED', _source: { filePath: f1, statement: 'Status: UNCOMMITTED.' } },
    { id: 'b:arm_state', target: 'b', claimType: 'arm_state', claimedStatus: 'ARMED', _source: { filePath: f2, statement: 'Lane: ARMED.' } },
  ]}));
  const verify = () => ({
    results: [
      { id: 'a:git_status', verifier: 'git_status', verifiedStatus: 'SHIPPED', match: false, evidence: ['git: on origin'], confidence: 0.98, proposedFix: 'SHIPPED' },
      { id: 'b:arm_state', verifier: 'arm_state', verifiedStatus: 'DISARMED', match: false, evidence: ['flag absent'], confidence: 0.5, proposedFix: 'DISARMED' },
    ],
    registry: { schema: 'yuri.claim-registry.v1', updatedMs: 1, claims: {} },
  });
  return { dir, f1, f2, ledger, registry: path.join(dir, 'registry.json'), journalPath: path.join(dir, 'journal.jsonl'), verify,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('sweep (dry-run) reports would-heal + surfaced without touching files', async () => {
  const h = setup();
  try {
    const s = await sweep({ armed: false, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify: h.verify });
    assert.equal(s.ok, true);
    assert.equal(s.armed, false);
    assert.equal(s.totalClaims, 2);
    assert.equal(s.stale, 2);
    assert.equal(s.wouldHeal, 1);     // claim a (healable, conf 0.98)
    assert.equal(s.healed, 0);        // dry-run — nothing applied
    assert.equal(s.surfaced, 1);      // claim b (below floor)
    // files untouched
    assert.match(fs.readFileSync(h.f1, 'utf8'), /UNCOMMITTED/);
    assert.match(fs.readFileSync(h.f2, 'utf8'), /ARMED/);
  } finally { h.cleanup(); }
});

test('sweep (armed) applies guarded heals + reports healed count', async () => {
  const h = setup();
  try {
    const s = await sweep({ armed: true, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify: h.verify });
    assert.equal(s.ok, true);
    assert.equal(s.healed, 1);
    assert.equal(s.wouldHeal, 0);
    assert.equal(s.surfaced, 1);
    assert.match(fs.readFileSync(h.f1, 'utf8'), /SHIPPED/);    // healed
    assert.doesNotMatch(fs.readFileSync(h.f1, 'utf8'), /UNCOMMITTED/);
    assert.match(fs.readFileSync(h.f2, 'utf8'), /ARMED/);      // untouched (below floor)
  } finally { h.cleanup(); }
});

test('sweep NEVER throws — a broken verify degrades to {ok:false} (SessionStart contract)', async () => {
  const h = setup();
  try {
    const verify = () => { throw new Error('simulated verifier crash'); };
    const s = await sweep({ armed: false, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify });
    assert.equal(s.ok, false);
    assert.match(s.error, /simulated verifier crash/);
    assert.equal(s.totalClaims, 0);
    // files untouched
    assert.match(fs.readFileSync(h.f1, 'utf8'), /UNCOMMITTED/);
  } finally { h.cleanup(); }
});

test('sweep topStale carries the top stale claims for the brain block', async () => {
  const h = setup();
  try {
    const s = await sweep({ armed: false, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify: h.verify });
    assert.ok(Array.isArray(s.topStale));
    assert.equal(s.topStale.length, 2);
    assert.ok(s.topStale[0].claimId && s.topStale[0].verifier);
  } finally { h.cleanup(); }
});

test('formatSummary: compact dry-run line', async () => {
  const h = setup();
  try {
    const s = await sweep({ armed: false, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify: h.verify });
    const line = formatSummary(s);
    assert.match(line, /staleness: 2 stale/);
    assert.match(line, /1 would-heal/);
    assert.match(line, /1 surfaced/);
    assert.match(line, /of 2/);
  } finally { h.cleanup(); }
});

test('formatSummary: armed line says "healed" not "would-heal"', async () => {
  const h = setup();
  try {
    const s = await sweep({ armed: true, ledger: h.ledger, registry: h.registry, journalPath: h.journalPath, verify: h.verify });
    assert.match(formatSummary(s), /1 healed/);
  } finally { h.cleanup(); }
});

test('formatSummary: degraded sweep → unavailable line', () => {
  assert.match(formatSummary({ ok: false, error: 'boom' }), /sweep unavailable/);
  assert.match(formatSummary(null), /sweep unavailable/);
});
