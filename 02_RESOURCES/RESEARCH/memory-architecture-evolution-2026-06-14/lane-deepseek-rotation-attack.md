All 11 tests pass. Now the adversarial trace.

---

## (1) CRASH BETWEEN SEAL-APPEND AND SYMLINK-SWAP, OR AFTER NEXT-GEN-CREATE BEFORE SWAP

**Trigger:** SIGKILL after `appendDurable(cur, SEAL)` but before `swapSymlink()`, OR after `closeSync(openSync(nextAbs,'a'))` (gen+1 created empty) but before `swapSymlink()`.

**State on restart:**
- SEAL in old gen, symlink still → old gen (swap is `renameSync` atomic, so it either happened or didn't)
- orphan: empty `canonical.gen-00002.jsonl` exists, predecessor gen-00001 has SEAL sentinel

**Recovery path:**
- `currentGen()`: symlink valid → `realpathSync` succeeds → returns gen-00001 (correct)
- `canonicalEventIds()`: iterates both gens via `listGenerations()`; gen-00002 empty; SEAL skipped (no `eventId`); all real eventIds captured
- `foldCanonical()`: same — SEAL skipped, gen-00002 empty → correct state
- Next drain appends to gen-00001 (after SEAL line). Eventually re-rotates.

**If symlink is also missing** (e.g., external removal): `currentGen` repair fires, picks `listGenerations()` last = gen-00002 (the empty orphan). BUT gen-00001 IS sealed, so gen-00002 is legitimately the next gen. New events go there. `foldCanonical` reads both. **Correct.**

**Blast radius:** Zero data loss. Orphan empty gen is harmless noise (1 inode, 0 bytes). Wastes one `readFileSync` per drain.

**Smallest guard:** POSIX `rename(2)` already makes `swapSymlink` atomic — no TOCTOU window for the swap itself. The window is between the durable append and the atomic rename. Guard: **none needed** for correctness. Cosmetic: `listGenerations` could filter empty gen files with a `statSync.size === 0` check, falling back to the next-highest non-empty gen for repair. But this is a polish issue, not a must-fix.

**Verdict: SAFE (recoverable).**

---

## (2) CRASH AFTER ROTATION BUT OFFSETS CHECKPOINTED FOR OLD GEN

**Trigger:** Crash between `atomicWriteFile(offsetsPath, ...)` and `sealAndRotate(...)`. Or after `sealAndRotate` completes.

**drainOnce ordering:** fold → read-view publish → offsets publish → rotate. Offsets are durable BEFORE rotation.

**State:** Offsets checkpointed against pre-rotation gen. Gen sealed + new gen created + symlink swapped. Offsets track shard positions, not canonical positions — they are gen-agnostic.

**Recovery:**
- `canonicalEventIds()` reseeds from ALL gens (old sealed gen + new empty gen). All eventIds present.
- Offsets read from disk. Shards re-scanned from checkpointed positions → all events already in `seen` → `skipped`, not `folded`. `folded=0`.
- Read-view rebuilt via `foldCanonical()` (all gens) → identical to pre-crash.

**Double-fold risk:** Zero. `seen` set contains all eventIds from old gen. Shard re-reads hit `seen.has()` → skipped.

**Loss risk:** Zero. Events are durably in canonical gen AND offset never advanced past what was fsync'd.

**Verdict: SAFE.**

---

## (3) RECLAIM WINDOW — 2nd DRAINER ROTATES WHILE 1st IS MID-FOLD

**Trigger:** drainer-1's fold takes >30s (`DRAIN_TTL_MS`). `holderAlive` check: `now - renewedAt >= 30000`. drainer-2's `acquireLease` → drainer-1 judged stale → `reclaimDirIfDead` destroys drainer-1's lease → drainer-2 acquires → runs full `drainOnce` including possible rotation.

**Meanwhile drainer-1 (lease expired, code still running):**
1. `curGen` = gen-00001 (resolved at start, before drainer-2 rotated)
2. Appends events to gen-00001 — **drainer-2 already sealed gen-00001 and swapped symlink to gen-00002**
3. Builds read-view from `foldCanonical` — correct (all gens)
4. Writes offsets — **OVERWRITES drainer-2's fresher offsets with older positions** ← THE DAMAGE
5. `statSync(curGen).size` → gen-00001's size > threshold → `sealAndRotate` called
6. `sealAndRotate`: `currentGen()` → gen-00002 (symlink was swapped). Seals gen-00002 (second SEAL), creates gen-00003, swaps symlink → gen-00003

**Concrete damage:**
- **Offset regression:** drainer-1's offsets overwrite drainer-2's. Next drain re-scans already-folded shard data. `seen` set catches duplicates → no canonical duplication. But wasted I/O is unbounded (re-scans entire shard tail).
- **Double-rotation:** gen-00003 created unnecessarily. gen-00002 has two SEAL lines. Harmless noise.
- **Duplicate canonical appends possible:** If drainer-2's `canonicalEventIds()` ran while drainer-1 was mid-append (torn line read), drainer-2 missed that eventId in seed → appended same event to gen-00002. `foldCanonical` dedup catches it. Wasteful but correct.
- **No data loss:** `foldCanonical` iterates all gens → eventual consistency.

**Smallest guard:** Before writing offsets and before calling `sealAndRotate`, check `renewLease(DRAIN_LEASE_ID, drainerId, {ttlMs: DRAIN_TTL_MS})`. If renew returns false (lease lost), abort without mutation and return `{ok:false, reason:'lease-lost'}`. `nano-lease.mjs` already exports `renewLease` — it re-reads `.owner` and checks `nanoId` match before updating `renewedAt`. One `renewLease` call before the offset write + one before `sealAndRotate` closes the window.

Alternatively: shorten `DRAIN_TTL_MS` to something larger than worst-case fold time, but that's a guess, not a guarantee. The heartbeat is the correct fix.

**Verdict: THE MUST-FIX.** Data is eventually consistent but offset regression breaks incremental progress.

---

## (4) MULTI-GEN DEDUP-SEED COMPLETENESS ON RE-FOLD

`canonicalEventIds()` iterates `listGenerations()` — all gen files — parses every line, collects eventIds. `foldCanonical()` does the same independently.

**Completeness:** Yes. Every gen file that exists is read. No gen files are ever deleted (no TTL cleanup). The only gap: torn/malformed lines skipped by `JSON.parse`. A torn line means the event wasn't fully written → correct to exclude from seed. If the torn write was from a crashed drainer that already advanced the shard offset past that event, the event is lost — but the offset only advances after `appendDurable` (append+fsync), so the line is durable. A `readFileSync` after `fsyncSync` on the same host sees the complete line (POSIX guarantees this for local filesystems). Cross-host NFS doesn't, but that's out of scope.

**Edge case (lease-expiry concurrent read):** drainer-2 reads gen while drainer-1 is mid-append (between `appendFileSync` and `fsyncSync`). Torn line → parse skip → eventId missing from seed. drainer-2 later reads shard, finds event, appends → duplicate in canonical. `foldCanonical` dedup catches it. **No corruption, waste only.**

**Verdict: SAFE for correctness.**

---

## (5) UNBOUNDED GEN ACCUMULATION (UNLINK-AFTER-TTL DEFERRED)

No cleanup code exists. `ROTATION_DEFAULT_BYTES = 50MB`.

**At 50MB/gen:** 20 gens = 1GB. 200 gens = 10GB. Every drain reads ALL gens to seed `canonicalEventIds()`. Every read-view build reads ALL gens via `foldCanonical()`. I/O grows O(n_gens).

**Deletion safety if added:** Deleting old gens removes their eventIds from the dedup seed. Events from deleted gens could be re-folded (duplicate in canonical). `foldCanonical` internal dedup catches intra-fold duplicates but NOT cross-deletion duplicates. This is a dedup degradation, not data loss — `foldCanonical` still produces a correct read-view. The canonical log just accumulates duplicate lines.

**For now:** Safe — gen count is low, total data <1GB in any realistic deployment. Unsafe at scale, but explicitly deferred per design comments.

**Verdict: SAFE for now, deferred.**

---

## MUST-FIX: (3) — LEASE EXPIRY DURING DRAIN → OFFSET REGRESSION

**The guard** (13 lines added to `drainOnce`):

```js
// BEFORE writing offsets AND before sealAndRotate:
const stillHeld = renewLease(DRAIN_LEASE_ID, drainerId, { ttlMs: DRAIN_TTL_MS });
if (!stillHeld) {
  return { ok: false, reason: 'lease-lost-mid-drain', folded, skipped };
}
```

Place one check right before `atomicWriteFile(offsetsPath, ...)` and one before the `statSync(curGen).size > rotationBytes(opts)` block. If the lease was lost, return partial results without mutating offsets or triggering rotation. The already-appended canonical events are durable and will be incorporated by the next successful drainer. The stale drainer's offsets never hit disk.

**Why this and not something else:** (1), (2), (4), (5) are all safe for correctness. (3) is the sole scenario where durable state regresses (offsets go backward), breaking the incremental-drain contract. It also causes unnecessary gen churn.