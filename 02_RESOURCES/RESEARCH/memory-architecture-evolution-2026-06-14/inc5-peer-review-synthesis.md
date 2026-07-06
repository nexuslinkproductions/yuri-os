# Inc 5 Fault-Injection Harness — NANO SWARM Peer Review Synthesis (2026-06-14)

Three cross-family peers (glm-5.1, minimax-m3, nemotron-3-ultra via `llm-lane.mjs ollama-cloud`) adversarially
reviewed the Inc 5 multi-process fault-injection harness (`mcs-fault-injection.test.mjs`) for missed fault modes
and false-greens. Brief: `inc5-peer-review-brief.txt`. Raw lane output: `inc5-peer-{glm,minimax,nemotron}.out`
(kept local; this is the synthesized, locally-verified record). Peer output is advisory-until-verified — every
finding below was checked against the actual store code before adoption.

## Findings adopted (verified real, fixed)

| # | Peer(s) | Finding | Verified against code | Resolution |
|---|---------|---------|------------------------|------------|
| 1 | minimax 1a, 2a | **Dedup never exercised under concurrency.** A/B/C/D all use DISTINCT eventIds; the store's core sha256-dedup + content fidelity were untested in the multi-proc harness. | TRUE — only unit T3 tested dedup, single-process. | **Scenario E**: same `laneId` + different `sessionId` → distinct shards (one-writer-per-file holds) but identical `(subject,object)` → identical eventId. 250 raw appends → 150 unique. Asserts count == 150, a known key's `object` is byte-exact, and zero duplicate eventId lines in canonical. |
| 2 | minimax 2b | **No reader races the writer.** Rotation/compaction consistency for peer-open reads was unverified. | TRUE. | **Scenario F**: a reader spins `readView()` + `loadCanonical()` throughout a rotation+compaction storm. Asserts `readView` claimCount is monotonic (atomic single-file publish never tears/regresses) and `loadCanonical` never throws. |
| 3 | minimax 2b (latent) | **`foldCanonical` TOCTOU.** `existsSync(gen)` then `readFileSync(gen)`; concurrent LEASED compaction can `rmSync` an old sealed gen in that window → peer-open `loadCanonical` throws ENOENT. | TRUE — real latent crash on the unleased peer-read path. | **Store fix**: ENOENT-tolerant fold (`try readFileSync … catch ENOENT → continue`). Safe because compaction rescues all live events into gen-00001 BEFORE unlinking, so a vanished gen never held an un-rescued live claim. Scenario F validates it. |
| 4 | **nemotron 1+3, minimax 1f (convergent)** | **Crash MID-FOLD untested.** Scenario C's `hold-then-die` holds the lease but never folds — the store's documented "crash after canonical write, before offset publish → 2nd drainer re-folds from the dedup seed" path was never touched. | TRUE — the exact path the lease-loss/crash comment guards. | **Scenario G**: seed 3000 events, fork drainer-1 (cycles:1), SIGKILL mid-fold (~250ms in, after partial canonical writes, before offset publish), drainer-2 reclaims (PID-liveness) + completes. Asserts exactly-once (3000), zero duplicate eventId lines, read-view not double-counted. |

Two of three peers independently surfaced #4 as the highest-value gap — genuine convergence, not a framing artifact.

## Findings verified but NOT changed (already-correct or pre-existing documented floor)

- **glm 1 / minimax 2h — PID-recycle defeats liveness reclaim.** Real but a documented cooperative-lease floor in
  `nano-lease.mjs`: if the OS recycles a dead PID to a live stranger within the 30s TTL, liveness reads "held" and
  reclaim waits out the TTL. Correctness holds (TTL expires); only latency degrades. Not deterministically
  reproducible. Added an honest comment in Scenario C; no code change.
- **minimax 1g/2g — shard torn writes / >4KB events.** `appendClaim` rejects events > `MAX_EVENT_BYTES` (4096)
  and `readFromOffset` only consumes complete `\n`-terminated lines (torn tail left for next read). Covered by
  design + unit T2.
- **minimax 2c — Scenario C `elapsed` start-point ambiguity.** Our `t0` is taken AFTER `await exited` (post-reap),
  so it measures reclaim latency, not the hold. Correct as written.

## Residual (honest scope)

- **Live-lease-loss `renewLease` guard** (a LIVE drainer whose lease is stolen mid-fold by TTL expiry, vs the
  CRASH case G covers) is not multi-process tested: the drain lease TTL is a hardcoded 30s (`DRAIN_TTL_MS`, not
  env-tunable), so a live drainer can't be made to lose its lease mid-fold deterministically without a store hook.
  Covered by code review + the dedup-seed idempotency that Scenario G proves end-to-end.

## Result

Harness: 7/7 green (A–G). Store unit suite: 15/15 green (foldCanonical hardening regression-clean). Daemon: 2/2.
Bridge: 1/1. NB: the store tests must each run with their OWN `YURI_NANO_LEASES_DIR` — a shared leases dir +
the global `DRAIN_LEASE_ID` makes concurrent test files contend for the drain lease (a test-runner artifact, not
a store bug).
