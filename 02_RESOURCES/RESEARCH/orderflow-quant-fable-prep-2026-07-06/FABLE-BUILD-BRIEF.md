# FABLE 5 BUILD BRIEF — Orderflow + Quant Trading System (P0→P2, free-first, DISARMED paper)

**Date:** 2026-07-06 · **Synthesized by:** Yuri (Opus lane, orchestrator) · **For:** Fable 5 @ max reasoning
**Prep fleet:** 5 Sonnet recon lanes (A–E) + MURE company dispatch (20-role, GLM substrate)
**Status:** prep COMPLETE — this brief + the master prompt + the 5 lane docs are your ground truth. Read this FIRST, then the master prompt, then the lane docs on demand.

---

## 0. Read order (yours)
1. **This brief** (the corrected build order + control packet + copy-ready facts).
2. Master prompt: `git show 409bb894` / the handoff you were given.
3. Research capture (the WHY): `02_RESOURCES/RESEARCH/orderflow-quant-pivot-2026-07-06.md`.
4. Lane docs (the EXACT surfaces, load on demand):
   - `lanes/A-nautilus-api.md` — nautilus v2 API surface (install, OrderBook, Databento, IB, instruments, Strategy/Actor).
   - `lanes/B-reuse-surfaces.md` — every alpha-factor-library reuse target: exports, input shapes, extension seams.
   - `lanes/C-data-stack.md` — free data stack, verified endpoints/auth/limits.
   - `lanes/D-quant-spec.md` — formula-level IC / DSR / HLZ / walk-forward / GEX / footprint spec.
   - `lanes/E-ib-wiring.md` — dockerized IB Gateway + adapter config + CME instrument table + OPRA→IV→gamma.
   - **`_SYSTEM/Scripts/alpha-factor-library/MURE_GAP_SEAM_DESIGN_2026-07-06.mjs`** — MURE's architect leaf produced this: a machine-readable `MURE_GAP_SEAM_SPEC` object pinning all 5 gap modules as clean seams onto the existing library — module name, location, DISARMED flag, degrade behavior, `imports_from_existing`, exports, seam input/output shapes, integration points, plus an acyclic dependency DAG and the DISARMED-first contract. Self-test 20/20; all cited symbols verified real exports. **CAVEAT (verified):** the `path:line` anchors in its comments are APPROXIMATE (GLM pointed a few lines off — e.g. `computeOFI` is `ofi.mjs:155` not `:152`); the SYMBOLS are correct — grep for exact signatures, or use Lane B which carries verified exact exports. This is your skeleton — Fill the modules; the seams are already designed.

---

## 1. FOUR BUILD-ORDER CORRECTIONS (the prep fleet caught these — they override the master prompt where they conflict)

**C1 — Databento is the BOOK-DATA source; IB is EXECUTION-ONLY.**
Lane A: the IB integration doc (2099 lines) has **zero** market-depth subscription examples — IB order-book data is UNVERIFIED/unsupported in practice. Lane C: IBKR **paper** accounts get free *execution* only; market data defaults to **15-min delayed** unless linked to a live, subscribed account. → **Architecture:** nautilus consumes the order book from **Databento** (real ES MBP-10 via the $125 credit) and routes **paper orders through IB**. Do NOT try to source the book from IB. This is the single biggest correction.

**C2 — The IC spine is a CONFIRMED greenfield gap (build it), but the promotion gate is REUSE-READY.**
Lane B: exhaustive grep (`IC|informationCoefficient|rankIC|spearman|Grinold|\bIR\b`) across the whole library = **zero hits**; `factor-evaluator.backtestFactor` computes Sharpe only. So IC/rank-IC/Grinold-IR is genuinely new. BUT Lane D confirms `factor-evaluator.mjs::deflatedSharpe` implements the exact Bailey–López de Prado DSR (gate `dsr > 0.95`) and `benjaminiHochberg` the canonical BH-FDR — both **reuse-ready**. → **Build the IC computation; FEED it into the existing DSR/BH gate. Do not rebuild the gate.**

**C3 — Build ONE new nautilus/Databento tape-recorder; the entire downstream reuses unchanged.**
Lane B: `ofi.mjs`, `orderbook-imbalance.mjs`, `ensemble.mjs`, `tape-replay.mjs` are venue-agnostic pure math — reusable **as-is**. The ONLY hard-coded Binance layer is `observatory/tape-recorder.mjs` + `trades-stream.mjs` (WS URLs, wire parsers). → **The swap seam is upstream:** write a new recorder that ingests nautilus `OrderBookDelta`/Databento MBP-10 and emits the **same JSONL line contract** `tape-replay.mjs` already consumes (`{bidPx,bidSz,askPx,askSz}` snapshots + `{factorId,market,ts,price,dir}` ledger). Re-point that one seam and OFI/OBI/edge-audit/decision-sim/horizon-ladder all light up on equities/futures with zero rewrite. Reparameterize fees (`afl-paper.mjs` `feeModel` is injectable, `perpMode` is off by default) — no code change, just a non-crypto fee model.

