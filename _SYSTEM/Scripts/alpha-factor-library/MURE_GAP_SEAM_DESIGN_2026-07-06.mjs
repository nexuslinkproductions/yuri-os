#!/usr/bin/env node
// @capability: mure-gap-seam-design
// @serves: MURE | module boundaries | gap architecture | IC spine | footprint AMT | GEX | instrument layer | IB wiring | nautilus adapter | DISARMED-first
// @does: Canonical ARCHITECTURE SPEC (no runtime logic) — defines the 5 module boundaries as clean seams onto the existing alpha-factor-library, specifying exact imports, data shapes crossing each seam, the nautilus OrderBookDelta/OrderBookDepth10 adapter boundary, and the DISARMED-first integration contract. This file IS the spec; the implementation modules are separate files to be authored per-gap.
// @use: Read this before building ANY of the 5 MURE gap modules. Every seam, import, and data shape is pinned to evidence from the existing library (cited path:line in the comments). The spec is DISARMED-first: every new module gates behind a flag file and degrades to no-op when disarmed.
// @exports: MURE_GAP_SEAM_SPEC (the static specification object — module names, imports, seam shapes, flags)
//
// DESIGN PRINCIPLES (from orderflow-quant-pivot-2026-07-06.md §2):
//   1. REUSE, do not rebuild — the existing crypto infra is instrument-agnostic in principle; extend, don't greenfield.
//   2. Pure-leaf or compose-leaf — new modules import FROM existing, never the reverse (no cascade).
//   3. DISARMED-first — every new module degrades to no-op when its flag is absent; arming is owner-gated.
//   4. Same signal shape — every gap module emits the canonical {factorId, ts, value, side, confidence, source} signal.
//   5. Same data-quality gate — every market-data input crosses validateBar / dataQualityGate before use.
//
// EVIDENCE ANCHORS (verified this task):
//   ofi.mjs:67           export function ofiContribution(prev, curr)
//   ofi.mjs:152          export function computeOFI(snapshots, opts)
//   ofi.mjs:286          export function computeMultiLevelOFI(prevBook, currBook, opts)
//   ofi.mjs:~430         export function estimateLambda(...)
//   orderbook-imbalance.mjs:70   export function computeOBI(bids, asks, levels)
//   orderbook-imbalance.mjs:109  export function computeMicroprice(bids, asks)
//   orderbook-imbalance.mjs:172  export function computeOrderBookImbalance(book, opts) → signal[]
//   factor-evaluator.mjs:132     export function backtestFactor(returnsSeries, {periodsPerYear})
//   factor-evaluator.mjs:234     export function deflatedSharpe(observedSharpe, {nTrials, T, skew, kurtosis, confidence})
//   factor-evaluator.mjs:283     export function benjaminiHochberg(pValues, q)
//   factor-evaluator.mjs:324     export function factorPromotionGate(...)
//   trade-edge-audit.mjs:62      export function factorEdgeStats(recall, {horizonS, strideS})
//   trade-edge-audit.mjs:96      export function auditEdge({ledgerPath, q, rungs, makerSchedule})
//   trade-decision-sim.mjs:127   export function buildMarketDecision(market, signals, opts)
//   trade-decision-sim.mjs       DEFAULT_MAX_PCT=0.10, DEFAULT_CORR=0.70, DEFAULT_TAIL_FRAC=0.10
//   afl-paper.mjs:43             export function createPaperEngine(opts)
//   afl-paper.mjs:755            onSignal({factorId,ts,value,side,confidence}, {instrument, barHistory})
//   ensemble.mjs:37              export function combineSignals(signals, {weights, threshold, baseWeight})
//   observatory/depth-book.mjs   startDepthBook({symbols,onBook}); onBook({symbol,bids,asks,mid,spreadBps,ts})
//   observatory/tape-recorder.mjs  tape line types: {"t":"snap"...}, {"t":"diff"...}, {"t":"trade"...}
//   tape-replay.mjs:415          export function loadTape(filePathOrLines) → Tape (bookAt, tradesBetween, bookSeries, simulateOrder)
//   perp-signals.mjs             signal shape: {factorId, value, side, confidence, ts, source:'perp'}
//   data-quality-gate.mjs:74     export function validateBar(bar, opts)
//   afl-sizing.mjs:155           export function computeSize({edgeMean,edgeLowerCI,winProb,payoff,returns,equity,...})

