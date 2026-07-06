# Lane B — Exact Reuse-Surface Inventory: alpha-factor-library

All paths relative to `_SYSTEM/Scripts/alpha-factor-library/`. Read directly (Read/Grep), no
subagents, no online lookup, per dispatch constraints. Every claim below is anchored to an
exact file:line read in this session (2026-07-06).

---

## 1. `ofi.mjs` — Cont-Kukanov-Stoikov order-flow imbalance

**Exports** (`ofi.mjs:6`):
```js
ofiContribution(prev, curr) -> { e, crossedBook, skipped, bidContrib, askContrib }   // ofi.mjs:62
computeOFI(snapshots, opts) -> { ofi, sign, bucketsUsed, avgDepth, normalize }        // ofi.mjs:155
computeMultiLevelOFI(prevBook, currBook, opts) -> { ofi, levels, weights, perLevel, sign } // ofi.mjs:339
estimateLambda(pairs, minWindow=30) -> { lambda, alpha, rSquared, n }                 // ofi.mjs:399
```

**Input shape (Binance-shaped but exchange-agnostic field names):**
- `ofiContribution`/`computeOFI`: snapshot = `{ ts, bidPx, bidSz, askPx, askSz }` (best-level only) — `ofi.mjs:45-51`.
- `computeMultiLevelOFI`: `prevBook`/`currBook` = arrays of per-level objects `{bidPx,bidSz,askPx,askSz}`, top-of-book first — `ofi.mjs:306-310`. Explicitly documented as "the same `{price,size}[]` shape bookAt/extractTopN return, mapped to the ofiContribution field names" (`ofi.mjs:308-309`) — i.e. this is a generic L2-book delta representation, NOT a Binance wire-format struct. No funding rate, no mark price, no perp-specific field anywhere in the module.
- `estimateLambda`: pure `{ofi, deltaMid}[]` pairs — asset/venue agnostic.

**Extension seam for Fable (nautilus `OrderBookDelta` / Databento):** the seam is the CALLER that builds the `{ts,bidPx,bidSz,askPx,askSz}` snapshot pair (or the per-level array) BEFORE calling `ofiContribution`/`computeMultiLevelOFI`. Nothing inside `ofi.mjs` reads a Binance wire type — it only consumes plain numeric fields. A Fable adapter needs to translate `nautilus_trader`'s `OrderBookDelta`/`OrderBookDeltas` (or a reconstructed L2 book snapshot from Databento MBP-10) into this `{bidPx,bidSz,askPx,askSz}` tuple per level, in chronological pairs. No internal code changes required — this is a pure math kernel over injected snapshots (module docstring `ofi.mjs:31-32`: "pure math over injected snapshots (no network, no I/O)").

---

## 2. `orderbook-imbalance.mjs` — OBI / microprice

**Exports** (`orderbook-imbalance.mjs:6`):
```js
DEFAULT_LEVELS = 10                                                    // orderbook-imbalance.mjs:26
DEFAULT_THRESHOLD = 0.2                                                 // orderbook-imbalance.mjs:33
OBI_CONFIDENCE_CAP = 0.60                                                // orderbook-imbalance.mjs:40
computeOBI(bids, asks, levels=10) -> number|NaN                          // orderbook-imbalance.mjs:61
computeMicroprice(bids, asks) -> number|NaN                              // orderbook-imbalance.mjs:104
obiToSignals(obi, microprice, book, opts) -> signal[]                     // orderbook-imbalance.mjs:150
computeOrderBookImbalance(book, opts) -> signal[]                        // orderbook-imbalance.mjs:218
```

**Input shape:** `bids`/`asks` = `{price:number, size:number}[]`, best level at index 0 (`orderbook-imbalance.mjs:56-59`). Top-level `computeOrderBookImbalance(book, opts)` expects `book = { bids, asks, mid, spreadBps }` (`orderbook-imbalance.mjs:214`). This is a GENERIC L2 snapshot shape — no Binance-specific field, no funding/mark coupling. Comment explicitly notes "crypto perp book signal" in `@serves` (`orderbook-imbalance.mjs:3`) but the code itself is venue-agnostic; the crypto framing lives only in the `factorId` string template (`crypto-obi-<market>`, `orderbook-imbalance.mjs:168`) and the module's decay-caveat commentary (perp book refill dynamics), not in any parsing logic.

