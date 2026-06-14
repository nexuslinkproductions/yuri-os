// _SYSTEM/Scripts/memory-canonical-store.test.mjs
// P1 gate for the canonical truth convergence store — node:test + node:assert only, zero external deps.
// Runs entirely in temp dirs (opts.dir); NO live store is touched. Lease isolation requires
// YURI_NANO_LEASES_DIR to be set to a temp dir in the runner env (see the run command).

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appendClaim, drainOnce, loadCanonical, readView,
  contentHashOf, mintEventId, shardPath, MAX_EVENT_BYTES, DRAIN_LEASE_ID,
  resolveDirs, listGenerations, compactGeneration, compactionScore, safeUnlinkSealedGens,
} from './memory-canonical-store.mjs';
import { acquireLease, releaseLease } from './nano-lease.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mcs-'));
const lineCount = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length : 0);

describe('memory-canonical-store (P1)', () => {

  // T-cap — oversized event rejected at append (torn-write floor).
  it('T-cap: event > MAX_EVENT_BYTES is rejected, not appended', () => {
    const dir = tmp();
    const big = 'x'.repeat(MAX_EVENT_BYTES + 100);
    const r = appendClaim('lane-a', 's1', { subject: 'big', predicate: 'p', object: big }, { dir });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'event-too-large');
    assert.ok(!fs.existsSync(shardPath('lane-a', 's1', { dir })), 'no shard file written for rejected event');
  });

  // T3 — same fact from two different lanes dedups to ONE canonical claim.
  it('T3: dedup — identical fact from two lanes -> 1 canonical event', () => {
    const dir = tmp();
    const fact = { subject: 'yuri://self/name', predicate: 'identity.name', object: 'YURI' };
    const a = appendClaim('claude', 's1', fact, { dir });
    const b = appendClaim('deepseek', 's2', fact, { dir });
    assert.equal(a.eventId, b.eventId, 'same fact -> same eventId across lanes');
    const res = drainOnce('drainer-1', { dir });
    assert.equal(res.ok, true);
    assert.equal(res.folded, 1, 'exactly one event folded');
    assert.equal(res.skipped, 1, 'the duplicate was skipped');
    assert.equal(loadCanonical({ dir }).length, 1);
  });

  // T1 — many events across many shards all fold; per-shard offsets track correctly.
  it('T1: multi-shard append integrity — all distinct events fold once', () => {
    const dir = tmp();
    let n = 0;
    for (let lane = 0; lane < 5; lane += 1) {
      for (let i = 0; i < 20; i += 1) {
        const r = appendClaim(`lane-${lane}`, 'sess', { subject: `s${lane}-${i}`, predicate: 'rel', object: i }, { dir });
        assert.equal(r.ok, true); n += 1;
      }
    }
    const res = drainOnce('drainer-1', { dir });
    assert.equal(res.ok, true);
    assert.equal(res.folded, n, `all ${n} events folded`);
    assert.equal(loadCanonical({ dir }).length, n);
    // every canonical line is valid JSON with an eventId
    const { canonicalLog } = { canonicalLog: path.join(dir, 'canonical.jsonl') };
    for (const ln of fs.readFileSync(canonicalLog, 'utf8').split('\n')) {
      if (!ln.trim()) continue;
      const e = JSON.parse(ln); assert.ok(e.eventId, 'each line has eventId');
    }
  });

  // T4 — crash before offset checkpoint -> re-fold is idempotent (dedup-set seeded from canonical).
  it('T4: crash-recovery — re-fold after lost offsets adds zero duplicates', () => {
    const dir = tmp();
    appendClaim('lane-a', 's1', { subject: 'a', predicate: 'p', object: 1 }, { dir });
    appendClaim('lane-a', 's1', { subject: 'b', predicate: 'p', object: 2 }, { dir });
    const r1 = drainOnce('drainer-1', { dir });
    assert.equal(r1.folded, 2);
    const canonicalLog = path.join(dir, 'canonical.jsonl');
    const before = lineCount(canonicalLog);
    // simulate crash AFTER canonical append but BEFORE offset checkpoint: delete the offsets file
    fs.rmSync(path.join(dir, 'drainer-offsets.json'), { force: true });
    const r2 = drainOnce('drainer-1', { dir });
    assert.equal(r2.ok, true);
    assert.equal(r2.folded, 0, 're-fold folds nothing new');
    assert.equal(r2.skipped, 2, 'both re-read events skipped as already-known');
    assert.equal(lineCount(canonicalLog), before, 'canonical.jsonl unchanged — zero duplication');
  });

  // T5 — drainer election: a held lease blocks a second drainer (no split-brain).
  it('T5: election — second drainer is refused while lease held', () => {
    const dir = tmp();
    appendClaim('lane-a', 's1', { subject: 'x', predicate: 'p', object: 1 }, { dir });
    const held = acquireLease(DRAIN_LEASE_ID, 'holder', { ttlMs: 30_000 });
    assert.equal(held.ok, true, 'holder acquires the drain lease');
    try {
      const res = drainOnce('other-drainer', { dir });
      assert.equal(res.ok, false);
      assert.equal(res.heldBy, 'holder', 'second drainer sees the holder, does not fold');
      assert.equal(lineCount(path.join(dir, 'canonical.jsonl')), 0, 'nothing folded while blocked');
    } finally {
      releaseLease(DRAIN_LEASE_ID, 'holder');
    }
    // after release, a drainer succeeds
    const ok = drainOnce('other-drainer', { dir });
    assert.equal(ok.ok, true);
    assert.equal(ok.folded, 1);
  });

  // T-supersede — an update supersedes the prior claim for the same (subject,predicate).
  it('T-supersede: update replaces the prior value in the read-view', () => {
    const dir = tmp();
    const v1 = appendClaim('lane-a', 's1', { subject: 'yuri://tone', predicate: 'style', object: 'neutral' }, { dir });
    drainOnce('d1', { dir });
    appendClaim('lane-a', 's1', { kind: 'update', subject: 'yuri://tone', predicate: 'style', object: 'direct', supersedes: v1.eventId }, { dir });
    const res = drainOnce('d1', { dir });
    assert.equal(res.ok, true);
    const view = readView({ dir });
    const claim = Object.values(view.claims).find((c) => c.subject === 'yuri://tone' && c.predicate === 'style');
    assert.ok(claim, 'superseded claim present in read-view');
    assert.equal(claim.object, 'direct', 'read-view shows the superseding value');
    assert.equal(loadCanonical({ dir }).filter((c) => c.subject === 'yuri://tone').length, 1, 'one active claim for the key');
  });

  // T-retract — a retract removes the claim from the read-view.
  it('T-retract: retract removes the claim from current state', () => {
    const dir = tmp();
    appendClaim('lane-a', 's1', { subject: 'fact://temp', predicate: 'holds', object: true }, { dir });
    drainOnce('d1', { dir });
    assert.equal(loadCanonical({ dir }).length, 1);
    appendClaim('lane-a', 's1', { kind: 'retract', subject: 'fact://temp', predicate: 'holds' }, { dir });
    drainOnce('d1', { dir });
    assert.equal(loadCanonical({ dir }).length, 0, 'retracted claim is gone from current state');
  });

  // hash determinism + open peer read shape
  it('hash: same claim -> same sha256 eventId, different object -> different', () => {
    const h1 = contentHashOf({ subject: 's', predicate: 'p', object: 'a' });
    const h2 = contentHashOf({ subject: 's', predicate: 'p', object: 'a' });
    const h3 = contentHashOf({ subject: 's', predicate: 'p', object: 'b' });
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
    assert.equal(h1.length, 64, 'sha256 hex (not FNV-32)');
    assert.ok(mintEventId({ subject: 's', predicate: 'p', object: 'a' }).startsWith('evt.assert.'));
  });

  it('readView open-read returns a well-formed (possibly empty) view', () => {
    const dir = tmp();
    const v = readView({ dir });
    assert.ok('claims' in v && 'contested' in v, 'view has claims + contested buckets');
  });

  // T-rotation (P2 Inc 2) — canonical rotates by size; events fold across generations; zero loss; old gen sealed.
  it('T-rotation: rotate by size, fold across generations, zero loss, old gen sealed', () => {
    const dir = tmp();
    for (let i = 0; i < 6; i += 1) appendClaim('lane-a', 's1', { subject: `r${i}`, predicate: 'p', object: i }, { dir });
    const r1 = drainOnce('d1', { dir, rotationBytes: 300 });   // fold 6, then rotate (gen exceeds 300 bytes)
    assert.equal(r1.folded, 6);
    assert.ok(r1.rotated, 'rotation triggered after threshold');
    for (let i = 6; i < 10; i += 1) appendClaim('lane-a', 's1', { subject: `r${i}`, predicate: 'p', object: i }, { dir });
    const r2 = drainOnce('d2', { dir, rotationBytes: 300 });
    assert.equal(r2.folded, 4, 'post-rotation events fold into the NEW generation');
    assert.equal(loadCanonical({ dir }).length, 10, 'all events present across generations — zero loss');
    const gens = fs.readdirSync(dir).filter((n) => n.startsWith('canonical.gen-'));
    assert.ok(gens.length >= 2, `multiple generations created (got ${gens.length})`);
    assert.match(fs.readFileSync(path.join(dir, 'canonical.gen-00001.jsonl'), 'utf8'), /"seal":true/, 'first generation sealed');
    assert.ok(fs.lstatSync(path.join(dir, 'canonical.jsonl')).isSymbolicLink(), 'canonical.jsonl is a symlink to current gen');
  });

  // T-rotation-idempotent — re-fold after rotation + lost offsets stays zero-dup across generations.
  it('T-rotation-idempotent: re-fold across generations adds zero duplicates', () => {
    const dir = tmp();
    for (let i = 0; i < 8; i += 1) appendClaim('lane-a', 's1', { subject: `g${i}`, predicate: 'p', object: i }, { dir });
    drainOnce('d1', { dir, rotationBytes: 300 });               // folds + rotates
    fs.rmSync(path.join(dir, 'drainer-offsets.json'), { force: true });  // simulate crash before checkpoint
    const r = drainOnce('d1', { dir, rotationBytes: 300 });
    assert.equal(r.folded, 0, 're-fold across generations folds nothing new');
    assert.equal(loadCanonical({ dir }).length, 8, 'no duplication after multi-generation re-fold');
  });

  // T-compaction (P2 Inc 3) — compaction rewrites sealed gens to live-only; retracted+superseded dropped.
  // Suppress the in-drain auto-compaction (high thresholds) so the MANUAL call is what folds out the dead events.
  it('T-compaction: drops retracted+superseded events, keeps live state intact', () => {
    const dir = tmp();
    const noCompact = { dir, rotationBytes: 300, compactDeadRatio: 2, compactGenThreshold: 9999 };
    const v1 = appendClaim('lane-a', 's1', { subject: 'x', predicate: 'p', object: 1 }, noCompact);
    appendClaim('lane-a', 's1', { subject: 'y', predicate: 'p', object: 2 }, noCompact);
    drainOnce('d1', noCompact);
    appendClaim('lane-a', 's1', { kind: 'update', subject: 'x', predicate: 'p', object: 99, supersedes: v1.eventId }, noCompact);
    appendClaim('lane-a', 's1', { kind: 'retract', subject: 'y', predicate: 'p' }, noCompact);
    drainOnce('d1', noCompact);
    const { base, canonicalLog } = resolveDirs({ dir });
    const r = compactGeneration(base, canonicalLog, { compactDeadRatio: 0, compactGenThreshold: 0 });
    assert.equal(r.compacted, true);
    assert.ok(r.deadEvents > 0, 'compaction recognised dead events');
    const live = loadCanonical({ dir });
    assert.equal(live.length, 1, 'only the live claim survives');
    assert.equal(live[0].object, 99, 'superseding value is the survivor');
  });

  // T-compaction-score — staleness × deadRatio, LOG-SIZE health signal only.
  it('T-compaction-score: returns staleness × deadRatio in valid ranges', () => {
    const dir = tmp();
    appendClaim('lane-a', 's1', { subject: 'a', predicate: 'p', object: 1 }, { dir });
    drainOnce('d1', { dir, rotationBytes: 300 });
    const { base } = resolveDirs({ dir });
    const s = compactionScore(listGenerations(base)[0], { base });
    assert.equal(typeof s.score, 'number');
    assert.ok(s.deadRatio >= 0 && s.deadRatio <= 1, 'deadRatio normalised');
  });

  // T-safe-unlink — an aged sealed gen holding ZERO live claims is unlinked; a live-holding gen is NEVER touched.
  // Suppress auto-compaction so an all-dead sealed gen actually persists for safe-unlink to act on.
  it('T-safe-unlink: aged all-dead sealed gen unlinked, live-holding gen protected, truth preserved', () => {
    const dir = tmp();
    const noCompact = { dir, rotationBytes: 200, compactDeadRatio: 2, compactGenThreshold: 9999 };
    const v1 = appendClaim('lane-a', 's1', { subject: 'k', predicate: 'p', object: 'old' }, noCompact);
    drainOnce('d1', noCompact);                                                    // gen-1=[old] -> rotate -> gen-2 live
    appendClaim('lane-a', 's1', { kind: 'update', subject: 'k', predicate: 'p', object: 'new', supersedes: v1.eventId }, noCompact);
    drainOnce('d1', noCompact);                                                    // gen-2=[new] -> rotate -> gen-3 live
    const { base, canonicalLog } = resolveDirs({ dir });
    const curLive = fs.realpathSync(canonicalLog);
    const gen1 = listGenerations(base).find((g) => /gen-00001/.test(g));           // holds only the (now-dead) old value
    fs.utimesSync(gen1, new Date(Date.now() - 2 * 86_400_000), new Date(Date.now() - 2 * 86_400_000));
    const r = safeUnlinkSealedGens(base, canonicalLog, { sealTtlMs: 86_400_000, sealStableMs: 0 });
    assert.ok(r.unlinked.some((g) => /gen-00001/.test(g)), 'all-dead aged gen was unlinked');
    assert.ok(r.skipped.some((s) => /gen-00002/.test(s.path) && s.reason === 'holds-live-claims'), 'live-holding gen protected');
    assert.ok(fs.existsSync(curLive), 'live generation is kept');
    const live = loadCanonical({ dir });
    assert.equal(live.length, 1, 'zero truth lost');
    assert.equal(live[0].object, 'new', 'the live value survived the unlink');
  });

  // T-compaction-no-resurrect — compaction + lost offsets must NOT resurrect a superseded value (order-independent fold).
  it('T-compaction-no-resurrect: compaction + offset loss never resurrects a superseded value', () => {
    const dir = tmp();
    const v1 = appendClaim('lane-a', 's1', { subject: 'k', predicate: 'p', object: 'old' }, { dir });
    drainOnce('d1', { dir, rotationBytes: 200 });
    appendClaim('lane-a', 's1', { kind: 'update', subject: 'k', predicate: 'p', object: 'new', supersedes: v1.eventId }, { dir });
    drainOnce('d1', { dir, rotationBytes: 200, compactDeadRatio: 0, compactGenThreshold: 0 });  // compaction drops 'old' from canonical
    assert.equal(loadCanonical({ dir })[0].object, 'new');
    fs.rmSync(path.join(dir, 'drainer-offsets.json'), { force: true });            // crash: re-read shard from 0, re-emit 'old'
    drainOnce('d1', { dir, rotationBytes: 200 });
    const live = loadCanonical({ dir });
    assert.equal(live.length, 1, 'still exactly one active claim');
    assert.equal(live[0].object, 'new', 'superseded value did NOT resurrect');
  });
});
