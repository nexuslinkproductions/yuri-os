[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
**1. New — `_SYSTEM/Scripts/filing-canonical-bridge.mjs`**
```js
import { appendClaim } from './memory-canonical-store.mjs';
import { assess, isPinned, isProtectedPath, CANONICAL_ZONES } from './filing-assessor.mjs';

export const MAX_PER_RUN = 50;
const ALLOWED_ZONES = new Set([...CANONICAL_ZONES, 'EPHEMERAL', 'unclassified']);
const _runCount = new Map();                                  // sessionId → emitted count

export function emitFilingClaim(sessionId, decision, opts = {}) {
  if (!sessionId) return { ok: false, reason: 'sessionId required' };
  const fp = String(decision?.subject || '');
  const zone = decision?.object?.zone;
  if (!fp) return { ok: false, reason: 'subject (path) required' };
  if (zone == null) return { ok: false, reason: 'object.zone required' };
  if (zone !== 'unclassified' && !ALLOWED_ZONES.has(zone))
    return { ok: false, reason: `zone "${zone}" not in closed enum`, allowed: [...ALLOWED_ZONES] };
  // re-verify at emit (never trust caller-side pre-check; state may have shifted)
  if (isProtectedPath(fp)) return { ok: false, reason: 'protected — veto' };
  if (isPinned(fp))        return { ok: false, reason: 'pinned — veto' };
  const a = assess(fp);
  if (a.protected || a.pinned) return { ok: false, reason: 'assessor veto at emit' };
  const n = _runCount.get(sessionId) || 0;
  if (n >= MAX_PER_RUN) return { ok: false, reason: `per-run cap ${MAX_PER_RUN} reached` };
  _runCount.set(sessionId, n + 1);
  return appendClaim('filing', sessionId, {
    kind: 'filing-decision', subject: fp, predicate: 'recommended-zone',
    object: { zone, ...decision.object },
    domain: 'filing', tier: 'advisory', lifecycle: 'transition',
    memory_type: 'filing-decision',
  }, opts);
}

export function _resetRun(sessionId) { _runCount.delete(sessionId); }
export { ALLOWED_ZONES };
```

**2. Patch — `memory-canonical-store.mjs` (`loadCanonical`): opt-in for filing advisory**
```diff
 export function loadCanonical(opts = {}) {
   const { base } = resolveDirs(opts);
   const { byKey } = foldCanonical(base);
-  return [...byKey.values()];
+  const all = [...byKey.values()];
+  // OFF by default: filing-lane claims are advisory (transition-only). Opt in to surface them.
+  return opts.includeAdvisory ? all : all.filter((c) => c.provenance?.lane !== 'filing');
 }
```

**3. Patch — `filing-assessor.mjs`**

PINNED_ANCHORS — add live canonical store (the frozen path: base dir, symlink, shards, read-view, offsets):
```diff
   '_SYSTEM/yuri-graph.json', '_SYSTEM/yuri-graph-state.json', '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json',
+  // live canonical-truth store (frozen; mutator must never relocate)
+  '_SYSTEM/state/memory-canonical', '_SYSTEM/state/memory-canonical/canonical.jsonl',
+  '_SYSTEM/state/memory-canonical/shards', '_SYSTEM/state/memory-canonical/read-view.json',
+  '_SYSTEM/state/memory-canonical/drainer-offsets.json',
 ]);
```

ZONE_RULES — add `_SYSTEM/backups` by-zone, after `_SYSTEM/state`, before `_SYSTEM/config` (resident lock, before any by-keyword fallback):
```diff
   { zone: '_SYSTEM/state', kind: 'state/telemetry', test: (p, name, ext, rel) => name.endsWith('.jsonl') || (name.endsWith('.json') && inZone(rel, '_SYSTEM/state')) },
+  { zone: '_SYSTEM/backups', kind: 'backup', test: (p, name, ext, rel) => inZone(rel, '_SYSTEM/backups') },
   { zone: '_SYSTEM/config', kind: 'config-registry', test: (p, name, ext, rel) => name.endsWith('.json') && (inZone(rel, '_SYSTEM/config') || (rel.startsWith('_SYSTEM/') && rel.split('/').length === 2 && reConfigJson.test(name))) },
```

**4. Test — `_SYSTEM/Scripts/filing-canonical-bridge.test.mjs`**
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { emitFilingClaim, MAX_PER_RUN, _resetRun } from './filing-canonical-bridge.mjs';
import { loadCanonical } from './memory-canonical-store.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'fb-'));
const opts = { dir: tmp };              // isolates from live store (resolveDirs honours opts.dir)
const sid = 't1';

test('zone enum + vetoes + per-run cap + loadCanonical opt-in', () => {
  _resetRun(sid);
  // closed-enum: unknown zone rejected
  assert.equal(emitFilingClaim(sid, { subject: 'a.md', object: { zone: 'NOPE' } }, opts).ok, false);
  // EPHEMERAL + unclassified + known CANONICAL_ZONES accepted
  assert.equal(emitFilingClaim(sid, { subject: 'x.bak', object: { zone: 'EPHEMERAL' } }, opts).ok, true);
  assert.equal(emitFilingClaim(sid, { subject: 'm.xyz', object: { zone: 'unclassified' } }, opts).ok, true);
  assert.equal(emitFilingClaim(sid, { subject: '02_RESOURCES/RESEARCH/x.md', object: { zone: '02_RESOURCES/RESEARCH' } }, opts).ok, true);
  // pinned + protected re-verified at emit
  assert.equal(emitFilingClaim(sid, { subject: '_SYSTEM/yuri-origin.md', object: { zone: '_SYSTEM/docs' } }, opts).ok, false);
  assert.equal(emitFilingClaim(sid, { subject: '.env',                object: { zone: 'EPHEMERAL' } }, opts).ok, false);
  // per-run cap: 3 used → 47 more allowed → cap rejects remainder
  let ok = 0, cap = 0;
  for (let i = 0; i < 60; i++) {
    const r = emitFilingClaim(sid, { subject: `c${i}.md`, object: { zone: 'unclassified' } }, opts);
    if (r.ok) ok++; else if (/cap/.test(r.reason || '')) cap++;
  }
  assert.equal(ok + 3, MAX_PER_RUN);
  assert.equal(cap, 60 - ok);
  // loadCanonical OFF by default excludes filing; includeAdvisory:true includes
  assert.equal(loadCanonical(opts).length, 0);
  const adv = loadCanonical({ ...opts, includeAdvisory: true });
  assert.equal(adv.length, MAX_PER_RUN);
  for (const c of adv) assert.equal(c.provenance?.lane, 'filing');
});

test('teardown', () => { rmSync(tmp, { recursive: true, force: true }); });
```

Run: `node --test _SYSTEM/Scripts/filing-canonical-bridge.test.mjs` (uses `opts.dir` → temp; never touches live store).

**Advisory until Claude verifies.**
