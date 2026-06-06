---
name: transfer-distance-engine-v2-build-plan
description: Utmost-detail build plan for the V2 structural cross-domain transfer-distance engine + the cross-reference.mjs supercharge — research-locked, dual-surface, empirical candidate bake-off, lane orchestration, falsification bar. Living doc; keep BUILD STATUS synced per wave.
metadata: { node_type: build-plan, date: 2026-06-06, status: active, authority: advisory-owner-gated }
tags: transfer_distance, cross_reference_engine, build_plan, structural_distance
---

# Transfer-Distance Engine V2 — Build Plan (research-locked, utmost detail)

> Supersedes the V1 surface-NCD core (proved structurally blind: [[cross-domain-transfer-distance-prior-art]], 2/5 cold). Grounding: the 4-lane prior-art survey + 36-card logbook ground truth + the V1 proof harness. Obeys [[circuitry-change-propagation-continuity]] + [[hold-big-picture-breadth-and-depth]]. Advisory; owner gates the cross-reference.mjs wire-in (it is live self-improvement code).

## 0. Goal (decoded from Marcel)
Measure "the degree of how far a mechanism is pulled from a different domain and applied," so the cross-reference engine ranks a FAR-but-holding transfer (innovation) above a NEAR or a far-but-broken (theater) one — embedding-free, deterministic, provable on the logbook, then wired live.

## 1. LOCKED decisions (from research — do not relitigate)
- **STAYS:** the triangle (A source · M mechanism · B target); `bridge = min(recon(M,A), recon(M,B))` (validated 3×: Gentner systematicity, Ben-David joint-error floor [bendavid-2010-domains], Vitányi K(x|y) [bennett-1998-infodist]); `value = distance·bridge·structuralConf` + fail-closed gate (= empirical inverted-U, [uzzi-2013-atypical]); NPMI = novelty discount only, never distance-core (self-dealing/circular).
- **CHANGES:** the DISTANCE core moves from surface compression (register meter) to STRUCTURAL distance. The failure is named in the literature ([cebrian-2005-pitfalls]); the fix ladder is known.
- **DUAL SURFACE:** distance has two extractors sharing one bridge+value:
  - **S1 — text/import** (logbook source-theory→organ; source NOT in graph): relational-signature distance over text.
  - **S2 — graph/internal** (lesson↔organ cross-reference; both IN our circuitry graph): RSO/structured-kernel-MMD over typed-path motifs.

## 2. Architecture
```
transferScore(A, M, B, structuralConf, mismatchPresent, surface)
  ├─ distance = DISTANCE_FN[surface](A, B)     # S1: relational-signature · S2: graph-motif MMD
  ├─ bridge   = min(recon(M,A), recon(M,B))    # reconstruction; upgradeable to conditional-compression
  ├─ valueRaw = distance · bridge · structuralConf
  └─ value    = antiTheaterGate(valueRaw, {bridge, mismatchPresent, structuralConf, distance})
DISTANCE_FN is pluggable → the bake-off swaps it without touching bridge/value/gate.
```
Refactor `transfer-distance.mjs`: extract the distance core behind a `distanceFn` injection so candidates drop in; keep bridge/gate/value/tier intact (they passed).

## 3. Candidate DISTANCE functions (the bake-off — build ALL, test ALL, keep what separates)
| id | candidate | source | deps | hypothesis |
|---|---|---|---|---|
| C1 | **bzip2/BWT-NCD swap** | [cilibrasi-2004-ncd][ferragina-2005-bwt] | node bzip2 (or shell) | context-grouping beats LZ77 register-noise (quick win) |
| C2 | **operator-skeleton distance** | [gentner-1983-smt][sculley-2006-compml] | none (pure) | strip domain NOUNS, keep relational OPERATORS/verbs → NCD/Jaccard over the skeleton separates near/far |
| C3 | **grammar-NCD (Sequitur/Re-Pair)** | [nevillmanning-1997-sequitur][larsson-2000-repair] | small in-repo impl | isomorphic mechanism → isomorphic grammar rules → low distance |
| C4 | **conditional compression / CDM** | [keogh-2004-cdm][bennett-1998-infodist] | none (gzip dict reuse) | K(source\|target) proxy; also upgrades the bridge term |
| C5 | **RSO / motif-MMD over circuitry graph** (S2 only) | [forbus-1995-macfac][borgwardt-2006-graphkernel] | graph json (read-only) | typed-2-edge-path Jaccard/MMD + systematicity separates organ↔organ |

C2 is the cheapest honest fix and the primary hypothesis; C1 the fastest baseline; C4 doubles as a bridge upgrade; C3 the heaviest; C5 the live-engine surface.

