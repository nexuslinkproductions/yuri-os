---
name: feedback-posix-fs-concurrency-floor
description: "Building FS-based leases / append-only log rotation on a plain POSIX filesystem: reserve the dest NAME with O_EXCL before rename (rotation), reclaim DEAD-ONLY-UNDER-CUSTODY for leases, swallow ENOENT on read TOCTOUs — and accept the reclaim/claim eviction as an unremovable cooperative floor (no lock manager => can't make reclaim+claim atomic)"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - lease
    - file lock
    - log rotation
    - rename
    - atomic
    - reclaim
    - concurrency primitive
    - append-only
    - TOCTOU
    - posix
  refs:
    - feedback-agentic-red-team-finds-what-self-tests-miss
    - proj-nano-swarm-fabric-2026-06-13
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: building FS-based concurrency primitives (leases, locks, rotating append-only logs) on a plain POSIX filesystem with NO lock manager — three patterns, born from 3 red-team-proven bugs (NANO SWARM Phase 3, 2026-06-13):

1. **Rotation: reserve the DESTINATION NAME, not just rename the source.** `renameSync(active, dest)` serializes on the SOURCE inode — two rotators that computed the same `dest` both rename DIFFERENT source inodes onto the SAME name, and rename REPLACES the dest → the second silently destroys the first's segment (~45% loss proven). FIX: `closeSync(openSync(dest, 'wx'))` (O_CREAT|O_EXCL) to claim the seq atomically BEFORE the rename; a racer gets EEXIST and bails. "The rename is the serialization point, safe regardless of concurrency" was my FALSE claim the red-team killed.

2. **Lease reclaim: DEAD-ONLY, re-evaluated UNDER CUSTODY.** Never `read-owner → judge-dead → destroyDir` unconditionally — a fresh LIVE claim in that window gets destroyed + re-granted (double-acquire + lost updates). FIX: pre-check (live → don't disturb) → stage the dir to a unique name (atomic custody, one winner) → RE-READ the owner under custody → destroy ONLY if dead-NOW, else restore. Judge dead-ness fresh under custody so a just-RENEWED lease (same identity, fresh ts) is not torn down.

3. **Read TOCTOU: swallow ENOENT.** `existsSync(f)` then `readFileSync(f)` can NEVER be atomic — a concurrent rotation renames the active file in the window → ENOENT crashes the reader. FIX: read directly, ENOENT → return [] (empty), and let a snapshot-stable retry (rebuild while the sealed-set changed mid-read) re-list. The append-only log is then eventually-consistent: a transient per-read under-count self-heals via the consumer's persistent cursor; permanent-drop = 0.

WHEN: any time you reach for mkdir/rename/lockfile to coordinate processes over shared files. Run capability-recall first ([[nano-lease-registry]], [[nano-swarm-supervisor]] already exist — extend, don't rebuild).
DONT: claim "atomic" / "safe regardless" for a rename-based scheme without proving the dest-name + reclaim/claim races with REAL multi-process harnesses. Single-threaded Node CANNOT race — see [[feedback-agentic-red-team-finds-what-self-tests-miss]].
WHY (the floor): "reclaim a dead holder AND grant it to myself" cannot be made fully atomic against a concurrent claim on a plain POSIX FS — the 3-way eviction (stage a lease that went live, a third party claims the freed dir before restore) is unremovable WITHOUT a lock manager or fencing tokens. It is NEVER a double-owner (reclaim returns false); the evicted owner detects it on its next owner-checked renew/release. Accept + document this cooperative-lease floor honestly; don't fake a hard guarantee. The realistic single-attempt-yield path is provably 0 — the residual only bites tight retry-churn on ONE resource.
SEE: _SYSTEM/reports/nano-swarm-session-retro-2026-06-13.md (Phase 3) · [[feedback-agentic-red-team-finds-what-self-tests-miss]] · [[proj-nano-swarm-fabric-2026-06-13]]