**Extension seam:** identical to `ofi.mjs` — the seam is upstream, at whoever builds the `{price,size}[]` bids/asks arrays. For nautilus, that means projecting `OrderBook.bids()`/`OrderBook.asks()` (or `book.bids_as_map()`) into `{price, size}` objects; for Databento, projecting MBP-10 levels the same way. The only crypto-specific artifact worth changing is the `factorId` template string prefix `crypto-obi-`/`crypto-microprice-` (`orderbook-imbalance.mjs:168,189`) — cosmetic, not structural.

---

## 3. `factor-evaluator.mjs` — deflatedSharpe, benjaminiHochberg, temporalSplit, factorPromotionGate, backtestFactor

**Exports** (`factor-evaluator.mjs:6`):
```js
backtestFactor(returnsSeries, {periodsPerYear=365}) -> {sharpe, mean, std, n, periodsPerYear, sharpePeriod}  // :132
temporalSplit(orderedItems, {frac=0.7}) -> {train, test}                                                      // :163
heldOutEvaluate(orderedReturns, {frac=0.7, periodsPerYear=365}) -> {inSampleSharpe, heldOutSharpe, optimismGap, nTrain, nTest, periodsPerYear} // :183
deflatedSharpe(observedSharpe, {nTrials, T, skew=0, kurtosis=3, confidence=0.95}) -> {dsr, sr0, passes, z, varSR} // :234
benjaminiHochberg(pValues, q=0.1) -> {rejected:boolean[], threshold, k}                                        // :283
factorPromotionGate({observedSharpe, nTrials, T, pValue, skew, kurtosis, confidence, fleetPValues, q}) -> {promote, reasons, dsr, sr0, fdr}  // :324
sequentialBacktestDecision(orderedReturns, {threshold=0, alpha=0.05, maxN}) -> {decision, nUsed, ci, range}     // :385
AFL_LEDGER, mapEvaluationToClaim, recordFactorForecast                                                         // :55, :430, :468
```

**Input shape:** ALL functions here take a plain `number[]` of per-period RETURNS (fractional, e.g. `0.0025`), not raw prices, ticks, or any exchange-specific object (`factor-evaluator.mjs:62-66` `finiteReturns` helper filters to `typeof x === 'number'`). No asset-class assumption anywhere — this module is pure statistics over an already-computed return series. `periodsPerYear` defaults to 365 (crypto 24/7 framing, `factor-evaluator.mjs:128-129`) — the ONE crypto-specific default; futures/equities would pass `252` (or a session-count-based value) explicitly.

**Extension seam for equities/futures/options:** none needed inside this module except overriding `periodsPerYear` per asset class (252 for equities/futures trading days, or explicit session-count for options). The return-series construction (price→return, forward-return alignment) happens entirely UPSTREAM in `trade-edge-audit.mjs`'s `factorEdgeStats` — that is the actual seam (see §4 below).

---

## 4. `trade-edge-audit.mjs` — multi-horizon scoring, deflated Sharpe, FDR

**Exports** (`trade-edge-audit.mjs:6`):
```js
RUNGS  (re-exported from horizon-ladder.mjs)                                                    // :30
recallFactors(ledgerPath) -> { rows, series: Map<market,[ts,price][]>, byFactor: Map, factorIds, markets }  // :38
factorEdgeStats(recall, {horizonS=3600, strideS=0}) -> Object<factorId,{n,mean,std,sharpe,tStat,pValue,hitRate,market}>  // :70
auditEdge({ledgerPath, q=0.1, rungs=RUNGS, makerSchedule='binance-vip0'}) -> {recall, selectionTrials, rungs, falsification, verdict}  // :116
```