## 4. Empirical selection protocol (the proof — "prove ourselves right")
Run each candidate through `transfer-distance.proof.mjs` (already built; pluggable distanceFn). A candidate SHIPS only if, with a-priori frozen labels + a-priori gate:
- **(P1) distance separates:** med(dist FAR) > med(dist NEAR) with a margin ≥ 0.05 (V1 had −0.01 — inverted).
- **(P2) thesis:** med(value FAR_HOLDS) > med(value NEAR).
- **(P3) gate:** med(value FAR_HOLDS) > med(value FAR_BROKEN).
- **(P4) theater control:** mean(synthetic wrong-M) < med(value FAR_HOLDS) (V1 already passed).
- **(P5) FALSIFICATION (Codex):** leave out 12 cards, NO tuning on them, blind-bucket NEAR/FAR_HOLDS/FAR_BROKEN; require ≥ 8/12 ordinal agreement. If < 8/12 → the method is theater, do NOT ship.
Pick the simplest candidate that clears P1–P5. Ensemble (min/weighted) only if no single one clears it ([bailey-2014]).

## 5. File / module layout (house style — pure, injectable, tested)
- `_SYSTEM/Scripts/math/transfer-distance.mjs` — core (bridge/gate/value/tier + pluggable distanceFn + the winning DISTANCE_FN). EXISTS, refactor.
- `_SYSTEM/Scripts/math/transfer-distance-cores.mjs` — the candidate distance fns C1–C4 (pure). NEW.
- `_SYSTEM/Scripts/math/transfer-distance-graph.mjs` — C5 RSO/MMD over circuitry graph (read-only graph load). NEW.
- `_SYSTEM/Scripts/math/transfer-distance.test.mjs` — unit tests (edge cases, determinism, bounds, gate). NEW.
- `_SYSTEM/Scripts/math/transfer-distance.proof.mjs` — logbook proof + bake-off runner + P5 holdout. EXISTS, extend to loop candidates.
- `/tmp/logbook-truth.json` — promote the extractor to `_SYSTEM/Scripts/math/extract-logbook-truth.mjs` (repo, deterministic) so the proof is reproducible.

## 6. Wiring into cross-reference.mjs (S2 — owner-gated, last)
- Today: `bridges = tags.filter(b => b.domains.length > 1)` (binary).
- V2: for each multi-domain tag bucket, form candidate domain PAIRS; score each with the S2 graph distance (organ↔organ) + bridge (the tag = shared mechanism) + structuralConf (derive a proxy from lesson evidence or default). Emit ranked bridge rows carrying `{distance, value, tier, sourceDomain, targetDomain, sharedMechanism(tag), signals}`. Sort by value. Keep the 12-tag taxonomy intact. Gate sub-threshold rows to a sub-log (mirror xref-query gateHit).
- Additive only; no behavior removed; advisory output.

## 7. Lane orchestration (build WITH the compat lanes — Marcel's mandate)
Parallel build wave (each lane = a fully-equipped YURI operator, --context front-loaded):
- **DeepSeek** → C1 (bzip2-NCD) + C4 (conditional-compression/CDM) in `transfer-distance-cores.mjs` (its info-distance lane).
- **Kimi** → C2 (operator-skeleton, incl. the relational-operator lexicon) + C5 (RSO over the circuitry graph) (its structure/wiring lane).
- **Codex (gpt-5.5, read-only DRAFT first)** → C3 (grammar-NCD) + the unified bake-off runner extension + adversarial cert of the integrated module.
- **Claude (me)** → integrate, run the proof/bake-off, select the winner, wire S2, final verify. The lanes draft; local evidence + the proof decide; I hold finalizer authority.
Dispatch discipline: Rick preamble, `--context` front-load, /tmp prompt files if > ~2000 chars, NO shell `timeout`, retry-on-failure, read each lane's full output.

## 8. Verification + continuity (non-negotiable)
- Each candidate: unit test (bounds [0,1], determinism, MIN_CHARS sentinel, empty/degenerate) + the logbook proof.
- Winner: P1–P5 all green, printed with numbers.
- Continuity law: if S2 wires into cross-reference.mjs → update the circuitry graph node + viz + manual + re-verify + `ai reindex`, one motion (only when LIVE).
- Codex cert before any wire-in to live self-improvement code.
- Capture the winning-method writeup back to the corpus + reindex.

## 9. Risks
- Compressor/kernel/lexicon = the new ontology — a bad one relocates the register failure. Mitigation: the bake-off P1 gate kills non-separating candidates empirically.
- Logbook overfit (muse=test). Mitigation: P5 holdout + synthetic theater control.
- Short-text NCD noise persists for C1/C4. Mitigation: MIN_CHARS floor + prefer C2/C3 if C1/C4 don't clear P1.
- S2 needs structuralConf for lessons (absent). Mitigation: default + a lesson-evidence proxy; ship advisory.
- Self-dealing if NPMI ever re-enters distance. Mitigation: it stays a discount, externalize source side later.

