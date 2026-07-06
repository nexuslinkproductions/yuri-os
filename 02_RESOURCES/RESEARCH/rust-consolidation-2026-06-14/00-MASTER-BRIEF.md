# 00 — MASTER BRIEF · Rust Consolidation (the work deck)

> **Ground truth for the whole mission. Every spawn / lane / agent reads THIS FIRST, then works from it.**
> Owner directive (2026-06-14): large-scale Rust consolidation of hot kernels — "applies to all that can
> benefit from this refactoring … a large scale operation we have to do next for greater consolidation."
> Authority: this deck narrows execution; it never overrides `yuri-origin.md`, protected paths, or owner intent.

---

## 1. MISSION + FRAMING

Consolidate YURI's **hot, stable numerical kernels** from JavaScript into Rust, delivered to Node via
**napi-rs** (native) and/or **wasm-bindgen**, while **JavaScript stays the source-of-truth reference**.
Every Rust kernel is **bit-exact-conformance-tested** against its JS reference before it can ship, and is
swapped in behind a **reversible dependency-injection flag** (JS reference always remains runnable).

This is NOT a rewrite-everything. It is a surgical, ROI-ranked, conformance-gated migration of the kernels
that actually benefit, one wave at a time, owner-gated between waves.

**Why now:** greater consolidation of the hot path + the prerequisite muscle for the incoming ML lane
(Mojo) — see `proj-language-consolidation-priorities`.

---

## 2. TIERED ARCHITECTURE (committed)

| Tier | Language | Role | Hot path? |
|------|----------|------|-----------|
| Reference + verifiers | **JS** | source of truth; property provers; fast iteration | the gate IS here |
| Hot stable kernels | **Rust** (napi/wasm) | delivery, bit-exact to JS reference | yes |
| ML / numerical / GPU | **Mojo** | standalone ML lane, off the gate's hot path | separate mission |

**Hard rule — the energy gate STAYS JS.** `computeU` / `gateProposal` and the B1–B5 property provers are
NOT ported: a verifier must import the verified, and the live gate is JS-wired into the hooks. Port a kernel
**only once it has stopped changing.** The gate is still evolving (v3 + μ-coupling just shipped) → JS.

---

## 3. VERIFIED REALITY (local evidence, 2026-06-14)

### 3a. The proven pattern — `_SYSTEM/nexus-rs` (template, already shipping)
- Pure cargo-testable Rust modules (`minhash.rs`, `jaccard.rs`, `phi.rs`, `corpus_match.rs`) + a
  fail-closed FFI `guard.rs` + `binding.rs` (napi) + `wasm.rs` (wasm-bindgen).
- `conformance.test.mjs` calls the Rust `.node` **directly from Node** and compares to the JS modules on
  fixed inputs: **integer/string outputs EXACTLY equal** (the cross-machine determinism contract);
  **floats within 1e-9**. `wasm-conformance.test.mjs` does the same for the wasm build.
- `index.js` is the NAPI-RS-generated platform loader (darwin-arm64 `.node` present).
- **`yuri-phi.mjs` (golden-ratio primitives) is ALREADY ported** → `phi.rs`. Do not re-port; verify coverage.
- **LIVE-VERIFIED 2026-06-14 on darwin-arm64:** `node conformance.test.mjs` → **88/88 napi pass**;
  `node wasm-conformance.test.mjs` → **60/60 wasm pass** (no rebuild — ran against the committed `.node`/`.wasm`).
  The pattern works bit-exact NOW. Caveat per §6a: Cargo.toml does not pin `-C target-feature=-fma` (holds at
  1e-9 here; a 0-ULP gate-coupled port must add it).

### 3b. Candidate inventory + hotness (importer count = call-frequency proxy, repo-wide)
| Kernel | Importers | Nature | Stable? | Gate-coupled? |
|--------|-----------|--------|---------|---------------|
| `math/math-kernel.mjs` | **25** | ~35 pure numerical primitives | mostly | **YES** (energy-tick-core, energy-breaker, yuri-energy, provers) |
| `math/transfer-distance(.mjs/-cores)` | 9 | NEXUS CORE MBTS distance/surprise | yes | no |
| `quantum-hypothesis-tracker.mjs` | 5 | Jacobi SVD, R^N projectors | yes (gate passed 2026-06-11) | no |
| `yuri-match` (fuzzy-cross-surface) | 5 | PPMI + global-IDF feature space | yes | no |
| `formula-foundry.mjs` | 5 | formula search/codegen | churning | no |
| `spreading-activation-memory` | 2 | PageRank-style iteration | yes | no |
| `nexus-numerology.mjs` | 2 | small numerical | yes | no |
| `structural-centrality` / `fuzzy` (alias) | 0 direct | centrality | yes | no |

