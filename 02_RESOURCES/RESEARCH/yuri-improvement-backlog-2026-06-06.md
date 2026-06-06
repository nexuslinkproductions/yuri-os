---
name: yuri-improvement-backlog-2026-06-06
description: Discovery-wave output (2026-06-06) — the prioritized math/science improvement lineup (DeepSeek Wave D) + the merge-candidate consolidation targets (Codex Wave C, our own similarity matcher with boilerplate filtered). The "translate everything into equations" backlog + the "what can be merged into one governed component" backlog. Each item is leverage-ranked + blast-bounded.
metadata: { node_type: backlog, date: 2026-06-06, status: queued, source: wave-C-merge + wave-D-math }
tags: improvement_backlog, math_improvement, merge_candidates, equations, governed_consolidation
---

# YURI Improvement Backlog (discovery wave 2026-06-06)

The north star: translate hand-picked heuristics → governed equations; collapse scatter → governed components. Each item is verified-feasible (the methods already exist in the kernel) + leverage-ranked.

## A. MATH/SCIENCE improvements (Wave D — DeepSeek) — ranked by leverage × (1/blast)
| # | Surface | Current heuristic | The math | Conf | Win |
|---|---|---|---|---|---|
| **1** | Recall ranking weights | ad-hoc blend | **logistic calibration** (learned simple weights, or via the energy gate) | — | calibrated retrieval end-to-end |
| **5** | Recall ranking scores | ordinal sort, top-K | **softmax** (already in math-kernel) → probability simplex; `relevanceFloor` becomes a real cutoff; conscious-cap (12) → entropy-adaptive | HIGH | zero-cost, backward-compat, makes scores interpretable |
| **3** | Memory salience / eviction | hand thresholds | **Bayesian surprise / information-gain** retention score (+ FSRS half-life already in kernel) | — | memory-value loop closed |
| **4** | Cross-ref thresholds `0.30/0.85` | hand-picked | **Youden's J / ROC** over the corpus Jaccard distribution (prefix-filter returns the complete set for free → one scan) | MED | empirically-justified numbers + provenance artifact |
| **2** | Confidence / promotion gates | binary | **Platt calibration** (Brier/log-loss already in kernel) wired into live decisions | — | gate-quality loop closed |
| **7** | Slow degradation detection | none (MAD misses it) | **one-sided CUSUM** on signed ΔU — additive alarm beside isSurprise | low blast | catches the slow-rot failure mode the gate is blind to |
| **6** | Surprise detection | static median+K·MAD in energy-tick-core | **scalar Kalman / NIS** on log\|ΔU\| — re-sensitizes ~2 ticks vs MAD's ~10 | med blast | adaptive surprise; retires the CRITICAL-exclusion hand-patch |

#1 + #5 close the recall loop; #3 closes the memory-value loop; #2/#6/#7 close the gate-quality loop. #6/#7 already designed in `logbook-truth.json` (ready to build). START: #5 (softmax, zero-cost) → #1 → #3.

## B. MERGE candidates (Wave C — Codex, our similarity matcher, boilerplate filtered)
Boilerplate (`REPO_ROOT`/`__dirname`) filtered out; module-level mechanism-family clusters ranked by ROI (burden reduced vs merge risk). The 104-node raw glob was REJECTED (too glued by shared CLI scaffolding — not a real merge).
1. **TOP — `cyber-*` proof/report kernel:** many cyber-* scripts share a build→write→validate→render lifecycle → one `cyber-proof-kernel.mjs` core + thin domain wrappers (strongest evidence, clear governance win, doesn't erase domain logic).
2. `worker-capture-once.mjs` + `yuri-workcell-capture.mjs` → `worker-capture-kernel.mjs` (shared capture→sanitize→hash→write→event; keep distinct output schemas).
3. `yuri-chat-tui.mjs` + `yuri-tui.mjs` → `tui/yuri-tui-core.mjs` (shared render/input loop; skins/pulse as adapters; keep aliases until usage known).
…+5 more lower-ROI candidates in the lane report. Each merge is owner-gated (consolidating live code).

## C. Hardening (from the moat audit) — see [[oss-release-moat-audit-2026-06-06]]
Protected-path consolidation (DONE: `yuri-protected-paths.mjs` + the bash-gate `./`-bypass CLOSED), git-history secret scan, LICENSE/README/SECURITY, dependency/license audit.

## Build order recommendation
Hardening-first (mostly done) → #5 softmax recall (zero-cost, pairs with the new memory-match) → #1/#3 recall+salience calibration → Youden thresholds → the cyber-kernel merge. Each is a heuristic→equation step toward governed cognition.
SEE: [[nexus-guard-precision-tension-2026-06-06]], [[circuitry-autoregen-queue-2026-06-06]], [[lane-frontload-verified]].
