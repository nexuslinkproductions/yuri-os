[2m[tool] read_file[0m
[2m[tool] grep[0m
[2m[tool] read_file[0m
[2m[tool] grep[0m
[2m[tool] read_file[0m
[2m[tool] grep[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] search[0m
[2m[tool] grep[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] grep[0m
[2m[tool] bash[0m
## Inc 3 COMPACTION — Implementation-Grade Code

### 1. Add to `memory-canonical-store.mjs` — constants + import (after `ROTATION_DEFAULT_BYTES` block)

```js
const COMPACT_DEAD_RATIO = 0.3;      // compact when >30% sealed-gen events are dead
const COMPACT_GEN_THRESHOLD = 5;     // compact when sealed gen count exceeds this
const SEAL_TTL_MS = 86_400_000;     // 24h before sealed gen eligible for unlink
const SEAL_STABLE_MS = 300_000;     // 5min mtime stability required before unlink
```

Add import alongside existing `import { atomicWriteFile … }`:

```js
import { stalenessScore } from './filing-assessor.mjs';
```

### 2. New functions (after `sealAndRotate`, before `appendClaim`)

```js
/** LOG-SIZE compaction score for a generation file. stalenessScore × deadRatio. NEVER retracts decisions. */
export function compactionScore(genPath, opts = {}) {
  const base = opts.base || path.dirname(genPath);
  if (!existsSync(genPath)) return { score: 0, ageHours: 0, totalEvents: 0, deadEvents: 0, deadRatio: 0, genPath };
  const { byKey } = foldCanonical(base);
  const liveIds = new Set([...byKey.values()].map((e) => e.eventId));
  let total = 0, dead = 0;
  for (const ln of readFileSync(genPath, 'utf8').split('\n')) {
    const t = ln.trim(); if (!t) continue;
    let e; try { e = JSON.parse(t); } catch { continue; }
    if (!e?.eventId) continue;
    total += 1;
    if (!liveIds.has(e.eventId)) dead += 1;
  }
  const deadRatio = total > 0 ? dead / total : 0;
  const ageHours = Math.max(0, (Date.now() - statSync(genPath).mtimeMs) / 3_600_000);
  return { score: stalenessScore(ageHours, opts.halfLifeHours ?? 168) * deadRatio, ageHours, totalEvents: total, deadEvents: dead, deadRatio, genPath };
}

/** Compact sealed generations: rewrite live-only events into gen-00001, drop retracted + superseded.
 *  Triggers when deadRatio > threshold OR sealed gen count > genThreshold. Reuses listGenerations + foldCanonical. */
export function compactGeneration(base, canonicalLog, opts = {}) {
  const deadRatioTh = opts.compactDeadRatio ?? COMPACT_DEAD_RATIO;
  const genTh = opts.compactGenThreshold ?? COMPACT_GEN_THRESHOLD;
  let curLive; try { curLive = realpathSync(canonicalLog); } catch { return { compacted: false, reason: 'no-current-gen' }; }
  const sealed = listGenerations(base).filter((g) => g !== curLive);
  if (sealed.length === 0) return { compacted: false, reason: 'no-sealed-gens' };
  const { byKey } = foldCanonical(base);
  const liveIds = new Set([...byKey.values()].map((e) => e.eventId));
  let total = 0, dead = 0; const live = [];
  for (const gen of sealed) {
    if (!existsSync(gen)) continue;
    for (const ln of readFileSync(gen, 'utf8').split('\n')) {
      const t = ln.trim(); if (!t) continue;
      let e; try { e = JSON.parse(t); } catch { continue; }
      if (!e?.eventId) continue;
      total += 1;
      if (liveIds.has(e.eventId)) { live.push(t); } else { dead += 1; }
    }
  }
  const dr = total > 0 ? dead / total : 0;
  if (dr < deadRatioTh && sealed.length <= genTh) return { compacted: false, deadRatio: dr, sealedGens: sealed.length };
  const dst = path.join(base, genName(1));
  atomicWriteFile(dst, live.map((l) => `${l}\n`).join(''), { fsync: true });
  const rm = [];
  for (const g of sealed) { if (g === dst) continue; try { rmSync(g, { force: true }); rm.push(g); } catch { /* best-effort */ } }
  return { compacted: true, liveEvents: live.length, deadEvents: dead, totalEvents: total, deadRatio: dr, gensRemoved: rm.length };
}

/** Safe-unlink sealed generations older than SEAL_TTL with stable mtime. Never unlinks the current live gen. */
export function safeUnlinkSealedGens(base, canonicalLog, opts = {}) {
  const ttl = opts.sealTtlMs ?? SEAL_TTL_MS;
  const stable = opts.sealStableMs ?? SEAL_STABLE_MS;
  const now = Date.now();
  let curLive; try { curLive = realpathSync(canonicalLog); } catch { return { unlinked: [], skipped: [], reason: 'no-current-gen' }; }
  const unlinked = [], skipped = [];
  for (const gen of listGenerations(base)) {
    if (gen === curLive) { skipped.push({ path: gen, reason: 'current-live' }); continue; }
    try {
      const age = now - statSync(gen).mtimeMs;
      if (age < ttl) { skipped.push({ path: gen, reason: `age-${Math.round(age / 3_600_000)}h<ttl` }); continue; }
      if (age < stable) { skipped.push({ path: gen, reason: 'mtime-unstable' }); continue; }
      rmSync(gen, { force: true }); unlinked.push(gen);
    } catch (e) { skipped.push({ path: gen, reason: e.message }); }
  }
  return { unlinked, skipped };
}
```

### 3. `drainOnce` hook — two insertions + return change

**After fold loop, before lease-loss guard** (`// LEASE-LOSS GUARD` line):

```js
    // Inc 3: COMPACTION
    let compacted = null;
    try { compacted = compactGeneration(base, canonicalLog, opts); } catch { /* non-fatal */ }
```

**After rotation block, before return:**

```js
    // Inc 3: SAFE-UNLINK
    let unlinked = null;
    try { unlinked = safeUnlinkSealedGens(base, canonicalLog, opts); } catch { /* non-fatal */ }
```

**Return line** — change to:

```js
    return { ok: true, folded, skipped, shards: shards.length, claims: Object.keys(view.claims).length, rotated, compacted, unlinked };
```

### 4. Update `@exports` line

```
// @exports: appendClaim, drainOnce, loadCanonical, readView, contentHashOf, mintEventId, shardPath, resolveDirs, listGenerations, MAX_EVENT_BYTES, DRAIN_LEASE_ID, compactGeneration, compactionScore, safeUnlinkSealedGens
```

### 5. Test additions (`memory-canonical-store.test.mjs`)

Add to imports:

```js
import { compactGeneration, compactionScore, safeUnlinkSealedGens, resolveDirs, listGenerations } from './memory-canonical-store.mjs';
import { realpathSync } from 'node:fs';
```

Three tests inside the existing `describe` block:

```js
  it('T-compaction: drops retracted+superseded, keeps live state', () => {
    const dir = tmp();
    const v1 = appendClaim('lane-a', 's1', { subject: 'x', predicate: 'p', object: 1 }, { dir });
    appendClaim('lane-a', 's1', { subject: 'y', predicate: 'p', object: 2 }, { dir });
    drainOnce('d1', { dir, rotationBytes: 300 });
    appendClaim('lane-a', 's1', { kind: 'update', subject: 'x', predicate: 'p', object: 99, supersedes: v1.eventId }, { dir });
    appendClaim('lane-a', 's1', { kind: 'retract', subject: 'y', predicate: 'p' }, { dir });
    drainOnce('d1', { dir, rotationBytes: 300 });
    const { base, canonicalLog } = resolveDirs({ dir });
    const r = compactGeneration(base, canonicalLog, { compactDeadRatio: 0, compactGenThreshold: 0 });
    assert.equal(r.compacted, true); assert.ok(r.deadEvents > 0);
    const live = loadCanonical({ dir });
    assert.equal(live.length, 1); assert.equal(live[0].object, 99);
  });

  it('T-compaction-score: staleness × deadRatio, LOG-SIZE only', () => {
    const dir = tmp();
    appendClaim('lane-a', 's1', { subject: 'a', predicate: 'p', object: 1 }, { dir });
    drainOnce('d1', { dir, rotationBytes: 300 });
    const { base } = resolveDirs({ dir });
    const s = compactionScore(listGenerations(base)[0], { base });
    assert.equal(typeof s.score, 'number'); assert.ok(s.deadRatio >= 0 && s.deadRatio <= 1);
  });

  it('T-safe-unlink: old sealed gens unlinked, live gen kept', () => {
    const dir = tmp();
    for (let i = 0; i < 4; i++) appendClaim('lane-a', 's1', { subject: `s${i}`, predicate: 'p', object: i }, { dir });
    drainOnce('d1', { dir, rotationBytes: 200 });
    appendClaim('lane-a', 's1', { subject: 's5', predicate: 'p', object: 5 }, { dir });
    drainOnce('d1', { dir, rotationBytes: 200 });
    const { base, canonicalLog } = resolveDirs({ dir });
    const curLive = realpathSync(canonicalLog);
    const old = listGenerations(base).find((g) => g !== curLive);
    fs.utimesSync(old, new Date(Date.now() - 2 * 86_400_000), new Date(Date.now() - 2 * 86_400_000));
    const r = safeUnlinkSealedGens(base, canonicalLog, { sealTtlMs: 86_400_000, sealStableMs: 0 });
    assert.ok(r.unlinked.length >= 1); assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(curLive)); assert.equal(loadCanonical({ dir }).length, 5);
  });
```

**Design notes:** `compactGeneration` rewrites only live events (from `foldCanonical`'s `byKey`) into `gen-00001`, removes all other sealed gens, leaves the current live gen untouched. `compactionScore` wraps `stalenessScore` × `deadRatio` for log-size observability — never retracts decisions. `safeUnlinkSealedGens` removes sealed gens past `SEAL_TTL` (24h) with stable mtime, never touches the symlink target. Both are non-fatal in `drainOnce` (try/catch). Advisory until Claude verifies.
