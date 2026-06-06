---
name: yuri-governance-architecture-GVF-2026-06-06
description: THE unified mathematical-governance model for YURI — the Governed Verdict Functional (GVF). Synthesis of a 9-agent governance push (1 native architect + 5 Codex organs + 3 DeepSeek frontier). Every governance organ (energy, epistemic, conformance, matcher, dispatch) is one triple G=(S,V,C) over a complete candidate set Ω. The pairing law, the integrating potential U, the conformal-prediction anchor, the DES-supervisory-control formal home, the honest superiority claim, and the keystone (shadow-mode calibration layer C over the complete matcher set).
metadata: { node_type: architecture, date: 2026-06-06, status: canonical-synthesis, source: governance-push-9agents, tier: high }
tags: governance, GVF, lyapunov, conformal_prediction, calibration, DES_supervisory_control, superiority, keystone
---

# YURI Governance Architecture — the Governed Verdict Functional (GVF)

Synthesis of a 9-agent full-spectrum governance push (native architect + 5 Codex organ-digs + 3 DeepSeek
frontier). Every claim traces to live code. This is the model that makes YURI's math/science governance
auditable and superior — and the keystone that realizes it.

## 1. THE UNIFYING ABSTRACTION — `G = (S, V, C)` over a complete candidate set `Ω`
Every governance organ is ONE triple:
- **S : Ω → ℝ** — a deterministic, embedding-free **scalar potential** (cost/energy/tension/dissimilarity). Lower = healthier.
- **V : state → {⊥, valid}** — fail-closed **non-offsettable vetoes** keyed on the *absolute level* of a structural fault (not a delta, not a sum). Fires regardless of how good S is.
- **C : S → [0,1]** — a **calibration map** → a real probability with provenance (`advisory_only` until a local verifier proves otherwise).
- **Completeness contract:** `Ω` is the WHOLE candidate set with a true count — never top-N. A verdict over a truncated Ω is severity-laundering and is itself a veto-class fault.

Verified term-by-term across all five organs:
| Organ | S (potential) | V (non-offsettable floor) | C (calibration) | Ω |
|---|---|---|---|---|
| **Energy** (yuri-energy.gateProposal) | `U` (computeU) | protectedPath · structuralFloor · maxSeverity vetoes | **MISSING** (uncalibrated U) | trace state |
| **Epistemic** (claim-cortex) | Σ inversionPenalty `d²` | identity veto (worsened/untrackedRetract) + maxLadderInversion | verdict + UCB proto-calibration | complete claim ledger |
| **Conformance** (nexus-guard) | `T` (log-compressed/tier) | raw `{hi,med,lo}` L∞ counts | **MISSING** (hand 0.30/0.85) | complete set-difference |
| **Matcher** (corpus-match) | Expanded-Feature-Jaccard dist | `complete: t≥buildThreshold` flag | raw similarity (→ wants calibration) | prefix-filter PROVEN-complete set |
| **Dispatch** (shintai) | additive lexical cost | **NONE (the gap)** | **NONE** | roster |

## 2. THE PAIRING LAW (the deepest theorem — currently re-proven 5× in 5 comment blocks)
**Every soft scalar MUST be paired with a non-offsettable absolute-level (L∞ / identity) floor, because every magnitude aggregate — sum, convex sum, even L∞-max-of-delta — is conserved under an equal-magnitude swap.** This is why a pure scalar/delta gate is partition-fungible (the `3²+4²=5²` swap; [[delta-gate-severity-laundering]]). State it ONCE as a shared kernel helper, not 5 times. Conformance's intra-tier identity-swap residual needs the same fix: a finding-identity set keyed `cls|code|artifact|alias|target` (Gov-G3).