### 3c. Exclusions (do NOT port this wave)
- Energy gate + B1–B5 provers (changing + verifier-coupled) — **JS, period.**
- `formula-foundry` (still churning — not stable).
- Anything with 0 importers and no roadmap demand (no ROI).

---

## 4. RANKED WORK-LIST (refined by 3/3 repo-grounded peer convergence — Phase 0 swarm verifies)

**Granularity law (peer convergence):** port at **BATCH / array granularity, never scalar.** napi FFI
crossing ≈ 100–500 ns (deepseek) / 1–5 µs (glm); a kernel that runs in < that loses to the boundary.
So: array/distribution loops over N elements = win (FFI amortized); single-scalar calls
(`fib`, single `softmax`/`logLoss`, `bayesUpdate`, `bregmanDivergence`, small-`n` `median/dotProduct`)
= **negative ROI, stay JS.**

- **W1 · math-kernel — the ARRAY/distribution loops** — HIGHEST ROI in the repo (25 importers).
  Port the over-a-distribution functions at batch granularity: `entropy`, `klDivergence`, `crossEntropy`,
  `normalizeDistribution`, `weightedVariance/StdDev`, `percentile`, `median`, `rankWithTies`, `pNorm`,
  `cosineSimilarity`, `pearson`, `spearman`. **Gate-coupled + transcendental-heavy** (log/exp/pow) →
  bit-exact is HARD across ISAs (see §6) AND a 1e-9 drift can flip the gate threshold → these need
  **0-ULP or stay JS**; the EXACT-determinism subset (`rankWithTies`, `median`, `percentile`, comparison/
  graph: `dijkstra`/`astar`/`topologicalSort`) ports cleanly first. **Phase 0 splits the list per-function.**
- **W2 · corpus_match matcher-half** — `buildIndex` / `matchExact` / `matchPrefixFilter` are **still JS**
  (only minhash/jaccard are ported); O(N) minhash+LSH per query → quick, isolated win (both deepseek+glm flag).
- **W3 · quantum-hypothesis-tracker** — Jacobi SVD / sequential projector measurement; heavy numeric loops, stable.
- **W4 · yuri-match / token-expand (PPMI·IDF)** — O(V²) sparse co-occurrence matrix build; port the matrix
  build, keep JS tokenization. Big-array → napi zero-copy.
- **W5 · spreading-activation (PageRank)** — iterative numeric over the memory graph (batch-friendly).
- **DEMOTED · transfer-distance NCD** — uses gzip = **already native `node:zlib`**; Rust only wins if the
  NCD pair is **batched with Jaccard in one FFI call** (deepseek NEUTRAL / glm medium). Not a first wave.

Each W ships as its own owner-gated wave: PORT-SPEC → Rust module + cargo tests → napi+wasm bindings →
conformance.test.mjs (EXACT int/string, ≤1e-9 float; **0-ULP for gate-coupled**) → DI flag (default JS) → owner arms swap.

---

## 5. HARD CONSTRAINTS (binding)

- **JS stays source of truth.** Rust is delivery. The JS reference must remain runnable forever (it is
  what the conformance test and the gate provers import).
- **Bit-exact contract:** integer/string outputs **EXACTLY** equal; floats **≤ 1e-9**. For **gate-coupled**
  functions a 1e-9 drift can flip a threshold decision → those need **bit-exact (0 ULP)** or stay JS.
- **Reversible by DI flag** (mimo + deepseek + glm converged): a config flag (`useRust`) injects `JsKernel`
  or `RustKernel`; default JS; flip is one line; conformance runs against BOTH. No flag-day cutover.
- **No event-loop blocking** for large work (napi AsyncWork / rayon); zero-copy TypedArray/buffer marshalling.
- **enforce stays DISARMED.** Gate-core clean-path byte-identical. Protected paths off-limits.
- **Commit rules:** commit+push the session's OWN work directly (owner promotion 2026-06-14); explicit
  pathspec only (`git add <new> && git commit -- <paths>`), never `git add .` / bare commit / force;
  checks green + `git show --stat HEAD` before push; `git fetch` + FF, never rewrite shared history.
- **Register-first:** every new Rust kernel + its conformance harness gets a `MATH-SCIENCE-MANUAL.md`
  entry and `@capability` tag + `capability-scan.mjs` BEFORE claiming done.
- **No `npx gitnexus analyze`** in this shared/parallel context (dup-registry footgun).

---

## 6. CONFORMANCE DISCIPLINE — the float-determinism trap table

