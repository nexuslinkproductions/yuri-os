# CONTROL PACKET — W4 factor return-vectors (quantum circuit live-wire feeder) — nemotron-3-ultra lane

GOAL: Build the module that converts LIVE market bars into the REAL per-factor return-vector matrix that the quantum factor-circuit consumes — so the circuit's order-optimal sequencing runs on actual return series instead of metadata embeddings. PURE compute module (no network, no I/O). The main session wires it into the orchestrator.

GROUND FIRST (read these — do NOT guess signatures):
1. `_SYSTEM/Scripts/alpha-factor-library/factor-circuit.mjs` — read `factorVector`, `buildCommutativityMatrix`, `optimizeFactorCircuit` and HOW they expect factor vectors (dimension N, normalization). The circuit treats each factor as a rank-1 projector in R^N built from a vector. Your matrix rows must be the vectors `factorVector`/`optimizeFactorCircuit` expect (read the actual code — match dimension + normalization exactly; if it L2-normalizes internally, don't double-normalize).
2. `_SYSTEM/Scripts/alpha-factor-library/observatory/orchestrator.mjs` — read `closeReturns(bars)` (≈ line 160) and `computeLiveSignals` (≈ line 91). Your module turns a window of bars + the live signals into one return-vector per factor.
3. `00-MASTER-BRIEF.md` §4 + the quantum constraint: the circuit must short-circuit to classical when factors commute (already handled inside factor-circuit — you just supply honest vectors, never fabricate non-commutativity).

TARGET FILE (new): `_SYSTEM/Scripts/alpha-factor-library/factor-return-vectors.mjs`

REQUIREMENTS:
- `buildReturnVectors(bars, signals, opts?) -> { vectors: number[][], factorIds: string[], dim, degenerate }` where each row = the return-contribution series of one factor over the bar window, dimension `dim` (default: number of return periods = bars.length-1), aligned across factors (same length, zero-padded/truncated consistently). `degenerate=true` when <2 factors or all-zero/constant (caller then uses classical combine).
- Map each live signal to its return series honestly: e.g. a momentum factor's vector = sign(side) × per-period returns where the factor was "on"; a vol-regime factor's vector = the per-period vol contribution. Document the mapping. NEVER fabricate orthogonality/non-commutativity — derive vectors from real returns only.
- Finite-guard every element (NaN/Inf → 0). Pure function, deterministic, no network, no fs, no new dep. Pure ESM.
- Export a thin `circuitInputFromBars(bars, signals, opts?)` that returns exactly what `optimizeFactorCircuit` needs as input (read factor-circuit to get that arg shape right) so the orchestrator can call one function.

ACCEPTANCE:
- `node --check` passes.
- `--test` exits 0 asserting: with 2 synthetic correlated factors → vectors have equal length = dim, finite; degenerate=true on a single factor / all-constant input; feeding the output into `optimizeFactorCircuit` (import it) returns WITHOUT throwing and yields a `circuitQuality` ratio (≥1 when an ordering advantage exists, ==1/classical when factors commute — prove BOTH cases with crafted inputs).
- Self-test prints `N pass, 0 fail`.

TEST CMD: `node _SYSTEM/Scripts/alpha-factor-library/factor-return-vectors.mjs --test`
ROLLBACK: delete the new file.
AFTER WRITING: write the file, run node --check + --test yourself, report PASS/FAIL + exact counts + the exact `optimizeFactorCircuit` input shape you matched + a ≤8-line summary. DO NOT git commit. Your final message IS the result.
