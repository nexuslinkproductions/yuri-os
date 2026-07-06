## W3 · quantum-hypothesis-tracker.mjs — CORRECTED PORT-SPEC (evidence-grounded)

> File: `_SYSTEM/Scripts/quantum-hypothesis-tracker.mjs` — **313 lines** (verified `wc -l`).
> Prior spec was UNSOUND: it cited lines 568/338/169 in a 313-line file (hallucinated), labeled
> `jacobiSVD`/`schmidtDecomposition` as `TRANSCENDENTAL_HARD` (the file has ZERO log/exp/pow/sin),
> and located gate-coupling INSIDE this file (it is not — see §G). All line numbers below are real.

### Determinism reality (the headline correction)
- **NO transcendentals.** Only function call across the whole file is `Math.sqrt` — sites: L45 (`norm`),
  L154 (`measure` renorm), L240 / L245 / L246 / L247 / L269 (`jacobiSVD`). IEEE-754 §5.4 mandates `sqrt`
  is **correctly-rounded** → identical to V8's `Math.sqrt` bit-for-bit on any conformant ISA. **Class:
  FLOAT_SAFE & deterministic**, not transcendental-hard. The whole module is sqrt + (+,−,×,÷), all IEEE-deterministic ops.
- **No `import` statements at all.** Zero coupling to `energy-tick-core` / `recordCircuitEnergy` / `computeU`
  *inside this file* (grep `import` → 0 hits). The prior spec's "`recordCircuitEnergy→tickAndTrace` coupling"
  lives in the CALLER, not here (see §G).

### Per-function determinism class + ROI granularity

| Function | Lines | Class | ROI granularity | Note |
|----------|-------|-------|-----------------|------|
| `dot` | 37–41 | FLOAT_SAFE | scalar→**STAY JS** | O(N) sum; FFI > compute for the small N used here |
| `norm` | 44–46 | FLOAT_SAFE (sqrt) | scalar→STAY JS | |
| `scale`/`add` | 49–60 | FLOAT_SAFE | scalar→STAY JS | trivial |
| `normalize` | 63–67 | FLOAT_SAFE | scalar→STAY JS | `tol=1e-15` zero-guard (L65) |
| `matVec` | 74–82 | FLOAT_SAFE | **BATCH_WIN if m·n large** | summation-order load-bearing (L78 `s += M[i][j]*v[j]`) |
| `matMul` | 85–93 | FLOAT_SAFE | **BATCH_WIN** O(m·k·n) | the real compute mass; accumulation order L91 must stay scalar/in-order |
| `transpose`/`identity` | 96–112 | EXACT | BATCH-neutral | pure index moves, no float |
| `stateVector`/`projector`/`diagonalProjector` | 119–139 | FLOAT_SAFE | BATCH if N large | outer products O(N²) |
| `measure` | 150–157 | FLOAT_SAFE (sqrt L154) | per-call | `tol=1e-15` (L153) |
| `measureSequential` | 163–173 | FLOAT_SAFE | **BATCH_WIN** (loop of measures) | jointProb product L168; early-break L170 |
| `hypothesisPosteriors` | 180–188 | FLOAT_SAFE | BATCH | hard `1e-15` cutoff L184 |
| `qqEquality` | 200–218 | FLOAT_SAFE | per-call | **0-ULP cancellation trap** L217 (see §C) |
| `jacobiSVD` (private) | 225–274 | FLOAT_SAFE (sqrt only) | **BATCH_WIN** (iterative O(maxIter·n²·m)) | **0-ULP rank trap** L273; sort L271 |
| `schmidtDecomposition` | 281–284 | FLOAT_SAFE | BATCH | passes `tol=1e-10` (L281) into jacobiSVD (see §B) |
| `bayesPosterior`/`bayesSequential` | 294–313 | FLOAT_SAFE | scalar→STAY JS | classical baseline; `reduce` sum L296/L311 |

**Granularity verdict:** the only positive-ROI port surface is the matrix engine + SVD
(`matMul`, `matVec`, `measureSequential`, `jacobiSVD`/`schmidtDecomposition`) at **batch/matrix
granularity**. The R^N vector scalars (`dot`/`norm`/`scale`/`add`/`normalize`) and the Bayes baseline
are negative-ROI (FFI crossing ≈ 100–500 ns–5 µs > the work) → **STAY JS**.

### §B — The rank float→int 0-ULP trap (THE real blocker)
`jacobiSVD` line **273**: `return { rank: singularValues.filter(s => s > tol).length, singularValues };`
- `rank` is an **integer derived by thresholding floats** at `tol`. The default flow: `schmidtDecomposition`
  (L281, `tol = 1e-10`) → `jacobiSVD(A, m, n, tol)` (L283) → the **rank cutoff is 1e-10**, NOT the
  function's own `1e-12` default (L225) — the caller's value wins.
- A singular value that conforms to the deck's ≤1e-9 float tolerance can sit on **either side** of the
  1e-10 cutoff: 1e-9 drift is **10× larger** than the 1e-10 threshold → an integer `rank` flip.
- This is load-bearing: caller `factor-circuit.mjs` L515 → `entangled: sd.rank > 1`. A rank flip flips
  the entangled/uncoupled boolean → flips the whole quantum-vs-classical sequencing branch.
