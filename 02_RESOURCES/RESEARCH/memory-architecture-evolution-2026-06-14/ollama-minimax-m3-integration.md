[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
## Memory ↔ Filing Integration + Persistence

### 1. Filing decisions → canonical claims? **YES.**

Every `assess()` that recommends a placement emits a canonical event. Cheap dedup, durable, every lane sees placement history.

```js
// S1 — filing → canonical seam (reuse mintEventId for free idempotency)
const e = assess(path);
if (e.misplaced && e.recommendedZone) {
  appendClaim('filing', sessionId, {
    kind: 'assert',
    subject: `filing.placed`,
    predicate: path,
    object: { from: e.currentZone, to: e.recommendedZone, zone: e.recommendedZone, risk: e.risk },
    memory_type: 'placement', tier: 'system', lifecycle: 'active',
  });
}
```

Two predicates: `filing.misplaced` (assessment-only, advisory) and `filing.placed` (post-move, authoritative). Chain via `supersedes`. Emit **only on transition** (was-misplaced-and-isn't-now OR was-placed-elsewhere) to keep event volume bounded.

### 2. Reuse `stalenessScore` for canonical compaction? **YES, with a state wrapper.**

`buildReadView`/`foldCanonical` currently keep all `supersedes`-dethroned events in `canonical.jsonl` forever and never downgrade. Reuse is free — `confidenceDecay` is the only decay source in the system.

```js
// S2 — staleness reuse (export from filing-assessor, consume in memory-canonical-store)
export function compactionScore(event, ageHours, halfLifeHours = 24*30) {
  if (event.kind === 'retract') return 1;                              // dead-on-arrival
  if (event.supersedes || event._supersededBy) return 0.9;            // dethroned — almost dead
  if (event.kind === 'update' || event.kind === 'link') return Math.min(0.5, stalenessScore(ageHours, halfLifeHours));
  return stalenessScore(ageHours, halfLifeHours);                     // active claim, decay normally
}
```

**Do NOT use it for `retract` decisions** — retraction is causal (VC-dominance), not age-driven. Compaction is purely for log-size + read-view latency.

### 3. Memory artifacts placed by filing-assessor into `CANONICAL_ZONES`? **PARTIAL — pin + declare, don't route.**

- **Live mutable store** (`_SYSTEM/state/memory-canonical/{shards,canonical.jsonl,read-view.json,drainer-offsets.json}`) → add to **`PINNED_ANCHORS`**. These are the @-include of the canonical layer; moving them kills cross-lane read. Single edit, no new mechanism.
- **Backups** → add zone rule: `{zone:'_SYSTEM/backups', kind:'backup', test: inZone(rel,'_SYSTEM/backups')}`. One line in `ZONE_RULES`.
- **Source dirs** (`.claude/memory/`, `_SYSTEM/memory/`) → already settled (dot-dir prefix + existing zone). No new rules; `isSettled` suppresses.
- **At drainer boot, call `assess()` on the canonical-truth paths** → emit a `filing.canonical-store-pinned` claim listing them. This is filing's role: **declaration**, not relocation. Memory files are dynamic state, not artifacts — never route through `filing-autonomy`.

### 4. Persistence / carries-forward / off-disk durability

**Tiered, owner-gated, two-flag AND (mirrors `armedState`):**

| Tier | Where | When | Mechanism |
|---|---|---|---|
| **Hot** | `_SYSTEM/state/memory-canonical/` (gitignored) | continuous | shards append+fsync, drainer checkpoint LAST (durability ordering ✓) |
| **Warm** | `_SYSTEM/backups/memory/YYYY-MM-DD/canonical-dump.tar.zst` + `SHA256SUMS` | post-drain + daily | new `memory-persistence-sweep.mjs` (DISARMED, `YURI_MEMORY_PERSIST=1` + flag-file, reuses `atomicWriteFile` + `armedState`) |
| **Cold** | Time Machine (always) · rclone → B2/iCloud (env-gated, keychain creds) | daily | rclone-sidecar, env-flag |
| **Coldest (durability floor)** | `git bundle create` of `canonical.jsonl` + `read-view.json` → committed to a tracked bundle dir | quarterly, owner | survives disk wipe; 1-line restore |

**Crash recovery is already idempotent** by construction (drainer re-folds, dedups by `eventId`, offsets never point past un-folded data). Add weekly shard rotation when `shard > 50MB` to bound read latency.

**Restore CLI:** `memory-canonical-store.mjs restore --from <tarball-or-bundle>` → validates `SHA256SUMS`, re-stages shards, runs `drainOnce` (rebuilds read-view).

### Shared-mechanism reuse map

| Primitive (existing) | Reused by | Cost |
|---|---|---|
| `contentHashOf` / `mintEventId` (sha256) | S1 filing-decision dedup | free |
| `nano-lease` | S4 `persister:canonical-memory` lease | free |
| `atomicWriteFile` (temp+rename+fsync) | `SHA256SUMS`, backup manifest, offset file | free |
| `confidenceDecay` (math-kernel) | S2 `compactionScore` | thin wrapper |
| `armedState` (filing-autonomy) | S4 persistence sweep | copy pattern |
| `PINNED_ANCHORS` | canonical-truth live paths | 1 edit |
| `CANONICAL_ZONES` | `_SYSTEM/backups` zone | 1 line |
| `planHashOf` (sha256 sorted lines) | S4 persistence run-hash | copy shape |

### Persistence design summary

`memory-persistence-sweep.mjs` (new, DISARMED default): post-drain hook (synchronous) + daily timer. Inputs: `resolveDirs()` paths. Outputs: zst tarball, `SHA256SUMS`, run-ledger at `_SYSTEM/state/memory-persistence-ledger.jsonl`, optional rclone + git-bundle. Reuses `nano-lease` for single-persister safety, `armedState` for kill-switch, `planHashOf` for the run hash. Same governance shape as `filing-autonomy` — same owner trust, same blast-radius discipline.

### Highest-leverage seam + biggest risk

**S1 — filing decisions → canonical claims via `appendClaim`.** Cost = one line per filing run. Value = every lane sees placement, every recall can facet on `filing.zone`, every future `compactCanonical` knows history, every restore replays decisions. Filing goes from session-local dry-run to durable shared truth — turns filing from a tool into memory.

**Biggest risk: the same S1 floods canonical.** A bug in `assess()` or a malicious lane could emit thousands of filing events per tick, bloat `canonical.jsonl`, and corrupt the dedup set. Mitigations MUST ship with the seam: (a) per-run cap ≤50 filing events, hard-rejected past that; (b) `provenance.lane='filing'` advisory flag — `loadCanonical` callers opt in explicitly, not on by default; (c) re-verify `isProtectedPath/isPinned/isSettled` at emit time (drop at source); (d) **closed-enum zone predicate** — `object.zone` ∈ `CANONICAL_ZONES ∪ {EPHEMERAL, unclassified}` or reject, never accept arbitrary strings.
