# 01 — PORT-SPECS (Phase-0 verified output)

> Produced by the Phase-0 scoping swarm (10 agents: spec→adversarial-audit per W1–W5, 900k tokens) and
> the toolchain reality check. Every verdict below is **audited against the live JS source** — claims are
> separated from evidence; the audits CORRECTED real spec errors (logged per kernel). Reads with the deck
> ([00-MASTER-BRIEF.md](00-MASTER-BRIEF.md)).

## TL;DR — the verified call

| W | Kernel | Verdict | Conf | Why |
|---|--------|---------|------|-----|
| **W2** | corpus_match `buildIndex`/`matchPrefixFilter` (ids-only) | **GO — Phase-1 first** | 0.88 | EXACT, **scores never cross FFI** (ids-only, conformance is order-insensitive setEq) → zero float-determinism surface; extends existing `corpus_match.rs`. Blocker: `featureFn` callback (resolve via serializable feature contract). |
| **W1** | math-kernel clean set: `rankWithTies`, `median`, `percentile`, `weightedVariance` | **GO — after `roundStable`** | 0.86 | EXACT / FLOAT_SAFE, NOT prover-coupled, NOT gate-coupled, BATCH_WIN. `rankWithTies` is cleanest (raw integer averages, no `roundStable`). `median`/`percentile` need the `roundStable` keystone first. |
| **KEYSTONE** | `roundStable` (V8 `toPrecision(15)→Number`) | **GO — build FIRST** | — | The universal dependency: nearly every float-returning kernel applies it. Must be bit-exact-replicated in Rust before any float-return port is trustworthy. |
| **W3** | quantum-hypothesis-tracker | **DEFER — re-spec** | 0.86 | Spec **unsound** (hallucinated line numbers; sqrt-only mislabeled TRANSCENDENTAL_HARD — sqrt is IEEE-deterministic). Real 0-ULP trap: **rank = float→int threshold at 1e-10**. Needs a corrected spec before code. |
| **W4** | yuri-match / token-expand (PPMI·IDF) | **DEFER — wave 2+** | 0.86 | Real but transcendental-heavy (`log2`), insertion-order tie-break in `buildExpansionMap` (no lexical tie-break), `ppmi` can return NaN (N=0). Hotness numbers unbacked. |
| **W5** | spreading-activation (PageRank) | **DROP** | 0.82 | Importer count was wrong — **1 benchmark caller, not a hot/live path**. LOW ROI. Not a consolidation target. |

## Two UNIVERSAL blockers the audits surfaced (apply to all float ports)

1. **`roundStable` = V8 `toPrecision(15) → Number()` decimal round-trip.** This is V8's Grisu/Ryu-class
   shortest-round-trip + fixed-precision rounding. The naive Rust `format!("{:.14e}")` is **NOT guaranteed
   equivalent**. → Build `roundStable` as a dedicated, vector-pinned Rust primitive FIRST; it is the common
   dependency of `median`/`percentile`/`pearson`/`entropy`/… Everything float-returning waits on it.
2. **The prover threshold is 1e-12, not 1e-9.** `math-proof-gate.mjs deepAlmostEqual EPSILON = 1e-12`. Any
   **prover-coupled** function (kl/crossEntropy/pNorm/cosineSimilarity/dijkstra/astar/topologicalSort/
   weightedVariance/weightedStdDev/dotProduct/entropy/informationGain) ported must clear **1e-12** against
   the JS reference, not the deck's general 1e-9. **`dotProduct`** also has an FMA site (`total + value*right[i]`)
   the W1 spec missed — and it is prover-coupled AND inside `cosineSimilarity`.

## Per-kernel verified detail

### W1 · math-kernel (PARTIAL, sound, 0.86)
- **PORT_NOW (clean, verified non-coupled):** `rankWithTies` [EXACT], `median` [FLOAT_SAFE], `percentile`
  [FLOAT_SAFE], `weightedVariance` [FLOAT_SAFE]. `topologicalSort` [EXACT, PORT_NOW but NEUTRAL ROI; needs
  IndexMap/BTreeMap for Kahn-queue order].
- **DEFER (transcendental + often coupled):** `entropy`(GATE), `klDivergence`, `crossEntropy`,
  `weightedStdDev`, `pNorm`, `cosineSimilarity`, `pearson`, `spearman`, `normalizeDistribution`(GATE,
  auto-vectorized-sum reordering risk — force scalar sum), `dijkstra`/`astar` (NEUTRAL ROI: graph
  serialization across FFI > compute for small N; heap tie-ordering ≠ V8).
- **Audit corrections (spec errors fixed):** "Math.log(Math.E)≠1.0" is FALSE (it IS 1.0); "pearson is
  prover-coupled" is FALSE (not in math-proof-gate); "roundStable on EVERY return" overstated (rankWithTies
  + topologicalSort don't apply it). FMA fires in more sites than flagged (dotProduct).

