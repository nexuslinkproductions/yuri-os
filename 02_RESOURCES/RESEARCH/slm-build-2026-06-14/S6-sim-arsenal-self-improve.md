# S6 — Sim Arsenal & Self-Improvement Loops, mapped onto the slm-build research

The slm-build corpus was for YURI THE SYSTEM, not just a future 7B. The single insight: rStar-Math (`2501.04519`) is not "train an SLM" — it's a general loop, **small generator + deterministic verifier + co-evolution beats raw scale**, and YURI owns 3 of 4 pieces with the 4th half-built.

| rStar/RLVR piece | YURI mechanism | state |
|---|---|---|
| Verifier (reward) | `computeU`/`gateProposal` (math/yuri-energy.mjs) | LIVE |
| Candidate gen+score | decision-sim, izanagi-bridge | LIVE |
| Outcome scoring (Brier) | prediction-ledger.mjs | store LIVE, **unfed** |
| Param self-evolution | yuri-energy-calibrate.calibrate() ladder+holdout | LIVE but **open-loop** |

The loop is measure→robustify→commit→[LEARN]; the LEARN rung is the gap (ref-simulation-arsenal: "nothing scores predictions→outcomes on a schedule").

## REAL vs CARGO-CULT
- REAL: computeU-as-verifier is the unfair advantage the papers name (`2404.17140` SLMs need a *strong external* verifier; `2506.14245` outcome-only verifiable reward suffices). YURI's verifier is deterministic, not a reward-hackable second LLM.
- REAL: test-time-compute as SYSTEM strategy (`2504.04718` T1, `2604.01411` T2) = spend evals on best-of-N + verification, not size.
- CARGO-CULT: importing GRPO/GSPO/MeZO into the substrate. Those are GPU training optimizers — only matter when the SLM build runs. Do NOT bolt a policy-gradient optimizer onto the JS energy gate; it's a verifier, not a policy net. The transferable idea is verifier-as-objective + self-evolution, not the CUDA optimizer.
- CARGO-CULT: "more evals = win." eval-processing already proved millions is bad allocation; the win is CRN + QMC + stratify + stopping rule.

## buildIn (zero-GPU, now)
- **B1** learn-loop cron joins prediction→realized outcome→recordOutcome→calibrationReport (rStar `2501.04519`) — prediction-ledger.mjs + new learn-loop-cron.md + self-hypothesis.mjs. **The keystone.**
- **B2** `verifierBestOfN` — computeU over N candidates, argmax+CI (T1 `2504.04718`) — yuri-energy.mjs + eval-processing.
- **B3** zenkai failure intake → recordOutcome({0}) labeled negative (RLVR `2506.14245`) — failure-evolution-loop SKILL step 1.
- **B4** computeU as canonical sim value() oracle, kills sim≠prod gap (`2408.15240`) — decision-sim + izanagi-bridge.
- **B5** error-localized per-claim feedback not scalar ΔU (VERGE `2601.20055`, VeriCoT `2511.04662`) — prose-claim-extractor.mjs.

## simulate (before arming)
- **S1** replay 46k trace held-out, confirm Brier drops not noise (`2509.21882`) — eval-processing.heldout-split.
- **S2** best-of-N entropy-collapse sim if selection feeds weights (DAPO `2503.14476`) — decision-sim.multiverse.
- **S3** Schmidt-test prediction-error↔weight coupling before auto-proposing weight changes — quantum-hypothesis-tracker (order-effect = control; coupling = lever).
- **S4** per-claim culprit metamorphic check before B5→zenkai (PRM `2305.20050`).

## calculate
- **C1** baseline meanBrier+ECE over 46k trace — the honest "before" (`2509.21882`).
- **C2** marginal ΔU-per-candidate curve → optimal N for B2 (T2 `2604.01411`, preprint).
- **C3** CRN paired-delta CI on loop-on vs loop-off → effect-size not binary (feedback-effect-size-over-binary-threshold).

## topMove
**B1.** Converts the arsenal from open-loop to the rStar-Math self-evolution loop with computeU as verifier. Store + proposer + postmortem all exist; nothing joins outcomes back. Low effort, zero-GPU, precondition for everything else being measurable.

## Honest residual risk
The whole map rests on computeU being a *trustworthy* verifier. A miscalibrated gate → the loop amplifies the miscalibration (reward-hacking your own gate) — exactly the weak-verifier failure `2404.17140` names. C1+S1+S2 must gate B1 before arming. Self-improvement on a bad verifier is just confident drift.