[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] grep[0m
[2m[tool] grep[0m
[2m[tool] grep[0m
[2m[tool] list_dir[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
[2m[tool] bash[0m
## P1→P2 HARDENING: memory-canonical-store.mjs

### 1. GENERATION-BASED ROTATION (shards + canonical.jsonl)

**Bug being killed:** `rename()` on a live log while a writer holds an open fd → writer appends to orphaned inode → silent data loss (DeepSeek fault #9, verified POSIX behavior).

**Design:**
- Canonical log: `canonical-gen-NNNNN.jsonl` + symlink `canonical-current.jsonl → canonical-gen-NNNNN.jsonl`
- Shard files: `shards/<lane>--<session>.jsonl` (already one-writer-per-file, no rotation needed — compaction handles growth)
- `appendClaim` resolves `canonical-current.jsonl` symlink via `fs.realpathSync()` **before every append call** (already no cached fd — `appendDurable` opens/closes per call, so this is a one-line change)
- Drainer seals a generation by: (a) appending a `{kind:"SEAL", gen:N}` sentinel to current gen, (b) creating `canonical-gen-N+1.jsonl`, (c) `symlinkSync("canonical-gen-N+1.jsonl", "canonical-current.jsonl")` — atomic on same FS
- Writers that resolve the symlink after step (c) land in gen-N+1. Writers mid-append in gen-N complete to the old inode (safe — drainer still reads it)
- **Unlink only after TTL:** drainer tracks `lastAppendTime[gen]`. Gen unlinked only when `now - lastAppendTime > SEAL_TTL_MS` (default 60s) AND no new appends detected. This guarantees no writer fd can still be appending
- `readFromOffset` and `canonicalEventIds` scan ALL generations (oldest→newest) to build the full dedup set
- **Shard rotation:** not needed — shards are per-session, bounded by session lifetime. Compaction (§2) handles dead-session cleanup

**Code changes:**
- `resolveDirs()` → add `canonicalCurrentSymlink`, `listGenerations(dir)` (glob `canonical-gen-*.jsonl`, sort)
- `appendClaim` → `logPath = fs.realpathSync(canonicalCurrentSymlink)` before `appendDurable`
- `drainOnce` → after fold, if `canonicalCurrent` size > `ROTATION_SIZE_BYTES` (default 50MB), seal + rotate
- New: `sealGeneration(dir, drainerId)` — write SEAL sentinel, create next gen, swap symlink

### 2. COMPACTION (bound unbounded growth)

**Problem:** `canonical.jsonl` grows forever. Retracted/superseded events are dead weight. `readFromOffset` and `canonicalEventIds` do `readFileSync` of the entire file → OOM at scale.

**Design:**
- Compaction = drainer rewrites the active generation keeping only **live** events (not retracted, not superseded)
- Triggered when: (a) dead-event ratio > `COMPACT_DEAD_RATIO` (default 0.3), OR (b) generation file > `ROTATION_SIZE_BYTES`
- Algorithm: stream-read gen file line-by-line (not `readFileSync` — use `readline` interface), build `byKey`/`byEvent` maps (already in `foldCanonical`), write only final-state events to a new gen file, swap symlink
- **Compaction is a rotation** — old gen sealed, new compacted gen becomes current. Old gen unlinked after TTL
- Shard compaction: drainer unlinks shard files for sessions that no longer exist (pid dead + TTL expired). `reclaimLeases()` already provides the dead-owner signal
- `readFromOffset` → replace `readFileSync` with `fs.createReadStream({ start: fromOffset })` + readline. Bounded memory regardless of file size
- `canonicalEventIds` → stream-read, not bulk. Same pattern
- `foldCanonical` → stream-read. Accumulate only the `byKey`/`byEvent` maps (O(active_claims), not O(total_events))

**Code changes:**
- New: `streamReadJsonl(filePath, fromOffset, onLine)` — replaces both `readFromOffset` and `canonicalEventIds`
- `foldCanonical` → use `streamReadJsonl` internally
- `drainOnce` → after fold, check `deadRatio = (totalEvents - activeClaims) / totalEvents`; if > threshold, trigger compaction
- New: `compactGeneration(dir, drainerId)` — stream-read current gen, write live-only to next gen, seal+swap

### 3. DRAINER DAEMON LOOP + SIGTERM CLEAN RELEASE

**Problem:** `drainOnce` is single-shot. No long-running drainer process exists. Lease is released in the `finally` block but SIGKILL bypasses it, and SIGTERM is unhandled.

**Design:**
```
export async function drainDaemon(drainerId, opts = {}) {
  const interval = opts.intervalMs || 5000;
  const controller = new AbortController();
  
  // SIGTERM → clean shutdown
  const onSignal = async () => {
    controller.abort();
    releaseLease(DRAIN_LEASE_ID, drainerId);  // immediate, not waiting for loop
    process.removeListener('SIGTERM', onSignal);
    process.removeListener('SIGINT', onSignal);
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  
  while (!controller.signal.aborted) {
    await drainOnce(drainerId, opts);          // lease acquired/released per cycle
    await sleep(interval, controller.signal);   // AbortSignal-aware sleep
  }
}
```

- **Lease per cycle, not held across sleep:** `drainOnce` acquires + releases within one call. This means no lease is orphaned if the process dies between cycles — TTL expiry (30s) is the fallback, not SIGTERM
- SIGTERM handler calls `releaseLease` immediately (in case we're mid-drainOnce where the finally hasn't run), then sets abort flag
- **RenewLease not needed** — the per-cycle acquire/release pattern means the lease lives only for the fold duration (~ms). If a second drainer calls `drainOnce` while we're sleeping, it succeeds — this is correct (no drainer monopoly between cycles)
- For a **long-lived daemon** (background process), add `renewLease` on a heartbeat timer within `drainOnce`'s try block for folds that take > TTL. Current fold is fast (stream-read), so 30s TTL is generous
- `drainDaemon` returns a handle `{ stop() }` for programmatic shutdown

**Code changes:**
- New export: `drainDaemon(drainerId, opts)` → `{ stop() }`
- New: `sleep(ms, signal)` — Promise that resolves on timeout or abort
- `drainOnce` unchanged (single-shot still valid for test/manual use)

### 4. MULTI-PROCESS FAULT-INJECTION TESTS

**Problem:** Current tests are single-process. Concurrency bugs (torn writes, split-brain, rotation races) only manifest across OS processes.

**Design — all tests spawn real `child_process.fork()` or `execSync` workers:**

| Test | Method | Pass Criterion |
|---|---|---|
| **T8: rotation-under-write** | Writer process loops `appendClaim` every 50ms. Drainer process calls `drainOnce` + `sealGeneration` mid-stream. Writer continues 200ms post-rotation. | Zero lost events: writer's post-rotate appends land in new gen. Old gen fully drained. `totalEvents = pre + post` |
| **T9: disk-full** | Mount a 1MB tmpfs (Linux) or use `ulimit -f` (macOS). Writer appends until ENOSPC. | `appendClaim` returns `{ok:false, reason:'write-failed'}` — never `ok:true` with lost data. Drainer survives, read-view intact |
| **T10: N-process concurrent append** | 10 child processes, each appends 500 events to own shard simultaneously. Single drainer folds. | 5000 events in canonical, zero interleave, zero malformed lines |
| **T11: dead-drainer reclaim** | Drainer process SIGKILL'd mid-fold (no finally). Second process calls `drainOnce` after TTL. | Lease reclaimed, fold completes, zero dups (idempotent re-fold from canonical seed) |
| **T12: rotation + crash** | Drainer seals gen-N, crashes before symlink swap. New drainer starts. | New drainer detects unsealed gen (no SEAL sentinel), treats it as current, folds correctly |

**Implementation pattern:**
```js
// Worker script: _SYSTEM/Scripts/mcs-test-worker.mjs
// Receives {action, dir, ...params} via IPC, executes, returns result
import { appendClaim, drainOnce } from './memory-canonical-store.mjs';
process.on('message', async (msg) => {
  if (msg.action === 'append-loop') { /* loop appendClaim, send count back */ }
  if (msg.action === 'drain') { /* drainOnce, send result back */ }
});
```
- Parent test spawns N workers via `fork()`, sends params, collects results
- SIGKILL via `worker.kill('SIGKILL')` (no handler possible — that's the point)
- Disk-full: use `child_process.execSync('dd if=/dev/zero of=<tmpfs>/fill bs=1M')` to exhaust a tmpfs mount
- All tests run in temp dirs with isolated `YURI_CANONICAL_DIR` + `YURI_NANO_LEASES_DIR`

### CONCURRENCY HOLES IN CURRENT CODE

1. **`readFileSync` everywhere** — OOM at scale. Stream-read is mandatory for any file that can exceed ~100MB
2. **No rotation** — canonical.jsonl grows unbounded. One file forever = eventual disk exhaustion + single-file read latency
3. **`drainOnce` holds lease for entire fold** — if fold is slow (large canonical), lease TTL (30s) can expire mid-fold, allowing a second drainer to acquire and produce a split-brain fold. Fix: renew lease mid-fold, or make fold fast enough (stream-read helps)
4. **No compaction** — dead events (retracted/superseded) accumulate forever. At 1M events with 40% retracted, 400K lines are wasted IO on every fold
5. **`appendDurable` opens a new fd per call** — correct for rotation safety, but `fsync` per event is expensive. Batched fsync (accumulate N events or T ms, then fsync once) would 10-50× throughput. Must be per-shard (one-writer-per-file invariant holds)

---

**Top hardening priority:** Generation-based rotation (§1) — it prevents the silent-data-loss bug that is architecturally guaranteed under concurrent writers + rename. Everything else is performance/cleanliness; this is correctness.

**Biggest risk:** The cooperative-floor 3-way eviction window in `nano-lease` (documented, unremovable without a lock manager). Under rotation, a drainer that loses its lease mid-seal (between SEAL sentinel and symlink swap) leaves an unsealed generation. Recovery must detect and handle this — the SEAL sentinel is the marker, not the lease.
