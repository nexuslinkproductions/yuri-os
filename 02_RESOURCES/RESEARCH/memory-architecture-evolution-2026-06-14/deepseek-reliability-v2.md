## 1. CONCURRENCY FAILURE-MODE CATALOG

| # | Mode | Trigger | Blast Radius | Smallest Guard (POSIX primitives) |
|---|---|---|---|---|
| 1 | **Interleaved appends** | 2+ procs append >PIPE_BUF lines simultaneously to same fd. O_APPEND guarantees atomicity only ≤PIPE_BUF (4096 Linux, 512 POSIX min). | Corrupt JSON line → unparseable. Reader skips tail (existing stderr-warn behavior). Lost claim, not cascading. | **Pre-append length check**: reject lines > `PIPE_BUF - 256`. Split oversized claims into head+continuation sequence with a `seq:N/of:M` marker. |
| 2 | **Partial/torn append** | Writer SIGKILL'd mid-`write()` syscall. Bytes committed to disk < full line. | Incomplete trailing line. Reader skips (existing comment). Recoverable by re-submit. | **Trailing-newline convention**: every line ends `\n`. On read: if last char ≠ `\n`, discard last line. `fsync` after write (ALREADY in `appendLineDurable`) shrinks the window to crash-between-write-and-fsync — NOT eliminated, but detected. |
| 3 | **Dedup race (same fact)** | Two lanes independently propose identical fact (same claim_id or content hash). Both append. | Duplicate in ledger. Drainer must dedup during fold or read-view has 2 copies. Not corruption — duplication. | **Drainer-owned dedup**: fold by `claim_id` ∪ content-hash, keep first-by-offset, drop subsequent as "already known." Eventual consistency — writers don't coordinate. |
| 4 | **Drainer crash mid-fold** | Drainer dies after processing N of M new events, before updating read-view. | Read-view: N events visible, M−N stale (not lost — still in ledger). Restart replays N if checkpoint missing → duplicate if upsert not idempotent. | **Write-ahead checkpoint**: (a) record `processing: offset N` → (b) fold events → (c) `commit: offset N`. Recovery: resume from last `commit`. Idempotent upsert (not insert) makes replay safe. Checkpoint written via atomic rename (§6). |
| 5 | **Split-brain (two drainers)** | Lease expires or lockfile check skipped. Two sessions both believe they own drain. | Both write read-view → last-writer-wins corruption. Both update checkpoint → offset confusion. | **O_EXCL lockfile**: `open(lockfile, O_CREAT\|O_EXCL\|O_WRONLY)`. Write `{session_id, pid, heartbeat_at}`. Re-read to confirm no rename race. If O_EXCL fails → another drainer alive → exit. Heartbeat renewal via `utimes()` (no rewrite race). |
| 6 | **Half-folded read-view** | Reader opens read-view while drainer writes it. | Partially-written file → unparseable JSON or inconsistent state. | **Atomic rename**: drainer writes to `read-view.json.tmp`, `fsync`, then `rename(tmp, real)`. `rename` is atomic on same filesystem. Readers always see old-complete XOR new-complete. |
| 7 | **Checkpoint corruption** | Disk error, partial write, or concurrent write to checkpoint file. | Drainer resumes at wrong offset → skips unprocessed events (DATA LOSS) or replays already-processed (duplicate — safe if upsert). | **Atomic-rename checkpoint** + **checksum validation**: store `{offset, checksum_of_last_K_events_at_offset}`. On recovery: verify checksum matches ledger at that offset. Mismatch → cold-scan from offset 0 (slow but safe). |
| 8 | **Clock skew across sessions** | NTP drift, VM pause, different machines. Wall-clock timestamps disagree. | Timestamp-ordered drain produces incorrect causal order: B (caused-by-A) appears before A. | **Offset is truth**: drain processes by append-log byte-offset, NOT wall clock. `created_at` is metadata only. Cross-session causality via explicit `caused_by` field — drainer flags "out-of-order causal reference" as PENDING_REVIEW, never silently reorders. |
| 9 | **Log rotation racing writer** | Drainer `rename()`s current ledger while writer has open fd appending to it. | **SILENT DATA LOSS**: writer's fd points to old inode. `rename` changes directory entry only — old inode alive while fd open. Drainer processes old file, rotates. Writer's final appends land on invisible inode → no reader ever sees them. | **NEVER rename a live log**. Generation-based discovery: drainer writes `ROTATE` event to current log → creates `ledger-gen-N+1.jsonl` → atomically updates symlink `current → ledger-gen-N+1.jsonl`. Writers resolve `current` symlink BEFORE EACH APPEND (no cached fd across append calls). Old log sealed by convention (no new writes discovered). Unlink only after TTL with zero appends. |
| 10 | **Disk full (ENOSPC)** | Filesystem exhausted. | `write()` fails → claim event LOST (not in ledger). If drainer's read-view write also ENOSPC → truncated/corrupt read-view. | **Pre-allocate reserve**: 10MB `_SYSTEM/state/.reserve` — drainer unlinks it on ENOSPC to free emergency space. Writers: `statfs` check before append; on ENOSPC, return error to caller (NEVER silent drop). Drainer: monitor disk; warn at 90%. |
| 11 | **Lease not released on crash** | Drainer SIGKILL'd. Lockfile remains with dead owner's session_id. | New candidate sees lockfile, assumes alive drainer, refuses takeover → permanent stall: writes accumulate, read-view goes stale indefinitely. | **Heartbeat + dead-owner reclaim** (§2 below). Lockfile stores `{owner_session_id, pid, heartbeat_at, lease_ttl_ms}`. Candidate: read lockfile → if `now - heartbeat_at > lease_ttl`, owner DEAD → stage reclaim. |
| 12 | **readerdir TOCTOU on generation discovery** | Writer calls `readdir` to find latest gen, another writer creates gen+1 before append. | Writer appends to gen-N while gen-N+1 exists. Drainer reading gen-N+1 misses it → stale read-view. Harmless: drainer eventually scans gen-N too (it's sealed, not deleted). | **NOT a correctness bug** — only latency. Both logs are eventually drained. Acceptable. Mitigation: writer caches `current` symlink target (resolved once per batch), drainer doesn't seal gen-N until TTL of zero appends. |

## 2. DRAINER ELECTION — SINGLE-OWNER LEASE

**Lockfile location:** `_SYSTEM/state/drainer.lock`

**Lockfile schema:**
```json
{"owner_session_id":"claude-pt-3","pid":18421,"heartbeat_at":"2026-06-14T22:31:05Z","lease_ttl_ms":15000}
```

**Acquisition protocol (candidate):**
1. `open(lockfile, O_CREAT|O_EXCL|O_WRONLY)` — if EEXIST, go to reclaim path.
2. Write session_id + pid + heartbeat_at=now + ttl=15s. `fsync`. `close`.
3. **Re-read lockfile.** If `owner_session_id` ≠ mine → someone stole it (improbable but guard it) → exit.
4. Begin draining. Renew heartbeat every `ttl/3` (5s) via `futimes` on the open fd (no rewrite, no race).

**Reclaim protocol (candidate sees existing lockfile):**
1. Read lockfile → parse `{owner_session_id, pid, heartbeat_at, lease_ttl_ms}`.
2. If `now - heartbeat_at ≤ lease_ttl` → owner alive → exit (not my turn).
3. Owner DEAD. Write **TAKEOVER marker**: `_SYSTEM/state/drainer.takeover.{timestamp}` with candidate's session_id (O_EXCL — proves single reclaim intent).
4. **Re-read lockfile** (prevents double-reclaim race: if lockfile changed since step 1, someone else reclaimed → exit).
5. `rename(lockfile, lockfile + ".dead." + old_session_id)` — archived for audit.
6. Now go to Acquisition step 1 (O_EXCL on fresh lockfile). If step 1 fails → another candidate beat us → exit.

**What happens with NO drainer alive:**
- Writes continue appending to ledger (writers are independent — no drainer lock needed to write).
- Read-view FREEZES at last drainer checkpoint. Readers see stale data.
- New facts accumulate in ledger as latent events. No data loss.
- After `lease_ttl + reclaim_delay`, next session that touches memory becomes candidate → acquires lock → drains backlog → read-view catches up.
- **Max staleness:** unbounded until a session triggers election. Mitigation: a session touching `recallMemory` or `writeProposal` should check "is drainer alive?" and trigger election if not. This keeps staleness bounded by session activity interval (typically < 1 hour in live use).

## 3. SCALE ENVELOPE

| Dimension | Per-line fsync (CURRENT) | Batched fsync (PHASE 1) | With rotation |
|---|---|---|---|
| **Max writers** | 10–20 (fsync contention) | 50+ (contention shifts to O_APPEND atomicity) | Same |
| **Events/sec sustained** | 50–100 | 500–1,000 | Same |
| **Event size limit** | PIPE_BUF−256 (~3.8KB) | Same | Same |
| **Log size before rotation** | N/A (unbounded) | 100MB (~100K events @ 1KB/event) | Sealed logs kept for audit, live drainer tails only `current` |
| **Drainer scan (new events)** | `readFileSync` entire file | Stream from `last_offset` to EOF | Stream ~100MB max → ~2–5s on SSD |
| **Read-view rebuild (cold)** | N/A (flat dir scan) | ~100ms for 10K-node PPR graph | Same |
| **Drainer latency (p50)** | Process latency (immediate) | Batch interval (500ms default) | Same |
| **Disk footprint (1M events)** | ~1GB single file | ~1GB across 10 sealed + 1 live (~100MB each) | Cleanup old sealed logs after backup confirm |

**Backpressure:**
- **Writer-side:** buffer events locally, flush every 500ms OR every 10 events (whichever first). Reduces `appendLineDurable` calls by 10–50×.
- **Drainer-side:** if backlog > 10K events, skip non-critical event classes (proposals, telemetry) — prioritize decisions + facts. Emit "drainer behind" Kagami event.
- **Disk-full prevention:** statfs check before flush. Reserve file as emergency valve. At 90% full, drainer compacts oldest sealed log (merge+dedup then delete original).

**Degradation point:** ~1,000 events/sec sustained with batched fsync. Beyond that, switch to a real WAL (SQLite WAL mode as read-view, ledger stays `.jsonl` for portability) or move drainer to a dedicated long-running process (not per-session).

## 4. RELIABILITY TEST PLAN (10 tests — the minimum to prove safety)

| Test | Fault Injected | Pass Criterion |
|---|---|---|
| **T1: Concurrent append integrity** | 10 processes × 1,000 appends, simultaneous, single ledger. | 10,000 valid JSON lines, zero interleaved, FILE_COUNT evidence. |
| **T2: Torn append detection** | Append 8KB line (exceeds PIPE_BUF), SIGKILL mid-write. | Reader returns all prior lines intact; corrupt tail skipped WITH stderr warning. |
| **T3: Dedup under race** | 2 writers append same `claim_id`, <10ms apart. Drainer folds. | Read-view: exactly 1 entry for that id. Second event logged as "already known" in drainer audit. |
| **T4: Drainer crash-recovery** | Drainer killed mid-fold (SIGKILL after committing 50% of 1,000 new events). Restart. | All 1,000 events visible in read-view. Zero duplicates. Checkpoint offset correct. |
| **T5: Split-brain prevention** | Launch 2 drainers simultaneously (same lockfile path). | Exactly 1 acquires lock (O_EXCL). Other exits with code 1 + "drainer already running" on stderr. |
| **T6: Dead-owner reclaim** | Create stale lockfile (heartbeat 90s old, TTL=15s). Launch candidate. | Candidate detects dead owner, writes TAKEOVER marker, re-reads lockfile, reclaims, acquires, drains. Stale lockfile archived as `.dead.<session_id>`. |
| **T7: Half-folded read-view** | Drainer writes 500 events to `read-view.json.tmp`, SIGKILL before `rename`. Reader opens `read-view.json`. | Reader sees OLD complete view (rename never happened). `read-view.json.tmp` cleaned up on next drainer startup. No corruption. |
| **T8: Rotation-under-write** | Writer appends every 100ms. Drainer triggers rotation mid-stream (writes ROTATE, creates gen+1, updates symlink). | Writer discovers new `current` symlink target on next append resolution. Final append lands in gen+1. Zero lost events. Old gen-N sealed correctly. |
| **T9: Disk-full survival** | Fill filesystem (simulate via `fallocate` reserve file to 100%). Writer attempts append. | Writer returns ENOSPC error to caller. Does NOT return `ok:true`. Drainer unlinks reserve, retries → success. Original writer's claim NOT lost (caller has it, retries after space freed). |
| **T10: Clock-skew causal ordering** | Write event A (t=now+1000s, simulated), then event B (t=now, `caused_by=A.id`). Drain by offset. | B appears AFTER A in read-view (offset order). B's `caused_by` reference resolves to A (same ledger, earlier offset). Zero PENDING_REVIEW flags. |

**Fault-injection harness:** Each test is a shell script calling `memory-kernel.mjs` operations with env-controlled fault triggers (`YURI_FAULT_KILL_AFTER_APPEND=1`, `YURI_FAULT_SKEW_CLOCK=1000`, etc.). Tests run in a temp `_SYSTEM/state/test-*` directory — zero risk to live stores.

## HIGHEST-RISK FAILURE MODE

**Mode #9 — Log rotation racing a writer** (SILENT DATA LOSS, no error, no warning).

**Does event-sourcing survive it?** Only if the rotation protocol uses generation-based discovery + symlink, NEVER `rename()` on a live log. The current `memory-kernel.mjs` has NO rotation and NO drainer — so it's not exposed yet. But the first rotation implementation WILL introduce this bug unless the guard is baked into the design from day 0. The fix is structural (writers resolve `current` symlink per-append, drainer seals by convention not rename), not a patch. **Survivable with correct protocol; fatal with naive `rename`-based rotation.**