**C4 — Crypto testnet is NEW work, not reuse.**
Lane C: repo grep for `testnet.binance.vision` / `stream-testnet.bybit.com` = zero hits. Existing crypto code targets LIVE exchanges for signal research. The master prompt's "crypto testnet already wired in YURI" is **wrong** — budget testnet wiring as new work if you want it (it's optional for P0; ES via Databento is the proof wedge).

---

## 2. CONTROL PACKET (satisfies the protocol gate — this is your mutation contract)

- **Goal:** a DISARMED paper orderflow+quant system where an IC spine is live, OFI/OBI/footprint/GEX are ported+built onto nautilus/Databento, IBKR paper executes nautilus orders, and walk-forward + HLZ t≈3 clears out-of-sample before any scale.
- **Target files / dirs:** new modules under `_SYSTEM/Scripts/alpha-factor-library/` (IC spine, footprint/AMT, GEX, instrument layer, a `databento-recorder.mjs` or `nautilus-bridge/`), a Python nautilus dev env (venv/uv, NOT committed), IB Gateway docker config. Do NOT modify the venue-agnostic reuse modules except at their documented seams.
- **Constraints:** DISARMED-first (every new mechanism ships behind an unset flag; arming is owner-gated); explicit-pathspec commits only (never `git add .`/bare commit); free-first ($0 in P0–P2, only the $125 Databento credit wedge); protected paths off-limits (`.env`, `node_modules`, `.claude/state`, `backend/data`); capability-first (`capability-recall` before any new primitive, `@capability` tag + `capability-scan` to register).
- **Acceptance (per phase, in §3).** First-run success is a hypothesis — attack it with negative/mismatch tests; out-of-sample DSR must clear HLZ t≈3 before any scale claim.
- **Test command:** the AFL suite — `node --test _SYSTEM/Scripts/alpha-factor-library/*.test.mjs` (extend it; add red/grey/green tests for each new module). Python: `pytest` on the nautilus strategy nodes. Verify against LIVE runtime (a real Databento MBP-10 replay), not happy-path.
- **Rollback boundary:** git revert per-phase commit; unset the DISARMED flag; delete the Python venv. No durable external side-effect until P4 (owner-gated live).

---

## 3. PHASING (corrected — build order baked in)

