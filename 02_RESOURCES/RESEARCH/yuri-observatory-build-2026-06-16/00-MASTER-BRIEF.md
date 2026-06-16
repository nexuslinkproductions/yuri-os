# YURI Trading Observatory — Mission Master-Brief

> **Ground truth for every lane on this build (ollama-cloud peers, Sonnet/Haiku agents, main session).**
> Read this FIRST before any module. If a spec elsewhere conflicts with this file, this file wins (under `yuri-origin.md` authority).
> Status log lives at the bottom — append, don't overwrite.

## 1. Mission

Turn YURI into an app: a **paper-trading observability dashboard** for **crypto (PRIMARY) + Polymarket (secondary)**, on **LIVE market data** — paper means no real orders; fills are simulated against the *real live book*. Marcel + Mike must SEE what the AFL mechanisms are doing: mechanism telemetry side-by-side with the actual platform charts. Revives the halted root YURI app.

Owner decisions: **Full observatory** (all 5 panel groups) · **crypto + Polymarket together** · **localhost-first** (auth for Mike later).

Full plan: `/Users/marcelspatz/.claude/plans/delegated-sniffing-russell.md`.

## 2. Verified ground (primary evidence, 2026-06-16 — do NOT re-derive)

- **Ollama-cloud peer lane LIVE** — `bash _SYSTEM/Scripts/ai llm ollama-cloud --model glm-5.1:cloud "..."` returns clean. Tools in-lane: `write_file`, `edit_file`, `bash`, read/grep/search. Roster: `deepseek-v4-pro:cloud` (true 1M input → big-context jobs), `glm-5.1:cloud` (default), `minimax-m3:cloud`, `nemotron-3-ultra:cloud`, `kimi-k2.7-code:cloud`, `gemma4:31b-cloud`. Pro plan = 3 concurrent.
- **AFL corpus = 85 factors** in `_SYSTEM/OS_KERNEL/alpha-factors.db` (tables: `alpha_factors` [85], FTS5, `factor_lineage`, `factor_performance_log`, `factor_embeddings`). Store: `alpha-factor-store.mjs`. Tests green.
- **Math modules import clean** (`node --check`): factor-evaluator (deflated Sharpe/BH-FDR/walk-forward), factor-scorer, factor-circuit (quantum-sequenced), data-quality-gate, regime-detector, afl-organ-adapter. Plus quantum-hypothesis-tracker (wired into factor-circuit), yuri-energy (decision conscience), decision-sim (+ QMC/Sobol-Halton), nexus-rs Rust (bit-exact Pearson/Spearman/percentile).
- **App shell**: root Vite5 + React19 + R3F9 + three@0.173 at `_SYSTEM/src/` (dashboard = NEW page; reuse TelemetryDeck/ConclaveMonitor patterns). Backend: Express5 + ws8.20 + better-sqlite3 at `_SYSTEM/backend/` (WS broadcast already wired in `server.ts`).
- **Drafts**: 912-line paper-engine draft at `02_RESOURCES/RESEARCH/afl-build-lanes-2026-06-14/mimo-paper-engine.out.txt`. `coinbase-adapter.mjs` = 7-line STUB (rebuild). DeepSeek adapter draft FAILED (re-author).
- **Charting deps** (lightweight-charts, uplot, echarts) NOT installed — owner-approved to install when Wave 3 needs them.

## 3. Adapter source-of-truth (USE THESE — design doc is partly stale)