- **Contract:** `rank` (integer) and `entangled` must be **EXACTLY** equal to JS (0-ULP on the comparison),
  per the nexus-rs "integer/string outputs EXACTLY equal" rule. A ≤1e-9 float tolerance on
  `singularValues` is **insufficient** to guarantee the derived integer. Port must (a) reproduce the SVD
  accumulation order bit-for-bit so SVs match to 0-ULP near the cutoff, AND (b) pin `-C target-feature=-fma`
  (the L252/L253/L257/L258 Jacobi rotations `c*bi - s*bj` and the L91/L78/L268 accumulations are
  `a*b±c*d` FMA-contraction sites). Note the same `tol` is ALSO the Jacobi off-diagonal convergence test
  (L240 `Math.abs(gamma) <= tol*Math.sqrt(alpha*beta)`) — a different `tol` interpretation but the SAME
  variable, so any rounding drift in the rotation also perturbs WHEN it converges → compounds into the SV
  values feeding the rank cutoff.

### §C — The qq cancellation 0-ULP (catastrophic subtraction)
`qqEquality` line **217**: `qqStatistic: sAB - sBA`. The quantum model guarantees `sAB ≈ sBA`, so this
is a **near-equal-minus-near-equal cancellation** → all surviving precision is in the low bits. The
benchmark/skill asserts `qq ≈ 0` at the **1e-12** order (Wang-Busemeyer consistency). A 1e-9-tolerant
port would let `qqStatistic` drift ~1000× past the 1e-12 assertion → spurious "order effect" verdict.
**Contract:** the `sAB`/`sBA` accumulation paths (L209–L215, each a sum of two `sqNorm`/`matVec` chains)
must be 0-ULP-faithful; `qqStatistic` must clear **1e-12** against JS, not 1e-9. FMA-pin required (the
inner `matVec` L78 + `dot` L39 are contraction sites).

### §G — The recordCircuitEnergy coupling (non-enforcing, and NOT in this file)
- This file has **no** energy coupling. The coupling is one hop out, in `factor-circuit.mjs`:
  L60 `import { freshState, tickAndTrace } from '../energy-tick-core.mjs'`; the consumer of the SVD
  `rank`/`entangled` and `measureSequential` joint-probabilities.
- `recordCircuitEnergy` (`factor-circuit.mjs` L606–624) is a **RECORDING, explicitly inert**: L612 sets
  `is_error: !advantage`; L620 comment "Keep the energy gate's enforce path inert here: this is a
  recording, not a session mutation." It calls `tickAndTrace` only to append to the energy trace; it does
  **not** route through the enforcing PreToolUse circuit-breaker.
- **Implication for the port:** porting the tracker does **not** touch the energy gate's hot/enforce path
  (consistent with §2 of the master brief — the gate stays JS). The tracker is correctly classified
  **non-gate-coupled**. BUT the derived-integer (`rank`→`entangled`) IS consumed by a downstream branch
  that feeds the (inert) energy recording, so an integer flip silently corrupts an audit trace, not a
  live veto. Risk is **silent-wrong-recording**, not gate-bypass. Still demands 0-ULP on the integer.

### §S — Sort + iteration-order notes
- L271 `singularValues.sort((a, b) => b - a)`: descending numeric sort over floats. Rust must use stable
  `sort_by(|a,b| b.total_cmp(a))` (NOT `sort_unstable`, NOT naive `partial_cmp` — NaN/-0 handling). Since
  the rank cutoff reads this sorted array, a tie-break difference at the boundary can move which SV is
  "first past tol". Use `f64::total_cmp`.
- No `HashMap`/object-key iteration anywhere → no insertion-order hazard (unlike W4).

### §T — Toolchain / conformance reality (carried from Phase-0 local evidence 2026-06-14)
- `cargo`/`rustc` 1.95.0, `wasm-pack` 0.15.0, aarch64-apple-darwin + wasm32 targets present;
  nexus-rs cargo tests 23/23 green → bit-exactness provable at cargo-test level NOW.
- **napi CLI ABSENT** → live `.node` rebuild is owner-gated. A ported W3 would ship as cargo-test-green
  Rust module + wasm conformance; JS stays source-of-truth; DI flag default-JS; no live swap.
- Fixtures MUST include: empty / singleton / rank-1 product state / Bell entangled state (`[1,0,0,1]`,
  rank 2 — the discriminator at `factor-circuit.mjs` L854–856) / a state with an SV deliberately placed
  within 1e-9 of the 1e-10 cutoff (the rank-flip adversary) / qq near-cancellation case. Compare
  in-process via typed arrays (never JSON round-trip). `rank`/`entangled` EXACT; `qqStatistic` ≤1e-12;
  `singularValues` ≤1e-9 only as a secondary check (the integer is the contract).

### Verdict
**DEFER** to a later wave. The tracker is genuinely portable (FLOAT_SAFE, stable since gate-pass 2026-06-11,
real BATCH_WIN in the SVD/matMul mass) and NOT on the enforcing gate path — so it is lower-stakes than W1.
But it carries TWO 0-ULP integer/cancellation traps (rank float→int at 1e-10; qq cancellation at 1e-12)
that make it strictly harder to conformance-prove than the W2/W1-clean ports, and it has only 2 live
non-test importers. Correct sequencing: ship W2 (zero float surface) and W1-clean (after `roundStable`)
first; bring W3 in a later owner-gated wave once the `-C target-feature=-fma` pin + 0-ULP SVD-accumulation
discipline is proven on the simpler kernels. **GO is unjustified now; NO_GO is too strong (it IS portable).
DEFER is the evidence-grounded call.**