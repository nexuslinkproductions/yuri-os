---
name: proj-keystone-verifier-learn-loop-2026-06-16
description: "Energy-gate verifier LEARN loop: capture ARMED + cadence LOADED (recurring 30min) but deriving 0 — pending claimId-tagged outcome accrual. Plus nano-dispatch-gated hydration shipped."
metadata:
  node_type: memory
  type: project
  tier: 2
  scope: energy-gate verifier learn loop / corrId forward-loop / nano lane reliability
  trig: "energy gate learn loop; corrId/claimIds; energy-outcome-deriver/backfill/signals; two-sided FP/TP labels; nano-dispatch-gated; com.yuri.energy-learn-deriver"
  refs:
    - feedback-nano-swarm-orchestration
    - ref-capability-scan-tag-window
    - proj-energy-calibration-swarm-sheet-2026-06-13
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: close the energy-gate verifier LEARN loop — gate firings carry a joinable corrId+claimIds, claims resolve, real reverted/promoted OUTCOME labels accrue in a shadow ledger → eventually a from-scratch two-sided FP/TP verdict (replaces the current proxy-only assessment).

WHO: Claude lane (build + arm); owner (loaded the cadence).

WHEN: built/armed 2026-06-15; cadence LOADED by owner 2026-06-16.

WHERE: capture = yuri-energy-gate-trace.mjs (corrId proposal-level fallback, ts-EXCLUDED; stamps corrId+claimIds) wired through yuri-energy.mjs gateProposal (corrSources) + claim-cortex.mjs gateClaimTransition (claimIds). Consume = energy-outcome-deriver.mjs / -backfill.mjs (reads armed `_SYSTEM/state/energy-gate-trace.jsonl` via traceFile default) / -signals.mjs (isReverted joins firing.claimIds → claim-transition-trace worsened[], STRICT-after ts, FAIL-CLOSED). Arm flags: `_SYSTEM/state/gate-trace.enabled` + `gate-trace-corrid.enabled` (present, LIVE). Cadence: `~/Library/LaunchAgents/com.yuri.energy-learn-deriver.plist` (StartInterval 1800s, RunAtLoad, runs energy-outcome-backfill).

STATE (2026-06-16, verified):
- Capture ARMED + healthy: 421,403 firings carry corrId.
- Cadence LOADED + recurring (exit 0 at load, every 30min).
- DERIVES 0 OUTCOMES (100% undeterminable) — NOT a bug: only 4/421403 firings carry claimIds (claimIds attach to claim-cortex claim-transition firings, ~absent; trace is dominated by ΔU=0 held decisions), and the 248 claim-transition-trace rows are nearly all worsened:[]. Join is live + fail-closed; nothing to join yet. Labels accrue over time exactly as the assessment predicted.
- The plist's `--firings /nonexistent-armed-only` disarms only the legacy dir-leg; the armed single-file traceFile leg still fires (that's where 421k came from). `--fresh` truncates+rebuilds the shadow each tick (O(full-trace) every 30min — fine at derived=0; a tail-incremental mode is a future optimization).
- nano-dispatch-gated.mjs hydration SHIPPED (1ecfc7a2): aiHydratedLlmRunner routes lanes through `bash ai llm <lane>` (keychain hydrates, all flags forward verbatim) — the gated design→execute dispatch now works standalone.

NEXT:
- Watch outcome accrual: derived>0 only once claim-cortex claim-transitions with claimIds resolve to reverts/promotions. If it stays 0 long-term, the gap is that the high-frequency gate path (ΔU=0 held) never threads claimIds — consider whether more firing classes should carry claimIds, or accept that the learn signal is intentionally claim-transition-only (slow + rare = correct).
- Two-sided from-scratch verdict is the destination metric; the proxy assessment stands until labels exist.
- eml-tree pow2 UNARY refactor (DISARMED, surfaced in the math assessment) is unrelated but tracked.

SEE: 02_RESOURCES/RESEARCH/math-base-sim-assessment-2026-06-15.md; [[feedback-nano-swarm-orchestration]]; [[proj-energy-calibration-swarm-sheet-2026-06-13]].
