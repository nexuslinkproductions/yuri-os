---
name: feedback-agentic-red-team-finds-what-self-tests-miss
description: "For concurrency / enforcement / safety-critical primitives, an independent agentic red-team (refute-by-default, writes real harnesses) is MANDATORY — green self-tests + mutation-tests are structurally blind to cross-process races, same-ms timestamps, poison inputs"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - red team
    - concurrency
    - race condition
    - lease
    - lock
    - enforcement
    - hook
    - safety primitive
    - before done
    - verify
  refs:
    - feedback-adversarial-persona-attack-loop
    - feedback-simulate-plan-refine-before-build
    - proj-nano-swarm-fabric-2026-06-13
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: a concurrency / enforcement / safety-critical primitive is NOT done on green self-tests + mutation-tests alone. Spawn an INDEPENDENT agentic red-team (Opus, refute-by-default, instructed to WRITE REAL HARNESSES — multi-process spawns, same-ms bursts, poison/circular inputs, planted stale/dead holders) before claiming it ready. Then VERIFY every finding vs live code (kill over-statements, extend the ones the agent under-scoped).
WHEN: lease/lock registries, PreToolUse/deny hooks, anything with cross-process contention, TTL/reclaim, atomic CAS, token/budget gates, cursor/ordering logic. Born 2026-06-13 (NANO SWARM): 3 Opus red-team nanos found a BLOCK-level race + 6 bugs that 47 green self-tests + mutation-tests missed entirely. RE-CONFIRMED Phase 3 (same day): 3 MORE Opus harness agents found 3 real bugs (rotation double-seal BLOCK, reader ENOENT crash, lease double-acquire) past ~120 green unit tests — engineering patterns banked in [[feedback-posix-fs-concurrency-floor]].
DO: give the agent the file + tests + a refute-by-default mandate + "prove it with a harness in /tmp"; pin Opus (max reasoning); run them in parallel (one per module) in the background while you do other work; on return, verify each finding against live code with your own harness before fixing.
DONT: trust a green unit suite for concurrency (single-threaded node CANNOT race); trust a passing test without asking what it actually proves (an instant-exit "race" test measured crash-reclaim, not contention → false 3-winners); trust a multi-process harness's BROKEN verdict without checking the PROCESS-LIFETIME boundary (Phase 3: the reaper agent self-overturned a false-death — its renewer process exited BEFORE the supervisor window ended, so the reap was correct; the renewer must outlive the reaper window); fail-CLOSED in a hook on missing telemetry (brick risk — fail-open in the hook, fail-closed at the restartable tick); ship mkdir-then-write atomic claims (empty-owner TOCTOU → use owner-included rename); treat ISO-ms as an ordering key (~88% same-ms collisions under burst).
WHY: self-tests are structurally blind to the exact failure classes that matter most for swarm primitives. The red-team found: empty-`.owner` TOCTOU (8 simultaneous lease winners), pid-reuse wedge, fail-open release hole, orphan-dir leak, "0"-threshold deny-everything brick, same-ms cursor skip, circular-result breaking always-HANDOFF. Each was real, each shipped past green tests. The independent adversarial pass IS the verification, not a nicety. Pairs with [[feedback-adversarial-persona-attack-loop]] (build→attack→verify before claiming novel/done).
SEE: [[feedback-adversarial-persona-attack-loop]] · [[feedback-simulate-plan-refine-before-build]] · [[proj-nano-swarm-fabric-2026-06-13]] · _SYSTEM/reports/nano-swarm-session-retro-2026-06-13.md