### P0 — dev env + IC spine + book seam (DISARMED paper)
1. `capability-recall "<need>"` before each new primitive (IC, footprint, GEX, recorder).
2. Bring up the nautilus v2 dev env (§4 install). Confirm import + a trivial `OrderBook` roundtrip.
3. Get a Databento account, claim the **$125 credit**, pull a SMALL ES MBP-10 slice first (GB-per-credit is UNVERIFIED — don't backfill big before you measure cost). Dataset `GLBX.MDP3`.
4. Write the **new tape-recorder** (C3): nautilus `OrderBookDelta`/Databento MBP-10 → the existing JSONL contract. Verify `tape-replay.mjs` consumes it unchanged.
5. Port **OFI/OBI** by re-pointing the upstream snapshot builder (they're pure math — no rewrite).
6. Build the **IC spine** (C2): per-symbol, per-horizon `IC = corr(signal_t, fwd_return_{t+h})` (Spearman rank-IC primary), IC decay across the horizon ladder, `IR = IC × √breadth`. Feed the series into the EXISTING `factor-evaluator.deflatedSharpe` (gate `dsr>0.95`) + `benjaminiHochberg`.
7. **Report** dev-env bring-up + first IC-spine result on real ES data **before P1** (checkpoint per master prompt).

### P1 — footprint/AMT + GEX + IB paper
1. Footprint/AMT value-area composites on MBP-10: bid/ask **delta** per price, **CVD**, **POC** (max-volume price), **value area** (70%-of-volume band around POC), **composite VA** (multi-session). Atop the ported OFI/OBI.
2. **GEX** self-computed from the OPRA chain: `GEX = Σ gamma × OI × 100 × spot² × 0.01 × sign`. **Sign: calls = +1, puts = −1** (Lane D: dealers short calls → hedge long-gamma = +; short puts → hedge short-gamma = −). Databento ships **no greeks** → compute IV (Black–Scholes + Newton/bisection on OPRA `mbp-1` NBBO mids) then closed-form BS gamma; OI from the `statistics` schema. Naive sign assumes all OI is customer-initiated — flag it, gate any GEX factor through DSR/BH like any other.
3. IB paper wiring (§5): `ghcr.io/gnzsnz/ib-gateway:stable`, paper port **4002**, `TIME_ZONE=Etc/UTC`, `market_data_type=DELAYED_FROZEN` for the dev loop (REALTIME needs a paid sub). Route a nautilus paper order end-to-end.

### P2 — ensemble + sizing + walk-forward gate
1. Ensemble the orderflow + GEX + IC signals (reuse `ensemble.mjs`).
2. CVaR sizing (reuse `trade-decision-sim.mjs`).
3. **Walk-forward** with **purge + embargo** (López de Prado) to kill leakage; anchored or rolling.
4. **HLZ multiple-testing gate**: t≈3 on **held-out data only**; increment `nTrials` every dev-cycle inspection of the held-out split (or the gate is theater). **Add BHY (Benjamini–Yekutieli)** alongside BH — orderflow/GEX factors share the same tape, so they are NOT independent and plain BH under-controls.

### P3 (deferred) / P4 (owner-gated live) — do not touch this build.

---

## 4. COPY-READY FACTS (verified — cite the lane doc for detail)

**Install (Lane A):**
```
uv pip install --pre --index-url=https://packages.nautechsystems.io/v2/simple/ nautilus-trader
```
v2.0.0rc1 (PyPI 2026-06-29), **no Rust toolchain** for the wheel path, macOS ARM64 officially supported. **No `[databento]` extra — Databento ships in core.** ⚠️ UNVERIFIED: confirm an arm64 wheel is actually published on the v2 index (`metadata.list_schemas` / a dry install check) before assuming.

**Order book (Lane A):** `OrderBookDelta`, `OrderBookDeltas`, `OrderBookDepth10`, `BookOrder`, `OrderBook` in `nautilus_trader/model/data.pyx` + `model/book.pyx`. Databento mapping: MBO→`OrderBookDelta`, **MBP_10→`OrderBookDepth10`**, MBP_1/BBO→quote.

**Instruments (Lane A):** `Equity`, `FuturesContract`, **`OptionContract`** (NOT `OptionsContract`) in `nautilus_trader/model/instruments/`.

**Strategy/Actor (Lane A):** `Actor.subscribe_order_book_deltas/_depth/_at_interval` + `on_order_book_deltas`/`on_order_book` handlers; `Strategy.submit_order` — `common/actor.pyx`, `trading/strategy.pyx`.

**IB Gateway docker (Lane E):** `ghcr.io/gnzsnz/ib-gateway:stable` (nautilus's hardcoded default). Paper **4002**→container 4004; live 4001→4003; bind `127.0.0.1`. `TIME_ZONE=Etc/UTC` mandatory. Creds env differ by path: `TWS_USERNAME`/`TWS_PASSWORD` (nautilus-managed) vs `TWS_USERID`/`TWS_PASSWORD` (standalone compose) — don't cargo-cult the wrong one.

**Quant gates (Lane D):** DSR gate `dsr > 0.95` (`factor-evaluator.deflatedSharpe`, verified term-for-term). Feed it: `sharpePeriod` (NOT annualized), true `nTrials`, actual skew/kurtosis. HLZ t≈3 held-out only. Add BHY for correlated fleets.

**CME instruments (Lane E):** ES/NQ/RTY/YM (CME) + CL/NG (NYMEX) table with multiplier/tick/tick-value in the lane doc. ⚠️ UNVERIFIED: YM's exact IB exchange string.

---

## 5. RESIDUAL RISK / UNVERIFIED (honest — verify before trusting)
- nautilus v2 arm64 wheel actually published on the v2 index (Lane A).
- OPRA.PILLAR schema coverage for SPX/SPY options depth on Databento — run a live `metadata.list_schemas` before assuming MBO/MBP-10 exists there (Lane A).
- Databento GB-per-$125-credit for MBP-10 — measure with a small pull first (Lane C).
- nautilus v2 is a RELEASE CANDIDATE — track breaking changes 1.x→2.0 on the OrderBook/adapter surfaces.
- IBKR paper `REALTIME`-without-subscription exact failure mode; YM IB exchange string (Lane E).
- GEX naive dealer-sign is an approximation (assumes all OI customer-initiated) — cross-check against SpotGamma before trusting levels.

---

**Start at P0. Report dev-env bring-up + first IC-spine result on real ES data before P1. Commit each phase (explicit pathspec); push your own work; report changed files + checks + residual risk per phase.**
