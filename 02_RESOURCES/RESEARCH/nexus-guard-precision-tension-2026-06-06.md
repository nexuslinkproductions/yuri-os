---
name: nexus-guard-precision-tension-2026-06-06
description: Synthesized design findings (DeepSeek lanes DS1+DS2, 2026-06-06) folded into the Regenerative Nexus Guard — the log-compressed wiring-tension scalar T (severity dominates count) + non-offsettable L∞ floor, reflexion-model conformance grounding, deterministic age/centrality/churn weighting, exemption hygiene, and the class A/B over-fire gate table. Captured for the compounding corpus.
metadata: { node_type: research, date: 2026-06-06, status: folded-phase1-partial, source: deepseek-lanes-ds1-ds2 }
tags: nexus_guard, wiring_tension, conformance, reflexion_model, precision, exemption_hygiene, severity_laundering
---

# Nexus Guard — Precision & Tension design (DeepSeek DS1+DS2 synthesis, folded)

Captured from two DeepSeek research lanes fired during the Phase-1 build of `regenerative-nexus-guard.mjs`.
Status: the tension scalar + exemption hygiene are FOLDED into the detector now; age/centrality/churn +
batching + DSM are the documented phase-2 fold. Cross-ref: [[regenerative-nexus-guard-2026-06-06]] (NG1 design),
[[delta-gate-severity-laundering]] (the L∞ finding this reuses), [[circuitry-auto-registration-regen-vision]].

## 1. Conformance grounding (DS1)
The guard IS a **reflexion model** (Murphy, Notkin, Sullivan 1995 — "Software Reflexion Models"): contracts =
*expected* architecture, disk scan = *recovered* architecture, and the work is **convergence** — refining the
mapping until expected and recovered agree. Implication: every false-positive gate is one mapping rule; every
stale exemption is a rule that never converged. The exemption list IS the mapping — if it grows monotonically
without converging, the model is wrong (→ the saturation alarm below). YURI already owns the composable
primitives: `arch-graph-engine.mjs` (Tarjan articulation points + Forman-Ricci curvature + spectral Laplacian
over the 87-node/157-edge graph) and `circuitry-auto-register.mjs` (import edges + complete prefix-filter).

## 2. Wiring tension scalar T (DS2) — FOLDED
```
severity(tier)   = { low:1, medium:5, high:10 }     # contract-anchored, not a free parameter
confidence(f)    ∈ [0,1]                              # class-A textual ≤0.2; class-F hook-diff ≥0.95
S_tier           = Σ_{f∈tier}  confidence(f) · riskMultiplier(f)   # risk=2.0 on mutation surfaces (hooks/settings)
T                = Σ_tier  severity(tier) · log10(1 + S_tier)
```
**Why log10(1+S):** sublinear in count — 1 finding→~0.3, 10→~1.04, 100→~2.0. 500 class-A noise findings
contribute at most `1·log10(501)≈2.7`; ONE class-F finding contributes `10·log10(2)≈3.0`. **Severity dominates
count** — no pile of low-confidence noise can drown a high-severity signal. T is NOT divided by repo size (that
would reward diluting the ratio by adding wired files). Healthy mid-size YURI baseline: T<5 clean · 5–15
accumulating · >15 significant.

**L∞ floor (the swap-proof term):** the SUM is partition-fungible — fixing one high finding while adding another
of equal weight leaves ΔT≈0 (the delta gate is blind). So emit the raw per-tier COUNTS `{hi, med, lo}` alongside
T. A cross-tier swap changes a count (caught); the **residual** is an *intra-tier identity swap* (remove one
high, add a different high → hi unchanged) — covered at the report level by per-artifact set-diff, not by the
scalar. Same architecture as the energy gate's `maxSeverityVeto` ([[delta-gate-severity-laundering]]). Telemetry
tuple: `{ T, hi, med, lo, delta:{...} }` where ΔT per commit is the actionable signal.

## 3. Deterministic weighting (DS1) — PHASE 2
- **Age:** `git log --diff-filter=A --format=%aI -- <file> | tail -1` → createdAt; `ageWeight=clamp((now-createdAt)/30d,0,1)`. A file added 20min ago is in-progress, not unwired (grace period → weight 0 under ~30d).
- **Centrality:** betweenness on the import graph (reuse the Tarjan SCC DFS in arch-graph-engine). Unreachable leaf → 0 (low priority); high-betweenness bridge that is unregistered → 1 (the *dangerous* orphan).
- **Churn:** `git log --format=%aI -- <file> | wc -l` → commitCount; `churnWeight=clamp(commitCount/10,0,1)`.
- Combined priority: `severity · (0.4·age + 0.3·centrality + 0.3·churn)`.

## 4. Exemption hygiene (DS1) — FOLDED (validateExemptions)
- Every exemption carries `{reason, owner, reviewBy:ISO}`. **Missing reason → itself a finding** (folded).
- **Sunset:** `now > reviewBy` → exemption suspended, artifact re-enters with severity +1 tier (folded: expiry check).
- **Hard expiry 180d:** an exemption older than 6 months is normalized debt, not a false positive (phase 2).
- **Saturation alarm:** >20% of a class exempted → structural warning ("contract too aggressive / hiding debt") (phase 2).

## 5. Class A/B over-fire gate table (DS1) — phase 2 (one partial fold: package.json-scripts seed)
| Class | Generator | Gate |
|---|---|---|
| A | re-export / barrel | track transitive chain; suppress if origin in-degree>0 |
| A | public library API (index.mjs) | path-exemption `publicApi:true` |
| A | dynamic / test-only consumer | flag LOW, note; never delete |
| B | package.json `scripts` entry | scan script values for the module path → seed **(FOLDED)** |
| B | child_process fork/spawn/exec | grep string-literal module refs → suppress LOW |
| B | string-ref in JSON/YAML/plist config | check graph files[]/settings/launchd → suppress |
| B | directory-scan loader (readdirSync+dynamic import) | mark siblings reachable through loader; loader is the wiring point |

**DSM phase 2:** GitNexus structural edges (imports+calls+reads+writes) → a true Dependency Structure Matrix;
transitive closure from the entrypoint seed set promotes classes A/B from LOW-confidence textual to HIGH-confidence
structural — run only on the top-N batches (the textual pass is the fast pre-filter, the DSM is the authoritative verifier).

## 6. The noise objection, answered
The strongest objection ("reports debt faster than it can be resolved; noisy → worsens the tension it measures")
is defeated by: (1) root-cause **batching** collapses 100 findings into ~3 causes — `batchPriority = Σ(severity·centrality·age)/batchSize` so 50 alias-shims can't outrank one critical orphan; (2) age grace period; (3) exemption self-destruct at 180d; (4) class A/B gates as a *converging* mapping, not a growing whitelist. The guard yells only about the top-3 batches that survived 30 days and carry structural evidence.

## Sources
DeepSeek lanes DS1 (precision/noise) + DS2 (tension scalar), 2026-06-06. Literature anchor: Murphy/Notkin/Sullivan,
"Software Reflexion Models: Bridging the Gap Between Source and High-Level Models" (1995). Reuses YURI finding
[[delta-gate-severity-laundering]]. Verified-vs-live: the tension scalar + exemption hygiene are folded + unit-tested
(`regenerative-nexus-guard.test.mjs`, 44/44); the rest is parked phase-2 with the gates specified.