Per `02_RESOURCES/RESEARCH/afl-grounding-venue-apis-2026-06-13.md`:
- **Coinbase Advanced Trade**: base `api.coinbase.com`, prefix `/api/v3/brokerage`. Keyless market-data reads available (`/market/products/{id}/candles`, `/market/product_book`, `/market/products/{id}/ticker`). Authed = Ed25519 JWT (EC stale → warn). Rate limits from response headers (`x-ratelimit-*`), NOT a fixed 30/s. Public WS `wss://advanced-trade-ws.coinbase.com`. Candles come newest-first → REVERSE to chronological (else data-quality-gate non-monotone trip).
- **Polymarket**: `py-clob-client` ARCHIVED → write against raw CLOB HTTP (`clob.polymarket.com`) / py-sdk beta. Auth L0 (read, no auth) / L1 (EIP-712) / L2 (+HMAC). Neg-risk exchange flag governs contract. Read-only L0 data via `data-api.polymarket.com/trades`. Fee price-dependent, peaks at p=0.5.
- **Canonical OHLCV bar** = the field the LIVE gate actually reads (`data-quality-gate.mjs`): `{ timestamp, open, high, low, close, volume }` — field is **`timestamp`** (NOT `t`; the venue-adapter-spec's `{t:ms-epoch}` is STALE, corrected 2026-06-16 against live source). Scale: unix-SECONDS (matches gate fixtures + lightweight-charts `UTCTimestamp`). Gate requires only finite + strictly-monotone timestamps. All adapters emit `timestamp` — verified consistent.

## 4. Hard constraints (every lane)

1. **PAPER-ONLY.** INV-1 `buildOrder` returns a body, NEVER POSTs an order. INV-2 NO key reads (creds from env only, never read `.env`/secrets). INV-3 live market-data reads OK. No real order ever fires.
2. **SSRF guard** on every outbound fetch: DENY private/loopback/link-local/cloud-metadata (169.254.169.254); ALLOW only an explicit public host allowlist.
3. **No secrets in code. No key values echoed.** Bound + validate every parsed number; numbers arrive as strings on the wire → explicit `parseNum` at the mapping boundary; `parseNum('')→null`; fail-closed on malformed.
4. **Deterministic + offline-testable**: inject `httpGet` via constructor; mappers pure + exported.
5. **No HUD/Kagami design tokens** (owner-banned) → self-contained purpose-built CSS only.
6. **Crypto PRIMARY.** Legality = Marcel + Mike's domain — NOT a blocker, no legal framing.
7. **Energy gate = decision conscience / veto, NOT the sizer** (calibrated for claim dynamics, not P&L). Sizing = separate `afl-sizing.mjs`.
8. **Protected paths off-limits**: `backend/data/`, `.claude/state|history|file-history`, `.env`, `node_modules/`, `.amp/`.
9. **No git mutation by peers.** Main session commits, scoped pathspec, after checks green.

## 5. Spawn protocol (control packet per task)

Every peer/agent dispatch carries a **CLAUDE CONTROL PACKET**: `goal · target file(s) · constraints (cite this brief) · acceptance criteria · test command · rollback boundary`. Serialize same-file lanes. **Main session verifies every claim with a local run** (lanes over-claim — "done" with 0 edits has happened). Routing: ollama-cloud peers = bulk authoring (deepseek-v4-pro for big-context); Sonnet agents = substantive integration/verification/design; Haiku = census/read.

## 6. Build waves

- **W0** foundation (lane/math/corpus verified ✓, this brief, scaffold dirs).
- **W1** data spine: adapters (coinbase/polymarket/perp) + paper engine (live fills) + afl-sizing.
- **W2** bridge: backend observatory orchestrator + REST `/api/observatory/*` + WS events.
- **W3** view: ObservatoryPage + 5 panels + 3D R3F (viz-lab port).
- **W4** depth: last30days intake + quantum live-wire + auth for Mike.

## 7. Standing directives (owner)

- **AGGRESSIVE RED-TEAM after every module/wave is "done"** (owner 2026-06-16). First-run/self-reported PASS is a hypothesis. The W1 adapter red-team proved it: peers self-reported PASS, a Sonnet adversarial pass found 2 real polymarket bugs (fee fp over-round + `_vwap` leak). Nothing is "done" until attacked.
- **RUST routing**: math-kernel core is JS; nexus-rs covers stats/distrib/similarity/phi only. Route hot numeric paths (correlation, percentile, weighted-stddev, vol-target) through `_SYSTEM/Scripts/math/nexus-stats.mjs` / `nexus-distrib.mjs`; the rest stays JS until a kernel Rust pass (owner roadmap).
- **SCALE**: adapters emit `timestamp` finite+monotone (coinbase/perp=seconds, polymarket=ms internally). The **W2 orchestrator NORMALIZES all bars to unix-SECONDS** at the single ingest chokepoint before gate+WS+frontend (lightweight-charts `UTCTimestamp` = seconds).

## 7b. Architecture decision — W2 bridge (2026-06-16)

The backend is **CommonJS** (ts-node, `"type":"commonjs"`) and only ever invokes `.mjs` as **subprocess scripts**, never `import`s them. The AFL spine is ESM `.mjs`. Forcing CJS-TS→ESM import via ts-node is fragile. **DECISION (self-governed, reversible): a dedicated lightweight ESM observatory server** (`_SYSTEM/Scripts/alpha-factor-library/observatory/`) — express + ws + better-sqlite3, all ESM, composes the spine natively. Serves REST `/api/observatory/*` + WS. Runs headless (paper-data gathering) OR behind the Vite app (dev-proxy). Zero CJS↔ESM friction, zero edits to the shared/contended `server.ts`. The big TS backend stays for the rest of YURI; folding the observatory into it later is an option, not a blocker.

## 8. Status log

- 2026-06-16 — W0 DONE. Lane LIVE (glm-5.1 pong), corpus 85/db confirmed, AFL tests clean, master-brief + dirs.
- 2026-06-16 — W1 ADAPTERS DONE + RED-TEAMED. coinbase (669L) / polymarket (939L) / perp (432L, Binance fapi) authored by ollama peers, adversarially verified by a Sonnet lane: exports/INV-1/INV-2/SSRF/mapper→gate/live-shape all PASS. 2 polymarket bugs caught + FIXED (fee fp → self-test 91/0; `_vwap` leak → deleted both push sites).
- 2026-06-16 — W1 PAPER + SIZING DONE + RED-TEAMED. afl-paper (1208L, 30/30; Sonnet) + afl-sizing (10/10; deepseek-v4-pro peer). Independent red-team found 8 bugs the self-tests missed — 1 CRITICAL (sizing CVaR cap was mathematically dead code, always 1.0), 1 HIGH (paper double-sizing: confidence re-applied to caller qty), + macOS case-sensitive protected-path bypass, NaN leakage, floor-kill, vacuous tests. ALL fixed + CONFIRMED-DEAD by re-verify; self-tests green, no regression. **Rust parity VERIFIED SAFE** — `YURI_NEXUS_RUST=1` = 0-ULP match on nexus-distrib. **Wave 1 data-spine COMPLETE.** Next: W2 backend orchestrator (adapters→normalize-seconds→dqGate→factors→sizing→paper→ledgers) + REST `/api/observatory/*` + WS, minimal touch to shared server.ts.
- 2026-06-16 — W2 BACKEND DONE + LIVE-VERIFIED. Dedicated ESM observatory server (node:http + SSE, ZERO express/ws; `_SYSTEM/Scripts/alpha-factor-library/observatory/` orchestrator.mjs 810L + observatory-server.mjs 306L). Red-team found 5 bugs incl. 1 CRITICAL (integer-floor zeroed fractional crypto qty → every signal silently NO_TRADE) — ALL fixed. **LIVE PROOF (real Coinbase): BTC paper position 0.02265 BTC @ $66,595 (fee $1.51), ETH 2.4446 ETH @ $1,815 (+$3.70 unreal) — full chain adapters→gate→signal→sizing→paper→P&L on LIVE data.** afl-paper 36/36 (T7 fractional regression added), observatory 25/25. Energy ΔU advisory live. Contract: REST GET /api/observatory/{markets,factors,paper,regime,energy,health} + SSE GET /api/observatory/stream (events market.tick/factor.signal/paper.fill/regime.shift/energy.state, type in JSON payload → frontend onmessage+JSON.parse). Can run headless to gather paper data. Next: W3 frontend dashboard.
- 2026-06-16 — W3 FRONTEND DONE + RED-TEAMED + LIVE-VERIFIED. Hybrid-tabs dashboard in the root Vite/React19/R3F app: pages/ObservatoryPage (Markets|Mechanism|Mind) + hooks/useObservatoryStream (SSE) + components/observatory/{MarketsTab (lightweight-charts candles, real 50-bar history), MechanismTab (factor ΔU/regime/Brier/energy gauge), MindTab} + scenes/{EnergySurfaceScene (real computeU heightfield), QSphereScene} + observatory.css (self-contained). Route /observatory + vite proxy →127.0.0.1:4242. Live red-team found 5 server↔frontend contract mismatches (qualityGate pass/passed, position field names instrument/quantity/avgEntryPrice, /paper+/regime per-market wrappers, RECOMPUTE_CIRCUIT color) — ALL fixed via hook normalization (server=source of truth), 45/45 live assertions green. `npm run build` green. NO HUD tokens. dep added: lightweight-charts (owner-approved).
- 2026-06-16 — **FULL-STACK MVP COMPLETE (crypto-primary).** live Coinbase→adapters→gate→signals→sizing→paper→energy→REST/SSE→dashboard, every layer red-teamed (15 bugs caught+killed). NEXT W4: wire Polymarket+perp into orchestrator DEFAULT_CONFIG (adapters built, not yet in the loop), last30days intake, auth for Mike, quantum live-wire, headless data-gather, YURI_NEXUS_RUST=1 (verified safe). OPEN: commit decision (scoped pathspec; shared multi-session tree); Binance perp may be geo-variable.
