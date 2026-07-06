# CONVERGENCE DESIGN — Canonical Truth, Scalable + Reliable

> Capstone design over 6 streams (Mimo×2, DeepSeek×2, two native red-team workflows) + Claude verification. Mission v2 (owner reframe 2026-06-14): ONE canonical truth path, peer-open read, scalable + reliable under N concurrent sessions+agents.
> Status: DESIGN — nothing built, no store mutated, contract NOT applied. Owner gates every phase.
> CLAUDE-VERIFIED facts tagged ✓. Model-lane claims tagged `[lane]`. All lanes peer-weighted; verification promotes to ✓.

## 1. THE DECIDING FACT (✓ verified by `getconf PIPE_BUF`)

**PIPE_BUF = 512 bytes on this Darwin machine.** A real memory event ≈ 3866 bytes (7.5× over). So any design where multiple processes `O_APPEND` to ONE shared log tears nearly every real write under concurrency → silent corruption → silent data loss. This **eliminates the two shared-log designs** for a "reliable" system on this platform.

**Winner: per-lane shards.** Each writer (session/agent/lane) appends ONLY to its OWN shard file. One writer per file = no concurrent appenders = PIPE_BUF bound is irrelevant = **platform-robust by construction**. Race-attack workflow scored it 0.685 vs 0.565 (event-log) vs 0.418 (wal-queue), reliability-dominant.

## 2. WHY THIS IS A WIRING JOB, NOT GREENFIELD (capability-first ✓)

The per-lane-shards architecture is three EXISTING, NANO-SWARM-hardened primitives wired together — not new distributed-systems code:

| Need | Existing primitive (✓ file exists) | What it already does |
|---|---|---|
| Per-lane shard write (anti-clobber) | `nano-doc-assembler.mjs` (6KB) | per-fragment files, zero shared-file RMW contention BY CONSTRUCTION |
| Single-drainer election | `nano-lease.mjs` (13KB) | `mkdir`-EXCL atomic lease, heartbeat renew, **dead-owner reclaim** (stage→re-read→destroy-if-dead-else-restore) |
| Same-fact dedup / idempotency | `yuri-nerve.mjs` (6KB) | event captured ONCE under one deterministic id, threaded across organs |
| Durable append + atomic publish | `memory-kernel.mjs` ✓ | `openSync('a')→append→fsync` + temp-file→`rename` publish (already in code) |

Reusing proven, red-teamed concurrency primitives is the difference between "research gamble" and "assemble + test." This is the core answer to "scalable + reliable is a MUST."

## 3. ARCHITECTURE

```
 N writers (sessions/agents/lanes)          ELECTED DRAINER (nano-lease)        ALL PEERS (open read)
 ───────────────────────────────            ──────────────────────────         ────────────────────
 each appends to its OWN shard:             holds lease("drainer:canonical")   read directly, no wrapper:
   memory-shards/<lane>-<session>.jsonl  →  folds shards → canonical.jsonl   →   - memory-canonical.jsonl
   (append+fsync, one writer/file,            (idempotent UPSERT, dedup by         - read-view.db (WAL, RO)
    event ≤4096B, trailing-\n)                 content-hash, offset checkpoint)     - MEMORY-ACTIVE.md (spine)
                                            dead-owner reclaim on crash          WAL: readers never block
```

- **Event envelope:** `{v, eventId, kind(assert|retract|update|link), subject, predicate, object, contentHash, supersedes, provenance{lane,session,agent,sourceRef}, vc(vector-clock), memory_type, domain, tier, lifecycle}`. Ordering by **append offset + vector-clock, NEVER wall-clock** (✓ both lanes independently flagged clock-skew as a bug).
- **Drainer:** write-ahead checkpoint (processing→fold→commit), idempotent UPSERT keyed on content-hash, atomic temp+rename for read-view + offset, resume-from-offset on crash. Election + reclaim = `nano-lease`.
- **Read views:** `canonical.jsonl` (portable truth) + `read-view.db` (SQLite WAL, indexed, RO-open) + `MEMORY-ACTIVE.md` (bounded project spine). All peer-open, no wrapper.
- **Projection (Seam 5):** `.claude/memory` (241 files, Claude-own) projects ONE-WAY into canonical at EOT (lane=claude-track-b); never becomes canonical, never overwritten by it. Track A (`_SYSTEM/memory`, 12 files) projects on first drainer start.

## 4. CROSS-FAMILY CONVERGENCE + THE BUGS EACH LANE CAUGHT (the verification story)

