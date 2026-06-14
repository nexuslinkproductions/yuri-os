// _SYSTEM/Scripts/filing-canonical-bridge.test.mjs
// P2 Inc 6 gate — node:test + node:assert only. Runs in a temp dir (opts.dir) — never touches the live store.
// Requires YURI_NANO_LEASES_DIR set to a temp dir in the runner env (drainOnce acquires the drain lease).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emitFilingClaim, MAX_PER_RUN, _resetRun } from './filing-canonical-bridge.mjs';
import { loadCanonical, drainOnce } from './memory-canonical-store.mjs';

test('filing<->canonical bridge: zone enum + protected/pinned veto + per-run cap + loadCanonical advisory opt-in', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'fb-'));
  const opts = { dir: tmp };
  const sid = 't1';
  _resetRun(sid);
  // closed-enum: unknown zone rejected (before any state mutation)
  assert.equal(emitFilingClaim(sid, { subject: 'a.md', object: { zone: 'NOPE' } }, opts).ok, false);
  // EPHEMERAL + unclassified + a real CANONICAL_ZONE accepted
  assert.equal(emitFilingClaim(sid, { subject: 'x.bak', object: { zone: 'EPHEMERAL' } }, opts).ok, true);
  assert.equal(emitFilingClaim(sid, { subject: 'm.xyz', object: { zone: 'unclassified' } }, opts).ok, true);
  assert.equal(emitFilingClaim(sid, { subject: '02_RESOURCES/RESEARCH/x.md', object: { zone: '02_RESOURCES/RESEARCH' } }, opts).ok, true);
  // re-verified veto at emit: yuri-origin.md is PINNED, .env is PROTECTED (both confirmed against the real assessor)
  assert.equal(emitFilingClaim(sid, { subject: '_SYSTEM/yuri-origin.md', object: { zone: '_SYSTEM/docs' } }, opts).ok, false);
  assert.equal(emitFilingClaim(sid, { subject: '.env', object: { zone: 'EPHEMERAL' } }, opts).ok, false);
  // per-run cap: 3 accepted so far -> 47 more allowed -> cap rejects the remainder
  let ok = 0, cap = 0;
  for (let i = 0; i < 60; i += 1) {
    const r = emitFilingClaim(sid, { subject: `c${i}.md`, object: { zone: 'unclassified' } }, opts);
    if (r.ok) ok += 1; else if (/cap/.test(r.reason || '')) cap += 1;
  }
  assert.equal(ok + 3, MAX_PER_RUN, 'cap stops emission at MAX_PER_RUN total');
  assert.equal(cap, 60 - ok, 'remainder past the cap is rejected');
  // fold the shard into canonical, THEN check the advisory opt-in
  drainOnce('fb-drain', opts);
  assert.equal(loadCanonical(opts).length, 0, 'filing claims excluded by default (advisory)');
  const adv = loadCanonical({ ...opts, includeAdvisory: true });
  assert.equal(adv.length, MAX_PER_RUN, 'includeAdvisory surfaces all filing claims');
  for (const c of adv) assert.equal(c.provenance?.lane, 'filing');
  rmSync(tmp, { recursive: true, force: true });
});
