# S4 — Calibration & Learning Layer: SLM research -> SYSTEM upgrades

> Lens: the slm-build D-angle ML upgrades are for YURI THE SYSTEM first — the GVF calibration layer, the energy gate, capability-recall, the prediction-ledger — and the 7B SLM only as a downstream consumer. Every item ties to a live mechanism + a verified paper.

## The one-line read
YURI already architected this layer and left it unbuilt. The GVF doc (yuri-governance-architecture-GVF-2026-06-06.md line 24) marks the **Energy organ's calibration map C as MISSING (uncalibrated U)**, and line 42 names the exact pipeline: **conformal anchor + Platt + Mondrian-per-evidence-kind**. The D-angle research is the closing instruction set for a frontier YURI already drew — and three primitives are already in the tree.

## What already exists (capability-first — do NOT rebuild)
- **conformalQuantile + heldOutSplit + inSampleVsHeldout** (eval-processing.mjs:195/174/208). Split-conformal (Vovk; Angelopoulos-Bates, (n+1)(1-alpha) order stat) is built + @capability:heldout-split registered. **Mondrian = stratify scores by evidence-kind, then call this per stratum.** Hard part done.
- **calibrationReport** (prediction-ledger.mjs:169). Already buckets by confidence, emits per-bucket hitRate + meanBrier = the reliability diagram's data, minus the ECE scalar (~15-line reduce).
- **computeU/gateProposal** (yuri-energy.mjs:617/766). 12 weights: 10 SOFT + 2 BARRIER (eta=100, theta=10, BARRIER_WEIGHT_KEYS, inviolable). Hand-tuned (header sec.23). **No pReject** — raw U is not a probability. That is the C-gap.
- **yuri-energy-calibrate.mjs 6-rung ladder + energy-calibration-contract.mjs** — admission gate for any new soft-weight vector. yuri-energy-propose.mjs already proposes leniency-direction candidates (a proto-proposer the bandit slots behind).
- **capability-recall.mjs:24 score()** — deterministic token-overlap matcher; the baseline LTR must beat.

## buildIn (zero-GPU, now)
1. ECE + reliability diagram over the ledger (data already bucketed). S/high. Held-out only.
2. Platt/isotonic shadow pReject=sigma(a*U+b) -> new yuri-energy-conformal.mjs. The GVF C-map. M/high.
3. Mondrian conformal wrapper reusing conformalQuantile per evidence-kind stratum (CONTRIBUTION_KIND partitions terms). S/high.
4. Online LTR for capability-recall (phi=token-overlap+phrase-hit+serves-jaccard, SGD on used?). NO idf-cosine, NO centrality. M/med.
5. ECE-delta as a co-metric on the ladder's real-data-bakeoff rung. S/med.

## Myth-busts (cargo-cult — do NOT do)
| Claim | Reality |
|---|---|
| IDF-cosine beats the deterministic matcher | NO — baseline-only at <=8 caps; revisit past 100+ |
| Centrality prior improves recall | NO — measured -4 to -40pt P@1; reject |
| Bandit can tune eta/theta barriers | NEVER — validateCandidateWeights excludes them |
| Calibrated pReject sits before a protected-path block | NEVER — GVF line 59: C is the soft conscience; hooks+deny-list are the spinal reflex |
| Train a reward model on the M2 Pro | NO — cloud-gated (Angle B/C), not a zero-GPU system move |
| ECE=0 means calibrated | NO — in-sample ECE=0 is the optimism trap (eval-processing sec.170) |

## SLM as downstream consumer (secondary)
Once Energy emits a calibrated pReject, the SAME gate is the SLM's RLVR/verifier signal: gateProposal already scores N candidates; a calibrated score is a better best-of-N selector + cleaner GRPO reward_fn (rStar-Math 2501.04519; SLMs-need-strong-verifiers 2404.17140). The 46k trace exports to PRM/RLVR (AgentPRM 2511.08325) — but that is cloud-gated TRAINING, not a system upgrade. The system move is the calibration layer; the SLM inherits it.

## topMove
Build yuri-energy-conformal.mjs (Platt pReject + Mondrian wrapper, shadow-only). Closes the GVF's MISSING Energy C-layer, reuses the built conformalQuantile (S-M not L), gives computeU a distribution-free P(overclaim)<=alpha, unlocks learned weights, and becomes the SLM's calibrated verifier for free. Gate behind ECE first.

RESULT_LABEL: 08CL_CALIBRATION_LEARNING_SLM_TO_SYSTEM_MAP_X_PASS_COMMITTED