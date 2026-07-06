---
name: feedback-enforce-block-is-breaker-not-soft-reject
description: "Energy-enforce blocks ONLY on catastrophic breaker trips, never on a soft gateProposal ΔU-ascent reject — any 'the gate blocks X' claim must be checked against whether it trips the breaker, not whether accept=false"
metadata: 
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig: 
    - energy enforce
    - breaker
    - gateProposal
    - accept false
    - arm blocking
    - verify finding
    - staleness
  refs: 
    - feedback-nano-swarm-orchestration
    - proj-keystone-verifier-learn-loop-2026-06-16
    - feedback-green-red-grey-test-layering
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: A finding that claims "the energy gate BLOCKS <X>" is only true if <X> trips the **breaker** (a catastrophic, non-offsettable veto: protectedPath / structuralFloor / maxSeverity / gateError → `isCatastrophic`). A soft `gateProposal` reject (`accept:false` from ΔU > threshold with NO veto) is **advisory only** — it does NOT trip the breaker, so `evaluateGate` stays CLOSED → enforce emits `allow`. The PEP (`energy-enforce.mjs`) reads the BREAKER state, never the per-tick accept/reject.

WHEN: verifying any energy-gate / arm-readiness finding, especially one tagged "BLOCKS THE ARM".

DO: build the repro through `verdictFromStates` → `isCatastrophic(verdict)` → `evaluateGate(breaker)` and check the DECISION, not just `accept`. Confirm whether the breaker actually opens.

DONT: equate `gateProposal.accept===false` with "enforce will block." That is a layer confusion (PDP soft-reject vs PEP breaker-enforce) and it over-states severity.

WHY: in the 2026-06-16 pre-arm red-team (88-agent fleet), 2 of 3 "CRITICAL arm-blocker" findings were mischaracterized exactly this way — D5 phantom-staleness made every healthy Edit `accept:false` (ΔU=0.478) but `isCatastrophic:false` → breaker CLOSED → `allow`. Real signal-quality bug, NOT arm-blocking. Main-session repro + Opus-2 both corrected it. Lesson pair: the fleet confirmed 60/70 (high rate) but the cross-dimension dedup collapsed 60 → ~6 root-cause classes — a confident lane over-claims severity AND multi-counts witnesses; verify every arm-gating claim with your own repro and dedup by root cause.

CONTEXT (project facts, see report not memory): energy-enforce arm = `arm-after-fixes`; SEAM-3 KILLED; real blockers = B1 RMW write-back race class (enforce full-snap write clobbers tick's trip — hermetic-confirmed), B2 untested+unverified block channel, B3 self-disarmable flag/snap dir, B4 ζ-staleness fail-closed on every live record. `YURI_ENERGY_ENFORCE=1` was already set in env (illusory arm). Full: `02_RESOURCES/RESEARCH/energy-prearm-audit-2026-06-16/02-FINDINGS-AND-RULING.md`.

SEE: [[feedback-nano-swarm-orchestration]] · [[proj-keystone-verifier-learn-loop-2026-06-16]] · [[feedback-green-red-grey-test-layering]]
