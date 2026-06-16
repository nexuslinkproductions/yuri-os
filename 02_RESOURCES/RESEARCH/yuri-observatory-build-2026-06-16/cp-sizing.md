# CONTROL PACKET — afl-sizing (paper-only position sizing)

GOAL: Author a NEW `afl-sizing.mjs` — paper-only, advisory position sizing for the AFL pipeline (`signal → regime → vol_target_sizing → risk_check`). Conservative by construction.

GROUND FIRST (read in order):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — §4 constraints + §7 standing directives (RUST routing: use nexus-rs for hot numeric paths).
2. 02_RESOURCES/RESEARCH/afl-crypto-trading-playbook-2026-06-14.md — the sizing/risk doctrine (vol targeting, fractional-Kelly, survivor risk-mgmt).
3. _SYSTEM/Scripts/math/nexus-distrib.mjs — the RUST-backed stats (weightedStdDev, pNorm). Use these for realized-vol; check the actual exported names by reading the file.
4. _SYSTEM/Scripts/decision-sim.mjs — `halton`, `makeQmcRng`, `robustScore`, `crossEntropyOptimize` for QMC/CVaR-robust sizing under return uncertainty. Read its real export signatures.

TARGET FILE: _SYSTEM/Scripts/alpha-factor-library/afl-sizing.mjs (write_file).

REQUIREMENTS:
- `computeSize({ edgeMean, edgeLowerCI, winProb, payoff, returns, equity, targetVol, caps })` → `{ targetNotional, targetQty, fraction, reason }`. Paper-only, advisory.
- **Fractional-Kelly on the LOWER confidence bound of edge** (edgeLowerCI), not the point estimate — conservative. Expose the Kelly fraction multiplier (e.g. 0.25–0.5).
- **Volatility targeting**: scale exposure so portfolio vol ≈ targetVol; compute realized vol via nexus-distrib's RUST weightedStdDev (import from ../math/nexus-distrib.mjs); JS fallback if the native module fails to load (try/catch import).
- Optional **CVaR-robust** size via decision-sim QMC sampling over return uncertainty (cap the size at the CVaR-robust value when provided).
- **Hard risk caps**: maxFraction, maxPerPosition, drawdown throttle. **NO_TRADE** (fraction=0) when edgeLowerCI ≤ 0 or winProb below a confidence floor — return reason string.
- Pure ESM. `node --check` passes. Deterministic `--test` self-test exiting 0.

ACCEPTANCE: node --check passes; `--test` exits 0; fractional-Kelly-on-lowerCI is strictly ≤ point-Kelly; vol-target scaling correct (higher realized vol → smaller size); nexus-distrib used for vol (with JS fallback proven); NO_TRADE path fires on non-edge; caps clamp.

AFTER WRITING: run `node --check` + `node afl-sizing.mjs --test`; report PASS/FAIL + exit code + ≤6-line summary + confirm whether the Rust nexus-distrib path loaded or fell back to JS. Do NOT git commit.
