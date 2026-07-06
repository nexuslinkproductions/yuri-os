# YURI CANONICAL TRUTH — CONVERGENCE STORE

## 1. Directory Layout
```
state/
  canonical-truth.active.jsonl     ← O_APPEND target (single active log)
  canonical-truth.sealed-*.jsonl   ← rotated, immutable, auditable
  drainer-lease.json               ← O_EXCL election file
  truth-materialized.json          ← symlink → truth-materialized-offset-<N>.json
  truth-materialized-offset-*.json ← versioned materialized views
  truth-meta.json                  ← { folded_offset, folded_file, ts }
```

## 2. Event Schema (one JSONL line, <4KB)
```jsonc
{
  "id": "evt_<sha256>",
  "kind": "assert|retract|update|link|note",
  "subject": "yuri://namespace/handle",
  "predicate": "relation-or-attribute",
  "object": "value | ref(handle)",
  "content_hash": "sha256(canonical(subject+predicate+object))",
  "supersedes": null | "evt_...",
  "confidence": 1.0,
  "provenance": {
    "lane": "claude-primary|gemini|...",
    "session": "uuid",
    "agent": "sub-agent-name",
    "source_ref": "/absolute/path/to/lane-local/entry.json"
  },
  "ts": "2025-01-15T10:30:00.123Z",
  "mono": 1247
}
```
**Dedup key:** `(subject, predicate, content_hash)` — same triple proposed by two lanes → same content_hash → deduped during fold. Drainer keeps latest by `(ts, mono)` per `(subject, predicate)`.

## 3. Write Protocol (lock-free, all peers equal)
```
1. Construct event, compute content_hash, serialize → one JSONL line < 4KB
2. Read active_file path from truth-meta.json
3. fd = open(active_file, O_WRONLY | O_APPEND)
4. write(fd, line + "\n")   ← POSIX atomic ≤ PIPE_BUF (4096 on Linux)
5. close(fd). Done. No lock.
```
If file rotated between steps 2→4: fd holds the inode; write lands on sealed file. Drainer re-scans sealed files for late arrivals. **Safe by construction.**

## 4. Drainer / Consolidator

### Election (singleton lease)
```
O_EXCL create drainer-lease.json with {holder, acquired_at, ttl_ms:30000}
  → EEXIST? read TTL. expired → delete → retry O_EXCL. valid → yield.
Renew lease every 10s during drain. Release by delete. TTL=30s (>> 5s drain cycle).
```

### Fold Algorithm (idempotent)
```
DRAIN_LOOP:
  1. Acquire lease
  2. Read truth-meta.json → folded_offset
  3. Open active log at folded_offset. Read lines.
  4. Per event:
     - content_hash already seen at (subject,predicate) with ≥ts → SKIP
     - kind=retract → mark (subject,predicate) retracted
     - kind=update → mark supersedes old, upsert new
     - kind=assert → upsert
     - conflicts (two active values for same key) → move to contested[]
  5. Write truth-materialized-offset-<new_N>.json  (tmp + atomic rename)
  6. Update symlink truth-materialized.json → new file ONLY if new_N ≥ current_N
  7. Update truth-meta.json with new offset (tmp + atomic rename)
  8. Rotate active log if >1MB or >10K lines:
       O_EXCL(next) → rename(active→sealed) → rename(next→active)
  9. Re-scan sealed files for late-arrival writes by pre-rotation fds
  10. More events arrived during drain? → loop. Else release lease, sleep 5s.
```
**Crash recovery:** truth-meta.json holds last-good offset. Re-fold from there. Content-hash dedup makes re-fold idempotent — zero data loss, zero duplication.

## 5. Materialized Read View (open, no wrapper)
```jsonc
{
  "v": 3,
  "folded_offset": 1847293,
  "folded_at": "ISO8601",
  "claims": {
    "yuri://self/name": {
      "pred": "identity.name", "val": "YURI",
      "hash": "a1b2...", "status": "active",
      "prov": {"lane":"claude-primary","session":"abc"},
      "ts": "ISO8601", "conflicts": []
    }
  },
  "contested": {
    "yuri://self/tone": {
      "pred": "communication.style",
      "competing": [
        {"val":"direct","lane":"claude-primary","hash":"d4e5..."},
        {"val":"witty","lane":"gemini","hash":"f6a7..."}
      ],
      "resolution": null
    }
  }
}
```
**Read:** `fs.readFileSync("state/truth-materialized.json")` — any peer, any time, zero ceremony.
**Bound:** Single file OK to ~50MB/200K claims. Beyond → shard by `subject_hash[0:2]` into 256 files.

## 6. Lane Projection (no duplication)
```
Lane-local (.claude/memory/)              Canonical truth (state/)
  entry.canonical_ref: "evt_abc"  ←→  event.provenance.source_ref: lane-path
```
- Lanes construct event with provenance → O_APPEND to canonical log.
- Canonical truth IS source. Lane-local = cache/projection. Divergence → canonical wins.
- Once accepted, lane-local stores `canonical_ref` back-link.
- No registration needed. Provenance identifies lane. Cross-lane reads via materialized view.

## 7. Scale Envelope
| Dimension | Safe | Degradation threshold | Mitigation |
|---|---|---|---|
| Concurrent writers | 20 | 50+ (kernel O_APPEND contention) | Shard active log ×4 by writer%4 |
| Events/sec | ~1000 | Not the bottleneck (4KB×1000=4MB/s SSD) | — |
| Active log size | 1MB / 10K events | Drainer lag | Auto-rotate |
| Materialized view | 50MB / 200K claims | JSON parse >1s | Shard into 256 files |
| Total store growth | Unbounded (append) | Disk fill | Periodic sealed-log compaction job |
| Drainer latency | 5-10s cycle | Real-time gap acceptable | Materialized is still-readable stale |

**Backpressure:** None needed. Append-only is free. Drainer catch-up is O(new_events), self-heals.

## 8. Recommended Protocol
**Write:** O_APPEND JSONL, content-hash idempotent-key, zero locks.
**Drain:** Leased singleton folds log → versioned materialized JSON symlinked by offset.
**Read:** Direct file read, zero wrappers.
**Project:** Lanes append events with provenance, canonical truth is authoritative, cross-link by event_id handle.

## 9. Single Most Likely Breakage
**Drainer lease TTL expires during a slow (not dead) drain → dual-drainer window.** Both fold the same batch, both write materialized views. If the slower drainer's symlink-rename wins the race, the offset watermark **regresses**. Next fold re-processes events (benign, idempotent), but readers briefly see stale data during the regression window.

**Mitigation:** Symlink update is **conditional** — only rename symlink if `new_offset ≥ current_offset` (checked by reading symlink target filename, which encodes offset). If race persists, the orphaned lower-offset file is harmless. Second-order risk: symlink not atomic on read across all FS → readers retry on `ENOENT` with 50ms backoff ×3.