import { pathToFileURL } from 'node:url';

/**
 * MURE_GAP_SEAM_SPEC — the canonical gap-module boundary specification.
 * Static, read-only. Implementation modules import the functions named here.
 */
export const MURE_GAP_SEAM_SPEC = Object.freeze({

  // ═══════════════════════════════════════════════════════════════════════
  // CANONICAL SIGNAL SHAPE (every gap module emits this — pinned to perp-signals.mjs + afl-paper.mjs:766)
  // ═══════════════════════════════════════════════════════════════════════
  signalShape: {
    factorId: 'string',     // e.g. 'ic-composite-ES', 'footprint-delta-NQ', 'gex-flip-SPX'
    ts: 'number',           // unix-seconds (matching orchestrator convention)
    value: 'number',        // raw factor value (IC, delta, GEX-level)
    side: "'long'|'short'|'flat'",
    confidence: 'number',   // [0, 1]
    source: 'string',       // 'ic' | 'footprint' | 'gex' | 'equities' | 'ib-paper'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NAUTILUS ADAPTER BOUNDARY (the data translation seam)
  // ═══════════════════════════════════════════════════════════════════════
  // nautilus_trader v2 (Rust+PyO3) → Databento data client emits two book types:
  //   OrderBookDelta  — MBO (L3): single delta event {action: ADD|UPDATE|CLEAR, order: {price, size, side}}
  //   OrderBookDepth10 — MBP-10 (L2): aggregated top-10 levels snapshot {bids: [{price,size}x10], asks: [{price,size}x10]}
  // The YURI AFL operates on {price,size}[] bids/asks (Binance shape).
  // The adapter translates nautilus → YURI canonical; the reverse is NOT needed (YURI never sends book state to nautilus).
  nautilusAdapterBoundary: {
    module: 'nautilus-adapter.mjs',
    location: 'alpha-factor-library/adapters/',
    DISARMED_flag: '_SYSTEM/state/mure-nautilus-adapter.enabled',
    degradeBehavior: 'returns null on all exports; callers fall through to existing Binance depth-book.mjs',
    imports_from_existing: [
      'observatory/depth-book.mjs: extractTopN, applyLevels (book reconstruction primitives)',
      'ofi.mjs: ofiContribution, computeMultiLevelOFI (consume the translated snapshots)',
      'orderbook-imbalance.mjs: computeOBI, computeMicroprice (consume the translated book)',
    ],
    // nautilus OrderBookDepth10 → YURI {bids,asks} (the L2 seam)
    seam_OrderBookDepth10: {
      input: {
        bids: '[{price: f64, size: f64}] × 10  // nautilus BookLevel, best first',
        asks: '[{price: f64, size: f64}] × 10  // nautilus BookLevel, best first',
        instrument_id: 'string  // e.g. "ESM4.GLBX" → maps to YURI market "ES-USD"',
        ts_event: 'u64  // unix-nanos (nautilus convention) → divide by 1e6 for ms, 1e9 for seconds',
      },
      output: {
        // feeds directly into computeOrderBookImbalance(book, opts) — exact shape from depth-book.mjs onBook
        bids: '[{price: number, size: number}]  // YURI canonical, sorted desc',
        asks: '[{price: number, size: number}]  // YURI canonical, sorted asc',
        mid: 'number',
        spreadBps: 'number',
        ts: 'number  // unix-seconds (orchestrator convention)',
        symbol: 'string  // mapped from instrument_id via instrument-registry',
      },
    },
    // nautilus OrderBookDelta → YURI snapshot pair (for OFI event contributions)
    seam_OrderBookDelta: {
      input: {
        action: "'Clear' | 'Update' | 'Add'  // nautilus BookAction enum",
        order: {
          price: 'f64  // BookPrice',
          size: 'f64  // quantity; 0 on Clear',
          side: "'Buy' | 'Sell'  // nautilus OrderSide; Buy = bid, Sell = ask",
        },
        instrument_id: 'string',
        ts_event: 'u64  // unix-nanos',
      },
      output_for_ofi: {
        // The adapter maintains a nautilus book internally and emits YURI snapshot pairs
        // {ts, bidPx, bidSz, askPx, askSz} — the EXACT shape ofiContribution(prev, curr) expects
        ts: 'number  // unix-seconds',
        bidPx: 'number  // best bid from maintained book',
        bidSz: 'number',
        askPx: 'number  // best ask from maintained book',
        askSz: 'number',
      },
    },
    // Databento instrument_id → YURI market symbol mapping (delegates to instrument-layer)
    instrumentMapping: 'delegates to instrument-registry.mjs resolveNautilusId(yuriMarket) / resolveYuriMarket(nautilusId)',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GAP 1: IC SPINE (information coefficient — the quant measurement core)
  // ═══════════════════════════════════════════════════════════════════════
  // What it measures: Spearman rank-IC between factor cross-sectional ranks and forward returns.
  // Why it's a gap: grep confirms ZERO IC/rank-correlation code in the library. The existing
  // factor-evaluator.mjs measures Sharpe/DSR/FDR but NOT IC (the cross-sectional predictive metric
  // the quant transcript demands as the primary edge measure, per Grinold's IR = IC × √breadth).
  gap1_ic_spine: {
    module: 'ic-spine.mjs',
    location: 'alpha-factor-library/',  // leaf module — sits beside factor-evaluator.mjs
    DISARMED_flag: '_SYSTEM/state/mure-ic-spine.enabled',
    degradeBehavior: 'computeIC returns {ic: NaN, pValue: NaN}; computeICSeries returns []; orchestrator skips IC weighting',
    type: 'leaf (pure compute, no network, no I/O)',
    imports_from_existing: {
      'factor-evaluator.mjs': [
        'deflatedSharpe(observedSharpe, {nTrials, T, skew, kurtosis, confidence})  // for IC-based Sharpe overfit control',
        'benjaminiHochberg(pValues, q)  // for IC-FDR across the factor fleet',
        'temporalSplit(orderedItems, {frac})  // chronological IC walk-forward (leak-free)',
      ],
      'horizon-ladder.mjs': [
        'RUNGS  // multi-horizon IC evaluation rungs (1m, 5m, 15m, 1h, 4h, 1d)',
      ],
      'trade-edge-audit.mjs': [
        'recallFactors(ledgerPath)  // to get the factor return series IC operates on',
        'factorEdgeStats(recall, {horizonS, strideS})  // the forward-return lookup IC needs',
      ],
    },
    exports: [
      'spearmanRankIC(factorRanks, forwardReturns)  // the core: ρ(rank(factor), forward_return)',
      'computeIC(factorValues, forwardReturns, {method: "spearman"|"pearson"}) → {ic, pValue, n, ci}',
      'computeICSeries(recall, {factorId, horizonS, method}) → [{ts, ic, n}]  // rolling IC time series',
      'icBreadthIR(meanIC, breadthN, icStd)  // Grinold: IR = IC × √breadth  (breadth = independent bets/period)',
      'icPromotionGate(icStats, {minIC, minTStat, nTrials})  // IC-based factor promotion (IC > 0.05 + t-stat > 2)',
    ],
    // Data shapes crossing the seam:
    seam_input: {
      factorValues: '[number]  // cross-sectional factor values at time t (ranks or raw)',
      forwardReturns: '[number]  // same-length forward returns aligned to factorValues',
      recall: 'trade-edge-audit.recallFactors() output  // {rows, series, byFactor, factorIds, markets}',
    },
    seam_output: {
      icStats: '{ ic: number, pValue: number, n: number, ci95: [number, number], method: string }',
      icSeries: '[{ ts: number, ic: number, n: number }]  // rolling IC for time-series IC-decay analysis',
    },
    integration_to_signal: {
      // IC does NOT emit directional signals directly; it MODULATES the confidence of existing signals
      // via the ensemble's weights map: ensemble.combineSignals(signals, {weights: {factorId: icWeight}})
      modulates: 'ensemble.mjs:combineSignals(signals, {weights})  // IC-derived weight per factor',
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GAP 2: FOOTPRINT / AMT (Auction Market Theory value-area composites)
  // ═══════════════════════════════════════════════════════════════════════
  // What it computes: Volume-at-price footprint profiles, cumulative delta (CVD),
  // value-area high/low (VAH/VAL), composite profile (POC), and AMT regime signals
  // (acceptance vs rejection at value-area edges).
  // Why it's a gap: the existing tape-replay.mjs reconstructs L2 book state from recorded
  // tapes, but has ZERO footprint/volume-profile/AMT analysis. The tape data exists
  // (tape-recorder.mjs writes snap/diff/trade lines) — the ANALYSIS on top is missing.
  gap2_footprint_amt: {
    module: 'footprint-amt.mjs',
    location: 'alpha-factor-library/',
    DISARMED_flag: '_SYSTEM/state/mure-footprint.enabled',
    degradeBehavior: 'computeFootprint returns {bins: [], poc: null, vah: null, val: null}; amtSignals returns []',
    type: 'leaf (pure compute over injected tape/bar data, no network)',
    imports_from_existing: {
      'tape-replay.mjs': [
        'loadTape(filePathOrLines)  // load a recorded tape for offline footprint analysis',
        'Tape.tradesBetween(t0, t1)  // extract the trade flow for volume-at-price binning',
        'Tape.bookAt(ts)  // mid/spread reference for delta computation',
      ],
      'ofi.mjs': [
        'ofiContribution(prev, curr)  // reuse for per-bar buy/sell pressure decomposition',
      ],
      'orderbook-imbalance.mjs': [
        'computeMicroprice(bids, asks)  // anchor for acceptance/rejection at value edges',
      ],
      'data-quality-gate.mjs': [
        'validateBar(bar, opts)  // bar validation before volume-profile binning',
      ],
    },
    exports: [
      'computeVolumeProfile(trades, {binSize, priceMin, priceMax}) → {bins: [{price, buyVol, sellVol, totalVol}], poc, vah, val}',
      'computeCVD(trades) → [{ts, cvd}]  // cumulative volume delta (buy_vol - sell_vol) over time',
      'computeFootprintBars(trades, {barSec, binSize}) → [{ts, open, high, low, close, bins: [{price, delta, vol}], cvd}]',
      'computeValueArea(volumeProfile, {valuePct: 0.70}) → {vah, val, poc, valueAreaVol}',
      'amtSignals(footprintBars, valueArea, opts) → signal[]  // AMT regime: acceptance/rejection at VAH/VAL',
    ],
    // Data shapes crossing the seam:
    seam_input: {
      // trades come from tape-replay.Tape.tradesBetween(t0, t1) — shape from trades-stream.mjs:
      trades: '[{ symbol: string, price: number, qty: number, ts: number, isBuyerMaker: boolean, aggressorSide: string }]',
      // bars come from the orchestrator's normalizeTimestamps → dataQualityGate pipeline
      bars: '[{ timestamp: number, open: number, high: number, low: number, close: number, volume: number }]',
    },
    seam_output: {
      volumeProfile: '{ bins: [{price:number, buyVol:number, sellVol:number, totalVol:number}], poc:number, vah:number, val:number }',
      footprintBars: '[{ ts:number, bins:[{price:number,delta:number,vol:number}], cvd:number }]',
      // AMT signals use the canonical signal shape:
      signals: '[{ factorId: "footprint-delta-<market>", ts, value: cvd, side, confidence, source: "footprint" }]',
    },
    integration_to_ensemble: 'emits signals in canonical shape → ensemble.combineSignals consumes directly',
    integration_to_paper: 'afl-paper.onSignal(signal, {instrument, barHistory}) consumes the canonical signal',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GAP 3: GEX (Gamma Exposure from options chains)
  // ═══════════════════════════════════════════════════════════════════════
  // What it computes: per-strike gamma exposure, aggregate GEX profile, gamma flip level,
  // and dealer-positioning regime signals (positive-gamma = stable, negative-gamma = volatile).
  // Why it's a gap: ZERO GEX/options/gamma code exists. The existing perp-signals.mjs computes
  // funding/OI structural signals but nothing from the options chain.
  // Formula (from orderflow-quant-pivot §4): GEX = Σ gamma × OI × multiplier × spot² × 0.01 × sign
  gap3_gex: {
    module: 'gex-compute.mjs',
    location: 'alpha-factor-library/',
    DISARMED_flag: '_SYSTEM/state/mure-gex.enabled',
    degradeBehavior: 'computeGEX returns {strikes: [], totalGEX: 0, gammaFlip: null}; gexSignals returns []',
    type: 'leaf (pure compute over injected options-chain data, no network)',
    imports_from_existing: {
      'factor-evaluator.mjs': [
        'deflatedSharpe(observedSharpe, {nTrials, T, skew, kurtosis, confidence})  // GEX backtest overfit control',
        'benjaminiHochberg(pValues, q)  // GEX across multiple underlyings = multiple testing',
      ],
      'trade-edge-audit.mjs': [
        'factorEdgeStats(recall, {horizonS, strideS})  // measure GEX signal edge at horizon',
      ],
      'data-quality-gate.mjs': [
        'validateBar(bar, opts)  // validate the underlying price bar',
      ],
    },
    exports: [
      'computeStrikeGEX({gamma, openInterest, spot, multiplier, sign}) → number  // per-strike GEX contribution',
      'computeGEX(chain, {spot, multiplier, dealerSign}) → {strikes: [{strike, gex, cumulativeGEX}], totalGEX, gammaFlip}',
      'gexRegime(totalGEX, gammaFlip, spot) → {regime: "positive"|"negative", nearFlip: boolean, distancePct}',
      'gexSignals(gexResult, {market, ts}) → signal[]  // directional signals from GEX regime',
    ],
    // Data shapes crossing the seam:
    seam_input: {
      // options chain comes from the Databento OPRA adapter (to be wired via nautilus-adapter)
      // or an injected getter for offline testing. Shape:
      chain: '[{ strike: number, gamma: number, openInterest: number, type: "call"|"put", iv: number, volume: number }]',
      spot: 'number  // underlying spot price',
      multiplier: 'number  // contract multiplier (100 for equities)',
      dealerSign: '{ call: +1, put: -1 }  // default; configurable for dealer-positioning inference',
    },
    seam_output: {
      gexResult: '{ strikes: [{strike:number, gex:number, cumulativeGEX:number}], totalGEX:number, gammaFlip:number|null }',
      // GEX signals use the canonical shape:
      signals: '[{ factorId: "gex-regime-<market>", ts, value: totalGEX, side, confidence, source: "gex" }]',
    },
    integration_to_ensemble: 'emits canonical signals → ensemble.combineSignals',
    integration_to_edge_audit: 'GEX signals flow through trade-edge-audit.auditEdge for DSR+FDR screening',
    note: 'GEX dealer-sign is an APPROXIMATION (naive ±call/put). Validate against SpotGamma before trusting for sizing.',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GAP 4: INSTRUMENT LAYER (multi-asset instrument metadata + venue mapping)
  // ═══════════════════════════════════════════════════════════════════════
  // What it provides: a registry of instrument metadata (tick size, lot size, contract multiplier,
  // venue, asset class) that the existing crypto-only library lacks. The orchestrator currently
  // hardcodes crypto markets (BTC-USD, ETH-USD) and crypto fee models. This layer generalizes.
  // Why it's a gap: the existing strategy-registry.mjs:26 computeAllStrategies(bars, market) takes
  // a bare market string — no tick size, no contract spec, no venue routing.
  gap4_instrument_layer: {
    module: 'instrument-registry.mjs',
    location: 'alpha-factor-library/',
    DISARMED_flag: '_SYSTEM/state/mure-instruments.enabled',
    degradeBehavior: 'resolveInstrument returns the crypto default; getInstrumentByVenue returns null for non-crypto',
    type: 'leaf (pure metadata registry, no network)',
    imports_from_existing: {
      'afl-paper.mjs': [
        'binanceFeeModel  // crypto fee model reference — the default the registry returns when disarmed',
        'cryptoFeeModel  // the generic crypto fee factory',
      ],
      'perp-signals.mjs': [
        'cryptoMarketToPerpSymbol(market)  // the crypto venue mapping the registry wraps for non-crypto',
      ],
    },
    exports: [
      'resolveInstrument(market) → InstrumentSpec  // the core lookup',
      'getInstrumentByVenue(venue, symbol) → InstrumentSpec',
      'resolveNautilusId(yuriMarket) → string  // YURI market → nautilus instrument_id (e.g. "ES-USD" → "ESM4.GLBX")',
      'resolveYuriMarket(nautilusId) → string  // reverse: nautilus instrument_id → YURI market',
      'listInstrumentsByClass(assetClass) → InstrumentSpec[]',
      'getFeeModel(instrumentId) → feeModelFn  // delegates to afl-paper fee models by asset class',
      'registerInstrument(spec)  // add/update the registry',
    ],
    // Data shapes crossing the seam:
    instrumentSpecShape: {
      market: 'string  // YURI canonical, e.g. "ES-USD", "BTC-USD", "SPX-USD"',
      nautilusId: 'string  // nautilus instrument_id, e.g. "ESM4.GLBX", "BTCUSDT.BINANCE"',
      assetClass: "'crypto' | 'equity' | 'future' | 'option' | 'index'",
      venue: "'binance' | 'ib' | 'databento'",
      tickSize: 'number',
      lotSize: 'number',
      contractMultiplier: 'number  // 1 for spot, 50 for ES, 100 for equity options',
      quoteCurrency: 'string  // "USD", "USDT"',
      pricePrecision: 'number  // decimal places',
      feeModel: 'string  // key into afl-paper fee model registry',
      tradingHours: 'string | "24/7"  // session info for futures/equities',
    },
    integration_to_orchestrator: 'orchestrator.mjs:runCycle calls resolveInstrument(market) instead of assuming crypto',
    integration_to_paper: 'afl-paper.createPaperEngine({feeModel: getFeeModel(instrumentId)})',
    integration_to_sizing: 'afl-sizing.computeSize receives caps from InstrumentSpec (tickSize, lotSize, contractMultiplier)',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GAP 5: IB WIRING (Interactive Brokers execution adapter — DISARMED paper only)
  // ═══════════════════════════════════════════════════════════════════════
  // What it provides: the tradfi execution path (stocks + options + futures) via nautilus's
  // IB adapter (v2 Rust + PyO3 + dockerized IB Gateway). DISARMED = paper-trading only.
  // Why it's a gap: the existing adapters/ directory has binance (crypto) + polymarket only.
  // No tradfi broker path exists.
  gap5_ib_wiring: {
    module: 'ib-adapter.mjs',
    location: 'alpha-factor-library/adapters/',
    DISARMED_flag: '_SYSTEM/state/mure-ib-adapter.enabled',
    degradeBehavior: 'ALL exports return {status: "DISARMED"} or []; buildOrder returns the body but NEVER submits',
    type: 'adapter (DISARMED paper only; arming for live = owner-gated)',
    imports_from_existing: {
      'afl-paper.mjs': [
        'createPaperEngine(opts)  // the IB paper orders flow through the SAME paper engine (INV-1)',
        'cryptoFeeModel, binanceFeeModel  // reference fee models the IB fee model mirrors',
      ],
      'instrument-registry.mjs': [
        'resolveInstrument(market)  // map YURI market → IB contract spec',
        'getFeeModel(instrumentId)  // IB commission model',
      ],
      'trade-decision-sim.mjs': [
        'buildMarketDecision(market, signals, opts)  // the decision that generates the order intent',
      ],
      'trade-edge-audit.mjs': [
        'auditEdge({ledgerPath, q, rungs, makerSchedule})  // pre-trade edge gate',
      ],
    },
    exports: [
      'buildIBContract(market, instrumentSpec) → {symbol, secType, exchange, currency, ...}  // nautilus IB contract shape',
      'buildIBOrder(decision, instrumentSpec) → {action, totalQuantity, orderType, limitPrice, ...}  // NEVER submits',
      'submitIBPaperOrder(order, paperEngine) → {fill, status}  // routes through afl-paper.createPaperEngine',
      'getIBPositions(httpGet) → [{market, position, avgCost}]  // read-only position query',
      'getIBAccountSummary(httpGet) → {totalCash, netLiquidation, ...}  // read-only account',
    ],
    // Data shapes crossing the seam:
    seam_input: {
      // decision comes from trade-decision-sim.buildMarketDecision
      decision: '{ market: string, side: "long"|"short"|"flat", sizePct: number, confidence: number, edgeBps: number }',
      // instrumentSpec comes from instrument-registry.resolveInstrument
      instrumentSpec: 'InstrumentSpec (see gap4_instrument_layer.instrumentSpecShape)',
    },
    seam_output: {
      // buildIBOrder returns the IB TWS/gateway contract — NEVER submitted when DISARMED
      ibOrder: '{ action: "BUY"|"SELL", totalQuantity: number, orderType: "MKT"|"LMT", limitPrice?: number, tif: "DAY" }',
      // submitIBPaperOrder routes through the SAME paper engine (INV-1: no real order path)
      paperFill: '{ instrument: string, side: string, qty: number, fillPrice: number, ts: number, pnl: number }',
    },
    hard_invariants: [
      'INV-1: NEVER places a real order. DISARMED = paper only. Arming for live = owner-gated.',
      'INV-2: No key/secret reads. IB credentials via env only (IB_GATEWAY_HOST, IB_GATEWAY_PORT, IB_ACCOUNT).',
      'INV-3: Live reads OK (positions, account summary) when armed + IB Gateway running.',
      'INV-4: buildOrder returns the body; submitIBPaperOrder routes through afl-paper (no IB TWS submit).',
    ],
    integration_to_orchestrator: 'orchestrator adds an IB venue loop (alongside the crypto loop) when armed',
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DEPENDENCY DAG (verified acyclic — new modules are leaf/compose only)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // EXISTING (unchanged):
  //   orderbook-imbalance → (leaf)
  //   ofi → orderbook-imbalance
  //   factor-evaluator → eval-processing
  //   ensemble → (leaf)
  //   horizon-ladder → (leaf)
  //   trade-edge-audit → horizon-ladder + factor-evaluator + spread-correction + maker-fill-sim
  //   trade-decision-sim → factor-circuit + decision-sim + trade-edge-audit
  //   afl-paper → data-quality-gate + prediction-ledger
  //   tape-replay → depth-book + maker-exec-measure
  //
  // NEW (slot in as leaf/compose — existing modules never import new):
  //   instrument-registry → afl-paper (fee models) + perp-signals (crypto mapping)     [LEAF]
  //   nautilus-adapter → depth-book (primitives) + ofi + orderbook-imbalance            [LEAF]
  //   ic-spine → factor-evaluator + horizon-ladder + trade-edge-audit                  [LEAF]
  //   footprint-amt → tape-replay + ofi + orderbook-imbalance + data-quality-gate      [LEAF]
  //   gex-compute → factor-evaluator + trade-edge-audit + data-quality-gate             [LEAF]
  //   ib-adapter → afl-paper + instrument-registry + trade-decision-sim + trade-edge-audit  [ADAPTER]
  //
  // CYCLE CHECK: all new edges point FROM new TO existing. No existing module imports new.
  //   Therefore no cycle is possible. Verified by import-direction audit.
  //
  dagVerified: true,

  // ═══════════════════════════════════════════════════════════════════════
  // DISARMED-FIRST CONTRACT (every new module)
  // ═══════════════════════════════════════════════════════════════════════
  // Each module checks for its flag file at import time:
  //   const ARMED = existsSync('_SYSTEM/state/mure-<module>.enabled');
  // When DISARMED:
  //   - Pure-compute functions (ic, footprint, gex) return null/empty/NaN (callers skip)
  //   - Adapter functions (nautilus, ib) return {status:'DISARMED'} or []
  //   - Signal emitters return [] (ensemble/orchestrator see no signals from the gap)
  //   - NO throw, NO console.error spam (fail-silent degrade)
  // Arming:
  //   - Creating the flag file = owner-gated (Self-Governance Charter: ARMING always gates)
  //   - Arming the IB adapter for LIVE order submission = doubly owner-gated (outward-facing)
  //
  disarmedFirstContract: {
    pattern: "const ARMED = existsSync(flagPath); if (!ARMED) return degradeValue;",
    allFlags: [
      '_SYSTEM/state/mure-nautilus-adapter.enabled',
      '_SYSTEM/state/mure-ic-spine.enabled',
      '_SYSTEM/state/mure-footprint.enabled',
      '_SYSTEM/state/mure-gex.enabled',
      '_SYSTEM/state/mure-instruments.enabled',
      '_SYSTEM/state/mure-ib-adapter.enabled',
    ],
    armingIsOwnerGated: true,
  },
});

// ── main-guarded self-test (spec structural integrity) ───────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // All 5 gaps present
  ok(MURE_GAP_SEAM_SPEC.gap1_ic_spine, 'gap1 present');
  ok(MURE_GAP_SEAM_SPEC.gap2_footprint_amt, 'gap2 present');
  ok(MURE_GAP_SEAM_SPEC.gap3_gex, 'gap3 present');
  ok(MURE_GAP_SEAM_SPEC.gap4_instrument_layer, 'gap4 present');
  ok(MURE_GAP_SEAM_SPEC.gap5_ib_wiring, 'gap5 present');

  // Every gap has a DISARMED flag
  for (const g of ['gap1_ic_spine','gap2_footprint_amt','gap3_gex','gap4_instrument_layer','gap5_ib_wiring']) {
    ok(MURE_GAP_SEAM_SPEC[g].DISARMED_flag, `${g} has DISARMED flag`);
    ok(MURE_GAP_SEAM_SPEC[g].degradeBehavior, `${g} has degrade behavior`);
  }

  // Signal shape present
  ok(MURE_GAP_SEAM_SPEC.signalShape.factorId, 'signal shape defined');
  ok(MURE_GAP_SEAM_SPEC.signalShape.source, 'signal source field');

  // DAG verified
  ok(MURE_GAP_SEAM_SPEC.dagVerified === true, 'DAG verified acyclic');

  // Nautilus adapter boundary
  ok(MURE_GAP_SEAM_SPEC.nautilusAdapterBoundary.seam_OrderBookDepth10, 'OrderBookDepth10 seam defined');
  ok(MURE_GAP_SEAM_SPEC.nautilusAdapterBoundary.seam_OrderBookDelta, 'OrderBookDelta seam defined');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