**Input shape — THIS IS THE BINANCE-SPECIFIC SEAM:** `recallFactors` reads a JSONL "strategy-forecasts ledger" where each row is `{ factorId, market, ts, price, dir }` (`trade-edge-audit.mjs:44`, filtered by `r.factorId && isNum(r.ts) && isNum(r.price)`). This ledger format is exchange-agnostic in SHAPE (just factorId/market/ts/price/dir) but is currently populated ONLY from crypto perp forecasts written elsewhere in the AFL pipeline (the ledger path defaults to `_SYSTEM/state/strategy-forecasts.jsonl`, `trade-edge-audit.mjs:180`). `factorEdgeStats` pairs a forecast at `ts` with the SAME-market forward price at `ts+horizonS` (leak-free, `trade-edge-audit.mjs:73-77`) and computes `dir * (p1-price)/price` as the realized return — pure price-ratio math, no crypto-specific field (no funding, no mark price) anywhere in this computation.

Also imports and orchestrates (does not reimplement): `horizon-ladder.mjs` (RUNGS), `factor-evaluator.mjs` (deflatedSharpe, benjaminiHochberg), `spread-correction.mjs` (analyze, classifyFamily — bounce-family screen), `maker-fill-sim.mjs` (analyze — fee/queue falsification, `makerSchedule='binance-vip0'` default IS Binance-specific here, `trade-edge-audit.mjs:116`).

