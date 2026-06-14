# BUILD SPEC — P0+P1 (API-grounded, build-ready)

> Final synthesis round. Every API below is CLAUDE-VERIFIED against the real source (not assumed). Owner greenlit build of P0+P1 (synthetic-test only, no live store mutation, contract applied later at P6).

## VERIFIED PRIMITIVE APIs (the wiring contract)

| Primitive | Real signature (✓ read from source) | Use |
|---|---|---|
| `nano-lease.mjs` | `acquireLease(id,nanoId,{ttlMs})→{ok,leaseId,dir}\|{ok:false,heldBy}` · `renewLease(id,nanoId,{ttlMs})→bool` · `releaseLease(id,nanoId)→bool` · `reclaimLeases(now)→[]` · `acquireOrWait(...)` | Drainer election. `holderAlive = pidLive && fresh` already defeats PID-reuse. Use `ttlMs:30000`. |
| `_lib/fs.mjs` | `atomicWriteFile(path,data,{mkdir})` · `readJsonOrNull(path)` | Atomic temp+rename publish for read-view + offset checkpoint. |
| `memory-kernel.appendLineDurable` | `openSync('a')→appendFileSync(fd,line)→fsyncSync(fd)→closeSync` (INTERNAL, not exported) | Replicate the 6-line pattern in shard store (don't edit memory-kernel). |
| `yuri-nerve` | `mintEventId` uses FNV-1a 32-bit; append + load-dedup-by-id | PATTERN template only. Canonical store uses **sha256** (FNV collides ~65k events). |
| `nano-doc-assembler` | fixed-section model (`defineDoc`/`writeSection`) | PRINCIPLE only (one-writer-per-file). NOT the shard API — wrong shape for unbounded streams. |

## CORRECTIONS THIS ROUND MADE (vs workflow spec)
1. Drop the "birth-time sentinel" P1 guard — `nano-lease` already handles PID-reuse (`pidLive && fresh`).
2. Shard append = `appendLineDurable` pattern per-lane-file, NOT `nano-doc-assembler` (fixed-section, wrong shape).
3. Content hash = sha256, NOT FNV-1a 32-bit (scale collision).
4. Reuse `_lib/fs.mjs atomicWriteFile` for atomic publish (already proven).

## P0 — Guards (folded into the module, no separate phase artifact)
- Event byte cap: reject `Buffer.byteLength(line) > 4096` at append (torn-write floor; on Darwin PIPE_BUF=512 is moot because one-writer-per-shard, but cap bounds line size for the skip-on-parse-fail recovery).
- Per-shard write = one writer per file (lane-id + session-id in filename) → zero cross-writer interleave by construction.
- Trailing `\n` convention + skip-on-parse-fail read (matches memory-kernel readJsonlRows).
- Drainer SIGTERM → `releaseLease` before exit.
- Paths env-overridable (`YURI_CANONICAL_DIR`) → tests run in temp, live store untouched.

## P1 — Module: `_SYSTEM/Scripts/memory-canonical-store.mjs` (@capability: memory-canonical-store)
Exports:
- `shardPath(laneId, sessionId)` → `<dir>/shards/<lane>-<session>.jsonl`
- `appendClaim(laneId, sessionId, claim)` → mints `eventId = sha256(kind+subject+predicate+object)`, builds envelope `{v,eventId,kind,subject,predicate,object,contentHash,supersedes,provenance{lane,session},vc,memory_type,domain,tier,lifecycle,stamp}`, byte-caps, append+fsync to own shard. Returns `{ok,eventId,bytes}`.
- `drainOnce(drainerId, {dir})` → `acquireLease("drainer:canonical",drainerId,{ttlMs:30000})`; if held, return `{ok:false,heldBy}`. Read offset checkpoint; read all shard files from their per-shard offsets; fold events into canonical.jsonl (dedup by contentHash via in-memory set seeded from existing canonical + supersede-by-eventId); write read-view + new offsets via `atomicWriteFile`; `releaseLease`. Idempotent (re-fold = no-op).
- `loadCanonical({dir})` → dedup-by-eventId, supersede semantics, skip-malformed. Returns current claim set.
- `readView({dir})` → materialized `{claims, contested, foldedAt}` (open read, no wrapper).

## TESTS — `_SYSTEM/Scripts/memory-canonical-store.test.mjs` (temp dir, fault-injected)
- T1 concurrent-append integrity: N parallel appenders to DIFFERENT shards → all valid JSON, zero interleave.
- T3 dedup-under-race: two lanes append same fact → exactly 1 in read-view after drain.
- T4 drainer crash-recovery: kill after partial fold (re-run drainOnce from checkpoint) → all events, zero dups, idempotent.
- T5 election: two drainers, one gets lease, other gets `{ok:false,heldBy}`.
- T-cap: event >4096B rejected at append.
- T-supersede: `supersedes` chain resolves to latest.

Gate: all green + FILE_COUNT/TERM_COUNT evidence. No live store touched (temp dir only).
