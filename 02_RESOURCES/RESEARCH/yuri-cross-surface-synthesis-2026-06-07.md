---
name: yuri-cross-surface-synthesis-2026-06-07
description: The cross-surface comparability wave folded — how "0.4 in memory ≠ 0.4 in code" got cracked (containment + RRF), the unanimous frontier verdict, what shipped, and the honest residual. 9-agent wave (1 native + 5 Codex gpt-5.5 + 3 DeepSeek).
metadata: { node_type: synthesis, date: 2026-06-07, status: confirmed, tier: high, wave: cross-surface-comparability }
tags: cross-surface, comparability, containment, rrf, fusion, calibration, nexus, clockwork, matcher
---

# Cross-Surface Comparability — CRACKED (wave synthesis, 2026-06-07)

**The problem (Marcel):** `recallAll("<cue>")` returned `{}` across surfaces. A Jaccard of 0.4 under memory's
expansion map ≠ 0.4 under code's. "Expand the mathematical possibilities so it works rick :) i know it is possible."

**It was possible. It's done (v2).** Confirmed on real artifacts, all builds tested, precision-gate wired.

## Root cause (architect-verified, not guessed)
Two independent failures stacked:
1. **Symmetric Jaccard punishes size mismatch.** `|q∩d|/|q∪d|` — a 4-feature cue inside a 120-feature doc has a
   *mathematical ceiling* of `|q|/|d| ≈ 0.033`. The prefix-filter's length band `|d| ∈ [⌈t·|q|⌉, ⌊|q|/t⌋]`
   then **excludes** the long doc outright. Short cue ↔ long target was structurally unreachable.
2. **Per-corpus feature space.** Each surface learned its own PPMI/IDF → raw scores aren't commensurable.

## The fix that shipped (v2 — no labels, deterministic, complete)
| Layer | Module | What it does | Tests |
|---|---|---|---|
| **B — the unblock** | `yuri-containment-match.mjs` | asymmetric `|q∩d|/|q|` — cue-anchored, size-immune; complete candidate filter via posting-count ≥ ⌈t·\|q\|⌉ (pigeonhole-proof, not the peer length band) | 15/15 |
| **C — ranking** | `yuri-match-fusion.mjs` | RRF (k=60) over per-surface **complete** sets — rank-based, distribution-free, no comparable-score assumption | 8/8 |
| **A — root** | `yuri-match-global-space.mjs` | one shared PPMI/IDF over the union (the comparability *root* fix) | 17/17 |
| precision | `yuri-containment-match.mjs` gate | IDF-weighted containment (= BM25 b=0) + length-gate (|q|<4 → `sharp:false`) + `sharp`/`precisionGated` flags — never drops a complete result | folded into 15/15 |

**Confirm-or-kill (`xs-confirm-containment.mjs`, real energy-L∞ triangle):** a code-flavored cue surfaced the
right CODE (`yuri-energy`) + MEMORY (`energy-L∞-doubly-inert`, `delta-gate`) + DOC (GVF §pairing-law) at
containment **0.88–1.0**, both decoys cleanly below (0.018–0.18). Jaccard pinned every target at its ceiling
(0.02–0.09 → excluded at any usable threshold). **CONFIRMED.**

## The frontier verdict — UNANIMOUS across DS1/DS2/DS3 + CX4/CX5 + the mainspring architects
1. **Ship RRF over complete per-surface sets as v2.** Deterministic, completeness-preserving (sentinel rank =
   below-threshold), distribution-free, zero calibration dependency. Score-fusion is *blocked* until the C-layer.
   (DS1, CX5)
2. **Containment is the short↔long unblock — but precision-gate it.** Raw containment floods on generic cues.
   IDF-weighting is the natural bridge to BM25; gate `|q|<4`; flag `sharp:false` rather than silently drop
   (preserves the no-silent-miss completeness law). (DS3 — now BUILT into the module.)
