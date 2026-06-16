# CONTROL PACKET — observatory server + orchestrator (W2 bridge)

GOAL: Build a dedicated lightweight ESM server that runs the live paper-trading orchestration loop and serves it over REST + WS — the bridge between the AFL spine and the dashboard. Composes the existing `.mjs` modules natively (no TS, no CJS↔ESM friction).

GROUND FIRST:
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — §4 constraints, §7 directives, §7b architecture decision (BINDING).
2. The spine you compose (read their real export signatures, don't guess):
   - adapters/{coinbase,polymarket,perp}-adapter.mjs (getCandles/getTrades+reconstructBars/getFunding; injectable setHttpGet)
   - data-quality-gate.mjs (validateBar/dataQualityGate — bars need `timestamp`, finite+monotone)
   - factor-evaluator.mjs + factor-scorer.mjs (live signal scoring) ; regime-detector.mjs (detectRegimeShift)
   - afl-sizing.mjs (computeSize) ; afl-paper.mjs (createPaperEngine/ingestBar/onSignal or submitPaperOrder)
   - _SYSTEM/Scripts/math/yuri-energy.mjs (computeU/gateProposal — advisory energy.state telemetry)

TARGET FILES (new, under _SYSTEM/Scripts/alpha-factor-library/observatory/):
- `orchestrator.mjs` — the loop + in-memory state (no server deps; unit-testable).
- `observatory-server.mjs` — node:http + SSE wrapper around the orchestrator (ZERO external server deps; `ws` is NOT at repo root and the feed is push-only).

REQUIREMENTS:
- ORCHESTRATOR loop (one cycle = `runCycle()`, callable standalone): for each tracked market (default BTC-USD, ETH-USD on coinbase + 1–2 Polymarket markets) → fetch via adapters → **normalize ALL timestamps to unix-SECONDS** (the single canonicalization chokepoint) → dataQualityGate (drop+log on fail) → compute a few live factor signals → afl-sizing.computeSize → feed afl-paper (paper fill) → record to ledgers. Maintain latest snapshot per market: {bars, signals, paperPositions, pnl, drawdown, regime, energyDeltaU}.
- ENERGY telemetry: each paper-trade proposal → gateProposal ΔU (advisory, observe-only) → snapshot.energyDeltaU. Do NOT block on it (conscience, not gate).
- INTERVAL + RATE-LIMIT aware: configurable cycle interval (default conservative, e.g. 15s); respect adapter rate-limit headers; never hammer.
- REST: GET /api/observatory/{markets,factors,paper,regime,energy,health} → current snapshot (JSON).
- SSE (GET /api/observatory/stream, `text/event-stream`): push {type: 'market.tick'|'factor.signal'|'paper.fill'|'regime.shift'|'energy.state', ...} on each cycle. Push-only telemetry → SSE fits; frontend uses native EventSource. (NO WebSocket — `ws` is backend-only, not at root.)
- CONSTRAINTS: paper-only (inherited — no real orders), NO key reads, SSRF (adapters already guard), ledgers under _SYSTEM/state/ ONLY. CORS allow localhost only. Pure ESM, **node:http built-in ONLY — NO express, NO ws** (verified dep seam: only better-sqlite3 + the AFL spine resolve from root; node:http avoids any node_modules-placement risk). better-sqlite3 imported ESM default-style (proven in repo).
- MODES: `--once` (single runCycle, print snapshot, exit — deterministic for test with injected mock httpGet) and `--serve` (start the server + interval loop).
- node --check passes; a `--test` self-test using MOCK adapters (injected httpGet returning canned responses) runs a deterministic cycle end-to-end and exits 0 (asserts: bars gate-pass, a signal computes, a paper fill records, snapshot shape correct).

ACCEPTANCE: node --check both files; `--test` exits 0 (mock cycle end-to-end green); `--once` against a mock produces a well-formed snapshot; no real-order path; no key reads; timestamps normalized to seconds; server starts on a configurable port and serves the REST shape.

AFTER WRITING: run node --check + the --test; report PASS/FAIL + exit + a ≤8-line summary + the REST/WS contract (routes + WS message types) so the frontend lane can consume it. Do NOT git commit.
