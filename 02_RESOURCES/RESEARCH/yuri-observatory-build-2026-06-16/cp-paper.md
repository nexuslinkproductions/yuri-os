# CONTROL PACKET — afl-paper (live paper-trading engine)

GOAL: Integrate the existing 912-line draft into a clean, production `afl-paper.mjs` — a LIVE-data paper-trading engine. Paper = NO real orders; fills are SIMULATED against the real live book. Data is FED in (live bars via the orchestrator); the engine never fabricates prices.

GROUND FIRST (read in order):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — §4 hard constraints + §7 standing directives (BINDING).
2. 02_RESOURCES/RESEARCH/afl-build-lanes-2026-06-14/mimo-paper-engine.out.txt — the 912-line draft (createPaperEngine, ingestBar, onSignal, Almgren-Chriss fills, fees, 3-state breaker, JSONL ledgers). Adapt/harden it; keep what's sound.
3. _SYSTEM/Scripts/alpha-factor-library/data-quality-gate.mjs — validate every ingested bar (canonical field `timestamp`, finite+monotone) BEFORE use.
4. _SYSTEM/Scripts/prediction-ledger.mjs — wire signal→outcome via recordPrediction/recordOutcome/calibrationReport.

TARGET FILE: _SYSTEM/Scripts/alpha-factor-library/afl-paper.mjs (write_file).

REQUIREMENTS:
- `createPaperEngine(opts)` → engine; `ingestBar(bar)` accepts a canonical bar {timestamp,open,high,low,close,volume}, runs it through validateBar/dataQualityGate, REJECTS malformed (fail-closed, logged).
- `submitPaperOrder({venue, symbol, side, qty|notional, refPrice})` → simulated fill: Almgren-Chriss impact + half-spread + venue fee (crypto tiered maker/taker; polymarket quadratic `ceil(c·rate·p·(1-p))`). NEVER POSTs a real order (paper-only; mirror INV-1).
- Position tracking, realized + unrealized P&L, max drawdown, 3-state circuit breaker (CLOSED/HALF_OPEN/OPEN driven by drawdown).
- Append-only JSONL ledgers (paper fills + prediction ledger). Deterministic + replayable: `replay(events)` reproduces state exactly.
- The order SIZE arrives explicitly from the caller (afl-sizing computes it — separate module). Do NOT size internally beyond clamping to risk caps.
- NO key reads, no protected-path writes (ledgers under _SYSTEM/state/ are fine, NOT backend/data/). Pure ESM. `node --check` passes.
- Include a deterministic `--test` self-test that exits 0.

ACCEPTANCE: node --check passes; `--test` exits 0; ingestBar rejects a malformed bar (high<low / NaN); a fill computes impact+fee correctly; P&L/drawdown/breaker correct on a scripted bar+order sequence; replay() is deterministic; zero real-order path; zero key reads.

AFTER WRITING: run `node --check` + `node afl-paper.mjs --test`; report PASS/FAIL + exit code + a ≤6-line summary. Do NOT git commit.