> Source: peer convergence (mimo verified; deepseek/glm folding in), checked against the nexus-rs
> conformance contract. This is WHY bit-exact is hard and HOW to guarantee it.

| Trap | V8 behavior | Rust default | Discipline to match |
|------|-------------|--------------|---------------------|
| **Transcendentals** (`exp/log/pow/sin`) | FDLIBM / OS libm | `libm` crate (musl port) — **won't match bit-for-bit** | port V8's FDLIBM, or accept ≤1e-9 for NON-gate-coupled only |
| **FMA** | `a*b+c` = two rounded ops | `a.mul_add(b,c)` = one HW-rounded op | always write `(a*b)+c`, never `mul_add` |
| **f32 / `Math.fround`** | truncates to 32-bit | stays f64 | explicit `x as f32 as f64` |
| **NaN / -0.0** | canonical quiet NaN; `-0===0` | preserves NaN payload; distinct -0 | normalize `if x.is_nan(){f64::NAN}`; `-0` via `to_bits()==0x8000_0000_0000_0000` |
| **Integer overflow** | `\|0` → 32-bit wrap | i32 panics (debug) / wraps (release) | explicit `.wrapping_add()` etc. |
| **JSON numbers** | `NaN/Inf→null`, trims zeros | serde throws on NaN | custom serializer mirroring V8 |
| **Sort / iteration** | stable TimSort; int-keys-first `for..in` | stable sort but needs `f64::total_cmp`; HashMap unordered | `total_cmp` for floats; BTreeMap / explicit key order |

**Conformance fixture rule:** every ported function gets a fixed-input fixture covering empty / singleton /
NaN / -0 / large-array / known-answer cases; int+string EXACT; float ≤1e-9 (0-ULP for gate-coupled).

### 6a. Convergent discipline deltas (deepseek + glm, repo-grounded — verify in Phase 0)
- **`libm` crate pin:** for transcendentals use `libm::exp/log/pow` (pure-Rust fdlibm), NOT method syntax.
  On macOS/Linux V8 and Rust often share an fdlibm fork → bit-identical; **Windows MSVC CRT + aarch64 NEON
  diverge at the last ULP.** deepseek note: "not needed yet — current critical paths are u32/integer."
- **⚠ ACTIONABLE (glm catch):** the EXISTING `_SYSTEM/nexus-rs/Cargo.toml` uses `opt-level=3` + `lto=true`
  but does **NOT** pin `-C target-feature=-fma` → **latent FMA divergence on aarch64**. Today's `.node` was
  built+tested on darwin-arm64 and conformance passed at 1e-9, so it holds in practice — but any
  **0-ULP / gate-coupled** kernel MUST add `-C target-feature=-fma` (or audit each `a*b+c` site). Phase-0 task.
- **Sort:** Rust `sort_unstable` is NOT stable → use stable `sort` + `f64::total_cmp` for any order-dependent output.
- **Iteration order:** use `IndexMap` / `BTreeMap`, never bare `HashMap`, when output depends on order
  (V8 Map/Set = insertion order; JS object = integer-keys-first).
- **Never round-trip conformance through JSON** — compare in-process via typed arrays (`JSON.stringify`
  semantics for `NaN/Inf/-0`/trailing-zeros differ from serde).
- **f64 exclusively** (no f32 paths); canonicalize NaN/-0 at kernel boundaries; `wrapping_*` for int overflow.
- **Test on BOTH x86_64 and aarch64** before claiming bit-exact (FMA + libm diverge across ISAs).

---

## 7. STAGED OWNER-GATED FLOW

- **Phase 0 — SCOPE (this swarm, now):** per-kernel PORT-SPEC + per-function determinism audit + go/no-go +
  re-ranked work-list. Output: `01-PORT-SPECS.md` + finalized §4. *No Rust written yet.* → owner reviews.
- **Phase 1 — FIRST KERNEL:** build the #1 go-kernel end-to-end (Rust module + cargo tests + napi+wasm +
  conformance + DI flag default-JS). Prove the loop. → owner arms swap (or holds).
- **Phase 2..N — REMAINING WAVES:** one kernel per wave, same pipeline, owner-gated.
- **Phase F — CONSOLIDATE:** fold all kernels into one `nexus-rs`-style crate (or per-domain crates),
  nightly dual-conformance in CI-equivalent.

---

## 8. SPAWN PROTOCOL

- Every spawned agent / peer lane **reads this brief first**, then its scoped task.
- Output is **advisory until local evidence verifies it** (cargo test + conformance.test.mjs green).
- Emit a conforming RESULT_LABEL (`yuri-origin` Lane Result Grammar), e.g.
  `09RC_MATH_KERNEL_PORT_SPEC_X_PASS`.