**Extension seam:** feed `recallFactors`/`factorEdgeStats` a ledger of `{factorId, market, ts, price, dir}` rows sourced from nautilus/Databento bars instead of the live crypto forecast writer — the shape is already generic. The ONE hardcoded crypto artifact to override per-call is `makerSchedule` (defaults `'binance-vip0'`, passed straight to `maker-fill-sim.mjs`'s `analyze`) — pass an equities/futures fee schedule instead, or omit the falsification section for asset classes where maker/taker fee modeling doesn't apply.

---

## 5. `trade-decision-sim.mjs` — factor-circuit optimization, CVaR sizing

**Exports** (`trade-decision-sim.mjs:6`):
```js
DEFAULT_MAX_PCT = 0.10, DEFAULT_CORR = 0.70                                                     // :27-28
recallSnapshot(ledgerPath) -> { rows, byFactor: Map<factorId,row>, byMarket: Map<market,row[]>, factorIds, markets }  // :51
buildMarketDecision(market, signals, opts) -> { market, side, sizePct, confidence, orderOptimalSequence, circuitQuality, edgeBps, rationale, circuit }  // :119
decideTrades({ledgerPath, maxPct, corr, tailFrac, draws, circuitOpts}) -> { decisions, verdict, recall }  // :188
```

**Input shape:** same ledger row shape as trade-edge-audit — `{factorId, market, ts, price, dir}` (`trade-decision-sim.mjs:57`). Wraps `factor-circuit.mjs` (`optimizeFactorCircuit`), `../decision-sim.mjs` (`robustScore`, CVaR-style sizing), `spread-correction.mjs` (`classifyFamily`), and `trade-edge-audit.mjs` (`recallFactors`, `factorEdgeStats`) — orchestrates, does not reimplement (module docstring `trade-decision-sim.mjs:9-11`). `metaFromFactorId` (`trade-decision-sim.mjs:72-79`) reconstructs factor-circuit metadata (`category`, `correlation_cluster`, `data_inputs`, `sharpe_tier`) purely by string-pattern-matching the `factorId` — this is a heuristic reverse-engineering step, not an exchange dependency.

**Extension seam:** same ledger-shape seam as §4 — this module inherits it transitively via `recallSnapshot`/`recallFactors`. `ROUND_TRIP_COST = 0.0005` (`trade-decision-sim.mjs:32`, "taker ~0.20% is the real floor") is a crypto-taker-fee-calibrated constant that should be parameterized per asset class (equities/futures round-trip costs differ materially). No other asset-class coupling found.

---

## 6. `afl-paper.mjs` — paper engine, Almgren-Chriss impact, fees, P&L, circuit breaker

**Exports** (`afl-paper.mjs:6`):
```js
cryptoFeeModel(role='taker', monthlyVolume=0) -> (venue,price,size)=>number       // :110  (Coinbase-tiered)
binanceFeeModel(role='taker', monthlyVolume=0) -> (venue,price,size)=>number      // :146  (Binance USDⓈ-M VIP-tiered)
liquidationPrice(side, avg, leverage, mmr=0.004) -> number|null                   // :179  (Binance perp isolated-margin formula)
predictionMarketFeeModel(c=1, rate=0.07) -> (venue,price,size)=>number            // :194  (Polymarket quadratic)
createPaperEngine(config) -> { ingestBar, submitPaperOrder, onSignal, mark, positions, pnl, snapshot, replay, closePosition }  // :339
```

**Input shape:** `ingestBar(bar, instrument='default')` expects canonical bar `{timestamp, open, high, low, close, volume}` (unix-seconds timestamp, `afl-paper.mjs:4,628`), validated via `validateBar` from `data-quality-gate.mjs` — this is a GENERIC OHLCV bar shape, not Binance-specific. `submitPaperOrder({venue, symbol, side, qty|notional, refPrice, book, adv})` (`afl-paper.mjs:691`) — also generic. `onSignal(signal, ctx)` consumes the same factor-signal shape as ensemble/combineSignals (`{factorId, side, confidence,...}`).

**THE actual crypto-specific coupling** (explicit, by design):
- Default `feeModel` fallback = `binanceFeeModel('taker')` (`afl-paper.mjs:362-364`) — "BINANCE-ONLY default... every live caller passes feeModel explicitly already."
- `caps.perpMode` / `caps.leverage` / `caps.maintenanceMarginRate` (`afl-paper.mjs:380-383`) — opt-in leveraged perp economics, default OFF (spot behavior unchanged when `perpMode` is false).
- `caps.fundingRates` (`Object<string,number>` instrument→hourly rate, `afl-paper.mjs:325,377`) — perp-specific funding cost model, applied only when populated.
- `liquidationPrice()` implements the Binance USDⓈ-M isolated-margin formula specifically (verified against Binance worked examples per the docstring, `afl-paper.mjs:171`).

**Extension seam:** `config.feeModel` is an explicit injectable parameter (`(venue,price,size)=>number`) — Fable passes an equities/futures/options commission model instead of `binanceFeeModel`/`cryptoFeeModel`. `caps.perpMode=false` (default) already disables all leverage/funding/liquidation machinery for a spot/equities/futures paper run — no code change needed, just don't set `perpMode:true` and don't populate `fundingRates`. `ingestBar`'s canonical `{timestamp,open,high,low,close,volume}` bar is exchange-agnostic and maps directly from a nautilus `Bar` object or Databento OHLCV record.

---

## 7. `ensemble.mjs` — weighted strategy fusion

**Exports** (`ensemble.mjs:11`): `combineSignals(signals, opts) -> {side, net, strength, confidence, longVotes, shortVotes, weightSum, contributors, top}` (`ensemble.mjs:39`), `DEFAULT_THRESHOLD=0.05` (`ensemble.mjs:20`).

**Input shape:** `signals = [{factorId, side:'long'|'short'|'flat', confidence, value,...}]` (`ensemble.mjs:25`) — pure asset-agnostic vote aggregation. Zero crypto coupling; `weights` object is per-factorId, supplied externally by "the slower Sonnet/learn-loop re-weighting beat" (`ensemble.mjs:6-9`).

**Extension seam:** none needed — fully generic. Reusable as-is for equities/futures/options ensemble fusion.

---

## 8. `horizon-ladder.mjs` — multi-horizon scoring + weight derivation

**Exports** (`horizon-ladder.mjs:6`): `RUNGS` (array of 6 rung defs, `horizon-ladder.mjs:18-25`), `scoreLadder({ledgerPath, rungs=RUNGS, maxW=3}) -> {rungs: Object<label,{horizonS,evaluated,dataAvailable,weights,stats}>}` (`horizon-ladder.mjs:32`), `writeLadderWeights({ledgerPath, outPath, rungs=RUNGS}) -> ladder` (`horizon-ladder.mjs:54`).

**Input shape:** wraps `strategy-weights.mjs`'s `scoreForecasts`/`deriveWeights`, which (per the same pattern as trade-edge-audit) reads the ledger `{factorId, market, ts, price, dir}` shape. `RUNGS` rung definitions (`15m`→`weekly`, with `feeHurdle` per rung: `0.0015` short horizons, `0.002`-`0.004` longer horizons — `horizon-ladder.mjs:19-24`) are calibrated to crypto taker-fee levels ("verified live" comment references a "multi-hour ledger").

**Extension seam:** `feeHurdle` per rung should be re-parameterized for equities/futures (commission/slippage floor is much lower than crypto taker fees) — this is a config change, not a structural rewrite. The rung `horizonS`/`minN`/`strideS` scaffolding is asset-agnostic.

---

## 9. `alpha-factor-store.mjs` — SQLite factor persistence

**Exports** (`alpha-factor-store.mjs:5`): `openDb`, `getFactor`, `listFactors`, `searchFactors` (FTS5 bm25), `upsertFactor`, `updateFactor`, `recordPerformance`, `getPerformance`, `addLineage`, `getLineage`, `getAncestors`.

**Input shape:** SQLite CRUD over `_SYSTEM/OS_KERNEL/alpha-factors.db`. Schema already includes `crypto_compatible` AND `polymarket_compatible` boolean columns (`alpha-factor-store.mjs:122-129`, `199-201`) — i.e. the factor schema is ALREADY designed to be multi-asset-class-tagged via boolean compatibility flags, not crypto-exclusive. `listFactors` filters on both flags independently.

**Extension seam:** the schema pattern (`<assetClass>_compatible` boolean column) is the precedent Fable should follow — e.g. add `equities_compatible`/`futures_compatible`/`options_compatible` columns (schema migration, not a code rewrite of this module) OR reuse `metadata_json`/`tags` (already JSON-serialized free-form columns, `alpha-factor-store.mjs:33,207`) to avoid a schema migration entirely for a first pass.

---

## 10. `observatory/tape-recorder.mjs` — tape capture

**Exports** (`tape-recorder.mjs:6`): `startRecorder`, `utcDateTag`, `buildSnapLine`, `buildDiffLine`, `buildTradeLine`, `fetchFullDepthSnap`.

**Input shape — HARD BINANCE COUPLING:** imports `startDepthBook, parseDiffDepthMessage, FSTREAM_WS_URL, FAPI_HOST` from `./depth-book.mjs` (`tape-recorder.mjs:18`) and `fetchFullDepthSnap` calls `https://${FAPI_HOST}/fapi/v1/depth?symbol=...` directly (`tape-recorder.mjs:86`) — this is Binance USDⓈ-M futures REST API, hardcoded. `startDiffStream` subscribes to `wss://fstream.binance.com/stream?streams=<sym>@depth@100ms` (via `FSTREAM_WS_URL`, `tape-recorder.mjs:158`). Output line shapes (`buildSnapLine`/`buildDiffLine`/`buildTradeLine`) are generic JSONL (`{t:'snap'|'diff'|'trade', ts, s, ...}`) but the DATA SOURCE feeding them is 100% Binance-specific.

**Extension seam:** this module is NOT reusable as-is for nautilus/Databento — it IS the Binance data-source adapter. Fable's nautilus/Databento equivalent is a NEW recorder module that produces the SAME output line shapes (`{t:'snap',ts,s,lastUpdateId,bids,asks}` / `{t:'diff',ts,s,U,u,pu,b,a}` / `{t:'trade',ts,s,a,p,q,m}`) but sources from `OrderBookDeltas`/`Bar`/`TradeTick` events instead of Binance WS frames. The JSONL tape FORMAT is the reusable contract; the WS/REST fetching code is not.

---

## 11. `observatory/trades-stream.mjs` — live trade stream

**Exports** (`trades-stream.mjs:6`): `FSTREAM_WS_URL`, `parseAggTrade`, `startTradesStream`.

**Input shape — HARD BINANCE COUPLING:** `FSTREAM_WS_URL = 'wss://fstream.binance.com'` (`trades-stream.mjs:15`); `parseAggTrade` parses Binance's `{e:'trade'|'aggTrade', s, p, q, T, t|a, m}` wire format specifically (`trades-stream.mjs:27-51`); `startTradesStream` subscribes to `<sym>@trade` channel on the Binance combined-stream endpoint (`trades-stream.mjs:79`).

**Extension seam:** same as tape-recorder — this IS the Binance adapter, not a reusable generic module. The reusable CONTRACT is the parsed output shape `{symbol, price, qty, ts, isBuyerMaker, aggressorSide, aggId}` (`trades-stream.mjs:18`) — a Fable nautilus/Databento trade-tick adapter should normalize to this same shape (`aggressorSide` derived from a maker-flag equivalent) so downstream consumers (`tape-recorder.mjs`'s `buildTradeLine`, `tape-replay.mjs`'s `classifyEvent`) need zero changes.

---

## 12. `tape-replay.mjs` — offline book reconstruction + fill sim

**Exports** (`tape-replay.mjs:5`): `loadTape(filePathOrLines) -> Tape`, `Tape` class with `bookAt(ts)`, `tradesBetween(t0,t1)`, `bookSeries(t0,t1,stepMs)`, `simulateOrder({side,price,size,joinTs,horizonSec,decayModel,queueDecay})` (`tape-replay.mjs:141,206,232,309`).

**Input shape:** consumes the GENERIC JSONL tape line shapes described in §10 (`{t:'snap'|'diff'|'trade',...}`) via `classifyEvent` (`tape-replay.mjs:79-108`) — venue-agnostic AS LONG AS the tape file conforms to that line shape. No Binance-specific parsing inside `tape-replay.mjs` itself — it operates purely on the already-normalized JSONL contract. Imports `applyLevels, extractTopN` from `./observatory/depth-book.mjs` (generic level-map application) and `newMakerOrder, onTrade, onBookUpdate` from `./maker-exec-measure.mjs` (queue-honest fill sim, also venue-agnostic).

**Extension seam:** NONE needed for replay/book-reconstruction logic itself — if Fable's new nautilus/Databento recorder emits the same `{t:'snap'|'diff'|'trade',...}` JSONL line shape, `tape-replay.mjs` works unchanged. This is the cleanest reuse boundary in the whole library: the tape FORMAT (not the recorder) is the true interchange contract.

---

## IC-GAP VERDICT

**Grep evidence (exhaustive, whole `alpha-factor-library/` including test files):**
```
grep -rniE '\bIC\b|information.?coefficient|informationCoefficient|rankIC|spearman|rank.?corr|Grinold|\bIR\b' \
  --include='*.mjs' .
```
→ **ZERO matches, anywhere, including `.test.mjs` files.** Confirmed by a second exhaustive pass (exit code 1, no output).

**What DOES exist (the only correlation infrastructure in the library):**
- Pearson correlation only, in exactly two places:
  1. `maker-exec-measure.mjs:379` — `function pearson(xs, ys)` used for OFI-predictivity harness (Pearson correlation(ofi, futureΔmid) per lag, R², directional hit-rate) — this is a PRICE-LEVEL diagnostic on ONE factor (OFI) vs forward returns, not a cross-sectional or time-series IC on the FACTOR RANKING library-wide.
  2. `../math-kernel.mjs`'s `pearson` (imported by `regime-detector.mjs:38`) — used for pairwise correlation-drift detection between series (regime-shift detection), not factor evaluation.
- `factor-scorer.mjs:120,172` references `maxPairwiseCorr` (1 − maxPairwiseCorr as a diversification-quality score) — factor-vs-portfolio correlation, not IC.
- `alpha-factor-store.mjs` has a `correlation_cluster` COLUMN (metadata tag, string cluster ID) — not a computed statistic.

**`factor-evaluator.mjs`'s `backtestFactor` — read the function body directly (`factor-evaluator.mjs:132-149`):** it streams the return series through `mkAggregator` (Welford online mean/std) and computes ONLY:
```
sharpePeriod = mean/std (if n>=2 and std>0)
sharpe = sharpePeriod * sqrt(periodsPerYear)
```
Returns `{sharpe, mean, std, n, periodsPerYear, sharpePeriod}` — **no IC, no rank correlation, no cross-sectional anything.** `deflatedSharpe` and `benjaminiHochberg` (the other two named functions in the critical question) operate purely on the Sharpe/p-value outputs of `backtestFactor` — they inherit the same gap; there is no rank-IC input anywhere in the promotion pipeline.

**VERDICT: the research doc's claim is CONFIRMED TRUE — IC/rank-IC computation is a genuine, currently-absent gap.** The entire factor-evaluation stack (`factor-evaluator.mjs` → `trade-edge-audit.mjs` → `trade-decision-sim.mjs` → `horizon-ladder.mjs`) is built exclusively on:
1. Sharpe ratio (mean/std of realized per-period returns), annualized.
2. Deflated/Probabilistic Sharpe (Bailey & Lopez de Prado False Strategy Theorem) as the single-strategy overfit control.
3. Benjamini-Hochberg FDR as the multiple-testing control across a factor fleet.
4. One-sided t-test p-value on mean forward return (`trade-edge-audit.mjs:101-102`) for per-factor significance.

None of these is an Information Coefficient (Spearman rank correlation between factor score and forward return) or an Information Ratio (Grinold's IC × breadth framework). **This is "the missing quant core" the research doc flagged, and it is real** — a Fable build agent extending this library for equities/futures/options (where cross-sectional factor ranking across a universe is the standard evaluation paradigm, unlike the single-market crypto-perp directional-signal framing this library was built for) will need to BUILD rank-IC / Spearman-IC / Grinold IR computation from scratch. There is no existing YURI mechanism to reuse or extend for this — capability-recall would return nothing (verified: zero hits).

**Recommended build location:** `factor-evaluator.mjs` is the correct existing seam to EXTEND (not replace) — it already has the `deflatedSharpe`/`benjaminiHochberg` overfit-control pattern; a new `rankIC(factorScores, forwardReturns)` / `informationRatio(icSeries, opts)` pair of functions belongs alongside `backtestFactor` in that same file, following its existing pure-math/fail-open/no-IO conventions (`factor-evaluator.mjs:35-37`).

---

## Cross-cutting seam summary (for the Fable build agent)

| Layer | Reusable as-is? | Seam |
|---|---|---|
| OFI/OBI math (`ofi.mjs`, `orderbook-imbalance.mjs`) | YES, fully | Upstream: build `{bidPx,bidSz,askPx,askSz}` / `{price,size}[]` from nautilus `OrderBookDelta`/Databento MBP |
| Factor evaluation (`factor-evaluator.mjs`) | YES for Sharpe/DSR/FDR; NO IC (must build) | `periodsPerYear` param only |
| Edge audit / decision sim (`trade-edge-audit.mjs`, `trade-decision-sim.mjs`) | YES, ledger shape already generic | Populate `{factorId,market,ts,price,dir}` ledger from nautilus backtest fills; override `makerSchedule`/`ROUND_TRIP_COST` |
| Paper engine (`afl-paper.mjs`) | YES, `perpMode` opt-in/off by default | Pass equities/futures `feeModel`; leave `perpMode:false`, don't populate `fundingRates` |
| Ensemble/ladder (`ensemble.mjs`, `horizon-ladder.mjs`) | YES, fully generic (ensemble); ladder needs `feeHurdle` re-cal | Reparameterize `feeHurdle` per rung |
| Factor store (`alpha-factor-store.mjs`) | YES, schema precedent for multi-asset flags | Add `<assetClass>_compatible` columns or reuse `metadata_json`/`tags` |
| Tape capture (`observatory/tape-recorder.mjs`, `observatory/trades-stream.mjs`) | NO — these ARE the Binance adapter | Build a NEW nautilus/Databento recorder emitting the SAME JSONL line contract |
| Tape replay (`tape-replay.mjs`) | YES, fully — zero Binance coupling | None — works unchanged if the new recorder matches the JSONL contract |