The value was adversarial, not redundant. Each lane caught what the others missed:
- **Mimo** designed the event-sourced store + drainer + scale envelope; independently arrived at the lease/dedup/shard shape that matches the existing primitives.
- **DeepSeek** attacked it: caught clock-ordering bug (✓), O_APPEND torn-write (✓), and the **rename-rotation SILENT DATA LOSS** (writer's fd → orphaned inode) — fix traces to YURI's own `[[feedback-posix-fs-concurrency-floor]]`.
- **Race-attack workflow** caught the **macOS PIPE_BUF=512** killer (✓ verified) that invalidated both shared-log designs, plus split-brain-via-renewal-rename-race, checkpoint-corruption-on-ENOSPC, PID-reuse stale-lock.
- **Claude (me)** verified the deciding facts against live code/OS: PIPE_BUF, the 3-dir drift, JTMS-greenfield, the primitives exist.

## 5. PHASED BUILD PLAN (reversible-first, every phase owner-gated, DISARMED by default)

- **P0 — Guards + canonicalize (prereq, no store mutated).** Reconcile the 3-dir drift (✓: `.claude/memory`=241 / `~/.claude/projects/<id>/memory`=94 / `_SYSTEM/memory`=12, three different readers) — **owner decision needed**. Enforce event ≤4096B at write callsites; per-shard UUID first-line (content-addressed checkpoint, defeats inode-reuse); drainer SIGTERM→unlink handler; backup guard (memory.db gitignored, single-disk ✓). Gate: drift pinned, guards in place.
- **P1 — Shard infra + drainer skeleton (synthetic-test only).** Wire `nano-lease` election + dead-only-under-custody reclaim + PID-reuse birth-time sentinel; drainer folds synthetic shards → canonical.jsonl. Gate: lease + crash-recovery + dedup-on-restart tests green.
- **P2 — Track B projection at EOT (DISARMED, `YURI_TRACK_B_PROJECT=1`).** Project hot/ref'd `.claude/memory` files one-way into canonical; pre-emit hash-dedup. Gate: 5 known files verified, dedup confirmed on re-run.
- **P3 — Track A projection (one-time import).** 12-file `_SYSTEM/memory` table → canonical (lane=yuri-track-a). Cross-track dedup: Track A wins on tie. Gate: 12 entries, no dups.
- **P4 — Graph + spine + facets wired to canonical (01-SYNTHESIS stack).** `ingestMemoryDir` tails canonical.jsonl (NOT flat readdir — kills the partition footgun permanently); MEMORY-ACTIVE.md spine reads canonical; facets baked into events at emit. Gate: ≥14/20 recall@5 incl. zero-link files.
- **P5 — JTMS sidecar tails canonical (DISARMED, `YURI_JTMS_PERSIST=1`).** `truth-maintenance` becomes a streaming sidecar (NOT inline in memory-kernel — ✓ zero SQLite there); promote→assertPremise, evict→retract; serialize TMS (the missing persistence); VC-dominance gate rejects retraction-before-fact; cascade cap 50; contradicts→PENDING_REVIEW. Gate: crash-reload + retraction-ordering tests green.
- **P6 — Read-contract enforcement (owner-gated).** Apply the §7 contract diff; verify telemetry/secrets structurally absent from canonical. Gate: owner reviews one session's canonical.jsonl before publishing peer-open read.

## 6. RELIABILITY TEST PLAN (fault-injection — the "prove it before arming" gate)

10 tests in a temp dir, env-triggered faults: T1 concurrent-append integrity · T2 torn-append detection · T3 dedup-under-race · T4 drainer-crash-recovery · T5 split-brain-prevention · T6 dead-owner-reclaim · T7 half-folded-view · T8 rotation-under-write · T9 disk-full-survival · T10 clock-skew causal ordering. No arming until green.

## 7. CONTRACT DIFF — `yuri-origin.md` (DRAFT, owner approves before apply)

**Protected Surfaces — ADD:** `_SYSTEM/OS_KERNEL/token_ledger*` (telemetry, never canonical truth).
**Protected Surfaces — ADD canonical-truth read-open block:**
- `_SYSTEM/state/memory-shards/` — READ OPEN to all peers; no wrapper; no peer writes another lane's shard.
- `_SYSTEM/state/memory-canonical.jsonl` — READ OPEN to all peers; readline/readFileSync; contains only fact/proposal/retraction events — no telemetry, no secrets.
- WRITE to canonical RESERVED to the elected drainer; peers write ONLY their own shard. **Serialization is for CONCURRENCY SAFETY, NOT authority — every lane's proposals weighted equally. Serialized ≠ subordinate.**

**Track A block — REPLACE** the `memory.db`-centric surface with: canonical convergence store `_SYSTEM/state/memory-canonical.jsonl` (drainer-materialized from shards), READ-OPEN; `memory.db` demoted to legacy (wrapper-read until migration complete); pipeline `propose(append own shard)→drainer folds→canonical`; separation guarantee (token_ledger NEVER enters canonical).

**NEW paragraph — Canonical truth separation contract:** canonical holds only memory facts/proposals/retractions/links; READ is peer-open ("no agent, no LLM gets treated as less" — owner 2026-06-14); WRITE serialization is concurrency-safety not authority; Track B projects one-way into canonical, never becomes it.

## 8. RESIDUAL RISK (honest)

1. **Cooperative-floor 3-way eviction window** (medium, UNREMOVABLE without a lock manager — the NANO SWARM POSIX floor). Resolves ≤1 heartbeat, no data loss (shards immutable). Documented, not papered.
2. **Retraction clock-skew** (medium) — live only after P5; VC-dominance gate is the fix; retractions advisory until armed.
3. **Semantic dedup bypass** (low) — paraphrases get different hashes; needs JTMS P4/P5 to stage PENDING_REVIEW; until then graph treats as separate nodes w/ tagged edge.
4. **3-dir drift reconciliation** (low, but P0 prerequisite) — until owner pins canonical Track B path, projection targets ONLY the 241-file `.claude/memory` to avoid cross-dir duplication.
5. **`memory_type`/`memory_relations` DB facts** still `[agent-claimed via sqlite3]` — re-verify via approved wrapper before P3/P4 (didn't confirm this pass).

## 9. OPEN DECISIONS FOR OWNER

1. **3-dir drift:** which is canonical Track B, and reconcile the 94-file home dir? (Blocks P0.)
2. **Apply the §7 contract diff now, or after canonical.jsonl is live + stable** (P6 sequencing)?
3. **Build P0+P1 now** (low-blast, synthetic-test, reversible) **or keep the whole thing as spec** until your two parallel build sessions land?