- Peer lanes (deepseek/mimo/glm) are advisory design input; only local green = truth.
- Claims separate from evidence; name the float-determinism risk per function explicitly.

---

## 9. STATUS LOG

- 2026-06-14 — Deck created. Inventory + hotness profiled (local evidence §3b). nexus-rs pattern confirmed
  shipping. **All 3 peers (mimo/deepseek/glm) landed — 3/3 convergence, deepseek+glm grepped the LIVE repo
  (genuine, not framing-artifact).** Refinements folded: batch-granularity law (§4), corpus_match matcher-half
  as a quick win, transfer-distance NCD demoted (node:zlib native), scalar funcs excluded, §6a discipline
  deltas + the glm FMA-aarch64 Cargo catch. Next: Phase-0 scoping swarm (one agent per W1–W5 → verified
  PORT-SPEC, adversarially determinism-audited) → `01-PORT-SPECS.md`.
- 2026-06-14 — **Phase-0 COMPLETE → [01-PORT-SPECS.md](01-PORT-SPECS.md)** (10-agent spec→audit swarm,
  900k tok; audits corrected real spec errors). Verified call: **GO** = W2 corpus_match buildIndex/
  matchPrefixFilter (ids-only, zero float surface — Phase-1 first) + W1 clean set (rankWithTies/median/
  percentile/weightedVariance) after the **`roundStable` keystone**. **DEFER** = W3 quantum (spec unsound,
  re-spec; rank float→int 0-ULP), W4 yuri-match (log2 + tie-break + ppmi-NaN). **DROP** = W5 (1 benchmark
  importer, not hot). Two universal blockers: `roundStable`=V8 toPrecision(15)→Number must be bit-exact;
  prover threshold is **1e-12** not 1e-9. Toolchain: cargo/wasm-pack ✅ (cargo-test bit-exact provable NOW,
  nexus-rs 23/23 green); **napi CLI absent** → live `.node` rebuild is owner-gated install; Phase-1 ships
  cargo-verified Rust modules, JS stays source-of-truth, DI default-JS. Next: Phase-1 implementation swarm.
- 2026-06-14 — **Phase-1 SHIPPED+PUSHED** (`945bcb52`): W1 `stats.rs` (rank_with_ties/median/percentile/
  weighted_variance) + W2 `corpus_match.rs` featureFn serializable contract; cargo 37/37, napi compiles,
  FFI conformance intact. W3 quantum → `02-quantum-respec.md` (DEFER). W5 dropped.
- 2026-06-14 — **Phase-1 W1 ARMED+PUSHED** (`4d04b9bd`, owner: "arm what's built"): `@napi-rs/cli` installed,
  `binding.rs` exposes the 4 stats fns, conformance **napi 139/139** (+51 FFI assertions, error/throw parity),
  + reversible DI seam `_SYSTEM/Scripts/math/nexus-stats.mjs` (default-JS, `YURI_NEXUS_RUST=1` flips to Rust,
  fail-safe to JS, test 3/3). Armed-but-inert — no consumer flipped yet (per-consumer swap = further owner gate).
  `.node` gitignored (built locally). wasm arming owner-gated (homebrew cargo lacks wasm32 `core`; .wasm still 60/60).
- 2026-06-14 — **Phase-2 deep wave BUILT+INTEGRATED** (owner: "and deeper rust wave"; cargo **71/71** on main,
  napi compiles, conformance 139/139 intact). `round.rs` = 0-ULP keystone (bit-exact V8 toPrecision(15), proven
  308,249 vectors; caught stats.rs's naive helper failing exact-half ties). `distrib.rs` = **6/10 0-ULP**
  (normalizeDistribution/pNorm₂/cosine/weightedStdDev/pearson/spearman), **4 honestly STAY-JS**
  (entropy/kl/crossEntropy/softmax — libm≠V8 last-ULP). `ppmi.rs` = W4 (cooc EXACT, ppmi/idf 0-ULP aarch64).
  `.cargo/config.toml` -fma pin (x86_64-scoped; aarch64 guarded by `(a*b)+c` discipline, disasm-verified).
  Deps libm+indexmap (Cargo.lock pinned). All cargo-lib only — NOTHING wired to the live gate; JS source-of-truth.
  Commit pending. NEXT (all owner-gated): FFI-bind + arm the 6 new 0-ULP distrib fns + W4; wasm rebuild;
  stats.rs → delegate to round.rs (make it 0-ULP too); the 4 stay-JS need a V8-exact log/exp port to ever move.
