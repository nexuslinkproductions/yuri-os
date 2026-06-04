# Nemotron 3 Ultra 550B A55B — Live Eval (2026-06-04)

Evaluation of NVIDIA `nemotron-3-ultra-550b-a55b` as a YURI reasoning lane. Owner-requested (Marcel) capability test.

## Verdict

Live, callable today through our existing NIM infra at **zero integration cost**, and it is a genuinely strong reasoning lane. Reserve for HARD architecture/security reasoning — not daily chatter (it is the 550B flagship, slower + pricier than the daily `nemotron-120b` / `super-49b` lanes).

## Access (verified by live probe, not assumption)

- **API model id:** `nvidia/nemotron-3-ultra-550b-a55b` (slug == build.nvidia.com page). Resolved live, returned `PONG`.
- **Params:** 550B total / ~55B active (MoE, `a55b` suffix). MoE generation == our existing `nemotron-3-super-120b-a12b` / `nemotron-3-nano-30b-a3b` family, one tier up.
- **Endpoint:** OpenAI-compatible via `NVIDIA_NIM_BASE_URL` + `NVIDIA_API_KEY` (keychain/env-file hydrated by `offload.sh`).
- **Call path (zero config — `nvidia/*` passthrough already exists in `offload.sh:366`):**
  ```bash
  _SYSTEM/Scripts/ai offload --model "nvidia/nemotron-3-ultra-550b-a55b" "<prompt>"
  ```
  `--model` sets `PULSE_LANE_BYPASS=1`, skipping the classifier and hitting the model directly.
- **Not yet in the contract's named live registry** — our last NIM probe was 2026-05-20/21, before this model shipped. Friendly alias (`@nvidia-nemotron-ultra`) is unregistered but the passthrough makes it permanently callable as-is.

## Graded complex test — energy-gate red-team

Gave it our real Lyapunov energy-gate design (cold, no codebase access) and asked it to break a conserved-sum safety gate and propose the minimal fix. Ground truth = our own red-team finding (memory `FB:DELTA-GATE-SEVERITY-LAUNDERING`): a gate on a conserved SUM is partition-fungible; needs a non-offsettable L∞ max-severity term.

**Result: A.**
- **Vulnerability (A+):** independently named it "Energy Laundering via Compensating Progress Claims." Exact math: catastrophic `+M` harm offset by `k×−M` fabricated progress claims → `dU ≤ −M`, gate green. Identified the controllable surface precisely (adversary owns N, sign_i, s_i; severities are *claimed* not *measured*). Stated the root cause cleaner than our memory: weakness #7 "harm and progress don't cancel — deleting a database + writing a poem ≠ net zero harm."
- **Also surfaced cold:** salami-slicing (split harm into N sub-θ pieces), stateful accumulation across actions (no energy budget / `dH/dt`), unverified severity + sign assignment, no semantic grounding oracle. 7 distinct ranked weaknesses total.
- **Fix (A−):** `block = (H > θ)` with `H` = sum of harm-claims only, progress discarded. Proved non-offsettability rigorously (fixed index set, monotonic in harm, invariant to added progress claims). **Gap:** discarding progress entirely kills the gate's purpose — permitting high-value high-cost legitimate work — and would false-positive on a justified large action. A senior reviewer holds that constraint; Nemotron dropped it. Our shipped design is layered: soft net ΔU stays advisory, a non-offsettable L∞ max-severity term + protected-path/structural-floor veto is the hard floor — closes laundering AND preserves legitimate-permit behavior.

## Full-package eval (2026-06-04, 63KB / 6-organ briefing, 5-verifier cross-ref)

Fed it the real YURI architecture (energy gate, two-track memory, lane contract, propagation engine, claim-evidence cortex, persona spine), asked for cross-organ map + systemic findings + highest-leverage move + self-red-team, then cross-referenced every beyond-briefing claim against live code.

**Profile that emerged:** A− at architecture perception, C+ at unverified concrete output.
- STRENGTH: holds a whole system in context and finds the load-bearing seam. Its top finding survived live verification and was its own inference (not a quote-back).
- FAILURE MODES: (1) hallucinates function names + import paths the instant it writes implementation code (invented `projectStateAfter`, `loadCurrentEnergyState`); (2) confident layer-conflation reasoning errors stated with no hedge (claimed breaker clock-skew bypasses the veto — false; veto computes in gateProposal independent of breaker); (3) padding — ~8 of 10 "findings" were re-dressed copies of the per-organ risks fed in.
- USAGE LAW: use it to find the seam, never to write the patch. Always wrap the dispatch in a live-code cross-reference loop. The output-rail correctly auto-tagged its whole response ADVISORY_HYPOTHESIS_ONLY / EVIDENCE_MISSING.

**Two VERIFIED YURI gaps it surfaced (real build leads, Track-A worthy):**
1. The energy gate is built + armed (`_SYSTEM/state/energy-enforce.enabled` present → `energy-enforce.mjs` blocks at PreToolUse) but is **NOT wired into lane routing** — `offload-contract.mjs` `universalWorkflow` (`:30-61`), `selectSteeringLane` (`:717-823`), `buildRoutePlan` (`:1342-1388`) never call `gateProposal`. The gate guards tool execution, not dispatch selection.
2. `cortexSnapshot.maxLadderInversion` (the L∞ swap-bug groundwork) is **emitted** (`claim-cortex.mjs:530,558`) but **never consumed** by `gateProposal` (`yuri-energy.mjs:472-604`). Wiring it into the structural-floor section (~`:509-552`) closes the documented swap-fungibility — no new preflight layer needed (that part of Nemotron's proposal was misplaced + referenced invented symbols).

## When to use

- HIGH/CRITICAL system/infra security + architecture reasoning (NIM-scope per `FB:CODEX-POWERHOUSE-NIM-SCOPE`).
- Adversarial second-opinion / refute-by-default attack passes on YURI substrate (it found a real defect class cold).
- NOT for routine chatter, design copy, or cheap probes — cost/latency don't justify it there.

## Notes

- Our output-rail correctly tagged the NIM response `[ADVISORY_HYPOTHESIS_ONLY] [EVIDENCE_MISSING]` before display — conscience layer behaved.
- Next step (optional, not done): register `@nvidia-nemotron-ultra` as a named lane (dispatch token + `offload.sh` case map + contract live registry + `ai` facade help) so it is first-class, not passthrough-only.