3. **Global feature space = partial win, NOT replacement, NOT v1.** It fixes the per-corpus comparability *root*
   and gives cross-surface completeness for the first time — but it does **not** solve the length band (a 4-word
   cue vs a 2000-word doc stays low-Jaccard under *any* PPMI) and forces one global precision setting. Gain over
   calibrated RRF is real but marginal → **v2 upgrade path, not the first brick.** (DS2, CX2-residual, mainspring)
4. **Calibration C-layer = the keystone (v3), and it needs labels.** Conformal over Platt-calibrated scores makes
   "0.4 in code" and "0.4 in memory" both mean `P(relevant)≈0.4`; then CombMNZ score-fusion carries `P(overclaim)≤α`.
   Blocker: memory surface has ~11 items — too few. Minimal build = shadow calibration ledger
   `(surface, queryId, itemId, rawScore, rank, complete, label, split)` + deterministic label generators
   (self-recall + held-out title/path cues) + per-surface Platt + Mondrian conformal thresholds. (DS1, CX4)
5. **THE ONE THAT UNBLOCKS THE MOST: id-bridge structural graph + `yuri-navigate.mjs`.** It *bypasses* the
   similarity-comparability problem entirely — typed structural edges (a symbol's `files[]`, a node's deps) are
   deterministic cross-surface edges that need **no shared feature space at all**. Similarity (RRF/containment)
   enriches retrieval *around* the structure; calibration makes the scores honest *later*. Structure is the
   sound mainspring, buildable today. (CX5 `XS_INTEGRATION_DECISION_X_PASS`, biksdzrhl, mainspring N1)

## What this means for the build order (locked)
- **v2 — DONE:** containment + RRF + precision-gate → `recallAll` ranks cross-surface, complete + deterministic.
- **NEXT (highest leverage):** id-bridge table + `yuri-navigate.mjs` — structural edges first; the similarity
  layer already exists to ride on top.
- **THEN (keystone):** calibration C-layer (shadow ledger + label harvest from day one) → comparable SCORES,
  unblocks GPD's full ΔU loop + auto-calibration.
- **DEFERRED:** global feature space (v2-of-similarity) only if the C-layer proves insufficient.

## Honest residual (carried forward, not hidden)
- RRF fusion is **rank-complete per surface** but **cannot prove fused completeness** (rank-based, no global
  threshold). Stated plainly; the C-layer + global-space is the path to fused completeness if ever needed.
- Containment precision rests on IDF + the `|q|<4` gate; on a generic 4–5 feature cue it can still over-recall →
  that's exactly why hits carry `sharp`/`idfScore` for the consumer/fusion layer to down-weight, and why BM25
  cross-check is the v3 sharpener.
- `yuri-match` recall still uses unweighted set-Jaccard for its completeness proof; the IDF weighting lives in
  the scoring/containment layer (global-space residual, by design).

## Lane provenance
9-agent wave (1 native Claude + 5 Codex gpt-5.5 xhigh + 3 DeepSeek, separate quota). Builds:
CX1 fusion `XS_FUSION_P_PASS` · CX2 global-space `XS_GLOBAL_SPACE_P_PASS` · CX3 length-fix `XS_LENGTH_FIX_X_PASS`
· CX4 calibration `XS_CALIBRATION_FUSION_P_PASS` · CX5 integration `XS_INTEGRATION_DECISION_X_PASS`. Frontiers:
DS1 IR-fusion · DS2 shared-latent · DS3 asymmetric-similarity. Native: confirm-or-kill + precision-gate close +
this synthesis. All lane output verified vs live tests before fold (advisory until local evidence).

**RESULT_LABEL:** `XS_CROSS_SURFACE_COMPARABILITY_CRACKED_X_PASS_COMMITTED`

## See
North-star [[yuri-clockwork-northstar-2026-06-06]] · Mainspring [[yuri-mainspring-synthesis-2026-06-07]] ·
Governance [[yuri-governance-architecture-GVF-2026-06-06]] · Breakthrough [[yuri-breakthrough-GPD-2026-06-06]] ·
Tracker [[YURI-NEXUS-ROADMAP]] · Confirm report `xs-confirm-containment-report.json`.