### W2 · corpus_match (PARTIAL, sound, 0.88)
- **PORT_NOW:** `buildIndex` [EXACT], `matchExact`/`matchPrefixFilter` [ids-only EXACT]. `matchLSH` DEFER,
  `loadFtsCorpus`/`ftsQuery` STAY_JS (IO).
- **The load-bearing insight:** binding.rs `MatchResult` is `{ ids: Vec<String> }` — **scores never cross
  the FFI boundary**; `conformance.test.mjs` compares ids via **order-insensitive `setEq`**. So the spec's
  round4 / total_cmp / -0 score anxieties are MOOT at the conformance boundary → this is the **lowest
  float-risk port in the whole list.**
- **Real blocker (the PARTIAL):** `featureFn` is a JS callback passed by all 4 hot callers
  (circuitry-auto-register, cross-reference, memory-match, yuri-match). Resolve by porting the no-featureFn
  path first and/or defining a serializable feature contract for the callback.
- **Latent (flag in fixtures):** downstream score classification flip (`mh.score >= nearDup`) lives JS-side
  (score isn't ported, so safe); Unicode case-folding divergence (JS `toLowerCase` vs Rust ascii-filter).

### W3 · quantum-hypothesis-tracker (PARTIAL, **sound=FALSE**, 0.86)
- **Why DEFER:** spec hallucinated call sites (cited lines 568/338/169 in a 313-line file); mislabeled
  `jacobiSVD`/`schmidtDecomposition` as TRANSCENDENTAL_HARD — the file has **zero** log/exp/pow/sin; only
  `sqrt`, which IEEE-754 mandates correctly-rounded → **FLOAT_SAFE & deterministic**.
- **Real 0-ULP trap:** `rank = singularValues.filter(s => s > tol).length` at `tol=1e-10` → a 1e-9 SV drift
  is 10× looser than the rank cutoff → **integer rank flip** (float→int threshold). qq≈0 test asserts 1e-12
  (catastrophic cancellation `sAB−sBA`). Gate-coupling exists via `recordCircuitEnergy→tickAndTrace` but is
  a non-enforcing RECORDING (inert). → re-spec with real evidence, then port as a later wave.

### W4 · yuri-match / token-expand (PARTIAL, sound, 0.86)
- `buildCooccurrence` [EXACT, PORT_NOW]; `ppmi`/`buildIdf`/`buildExpansionMap`/`buildSecondOrderMap`
  [TRANSCENDENTAL log2]. Gate-reach verified (xref/circuitry/memory-match/corpus-match — advisory paths).
- **Audit misses to honor:** `buildExpansionMap` sort has **no lexical tie-break** (nondeterministic order
  under HashMap); `ppmi` **can return NaN** (N=0); float-summation order load-bearing; `tokenize` applies
  stop-words + min-length-3 + char-cap (not just lowercase). Hotness (73s/110ms) **unbacked** → measure first.

### W5 · spreading-activation (PARTIAL, sound, 0.82) → **DROP**
- Importer count was wrong: **1 genuine importer = a recall@5 benchmark, not a hot/live path.** Power
  iteration is a theoretical BATCH_WIN but not at real load (N≈251, one caller). LOW ROI → out of scope.

## Toolchain reality (local evidence 2026-06-14, darwin-arm64)
- `rustc`/`cargo` **1.95.0 ✅**; `wasm-pack` **0.15.0 ✅**; targets **aarch64-apple-darwin + wasm32-unknown-unknown ✅**.
- `cargo test --manifest-path _SYSTEM/nexus-rs/Cargo.toml --lib` → **23/23 green** — bit-exactness is
  **provable NOW at the cargo-test level** against JS-pinned vectors (the nexus-rs discipline).
- **napi CLI ABSENT** (`npx napi` → ENOVERSIONS). The live `.node` FFI rebuild needs an owner-approved
  install (`@napi-rs/cli`); the committed `.node` proves it was built before. **Until then:** Phase-1 ships
  Rust modules + cargo-test-green (verified) + wasm binding; the `.node` rebuild + live DI swap is the
  owner-gated arming step. JS stays source-of-truth; nothing swapped live.

## Phase-1 plan (the implementation swarm)
1. **Keystone:** `roundStable` Rust primitive, vector-pinned cargo test vs V8 `toPrecision(15)→Number`.
2. **Lane A (after keystone):** W1 clean set (`rankWithTies` first — no roundStable; then `median`/
   `percentile`/`weightedVariance`) as a new pure Rust module + cargo tests vs JS-pinned vectors.
3. **Lane B (parallel):** W2 `buildIndex`/`matchPrefixFilter` ids-only into `corpus_match.rs` + cargo tests;
   resolve `featureFn` via serializable feature contract.
4. **Lane C (parallel, spec-only):** W3 corrected PORT-SPEC (real evidence, FLOAT_SAFE, rank 0-ULP).
5. Each lane: cargo-test-green = local truth; wasm conformance; DI flag default-JS; napi `.node` rebuild
   flagged for owner. Register every new module in MATH-SCIENCE-MANUAL + `@capability` before done.