## 3. COMPOSITION — Energy `U` is the integrating potential (the backbone)
`computeU` is the only place that folds a heterogeneous field-bag into one comparable scalar → it is the **common currency** the other organs convert into.
- **matcher → epistemic** (LIVE): complete recall lets the cortex see ALL prior claims, not top-N.
- **epistemic → energy** (LIVE): claimGateFields inject α/β/ε/ζ/θ + maxLadderInversion into the gate — but deliberately OMIT the veto fields (cortex can raise U, cannot yet block).
- **conformance → energy** (FRONTIER, needs C first): add `λ·T` + `{hi,med,lo}` as a structural-floor veto input → "system is incoherently wired" raises the same U as "a claim is over-asserted." Dimensionally requires T pass through C first (T is log-compressed, U is nats).
- **calibration → ALL** (FRONTIER, shadow-first): C is NOT an organ — it's a transform over every organ's raw S. Built once, it makes U/T/Jaccard/dispatch-cost speak PROBABILITY → comparable across organs → energy weights become LEARNED not hand-tuned (the #1 honest limitation, yuri-energy.mjs:20-22).
- **dispatch → energy** (FRONTIER): replace argmax-of-lexical-score with min-cost assignment; expose chosen residual cost as a U-term. (Keep AUTHORIZATION — dispatch-at-all-vs-refuse — in the protocol-guard, not U; only SELECTION cost enters U.)

## 4. THE CALIBRATION LAYER `C` — conformal prediction is the anchor (DS2)
Pipeline: **Conformal prediction (#3, the anchor)** gives a *mathematical* guarantee (finite-sample, distribution-free): `P(overclaim) ≤ α`. Platt (#2) + Brier/log-loss-as-loss (#1, already in kernel) feed calibrated probabilities into the conformal nonconformity score. Bayesian decision theory (#4) consumes it (promote/evict/dispatch = minimize expected loss under a cost-of-error matrix). Active learning (#6) orders which labels to verify first; cold-start priors (#5) bridge until the ledger populates.
**Core law upgrade:** "advisory until verified" → **"advisory until the conformal bar is met; when met: marginal guarantee P(overclaim) ≤ α, Mondrian per evidence-kind, adaptive for drift, operator override always."** Calibration NEVER lifts a veto or an operator gate (authority ordering preserved).

## 5. FORMAL HOME + the 7 governance invariants
- **Formal home (DS1):** not continuous control (no plant); YURI governance = **Discrete-Event Systems supervisory control (Ramadge-Wonham)** — a supervisor restricting the system to a legal language of event sequences. Lyapunov was the right intuition; DES is the publishable formalism. (Zero prior corpus hits — genuinely new.)
- **Invariants:** (1) completeness/no-silent-miss · (2) determinism/reproducibility (no clock/RNG/embeddings in any core) · (3) fail-closed everywhere (a fault you can't evaluate = worst case) · (4) Lyapunov-decrease toward verified+coherent+progressing states · (5) calibration (scores = real probabilities; per-organ honesty) · (6) the pairing law · (7) authority ordering preserved (model output enters only as advisory S; never lifts a veto).

## 6. HONEST SUPERIORITY CLAIM (DS3 — substantiated, not hyped)
YURI **leads on dynamical mathematical governance of epistemic state — a category it created.** "Nobody else measures whether the agent is becoming more or less coherent over time. We do — with math you can audit." Mainstream frameworks (LangGraph/CrewAI/AutoGen state-machines, DSPy optimization, Constitutional-AI prompts, NeMo/Invariant guardrails, constrained decoding) run a sampling LLM in the decision path + rank-and-truncate the candidate set → can't prove completeness, reproduce a verdict, or state a stability direction.
**Does NOT lead on:** OS containment, constrained-decoding hard guarantees, learned verifiers/PRMs, policy DSLs, content/semantic guardrails. Don't overclaim those.

## 7. HONEST GAPS (refute-by-default, from the architect)
1. The five share a PATTERN, not a runtime — ship the LAW + a shared C-layer + the pairing-helper; do NOT extract a god-object base class (premature consolidation = the rejected 104-node glob).
2. Calibration is well-grounded for conformance + matcher (have ground-truth labels), WEAK for energy + epistemic (sparse/slow outcomes) — state calibration quality PER-ORGAN, never blanket.
3. conformance→U DEPENDS on C-layer first (dimensional coherence).
4. dispatch: only SELECTION cost into U; keep AUTHORIZATION in protocol-guard.
5. determinism trades fuzzy recall for total auditability + completeness proofs (right trade for governance, wrong for a search engine — never let the governance matcher masquerade as semantic search).
6. the deterministic PreToolUse hooks + settings deny + operator-write-guard stay OUTSIDE the GVF — the hard spinal reflex; the GVF is the soft calibrated conscience. NEVER put a calibrated probability in front of a protected-path block.

## 8. THE KEYSTONE + sequenced moves
**KEYSTONE — build first: the calibration layer `C` in SHADOW MODE over the matcher's complete scored set.** Only piece touching all 5 organs; zero-risk (shadow, reports to `_SYSTEM/reports/`, overrides nothing); unblocked (softmax in kernel, matcher emits the complete raw-score vector, conformance has ground-truth labels); unlocks everything downstream (conformance-as-U-term, dispatch-vs-energy comparability, learned energy weights). *The matcher is the spine; calibration is the nervous system that makes the spine govern.*
Then (DS3's lead-wideners + the per-organ topMoves, shadow-first throughout):
1. Energy gate **OBSERVE→ENFORCE** — graduated ΔU bands (deny/steer/warn/log/allow) + wire the identity-aware veto live (Gov-G1: today it's a strong audited heuristic, not yet enforcing; maxLadderInversion not live-fed).
2. Wire matcher → computeU evidence terms (3-of-9 → 9-of-9 dark terms fire).
3. conformance `T` → U-term (after C); finding-identity floor (Gov-G3).
4. dispatch: shadow `decision-dispatch-kernel` — UCB + min-cost assignment over the EXISTING lane-calibration telemetry; replay-beat fixed routing before live (Gov-G4).
5. claim-calibration-ledger → Platt/conformal; expose pCorrect beside verdicts without changing enforcement (Gov-G2).
6. regulatory crosswalk: computeU terms/vetoes → NIST AI RMF / ISO 42001 / OWASP Agentic / MITRE ATLAS / EU AI Act (DS3 — auditable deterministic trails beat black-box scores).

SEE: [[yuri-enhancement-architecture-2026-06-06]], [[yuri-improvement-backlog-2026-06-06]], [[delta-gate-severity-laundering]], [[energy-gate-Linfinity-doubly-inert]], [[claim-evidence-ledger]].
