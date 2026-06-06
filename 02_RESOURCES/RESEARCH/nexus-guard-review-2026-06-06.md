---
name: nexus-guard-review-2026-06-06
description: OWNER REVIEW PACKET — Regenerative Nexus Guard Phase 1 (read-only detector) build + first run over the math/self-improvement core. 61 findings, 9 safe-auto-wire command-shim proposals (owner-gated phase 2), real math/hook/graph debt for review. Includes the build + 7-lane red-team record. Detector is READ-ONLY; nothing canonical was mutated.
metadata: { node_type: review, date: 2026-06-06, status: phase1-complete-awaiting-owner-gate, blast_radius: read-only }
tags: nexus_guard, owner_review, unwired, conformance, phase1
---

# Regenerative Nexus Guard — Phase 1 Owner Review

Status: **Phase 1 (read-only detector) BUILT, red-teamed, verified.** No canonical surface mutated.
Phase 2 (safe command-shim scaffolding) is the next step and is **owner-gated** — it does not run until you approve.

## What shipped
| Artifact | Role |
|---|---|
| `_SYSTEM/Scripts/regenerative-nexus-guard.mjs` | the detector (7 classes A–G + exemption hygiene H) |
| `_SYSTEM/Scripts/nexus-guard-contracts.json` | declarative wiring contracts + exemptions (edit THIS, not the detector, to suppress) |
| `_SYSTEM/Scripts/regenerative-nexus-guard.test.mjs` | 57-assert unit suite (pure primitives, no disk) |
| `02_RESOURCES/RESEARCH/nexus-guard-report.json` | machine-readable full report |
| `circuitry-auto-register.mjs` | MODIFIED — `resolveTestsCover` now treats an explicit import as authoritative (Codex C1 fix) |

Run it: `node _SYSTEM/Scripts/regenerative-nexus-guard.mjs --json 02_RESOURCES/RESEARCH/nexus-guard-report.json`
(`--full` widens scope to all of `_SYSTEM/Scripts`; default is the math + self-improvement core where "wired" is well-defined.)

## First run — 61 findings (core scope)
`36 HIGH-confidence · 25 LOW-confidence · tension T=16.968 · L∞ floor hi=6 med=16 lo=39`

### A. SAFE AUTO-WIRE — 9 missing command shims (owner-gated phase 2; deterministic, low-risk)
Each is a skill `/alias` trigger with no `.claude/commands/<alias>.md`. Phase 2 would scaffold these shims (and ONLY these):
```
/yuri-bankai (bankai-manifest)   /offload /deepseek /nvidia /nvidia-deepseek (deepseek-offload)
/yuri-geass (geass-lock)         /yuri-haki (haki-intent)
/yuri-izanagi (izanagi-simulator)  /yuri-nen (nen-phase-detector)
```
(14 raw E-findings → 9 unique shim targets; the `.agents` + `.claude` skill mirrors share aliases.)

### B. OWNER-GATED — behavior surfaces (never auto-wired)
- **F · 2 hooks present but not in settings.json:** `pulse-bus.js`, `scout-runner.js` → classify: unwired-new vs retired vs library-helper. Registering a hook mutates behavior → owner only.
- **D · 5 math modules absent from MATH-SCIENCE-MANUAL.md AND the circuitry graph** (Codex C1 verified all 5 REAL, not noise):
  `math-adapters.mjs` · `math-health.mjs` · `mechanism-pattern-registry.mjs` · `yuri-energy-trace-outcomes.mjs` (all HIGH — tests exist, so promoted-but-undocumented) · `math-operational-simulation.mjs` (MED). → register in the manual + graph, or exempt with reason.
- **G · 15 core modules absent from `yuri-circuitry-graph.json`** → owner-gated add-only graph regen (the auto-regen build, queued C6+C9). Manual mention ≠ graph membership (intentional — graph is the structural wiring).

### C. LOW-CONFIDENCE (advisory, never deletion-authoritative)
- **A · 25 orphan exports** — textual zero-reference scan. LOW by design; GitNexus in-degree is the phase-2 structural upgrade. Some are explicitly "exported for independent audit" (Codex C2 flagged `transfer-distance-cores.mjs`). Do not delete on this signal.

### D. FALSE POSITIVES — caught + handled this round (precision earned)
- **Class C (test-no-cover) went 8 → 0.** Root cause was a `resolveTestsCover` bug (matcher fingerprint overrode explicit imports). Fixed in the substrate → import is now authoritative; multi-import integration tests are covered. Verified vs the live consumer (`cross-reference.test: ok`).
- `extract-logbook-truth.mjs` (scratch proof-data helper) + `yuri-energy-trace-test-worker.mjs` (forked test worker) → exempted with reason/owner/reviewBy.
- `math-research-archive.test.mjs` (covers a markdown corpus) → exempted.

## Red-team record (the method: build → 7 lanes → fix → re-test → fold)
- **2 DeepSeek lanes** (advisory research): the log-compressed tension scalar + L∞ floor (DS2), reflexion-model precision tactics + exemption hygiene (DS1) → folded. Captured: [[nexus-guard-precision-tension-2026-06-06]].
- **5 Codex gpt-5.5 lanes** (DRAFT read-only, refute-by-default) — all verified against live code, all wrote nothing (read-only held):
  - C1 precision: 11 false positives found + 34 true debts confirmed → folded.
  - C2 graph: missed import-edge kinds (side-effect / `export…from`) + shebang entrypoints + orphan-export logic → folded.
  - C3 security: **2 real fail-OPEN bugs** — protected-path bypass via `./`-prefix (now normalized, fail-closed) + silent registry corruption (now a loud finding). Refuted 4 (resolveImport traversal, regex ReDoS, proto-pollution, NaN leak all came back SOUND).
  - C4 tension: my doc OVERCLAIMED the L∞ floor (intra-tier identity swap is a real residual — corrected); fail-open on unknown severity (now fail-closed to worst-case); non-total sort comparator (now total) → folded.
  - C5 contract: `isExempt` regex now fail-closed; exemption hygiene completeness (invalid-regex / no-owner / no-reviewBy / expired) → folded.

## Verification
- `regenerative-nexus-guard.test.mjs` — **57/57** (set-diffs, reachability, tension swap-proof, fail-closed, security path-normalize, exemption hygiene, report determinism).
- Substrate regression: `cross-reference.test: ok` (the `resolveTestsCover` change did not break the live consumer).
- Detector is deterministic (no clock in core; CLI stamps `generatedAt`) and read-only.

## Residual risk / honest limits
- Class A/B are import-graph + textual (LOW/MED) — GitNexus structural reachability (DSM) is the phase-2 confidence upgrade.
- The L∞ count floor is a DISTRIBUTION invariant, not an identity invariant — an intra-tier identity swap is covered by the per-artifact finding set, not the scalar.
- Root-cause batching + age/centrality/churn weighting (DS1) are specified but PARKED (phase 2) — at 61 findings the report is reviewable; at `--full` scope it needs batching first.
- ReDoS on exemption patterns is bounded by owner-authored (trusted) contracts; `safeTest` guards the crash, not catastrophic backtracking of a hostile pattern.

## Decision for the owner
1. Approve Phase 2 **safe command-shim scaffolding** (the 9 shims above) — deterministic, reversible, the one safe write the design permits?
2. Triage the D/F findings (register / exempt / retire)?
3. The G/graph-regen work folds into the queued circuitry auto-regen build (C6+C9).
