[2m[tool] read_file[0m
[2m[tool] read_file[0m
[2m[tool] read_file[0m
## PERSISTENCE / CARRIES-FORWARD + INTEGRATION TEST PLAN

### 1. Crash-Recovery End-to-End

**State that MUST survive** (durable on disk before any acknowledgement):
- `canonical.jsonl` — append-only, each event `fsync`'d before next
- `drainer-offsets.json` — checkpointed **AFTER** canonical + read-view are atomically published (temp→rename+fsync)
- Shard files — immutable, one-writer-per-file, never rotated by writer

**Recovery sequence on process restart:**
1. Drainer acquires lease (`nano-lease` — dead-owner reclaim handles stale lock)
2. Reads `canonical.jsonl` → builds `seen` Set of `eventId` (idempotency seed)
3. Reads `drainer-offsets.json` → per-shard byte offsets
4. For each shard: `readFromOffset(shard, offset)` → complete lines only (torn trailing line left for next pass)
5. For each event: if `eventId` in `seen` → **skip** (already folded); else append to canonical, add to `seen`
6. Rebuild read-view (atomic temp+rename), **then** checkpoint new offsets LAST

**Session boundary** = same as crash: lease expires → new drainer elected → re-fold from last checkpoint. Zero duplication, zero loss by construction.

---

### 2. Off-Disk Backup/Restore Strategy

**Risk:** `memory-shards/`, `canonical.jsonl`, `drainer-offsets.json`, `read-view.json` are all gitignored, single-disk (`_SYSTEM/state/memory-canonical/`).

**Strategy (minimum viable, implementable now):**

| Layer | Mechanism | RTO/RPO |
|-------|-----------|---------|
| **Hot** | Hourly `tar.gz` of entire `memory-canonical/` → `_SYSTEM/state/backups/memory-canonical-<ts>.tar.gz` (gitignored, same disk) | RPO ≤1h |
| **Warm** | Daily `rsync -a --delete _SYSTEM/state/memory-canonical/ /Volumes/Backup/yuri-memory/` (external drive) | RPO ≤24h |
| **Cold** | Weekly `git bundle create /Volumes/Backup/yuri-memory.bundle --all` (includes `.claude/memory` Track B source) | RPO ≤7d |
| **Canonical source** | `.claude/memory` (Track B, 241 files) + `_SYSTEM/memory` (Track A, 12 files) are **in git** — full replay possible via `drainOnce` on fresh shards | RPO = 0 |

**Restore protocol:** Stop all writers → wipe `memory-canonical/` → unpack latest hot/warm → `drainOnce` from offsets (idempotent) → verify `claims` count matches pre-crash.

---

### 3. Staleness / Demote-to-Subconscious Bridge (Cold Events)

**Problem:** Events not accessed in N days must demote from "active spine" (`MEMORY-ACTIVE.md`) to subconscious without losing truth.

**Mechanism (append-only, no mutation of canonical):**
1. **Staleness marker event** (new `kind: "demote"`): `{ subject, predicate, object: null, supersedes: <last-active-eventId>, provenance: {lane: "system", agent: "staleness-daemon"}, lifecycle: "subconscious" }`
2. Appended to **system shard** (`system--staleness.jsonl`) → folded by drainer like any event
3. `foldCanonical` treats `demote` as: keep in `byKey` but mark `status: "subconscious"`; excluded from `MEMORY-ACTIVE.md` spine projection
4. **Truth preserved:** `canonical.jsonl` still contains original `assert` + `demote` chain — full history queryable via `readView()` filter
5. **Re-promotion:** New `assert` with same `(subject,predicate)` + `supersedes: <demote-eventId>` → folds to active, spine re-includes

**No deletion, no overwrite.** Canonical remains immutable event log.

---

### 4. INTEGRATION TEST PLAN (Fault-Injection Gate)

**Run in temp dir (`YURI_CANONICAL_DIR=/tmp/yuri-test-XXXX`), env-triggered faults, 10 tests:**

| Test | Fault Injection | Assertion |
|------|----------------|-----------|
| **T1** Concurrent-append integrity | 8 writers × 500 events each, parallel `appendClaim` to distinct shards | All events folded exactly once; `folded === 8×500` |
| **T2** Torn-append detection | Kill writer mid-`appendFileSync` (SIGKILL at byte 2048 of 3866) | `readFromOffset` skips torn line; next drain folds complete events only |
| **T3** Dedup-under-race | Two lanes emit identical claim simultaneously (same `contentHash`) | Canonical contains **one** event; `skipped === 1` |
| **T4** Drainer-crash-recovery | `drainOnce` killed via SIGKILL after 60% of shards folded, offsets not checkpointed | Restart → re-fold from last offset; `folded + skipped === total events`; zero dups |
| **T5** Split-brain prevention | Two `drainOnce` calls racing for lease (lease TTL=100ms, heartbeat=50ms) | Only one acquires; second returns `{ok:false, heldBy}` |
| **T6** Dead-owner-reclaim | Drainer acquires lease → process killed → 35s later new drainer starts | Lease reclaimed (birth-time sentinel + dir mtime check); fold resumes |
| **T7** Half-folded-view | Kill drainer after canonical written, before read-view rename | Restart → read-view rebuilt from canonical; offsets checkpointed |
| **T8** Rotation-under-write | Writer holds fd to shard; external `mv shard.jsonl shard.jsonl.1` (simulate logrotate) | Writer's next append creates new shard (fd orphaned inode); drainer folds both |
| **T9** Disk-full survival | `fsync` returns ENOSPC mid-fold (mock via `fs.fsyncSync = () => { throw Object.assign(new Error(), {code:'ENOSPC'}) }`) | Drainer aborts, offsets NOT advanced; retry after space freed → clean fold |
| **T10** Clock-skew causal ordering | Events with `vc: {A:3, B:1}` arrive before `vc: {A:2, B:1}` (out-of-order append) | `foldCanonical` uses append-offset + VC dominance (not wall-clock) → correct final state |

**Gate:** All 10 green in CI before P1 arming. Each test <5s. Run via `node --test _SYSTEM/Scripts/memory-canonical-store.test.mjs`.

---

### Must-Have Persistence Guarantee

**`canonical.jsonl` + `drainer-offsets.json` checkpoint ordering guarantees exactly-once fold semantics across any crash/restart/session boundary — zero duplication, zero loss, by construction.**

### Biggest Risk

**Single-disk gitignored store (`_SYSTEM/state/memory-canonical/`).** No off-disk backup = total continuity loss on drive failure. Warm/cold layers must be automated before P2 arming.