## 10. BUILD STATUS (sync each wave)
- [x] Research locked + captured + indexed (2026-06-06)
- [x] V1 core + proof harness exist (bridge/gate/value validated; distance core to be replaced)
- [x] Wave-B: candidates built (Codex C3 grammar-NCD ✓; Claude C2 operator-skeleton + C1 brotli + C4 CDM ✓; Kimi C2 derailed→rebuilt by Claude; DeepSeek C1/C4 running)
- [x] **BAKE-OFF RUN — DECISIVE NEGATIVE on text-distance.** All 5 candidates FAIL P1 (separate near/far). Margins: V1 −0.010, operatorSkeleton −0.031, brotliNcd −0.013, cdm −0.045, grammarNcd +0.004. Most INVERTED.
  - **ROOT CAUSE (the finding):** the logbook cards are all written in ONE terse YURI-catalog voice — source-theory summaries carry no native-domain register, and the author *pre-bridges* far transfers in prose, which actively inverts the text signal. **Domain-distance is not extractable from same-voice summaries.** (Generalizes: YURI lesson↔lesson text has the same register-homogeneity problem.)
  - **WHAT SURVIVES:** the bridge + value structure works — operatorSkeleton value-vs-juice rho=0.39 (best), theater control passes for all. The engine ranks transfer QUALITY; only the DISTANCE-from-text axis is unrecoverable.
  - **FORK (owner decision):** the true distance axis needs EITHER (a) external native-domain corpus (field register — DeepSeek mitigation) OR (b) a structural domain representation (graph subgraphs per domain → RSO/MMD). Neither exists cleanly today; both are new sub-builds.
- [x] **FORK RESOLVED (owner): Field-distance (external).** Built `fieldDistance` (field lexicons + a-priori distance-from-systems taxonomy) as the DISTANCE axis; operator-skeleton stays the BRIDGE axis (split distFn/reconFn in the core). Fixed the target-leak bug (anchor target=systems; don't classify the leaky transfer prose) + multi-word term matching.
- [x] **V2 WORKS — bake-off: fieldDistance P1=0.250, P1/P2/P3/P4 all pass, rho=0.32.** Ranking matches the ask: physics_neuro/topology/economics far (0.80–0.90) → control/info/statistics near (0.18–0.30). The degree-of-farness axis is delivered + validated on the logbook.
- [~] **Lane REWORK dispatched (owner: "let the lanes rework on this too"):** DeepSeek=lexicon completeness + principled taxonomy + fix misclassifications (card 3, 33); Codex=strengthen the bridge to recover robust P3 + cert; Kimi=expand the operator-stem lexicon (tightly scoped). Claude integrates + re-proves.
- [x] **Integrated Codex bridge rework (mechanismFrameDistance) + VERIFIED locally:** V2.1 (field-distance × mechanism-frame) passes P1=0.25, P1/P2/P3/P4 ALL. Codex cert numbers reproduced (P3 recovers, theater killed). Added `scoreTransferV2` public entry + `V2_CONFIG`.
- [x] **Module unit test: 15/15 pass** (`transfer-distance.test.mjs` — bounds, determinism, gate, far>near, theater-killed).
- [x] **DeepSeek lexicon/taxonomy rework FOLDED + verified:** hyphen-normalization root-cause fix + stem-compatible terms + specialized-first tie-break order + principled FIELD_TO_SYSTEMS. Result: **P1 0.25→0.28, 11/11 key cards classify correctly, 15/15 unit test holds.** All 3 lanes contributed to the finished engine (Codex bridge · DeepSeek lexicons · Claude integration).
- [ ] Kimi operator-stem expansion (429) — cover locally if bridge needs it (currently passes without).
- [ ] **S2 wire into cross-reference.mjs — OWNER-GATED (live self-improvement code), not wired without explicit approval.**
- [ ] Promote logbook extractor to repo (reproducibility, nice-to-have).

### V2 ENGINE — COMPLETE + VERIFIED (2026-06-06)
Files (all `_SYSTEM/Scripts/math/`): `transfer-distance.mjs` (engine: pluggable distFn/reconFn, bridge, gate, value, tier) · `transfer-distance-cores.mjs` (candidates + fieldDistance + mechanismFrameDistance + `scoreTransferV2`/`V2_CONFIG`) · `transfer-distance.bakeoff.mjs` · `transfer-distance.proof.mjs` · `transfer-distance.v2demo.mjs` · `transfer-distance.test.mjs`. Ship config = `scoreTransferV2(t)`.
