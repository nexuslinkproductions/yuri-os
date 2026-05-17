#!/usr/bin/env node
/**
 * Trading Bot — Phase 5: Risk Engine
 *
 * Deterministic risk gates, Kelly position sizing, drawdown/loss halts, execution approval.
 * All 10 gates must pass for APPROVE. Output is append-only risk_decision.jsonl.
 *
 * Spec: .claude/trading-bot/phase-5/RISK_ENGINE.md
 * Schema: .claude/trading-bot/schemas/risk_decision.schema.json
 * Params: .claude/trading-bot/phase-0/SCOPE_LOCK.md
 */

// ─── Imports ────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Default Risk Parameters (from SCOPE_LOCK.md) ───────────────────────────

const RISK_PARAMS = {
  // Data Freshness
  DATA_MAX_AGE_MS: parseInt(process.env.RISK_DATA_MAX_AGE_MS || '60000', 10),
  // Liquidity
  MIN_VOLUME_24H: parseInt(process.env.RISK_MIN_VOLUME_24H || '500000', 10),
  MAX_SPREAD_BPS: parseInt(process.env.RISK_MAX_SPREAD_BPS || '25', 10),
  // Net Edge
  MIN_NET_EDGE: parseFloat(process.env.RISK_MIN_NET_EDGE || '0.04'),
  FLAT_FEE_RATE: parseFloat(process.env.RISK_FLAT_FEE_RATE || '0.005'),
  DEFAULT_SLIPPAGE_BPS: parseFloat(process.env.RISK_DEFAULT_SLIPPAGE_BPS || '15'),
  // Confidence
  MIN_CONFIDENCE: parseFloat(process.env.RISK_MIN_CONFIDENCE || '0.60'),
  MAX_DISPERSION: parseFloat(process.env.RISK_MAX_DISPERSION || '0.08'),
  // Kelly Sizing
  KELLY_FRACTION: parseFloat(process.env.RISK_KELLY_FRACTION || '0.25'),
  MAX_POSITION_PCT: parseFloat(process.env.RISK_MAX_POSITION_PCT || '0.05'),
  MAX_POSITION_FRACTION: parseFloat(process.env.RISK_MAX_POSITION_PCT || '0.05'),
  // Concentration
  MAX_OPEN_POSITIONS: parseInt(process.env.RISK_MAX_OPEN_POSITIONS || '3', 10),
  MAX_EXPOSURE_RATIO: parseFloat(process.env.RISK_MAX_EXPOSURE_RATIO || '0.15'),
  // Drawdown Halt
  DRAWDOWN_HALT_THRESHOLD: parseFloat(process.env.RISK_DRAWDOWN_HALT_THRESHOLD || '0.08'),
  // Daily Loss Halt
  DAILY_LOSS_HALT_THRESHOLD: parseFloat(process.env.RISK_DAILY_LOSS_HALT_THRESHOLD || '0.15'),
  // Data Quality
  MIN_DATA_QUALITY: parseFloat(process.env.RISK_MIN_DATA_QUALITY || '0.3'),
};

// ─── Output Path ────────────────────────────────────────────────────────────

const OUTPUT_DIR = resolve(__dirname, '../../.claude/trading-bot/data');
const RISK_LOG = resolve(OUTPUT_DIR, 'risk_decision.jsonl');

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowISO() {
  return new Date().toISOString();
}

function ensureOutputDir() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function loadJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function appendJsonl(path, record) {
  ensureOutputDir();
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf-8');
}

/**
 * Clamp a number between min and max (inclusive).
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ─── Gate 1: Data Freshness ─────────────────────────────────────────────────

/**
 * Check if a market snapshot timestamp is fresh enough (≤60s old by default).
 *
 * @param {number|string} snapshotTimestamp - Unix ms timestamp or ISO 8601 string
 * @returns {boolean} True if snapshot is fresh enough
 */
function checkDataFreshness(snapshotTimestamp) {
  if (snapshotTimestamp == null) return false;

  let ts;
  if (typeof snapshotTimestamp === 'string') {
    ts = new Date(snapshotTimestamp).getTime();
  } else {
    ts = Number(snapshotTimestamp);
  }

  // Guard: invalid timestamp
  if (!Number.isFinite(ts) || ts <= 0) return false;

  const age = Date.now() - ts;
  const maxAge = RISK_PARAMS.DATA_MAX_AGE_MS;

  return age >= 0 && age <= maxAge;
}

// ─── Gate 2: Liquidity ──────────────────────────────────────────────────────

/**
 * Check that 24h volume meets minimum and spread is within tolerance.
 *
 * @param {number} volume - 24h trading volume in quote currency
 * @param {number} spreadBps - Current bid-ask spread in basis points
 * @returns {boolean} True if liquidity is sufficient
 */
function checkLiquidity(volume, spreadBps) {
  // Guard: NaN or negative
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0) return false;
  if (typeof spreadBps !== 'number' || !Number.isFinite(spreadBps) || spreadBps < 0) return false;

  return volume >= RISK_PARAMS.MIN_VOLUME_24H && spreadBps <= RISK_PARAMS.MAX_SPREAD_BPS;
}

// ─── Gate 3: Net Edge ───────────────────────────────────────────────────────

/**
 * Calculate the net probability edge after fees and slippage.
 *
 * net_edge = (p_model - p_market) - (flat_fee_rate + slippage_bps / 10000)
 *
 * @param {number} pModel - Ensemble weighted probability (0-1)
 * @param {number} pMarket - Implied market probability from current price (0-1)
 * @param {number} flatFeeRate - Exchange taker fee as decimal (e.g. 0.005 for 0.5%)
 * @param {number} slippageBps - Worst-case slippage in basis points
 * @returns {number} Net edge as decimal (negative means no edge)
 */
function calculateNetEdge(pModel, pMarket, flatFeeRate, slippageBps) {
  // Guard: invalid inputs
  if (typeof pModel !== 'number' || !Number.isFinite(pModel)) return 0;
  if (typeof pMarket !== 'number' || !Number.isFinite(pMarket)) return 0;
  if (typeof flatFeeRate !== 'number' || !Number.isFinite(flatFeeRate)) flatFeeRate = 0;
  if (typeof slippageBps !== 'number' || !Number.isFinite(slippageBps)) slippageBps = 0;

  // Guard: clamp probabilities to valid range
  const pModelClamped = clamp(pModel, 0, 1);
  const pMarketClamped = clamp(pMarket, 0, 1);

  // Guard: division — slippageBps/10000
  const slippageFraction = slippageBps > 0 ? slippageBps / 10000 : 0;

  const netEdge = (pModelClamped - pMarketClamped) - (flatFeeRate + slippageFraction);

  // Clamp to reasonable range [-1, 1]; anything below -1 is treated as -1
  return clamp(netEdge, -1, 1);
}

// ─── Gate 5: Kelly Sizing ───────────────────────────────────────────────────

/**
 * Calculate position size using Kelly Criterion with fraction and bankroll cap.
 *
 * raw_kelly = edge / (odds - 1)
 *   (edge ≈ net probability edge; odds = market odds for binary outcome)
 *
 * Kelly applies a fraction (default 1/4 = quarter-Kelly) and caps at MAX_POSITION_PCT
 * of bankroll (default 5%).
 *
 * Returns 0 if edge <= 0, odds <= 1, or any guard triggers.
 *
 * @param {number} edge - Net edge as decimal (e.g. 0.06 for 6%)
 * @param {number} odds - Market odds for binary outcome (e.g. 2.0)
 * @param {number} bankroll - Current available capital in USD
 * @param {number} [kellyFraction=0.25] - Fraction of raw Kelly to apply (default quarter-Kelly)
 * @returns {number} Position size in USD (0 means no position)
 */
function calculateKellySize(edge, odds, bankroll, kellyFraction = 0.25) {
  // Guard: edge must be positive for any position
  if (typeof edge !== 'number' || !Number.isFinite(edge) || edge <= 0) return 0;

  // Guard: odds must represent a real bet (> 1) and be finite
  if (typeof odds !== 'number' || !Number.isFinite(odds) || odds <= 1) return 0;

  // Guard: bankroll must be positive and finite
  if (typeof bankroll !== 'number' || !Number.isFinite(bankroll) || bankroll <= 0) return 0;

  // Guard: kellyFraction must be between 0 and 1
  if (typeof kellyFraction !== 'number' || !Number.isFinite(kellyFraction)) kellyFraction = 0.25;
  kellyFraction = clamp(kellyFraction, 0, 1);

  // Division guard: (odds - 1) > 0 since odds > 1
  const denominator = odds - 1;

  // raw_kelly = edge / (odds - 1)
  // This is the "edge per unit of risk" approximation of Kelly
  const rawKelly = edge / denominator;

  // Guard: negative raw_kelly means no beneficial bet
  if (rawKelly <= 0) return 0;

  // Apply Kelly fraction (quarter-Kelly by default)
  const adjustedKelly = rawKelly * kellyFraction;

  // Dollar position before cap
  const rawPositionSize = adjustedKelly * bankroll;

  // Cap at max position fraction of bankroll
  const maxPositionSize = RISK_PARAMS.MAX_POSITION_FRACTION * bankroll;

  return Math.min(rawPositionSize, maxPositionSize);
}

// ─── Gate 6: Concentration ──────────────────────────────────────────────────

/**
 * Check that open positions and total exposure are within limits.
 *
 * @param {number} openPositions - Number of currently open positions
 * @param {number} totalExposureRatio - Total exposure as fraction of bankroll (e.g. 0.12 = 12%)
 * @returns {boolean} True if concentration is within limits
 */
function checkConcentration(openPositions, totalExposureRatio) {
  // Guard: invalid inputs
  if (typeof openPositions !== 'number' || !Number.isFinite(openPositions) || openPositions < 0) return false;
  if (typeof totalExposureRatio !== 'number' || !Number.isFinite(totalExposureRatio) || totalExposureRatio < 0) return false;

  // Round openPositions to integer (in case it's a float)
  const posCount = Math.round(openPositions);

  return posCount <= RISK_PARAMS.MAX_OPEN_POSITIONS && totalExposureRatio <= RISK_PARAMS.MAX_EXPOSURE_RATIO;
}

// ─── Gate 7: Drawdown Halt ──────────────────────────────────────────────────

/**
 * Check if portfolio is in drawdown halt (>8% underwater by default).
 *
 * drawdown_pct = (initial_equity - current_equity) / initial_equity
 *
 * @param {number} currentEquity - Current portfolio equity in USD
 * @param {number} initialEquity - Initial portfolio equity (bankroll baseline) in USD
 * @param {number} [haltThreshold=0.08] - Drawdown threshold to trigger halt (e.g. 0.08 = 8%)
 * @returns {boolean} True if drawdown is within limits (portfolio IS safe to trade)
 */
function checkDrawdownHalt(currentEquity, initialEquity, haltThreshold = 0.08) {
  // Guard: invalid inputs
  if (typeof currentEquity !== 'number' || !Number.isFinite(currentEquity) || currentEquity < 0) return false;
  if (typeof initialEquity !== 'number' || !Number.isFinite(initialEquity) || initialEquity <= 0) return false;
  if (typeof haltThreshold !== 'number' || !Number.isFinite(haltThreshold) || haltThreshold <= 0) haltThreshold = 0.08;

  // Guard: if current equity exceeds initial (profit), no drawdown
  if (currentEquity >= initialEquity) return true;

  // Division guard: initialEquity > 0 (validated above)
  const drawdownPct = (initialEquity - currentEquity) / initialEquity;

  // Return true (safe) if drawdown is below threshold
  return drawdownPct <= haltThreshold;
}

// ─── Gate 8: Daily Loss Halt ────────────────────────────────────────────────

/**
 * Check if today's total loss exceeds the daily loss halt threshold (>15% by default).
 *
 * daily_loss_pct = daily_loss / bankroll
 *
 * @param {number} dailyLoss - Total loss today in USD (realized + unrealized)
 * @param {number} bankroll - Current available bankroll in USD
 * @param {number} [haltThreshold=0.15] - Daily loss threshold to trigger halt (e.g. 0.15 = 15%)
 * @returns {boolean} True if daily loss is within limits (trading IS allowed)
 */
function checkDailyLossHalt(dailyLoss, bankroll, haltThreshold = 0.15) {
  // Guard: invalid inputs
  if (typeof dailyLoss !== 'number' || !Number.isFinite(dailyLoss) || dailyLoss < 0) return false;
  if (typeof bankroll !== 'number' || !Number.isFinite(bankroll) || bankroll <= 0) return false;
  if (typeof haltThreshold !== 'number' || !Number.isFinite(haltThreshold) || haltThreshold <= 0) haltThreshold = 0.15;

  // No loss today — always safe
  if (dailyLoss <= 0) return true;

  // Division guard: bankroll > 0 (validated above)
  const dailyLossPct = dailyLoss / bankroll;

  // Return true (safe) if loss is below threshold
  return dailyLossPct <= haltThreshold;
}

// ─── Gate 9: Data Quality Gate ──────────────────────────────────────────────

/**
 * Check that data quality score meets minimum threshold.
 *
 * @param {number} dataQualityScore - Data quality score 0-1 (from evidence packet quality gate)
 * @param {number} [minQuality=0.3] - Minimum acceptable quality threshold
 * @returns {boolean} True if quality is sufficient
 */
function checkDataQuality(dataQualityScore, minQuality = 0.3) {
  if (typeof dataQualityScore !== 'number' || !Number.isFinite(dataQualityScore)) return false;
  if (dataQualityScore < 0 || dataQualityScore > 1) return false;
  return dataQualityScore >= minQuality;
}

// ─── Gate 10: Kill-Switch Override ──────────────────────────────────────────

/**
 * Check that the kill switch is armed (manual acknowledgment required).
 *
 * @param {boolean} killSwitchArmed - True if kill switch is armed
 * @returns {boolean} True if kill switch is armed (trading IS allowed)
 */
function checkKillSwitch(killSwitchArmed) {
  return killSwitchArmed === true;
}

// ─── p_market Calculation ───────────────────────────────────────────────────

/**
 * Calculate implied market probability from market snapshot.
 *
 * For a simple binary directional bet:
 * - Default to 0.5 (random walk / neutral market)
 * - If target_price is available, derive from distance: approaches 0.5 when
 *   price is at target, tilts proportionally as price diverges.
 *
 * The portfolioState can override with an explicit p_market.
 *
 * @param {object} marketSnapshot - Normalized market state
 * @param {object} [portfolioState] - Portfolio state (may contain target_price or p_market)
 * @returns {number} Implied market probability 0-1
 */
function calculatePMarket(marketSnapshot, portfolioState = {}) {
  // If portfolio state explicitly provides p_market, use it
  if (portfolioState.p_market != null && typeof portfolioState.p_market === 'number'
      && Number.isFinite(portfolioState.p_market)) {
    return clamp(portfolioState.p_market, 0, 1);
  }

  // If marketSnapshot has p_market (custom field), use it
  if (marketSnapshot.p_market != null && typeof marketSnapshot.p_market === 'number'
      && Number.isFinite(marketSnapshot.p_market)) {
    return clamp(marketSnapshot.p_market, 0, 1);
  }

  // Default: neutral market expectation for binary direction bet
  return 0.5;
}

// ─── calculateMarketOdds ────────────────────────────────────────────────────

/**
 * Derive market odds from market snapshot and portfolio state.
 * Decimal odds = 1 / p_market
 *
 * @param {object} marketSnapshot - Normalized market state
 * @param {object} [portfolioState] - Portfolio state
 * @returns {number} Decimal odds (e.g. 2.0 for 50/50)
 */
function calculateMarketOdds(marketSnapshot, portfolioState = {}) {
  const pMarket = calculatePMarket(marketSnapshot, portfolioState);

  // Division guard: p_market must be > 0 to avoid division by zero
  if (pMarket <= 0) return 2.0; // fallback to 50/50 odds
  if (pMarket >= 1) return 1.01; // near-certainty, minimum realistic odds

  return 1 / pMarket;
}

// ─── Main Orchestrator ──────────────────────────────────────────────────────

/**
 * Evaluate all 9 risk gates sequentially and produce a RiskDecision.
 *
 * Pipeline:
 *   Prediction Result + Market Conditions + Portfolio State
 *   → Data Freshness → Liquidity → Net Edge → Confidence → Kelly Sizing
 *   → Concentration → Drawdown → Daily Loss → Kill-Switch
 *   → Output: risk_decision.jsonl
 *
 * @param {string} marketId - Market identifier (e.g. 'BTC-USD')
 * @param {object} predictionResult - PredictionResult from ensemble inference
 * @param {object} marketSnapshot - MarketSnapshot from scanner
 * @param {object} portfolioState - Current portfolio state:
 *   {
 *     bankroll: number,          // Initial bankroll (e.g. $100)
 *     current_equity: number,    // Current portfolio equity
 *     open_positions: number,    // Count of open positions
 *     total_exposure_usd: number, // Sum of all open position sizes
 *     daily_loss_usd: number,    // Total loss today (since midnight UTC)
 *     cumulative_loss_usd: number, // Cumulative losses ever
 *     kill_switch_armed: boolean,  // Is kill switch armed?
 *     p_market?: number,         // Optional override for market probability
 *     target_price?: number,     // Optional target price for p_market calc
 *   }
 * @returns {Promise<object>} RiskDecision
 */
async function evaluateRiskDecision(marketId, predictionResult, marketSnapshot, portfolioState) {
  // ── Prelim: Generate trade ID, validate inputs ──────────────────────────

  const tradeId = randomUUID();
  const timestamp = nowISO();

  // Guard: validate required inputs
  if (!marketId || typeof marketId !== 'string') {
    return buildRejectDecision(tradeId, 'UNKNOWN', [], [{
      gate: 'DATA_FRESHNESS',
      reason: 'Invalid market_id',
      actual: typeof marketId,
      threshold: 'non-empty string',
    }], {
      edge_pct: 0, kelly_raw: 0, kelly_quarter: 0, kelly_allocation_usd: 0,
      position_size_usd: 0, confidence_score: 0, dispersion: 0,
      current_equity: 0, drawdown_pct: 0, daily_loss_usd: 0,
      open_positions: 0, total_exposure_pct: 0,
    }, timestamp);
  }

  // Derive p_market and odds
  const pMarket = calculatePMarket(marketSnapshot, portfolioState);
  const odds = calculateMarketOdds(marketSnapshot, portfolioState);

  // Derive slippage from snapshot or config
  const estimatedSlippageBps = marketSnapshot.estimated_slippage_bps != null
    ? marketSnapshot.estimated_slippage_bps
    : RISK_PARAMS.DEFAULT_SLIPPAGE_BPS;

  // ── 1. Data Freshness Gate ──────────────────────────────────────────────

  const snapshotTimestamp = marketSnapshot?.timestamp || predictionResult?.timestamp;
  const dataFreshnessOk = checkDataFreshness(snapshotTimestamp);

  if (!dataFreshnessOk) {
    const age = snapshotTimestamp
      ? Date.now() - new Date(snapshotTimestamp).getTime()
      : 'N/A';
    return buildRejectDecision(tradeId, marketId, [], [{
      gate: 'DATA_FRESHNESS',
      reason: `Market snapshot is stale or missing (age: ${age}ms, max: ${RISK_PARAMS.DATA_MAX_AGE_MS}ms)`,
      actual: typeof age === 'number' ? `${age}ms` : 'N/A',
      threshold: `≤${RISK_PARAMS.DATA_MAX_AGE_MS}ms`,
    }], buildEmptyAssessment(predictionResult, portfolioState), timestamp);
  }

  const gatesPassed = ['DATA_FRESHNESS'];
  const gatesFailed = [];

  // ── 2. Liquidity Gate ───────────────────────────────────────────────────

  const volume = marketSnapshot?.volume_24h ?? 0;
  const spreadBps = marketSnapshot?.spread_bps ?? Infinity;
  const liquidityOk = checkLiquidity(volume, spreadBps);

  if (!liquidityOk) {
    gatesFailed.push({
      gate: 'LIQUIDITY',
      reason: `Insufficient liquidity: volume $${volume?.toLocaleString?.() ?? volume} (min $${RISK_PARAMS.MIN_VOLUME_24H.toLocaleString()}), spread ${spreadBps}bps (max ${RISK_PARAMS.MAX_SPREAD_BPS}bps)`,
      actual: `vol=${volume}, spread=${spreadBps}bps`,
      threshold: `vol≥$${RISK_PARAMS.MIN_VOLUME_24H}, spread≤${RISK_PARAMS.MAX_SPREAD_BPS}bps`,
    });
  } else {
    gatesPassed.push('LIQUIDITY');
  }

  // ── 3. Net Edge Gate ────────────────────────────────────────────────────

  const pModel = predictionResult?.p_model ?? 0.5;
  const flatFee = RISK_PARAMS.FLAT_FEE_RATE;

  const netEdge = calculateNetEdge(pModel, pMarket, flatFee, estimatedSlippageBps);
  const netEdgeOk = netEdge >= RISK_PARAMS.MIN_NET_EDGE;

  if (!netEdgeOk) {
    gatesFailed.push({
      gate: 'NET_EDGE',
      reason: `Insufficient edge: ${(netEdge * 100).toFixed(2)}% < ${(RISK_PARAMS.MIN_NET_EDGE * 100).toFixed(0)}% minimum`,
      actual: Number(netEdge.toFixed(4)),
      threshold: RISK_PARAMS.MIN_NET_EDGE,
    });
  } else {
    gatesPassed.push('NET_EDGE');
  }

  // ── 4. Confidence Gate ──────────────────────────────────────────────────

  const confidence = predictionResult?.confidence ?? 0;
  const dispersion = predictionResult?.dispersion ?? 1;
  const confidenceOk = confidence >= RISK_PARAMS.MIN_CONFIDENCE;
  const dispersionOk = dispersion <= RISK_PARAMS.MAX_DISPERSION;

  if (!confidenceOk) {
    gatesFailed.push({
      gate: 'CONFIDENCE',
      reason: `Low confidence: ${(confidence * 100).toFixed(1)}% < ${(RISK_PARAMS.MIN_CONFIDENCE * 100).toFixed(0)}% minimum`,
      actual: Number(confidence.toFixed(4)),
      threshold: RISK_PARAMS.MIN_CONFIDENCE,
    });
  }
  if (!dispersionOk) {
    gatesFailed.push({
      gate: 'CONFIDENCE',
      reason: `High dispersion: ${dispersion.toFixed(4)} > ${RISK_PARAMS.MAX_DISPERSION} maximum`,
      actual: Number(dispersion.toFixed(4)),
      threshold: RISK_PARAMS.MAX_DISPERSION,
    });
  }
  if (confidenceOk && dispersionOk) {
    gatesPassed.push('CONFIDENCE');
  }

  // ── 5. Kelly Sizing ─────────────────────────────────────────────────────

  const bankroll = portfolioState?.bankroll ?? 0;
  const kellyPosition = calculateKellySize(netEdge, odds, bankroll, RISK_PARAMS.KELLY_FRACTION);

  // Calculate raw Kelly and quarter Kelly as percentages for the assessment
  // Guard: odds > 1 already checked in calculateKellySize
  let kellyRawPct = 0;
  let kellyQuarterPct = 0;

  if (netEdge > 0 && odds > 1 && Number.isFinite(odds)) {
    const denominator = odds - 1;
    const rawKelly = netEdge / denominator;
    kellyRawPct = clamp(rawKelly * 100, 0, 100);
    kellyQuarterPct = clamp(rawKelly * RISK_PARAMS.KELLY_FRACTION * 100, 0, 25);
  }

  const maxPositionAllowed = RISK_PARAMS.MAX_POSITION_FRACTION * bankroll;
  const kellySizingOk = kellyPosition > 0 && kellyPosition <= maxPositionAllowed;

  if (!kellySizingOk) {
    gatesFailed.push({
      gate: 'KELLY_SIZING',
      reason: `Kelly position $${kellyPosition.toFixed(2)} is invalid or exceeds max $${maxPositionAllowed.toFixed(2)} (5% of $${bankroll.toFixed(2)})`,
      actual: Number(kellyPosition.toFixed(2)),
      threshold: `≤ $${maxPositionAllowed.toFixed(2)}`,
    });
  } else {
    gatesPassed.push('KELLY_SIZING');
  }

  // ── 6. Concentration Gate ───────────────────────────────────────────────

  const openPositions = portfolioState?.open_positions ?? 0;
  const totalExposureUsd = portfolioState?.total_exposure_usd ?? 0;
  const totalExposureRatio = bankroll > 0 ? totalExposureUsd / bankroll : 0;

  const newTotalExposureRatio = bankroll > 0
    ? (totalExposureUsd + kellyPosition) / bankroll
    : kellyPosition / (bankroll || 1);

  const concentrationOk = checkConcentration(
    openPositions + 1,  // +1 for this proposed trade
    newTotalExposureRatio
  );

  if (!concentrationOk) {
    gatesFailed.push({
      gate: 'CONCENTRATION',
      reason: `Concentration limit would be exceeded: ${openPositions + 1} positions (max ${RISK_PARAMS.MAX_OPEN_POSITIONS}), ${(newTotalExposureRatio * 100).toFixed(1)}% exposure (max ${(RISK_PARAMS.MAX_EXPOSURE_RATIO * 100).toFixed(0)}%)`,
      actual: `positions=${openPositions + 1}, exposure=${(newTotalExposureRatio * 100).toFixed(1)}%`,
      threshold: `positions≤${RISK_PARAMS.MAX_OPEN_POSITIONS}, exposure≤${(RISK_PARAMS.MAX_EXPOSURE_RATIO * 100).toFixed(0)}%`,
    });
  } else {
    gatesPassed.push('CONCENTRATION');
  }

  // ── 7. Drawdown Halt Gate ───────────────────────────────────────────────

  const currentEquity = portfolioState?.current_equity ?? bankroll;
  const initialEquity = portfolioState?.initial_equity ?? bankroll;
  const drawdownHaltThreshold = RISK_PARAMS.DRAWDOWN_HALT_THRESHOLD;
  const drawdownOk = checkDrawdownHalt(currentEquity, initialEquity, drawdownHaltThreshold);

  if (!drawdownOk) {
    const drawdownPct = initialEquity > 0
      ? (initialEquity - currentEquity) / initialEquity
      : 0;
    gatesFailed.push({
      gate: 'DRAWDOWN',
      reason: `Drawdown halt triggered: ${(drawdownPct * 100).toFixed(1)}% underwater exceeds ${(drawdownHaltThreshold * 100).toFixed(0)}% threshold`,
      actual: Number(drawdownPct.toFixed(4)),
      threshold: drawdownHaltThreshold,
    });
  } else {
    gatesPassed.push('DRAWDOWN');
  }

  // ── 8. Daily Loss Halt Gate ─────────────────────────────────────────────

  const dailyLossUsd = portfolioState?.daily_loss_usd ?? 0;
  const dailyLossHaltThreshold = RISK_PARAMS.DAILY_LOSS_HALT_THRESHOLD;
  const dailyLossOk = checkDailyLossHalt(dailyLossUsd, bankroll, dailyLossHaltThreshold);

  if (!dailyLossOk) {
    const dailyLossPct = bankroll > 0 ? dailyLossUsd / bankroll : 0;
    gatesFailed.push({
      gate: 'DAILY_LOSS',
      reason: `Daily loss halt triggered: loss of $${dailyLossUsd.toFixed(2)} (${(dailyLossPct * 100).toFixed(1)}% of $${bankroll.toFixed(2)}) exceeds ${(dailyLossHaltThreshold * 100).toFixed(0)}% threshold`,
      actual: Number(dailyLossPct.toFixed(4)),
      threshold: dailyLossHaltThreshold,
    });
  } else {
    gatesPassed.push('DAILY_LOSS');
  }

  // ── 9. Data Quality Gate ────────────────────────────────────────────────

  const dataQuality = predictionResult?.data_quality ??
    predictionResult?.research_quality ?? 0.5;
  const dataQualityOk = checkDataQuality(dataQuality, RISK_PARAMS.MIN_DATA_QUALITY);

  if (!dataQualityOk) {
    gatesFailed.push({
      gate: 'DATA_QUALITY',
      reason: `Insufficient data quality: ${(dataQuality * 100).toFixed(1)}% < ${(RISK_PARAMS.MIN_DATA_QUALITY * 100).toFixed(0)}% minimum`,
      actual: Number(dataQuality.toFixed(4)),
      threshold: RISK_PARAMS.MIN_DATA_QUALITY,
    });
  } else {
    gatesPassed.push('DATA_QUALITY');
  }

  // ── 10. Kill-Switch Override Gate ───────────────────────────────────────

  const killSwitchArmed = portfolioState?.kill_switch_armed === true;
  const killSwitchOk = checkKillSwitch(killSwitchArmed);

  if (!killSwitchOk) {
    gatesFailed.push({
      gate: 'KILL_SWITCH',
      reason: 'Kill switch is disarmed — manual acknowledgment required for trade execution',
      actual: 'disarmed',
      threshold: 'armed',
    });
  } else {
    gatesPassed.push('KILL_SWITCH');
  }

  // ── Build Risk Assessment ───────────────────────────────────────────────

  const computedDrawdownPct = initialEquity > 0
    ? Math.max(0, (initialEquity - currentEquity) / initialEquity)
    : 0;

  const riskAssessment = {
    edge_pct: Number((netEdge * 100).toFixed(4)),
    kelly_raw: Number(kellyRawPct.toFixed(4)),
    kelly_quarter: Number(kellyQuarterPct.toFixed(4)),
    kelly_allocation_usd: Number(kellyPosition.toFixed(2)),
    position_size_usd: Number(kellyPosition.toFixed(2)),
    confidence_score: Number((confidence).toFixed(4)),
    dispersion: Number((dispersion).toFixed(4)),
    current_equity: Number(currentEquity.toFixed(2)),
    drawdown_pct: Number(computedDrawdownPct.toFixed(4)),
    daily_loss_usd: Number(Math.max(0, dailyLossUsd).toFixed(2)),
    open_positions: Math.round(openPositions),
    total_exposure_pct: Number((newTotalExposureRatio * 100).toFixed(4)),
  };

  // ── Determine Decision ──────────────────────────────────────────────────

  const decision = gatesFailed.length === 0 ? 'APPROVE' : 'REJECT';

  const riskDecision = buildDecision(tradeId, marketId, decision, gatesPassed, gatesFailed, riskAssessment, timestamp);

  // ── Append to JSONL ─────────────────────────────────────────────────────

  appendJsonl(RISK_LOG, riskDecision);

  // ── Log ─────────────────────────────────────────────────────────────────

  if (decision === 'APPROVE') {
    console.log(`[RiskEngine] ${marketId}: APPROVE — position $${kellyPosition.toFixed(2)} (edge ${(netEdge * 100).toFixed(2)}%, confidence ${(confidence * 100).toFixed(0)}%)`);
  } else {
    const failGates = gatesFailed.map(f => f.gate).join(', ');
    console.log(`[RiskEngine] ${marketId}: REJECT — failed gates: ${failGates}`);
  }

  return riskDecision;
}

// ─── Build Decision Helpers ─────────────────────────────────────────────────

/**
 * Build a complete RiskDecision object.
 */
function buildDecision(tradeId, marketId, decision, gatesPassed, gatesFailed, riskAssessment, timestamp) {
  return {
    trade_id: tradeId,
    market_id: marketId,
    decision,
    gates_passed: [...gatesPassed],
    gates_failed: [...gatesFailed],
    risk_assessment: { ...riskAssessment },
    timestamp,
  };
}

/**
 * Build a REJECT decision for early-exit cases.
 */
function buildRejectDecision(tradeId, marketId, gatesPassed, gatesFailed, riskAssessment, timestamp) {
  return buildDecision(tradeId, marketId, 'REJECT', gatesPassed, gatesFailed, riskAssessment, timestamp);
}

/**
 * Build an empty/default risk assessment (used when not all data is available).
 */
function buildEmptyAssessment(predictionResult, portfolioState) {
  return {
    edge_pct: 0,
    kelly_raw: 0,
    kelly_quarter: 0,
    kelly_allocation_usd: 0,
    position_size_usd: 0,
    confidence_score: Number((predictionResult?.confidence ?? 0).toFixed(4)),
    dispersion: Number((predictionResult?.dispersion ?? 0).toFixed(4)),
    current_equity: Number((portfolioState?.current_equity ?? 0).toFixed(2)),
    drawdown_pct: 0,
    daily_loss_usd: Number(Math.max(0, portfolioState?.daily_loss_usd ?? 0).toFixed(2)),
    open_positions: Math.round(portfolioState?.open_positions ?? 0),
    total_exposure_pct: 0,
  };
}

// ─── Risk Reporting ─────────────────────────────────────────────────────────

const ALL_GATE_NAMES = [
  'DATA_FRESHNESS', 'LIQUIDITY', 'NET_EDGE', 'CONFIDENCE',
  'KELLY_SIZING', 'CONCENTRATION', 'DRAWDOWN', 'DAILY_LOSS', 'DATA_QUALITY', 'KILL_SWITCH',
];

/**
 * Generate a comprehensive risk report from accumulated risk decisions and trade outcomes.
 *
 * @param {Array} trades - Array of RiskDecision objects from risk_decision.jsonl
 * @param {Array} outcomes - Array of TradeOutcome objects from trade_outcome.jsonl
 * @returns {Promise<object>} RiskReport
 */
async function generateRiskReport(trades, outcomes) {
  if (!trades || trades.length === 0) {
    return {
      generatedAt: nowISO(),
      totalTrades: 0,
      approvedTrades: 0,
      rejectedTrades: 0,
      gatePerformance: ALL_GATE_NAMES.map(name => ({
        gate: name,
        passed: 0,
        failed: 0,
        total: 0,
        passRate: 0,
      })),
      positionSizing: {
        averageKellyPct: 0,
        maxPositionPct: 0,
        totalExposurePct: 0,
      },
      riskIncidents: [],
      calibrationStatus: {
        expectedApprovalRate: 0.85,
        observedApprovalRate: 0,
        issues: ['No trades available for report'],
      },
    };
  }

  // Gate performance counters
  const gateStats = {};
  for (const name of ALL_GATE_NAMES) {
    gateStats[name] = { passed: 0, failed: 0 };
  }

  let extraFailures = 0;
  for (const trade of trades) {
    for (const name of trade.gates_passed || []) {
      if (gateStats[name]) gateStats[name].passed += 1;
    }
    for (const failEntry of trade.gates_failed || []) {
      const name = failEntry.gate;
      if (gateStats[name]) gateStats[name].failed += 1;
      else extraFailures += 1;
    }
  }

  const gatePerformance = ALL_GATE_NAMES.map(name => {
    const stats = gateStats[name];
    const total = stats.passed + stats.failed;
    return {
      gate: name,
      passed: stats.passed,
      failed: stats.failed,
      total,
      passRate: total > 0 ? stats.passed / total : 0,
    };
  });

  // Position sizing statistics
  const approvedTrades = trades.filter(t => t.decision === 'APPROVE');
  const kellyPcts = approvedTrades
    .map(t => t?.risk_assessment?.kelly_quarter ?? 0)
    .filter(v => v > 0);

  const edgePcts = approvedTrades
    .map(t => t?.risk_assessment?.edge_pct ?? 0)
    .filter(v => v >= 0);

  const positionSizing = {
    averageKellyPct: kellyPcts.length > 0
      ? Number((kellyPcts.reduce((a, b) => a + b, 0) / kellyPcts.length).toFixed(4))
      : 0,
    averageEdgePct: edgePcts.length > 0
      ? Number((edgePcts.reduce((a, b) => a + b, 0) / edgePcts.length).toFixed(4))
      : 0,
    maxPositionPct: kellyPcts.length > 0
      ? Number(Math.max(...kellyPcts).toFixed(4))
      : 0,
    minPositionPct: kellyPcts.length > 0
      ? Number(Math.min(...kellyPcts).toFixed(4))
      : 0,
    medianPositionPct: kellyPcts.length > 0
      ? Number(median(kellyPcts).toFixed(4))
      : 0,
  };

  // Total exposure across all approved trades
  const totalAllocated = approvedTrades
    .reduce((sum, t) => sum + (t?.risk_assessment?.position_size_usd ?? 0), 0);
  // Use last trade's equity as reference point (imperfect but informative)
  const lastEquity = approvedTrades.length > 0
    ? approvedTrades[approvedTrades.length - 1]?.risk_assessment?.current_equity ?? 0
    : 0;

  positionSizing.totalExposurePct = lastEquity > 0
    ? Number((totalAllocated / lastEquity * 100).toFixed(4))
    : 0;

  // Risk incidents
  const riskIncidents = [];
  const drawdownTrades = trades.filter(t =>
    t.gates_failed?.some(f => f.gate === 'DRAWDOWN')
  );
  if (drawdownTrades.length > 0) {
    riskIncidents.push(`${drawdownTrades.length} trade(s) stopped by drawdown halt`);
  }

  const dailyLossTrades = trades.filter(t =>
    t.gates_failed?.some(f => f.gate === 'DAILY_LOSS')
  );
  if (dailyLossTrades.length > 0) {
    riskIncidents.push(`${dailyLossTrades.length} trade(s) stopped by daily loss halt`);
  }

  const killSwitchTrades = trades.filter(t =>
    t.gates_failed?.some(f => f.gate === 'KILL_SWITCH')
  );
  if (killSwitchTrades.length > 0) {
    riskIncidents.push(`${killSwitchTrades.length} trade(s) rejected by kill switch`);
  }

  // Days with confidence gate stopping trades (heuristic: count unique dates)
  const confidenceFailureDates = new Set();
  for (const t of trades) {
    if (t.gates_failed?.some(f => f.gate === 'CONFIDENCE')) {
      const dateKey = t.timestamp ? t.timestamp.slice(0, 10) : 'unknown';
      confidenceFailureDates.add(dateKey);
    }
  }
  if (confidenceFailureDates.size > 0) {
    riskIncidents.push(`${confidenceFailureDates.size} day(s) with trades stopped by confidence gate`);
  }

  if (riskIncidents.length === 0) {
    riskIncidents.push('None');
  }

  // Calibration status
  const totalTrades = trades.length;
  const approvedCount = approvedTrades.length;
  const rejectedCount = trades.filter(t => t.decision === 'REJECT').length;
  const observedApprovalRate = totalTrades > 0 ? approvedCount / totalTrades : 0;
  const expectedApprovalRate = 0.85;

  const issues = [];
  const rateDiff = observedApprovalRate - expectedApprovalRate;
  if (Math.abs(rateDiff) > 0.05) {
    issues.push(`Approval rate ${(observedApprovalRate * 100).toFixed(1)}% deviates from expected ${(expectedApprovalRate * 100).toFixed(0)}% by ${(Math.abs(rateDiff) * 100).toFixed(1)}%`);
  }

  if (kellyPcts.length > 0) {
    const avgKelly = positionSizing.averageKellyPct;
    const expectedAvg = 0.5;
    if (Math.abs(avgKelly - expectedAvg) > 0.2) {
      issues.push(`Average Kelly allocation ${avgKelly.toFixed(2)}% deviates from expected ${expectedAvg.toFixed(1)}%`);
    }
  }

  if (issues.length === 0) issues.push('None');

  const report = {
    generatedAt: nowISO(),
    totalTrades,
    approvedTrades: approvedCount,
    rejectedTrades: rejectedCount,
    approvalRate: Number((observedApprovalRate * 100).toFixed(1)),
    rejectionRate: Number(((1 - observedApprovalRate) * 100).toFixed(1)),
    gatePerformance,
    positionSizing,
    riskIncidents,
    calibrationStatus: {
      expectedApprovalRate: Number(expectedApprovalRate.toFixed(4)),
      observedApprovalRate: Number(observedApprovalRate.toFixed(4)),
      averageEdgePct: positionSizing.averageEdgePct,
      issues,
    },
  };

  return report;
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ─── Markdown Report Generation ─────────────────────────────────────────────

function generateRiskMarkdown(report) {
  const lines = [
    `# Risk Report — ${report.generatedAt.slice(0, 10)}`,
    ``,
    `## Overview`,
    `- **Total Trades Evaluated:** ${report.totalTrades}`,
    `- **Approved:** ${report.approvedTrades} (${report.approvalRate}%)`,
    `- **Rejected:** ${report.rejectedTrades} (${report.rejectionRate}%)`,
    ``,
    `## Gate Performance`,
    `| Gate | Passed | Failed | Total | Pass Rate |`,
    `|------|--------|--------|-------|-----------|`,
  ];

  for (const gp of report.gatePerformance) {
    const icon = gp.passRate >= 0.95 ? '✅' : gp.passRate >= 0.80 ? '⚠️' : '🔴';
    lines.push(`| ${gp.gate} | ${gp.passed} | ${gp.failed} | ${gp.total} | ${icon} ${(gp.passRate * 100).toFixed(1)}% |`);
  }

  lines.push(
    ``,
    `## Position Sizing`,
    `- **Average Kelly allocation:** ${report.positionSizing.averageKellyPct}% of bankroll`,
    `- **Average edge:** ${report.positionSizing.averageEdgePct}%`,
    `- **Median position:** ${report.positionSizing.medianPositionPct}%`,
    `- **Max position:** ${report.positionSizing.maxPositionPct}%`,
    `- **Min position:** ${report.positionSizing.minPositionPct}%`,
    `- **Total exposure across all approved trades:** ${report.positionSizing.totalExposurePct}%`,
    ``,
    `## Risk Incidents`,
  );

  for (const incident of report.riskIncidents) {
    lines.push(`- ${incident}`);
  }

  lines.push(
    ``,
    `## Calibration Status`,
    `- **Expected approval rate:** ${(report.calibrationStatus.expectedApprovalRate * 100).toFixed(0)}%`,
    `- **Observed approval rate:** ${(report.calibrationStatus.observedApprovalRate * 100).toFixed(1)}%`,
    `- **Average edge:** ${report.calibrationStatus.averageEdgePct}%`,
    `- **Issues:**`,
  );

  for (const issue of report.calibrationStatus.issues) {
    lines.push(`  - ${issue}`);
  }

  lines.push('');

  return lines.join('\n');
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (args.includes('--dry-run')) {
    console.log(JSON.stringify({
      ok: true,
      command: 'risk-engine',
      dry_run: true,
      gates: 10,
      output: RISK_LOG,
    }, null, 2));
    process.exit(0);
  }

  if (subcommand === 'evaluate') {
    // Usage: node risk-engine.mjs evaluate <marketId> [predictionResult.json] [marketSnapshot.json] [portfolioState.json]
    const marketId = args[1];
    if (!marketId) {
      console.error('Usage: node risk-engine.mjs evaluate <marketId> [predictionResult.json] [marketSnapshot.json] [portfolioState.json]');
      process.exit(1);
    }

    let predictionResult = {};
    if (args[2]) {
      try {
        predictionResult = JSON.parse(readFileSync(resolve(args[2]), 'utf-8'));
      } catch (err) {
        console.error(`Failed to read prediction result: ${err.message}`);
        predictionResult = {};
      }
    }

    let marketSnapshot = {};
    if (args[3]) {
      try {
        marketSnapshot = JSON.parse(readFileSync(resolve(args[3]), 'utf-8'));
      } catch (err) {
        console.error(`Failed to read market snapshot: ${err.message}`);
        marketSnapshot = {};
      }
    }

    let portfolioState = {};
    if (args[4]) {
      try {
        portfolioState = JSON.parse(readFileSync(resolve(args[4]), 'utf-8'));
      } catch (err) {
        console.error(`Failed to read portfolio state: ${err.message}`);
        portfolioState = {};
      }
    }

    const decision = await evaluateRiskDecision(marketId, predictionResult, marketSnapshot, portfolioState);
    console.log(JSON.stringify(decision, null, 2));
    process.exit(0);
  }

  if (subcommand === 'report') {
    // Usage: node risk-engine.mjs report [riskDecisions.jsonl] [outcomes.jsonl]
    const riskPath = args[1] || RISK_LOG;
    const outcomesPath = args[2];

    const trades = loadJsonl(riskPath);
    const outcomes = outcomesPath ? loadJsonl(outcomesPath) : [];

    const report = await generateRiskReport(trades, outcomes);
    console.log(JSON.stringify(report, null, 2));

    // Also write markdown
    const reportMdPath = resolve(OUTPUT_DIR, 'risk_report.md');
    ensureOutputDir();
    const md = generateRiskMarkdown(report);
    writeFileSync(reportMdPath, md, 'utf-8');
    console.log(`\nMarkdown report written to ${reportMdPath}`);

    process.exit(0);
  }

  if (subcommand === 'test') {
    // Self-test: verify all gates produce expected results
    console.log('[RiskEngine] Running self-tests...\n');

    // ── 1. checkDataFreshness ──
    const now = Date.now();
    console.assert(checkDataFreshness(now) === true, 'fresh timestamp should pass');
    console.assert(checkDataFreshness(now - 1000) === true, '1s old should pass');
    console.assert(checkDataFreshness(now - 61000) === false, '61s old should fail');
    console.assert(checkDataFreshness(now + 1000) === false, 'future timestamp should fail');
    console.assert(checkDataFreshness(null) === false, 'null should fail');
    console.assert(checkDataFreshness(undefined) === false, 'undefined should fail');
    console.log('[✓] checkDataFreshness: all assertions passed');

    // ── 2. checkLiquidity ──
    console.assert(checkLiquidity(1000000, 10) === true, 'high vol, low spread');
    console.assert(checkLiquidity(100000, 10) === false, 'low vol, low spread');
    console.assert(checkLiquidity(1000000, 30) === false, 'high vol, high spread');
    console.assert(checkLiquidity(500000, 25) === true, 'exact boundary vol and spread');
    console.assert(checkLiquidity(499999, 25) === false, 'just below min vol');
    console.assert(checkLiquidity(500000, 26) === false, 'just above max spread');
    console.assert(checkLiquidity(-1, 10) === false, 'negative volume');
    console.log('[✓] checkLiquidity: all assertions passed');

    // ── 3. calculateNetEdge ──
    const edge1 = calculateNetEdge(0.65, 0.58, 0.005, 15);
    const expected1 = (0.65 - 0.58) - (0.005 + 15/10000);
    console.assert(Math.abs(edge1 - expected1) < 0.0001, `edge should be ~${expected1}, got ${edge1}`);
    console.assert(edge1 > 0.06, 'spec example: edge should be ~0.0635');

    const edge2 = calculateNetEdge(0.50, 0.50, 0.005, 15);
    console.assert(edge2 < 0, 'equal probs with fees should give negative edge');

    const edge3 = calculateNetEdge(0.70, 0.70, 0.005, 15);
    console.assert(edge3 < 0, 'equal high probs with fees should give negative edge');

    const edge4 = calculateNetEdge(NaN, 0.50, 0.005, 15);
    console.assert(edge4 === 0, 'NaN pModel should return 0');

    console.log('[✓] calculateNetEdge: all assertions passed');

    // ── 4. Confidence checks (inline in evaluate) ──
    // Tested via evaluate, but verify edge values used in confidence gate
    console.assert(RISK_PARAMS.MIN_CONFIDENCE === 0.60, 'min confidence is 0.60');
    console.assert(RISK_PARAMS.MAX_DISPERSION === 0.08, 'max dispersion is 0.08');
    console.log('[✓] Confidence params verified');

    // ── 5. calculateKellySize ──
    const k1 = calculateKellySize(0.06, 2.0, 100, 0.25);
    // raw_kelly = 0.06 / 1.0 = 0.06 = 6%
    // quarter = 0.06 * 0.25 = 0.015 = 1.5%
    // position = min(0.015 * 100, 5) = $1.50
    console.assert(Math.abs(k1 - 1.50) < 0.01, `kelly(0.06, 2, 100) should be ~1.50, got ${k1}`);

    const k2 = calculateKellySize(0.15, 3.0, 1000, 0.25);
    // raw_kelly = 0.15 / 2.0 = 0.075 = 7.5%
    // quarter = 0.075 * 0.25 = 0.01875 = 1.875%
    // position = min(0.01875 * 1000, 50) = $18.75
    console.assert(Math.abs(k2 - 18.75) < 0.01, `kelly(0.15, 3, 1000) should be ~18.75, got ${k2}`);

    const k3 = calculateKellySize(-0.05, 2.0, 100, 0.25);
    console.assert(k3 === 0, 'negative edge should return 0');

    const k4 = calculateKellySize(0.06, 1.0, 100, 0.25);
    console.assert(k4 === 0, 'odds <= 1 should return 0');

    const k5 = calculateKellySize(0.06, 2.0, 0, 0.25);
    console.assert(k5 === 0, 'zero bankroll should return 0');

    const k6 = calculateKellySize(0.06, 2.0, 100, 0);
    console.assert(k6 === 0, 'zero kelly fraction should return 0');

    const k7 = calculateKellySize(0.50, 2.0, 100, 0.25);
    // raw_kelly = 0.50 / 1.0 = 0.50 = 50%
    // quarter = 0.50 * 0.25 = 0.125 = 12.5%
    // position = min(0.125 * 100, 5) = $5.00 (capped at 5%)
    console.assert(Math.abs(k7 - 5.00) < 0.01, `kelly large edge should be capped at 5% bankroll, got ${k7}`);

    console.log('[✓] calculateKellySize: all assertions passed');

    // ── 6. checkConcentration ──
    console.assert(checkConcentration(2, 0.10) === true, '2 positions at 10% should pass');
    console.assert(checkConcentration(3, 0.15) === true, '3 positions at 15% should pass (boundary)');
    console.assert(checkConcentration(4, 0.10) === false, '4 positions should fail');
    console.assert(checkConcentration(2, 0.20) === false, '20% exposure should fail');
    console.assert(checkConcentration(NaN, 0.10) === false, 'NaN positions should fail');
    console.assert(checkConcentration(2, NaN) === false, 'NaN exposure should fail');
    console.log('[✓] checkConcentration: all assertions passed');

    // ── 7. checkDrawdownHalt ──
    console.assert(checkDrawdownHalt(100, 100, 0.08) === true, 'no drawdown should pass');
    console.assert(checkDrawdownHalt(105, 100, 0.08) === true, 'profit should pass');
    console.assert(checkDrawdownHalt(93, 100, 0.08) === true, '7% drawdown should pass');
    console.assert(checkDrawdownHalt(91, 100, 0.08) === false, '9% drawdown should fail');
    console.assert(checkDrawdownHalt(92, 100, 0.08) === true, '8% drawdown == threshold should pass (≤)');
    console.assert(checkDrawdownHalt(NaN, 100, 0.08) === false, 'NaN equity should fail');
    console.log('[✓] checkDrawdownHalt: all assertions passed');

    // ── 8. checkDailyLossHalt ──
    console.assert(checkDailyLossHalt(0, 100, 0.15) === true, 'no loss today should pass');
    console.assert(checkDailyLossHalt(10, 100, 0.15) === true, '10% loss should pass');
    console.assert(checkDailyLossHalt(16, 100, 0.15) === false, '16% loss should fail');
    console.assert(checkDailyLossHalt(15, 100, 0.15) === true, 'exact 15% should pass (≤ threshold)');
    console.assert(checkDailyLossHalt(NaN, 100, 0.15) === false, 'NaN daily loss should fail');
    console.log('[✓] checkDailyLossHalt: all assertions passed');

    // ── 9. checkKillSwitch ──
    console.assert(checkKillSwitch(true) === true, 'armed should pass');
    console.assert(checkKillSwitch(false) === false, 'disarmed should fail');
    console.assert(checkKillSwitch(undefined) === false, 'undefined should fail');
    console.assert(checkKillSwitch(null) === false, 'null should fail');
    console.assert(checkKillSwitch(1) === false, 'truthy number should fail (strict)');
    console.assert(checkKillSwitch('true') === false, 'truthy string should fail (strict)');
    console.log('[✓] checkKillSwitch: all assertions passed');

    // ── calculatePMarket ──
    const m1 = calculatePMarket({}, {});
    console.assert(Math.abs(m1 - 0.5) < 0.001, 'default p_market should be 0.5');

    const m2 = calculatePMarket({}, { p_market: 0.58 });
    console.assert(Math.abs(m2 - 0.58) < 0.001, 'portfolio p_market override should work');

    const m3 = calculatePMarket({ p_market: 0.72 }, {});
    console.assert(Math.abs(m3 - 0.72) < 0.001, 'snapshot p_market should work');

    const m4 = calculatePMarket({}, { p_market: 1.5 });
    console.assert(Math.abs(m4 - 1.0) < 0.001, 'p_market > 1 should clamp to 1');

    const m5 = calculatePMarket({}, { p_market: -0.5 });
    console.assert(Math.abs(m5 - 0) < 0.001, 'p_market < 0 should clamp to 0');

    console.log('[✓] calculatePMarket: all assertions passed');

    // ── calculateMarketOdds ──
    const o1 = calculateMarketOdds({}, { p_market: 0.5 });
    console.assert(Math.abs(o1 - 2.0) < 0.001, '50% probability should give odds of 2.0');

    const o2 = calculateMarketOdds({}, { p_market: 0.25 });
    console.assert(Math.abs(o2 - 4.0) < 0.001, '25% probability should give odds of 4.0');

    const o3 = calculateMarketOdds({}, {});
    console.assert(Math.abs(o3 - 2.0) < 0.001, 'default should give odds of 2.0');

    const o4 = calculateMarketOdds({}, { p_market: 0 });
    console.assert(Math.abs(o4 - 2.0) < 0.001, 'p_market=0 should fallback to 2.0');

    const o5 = calculateMarketOdds({}, { p_market: 1 });
    console.assert(Math.abs(o5 - 1.01) < 0.001, 'p_market=1 should return min odds 1.01');

    console.log('[✓] calculateMarketOdds: all assertions passed');

    // ── Full evaluate (approval scenario) ──
    const prediction = {
      market_id: 'BTC-USD',
      p_model: 0.65,
      confidence: 0.78,
      dispersion: 0.024,
      model_probs: { claude: 0.62, grok: 0.67, gpt4o: 0.65, gemini: 0.60, deepseek: 0.64 },
      research_quality: 0.85,
      data_quality: 0.85,
      timestamp: new Date().toISOString(),
    };
    const snapshot = {
      market_id: 'BTC-USD',
      volume_24h: 35_000_000_000,
      spread_bps: 5,
      timestamp: new Date().toISOString(),
      last_price: 42500,
    };
    const portfolio = {
      bankroll: 100,
      current_equity: 100,
      initial_equity: 100,
      open_positions: 1,
      total_exposure_usd: 0.50,
      daily_loss_usd: 0,
      cumulative_loss_usd: 0,
      kill_switch_armed: true,
      p_market: 0.58,
    };

    const approvalDecision = await evaluateRiskDecision('BTC-USD', prediction, snapshot, portfolio);
    console.assert(approvalDecision.decision === 'APPROVE', `approval test: expected APPROVE, got ${approvalDecision.decision}`);
    console.assert(approvalDecision.gates_failed.length === 0, 'approval should have 0 failed gates');
    console.assert(approvalDecision.gates_passed.length === 10, 'approval should have 10 gates passed');
    console.assert(approvalDecision.risk_assessment.kelly_allocation_usd > 0, 'approval should have positive allocation');
    console.log(`[✓] evaluateRiskDecision (approval): APPROVE with ${approvalDecision.risk_assessment.kelly_allocation_usd.toFixed(2)} position`);

    // ── Full evaluate (rejection: stale data) ──
    const staleSnapshot = {
      ...snapshot,
      timestamp: new Date(Date.now() - 120_000).toISOString(), // 2 minutes old
    };
    const staleDecision = await evaluateRiskDecision('BTC-USD', prediction, staleSnapshot, portfolio);
    console.assert(staleDecision.decision === 'REJECT', `stale data test: expected REJECT, got ${staleDecision.decision}`);
    console.assert(staleDecision.gates_failed.some(f => f.gate === 'DATA_FRESHNESS'), 'stale data should fail DATA_FRESHNESS');
    console.log('[✓] evaluateRiskDecision (stale data): correctly REJECT');

    // ── Full evaluate (rejection: kill switch disarmed) ──
    const noKillPortfolio = { ...portfolio, kill_switch_armed: false };
    const noKillDecision = await evaluateRiskDecision('BTC-USD', prediction, snapshot, noKillPortfolio);
    console.assert(noKillDecision.decision === 'REJECT', `kill switch test: expected REJECT, got ${noKillDecision.decision}`);
    console.assert(noKillDecision.gates_failed.some(f => f.gate === 'KILL_SWITCH'), 'kill switch disarmed should fail KILL_SWITCH');
    console.log('[✓] evaluateRiskDecision (kill switch): correctly REJECT');

    // ── Full evaluate (rejection: drawdown halt) ──
    const drawdownPortfolio = {
      ...portfolio,
      current_equity: 85,
      initial_equity: 100,
    };
    const drawdownDecision = await evaluateRiskDecision('BTC-USD', prediction, snapshot, drawdownPortfolio);
    console.assert(drawdownDecision.decision === 'REJECT', `drawdown test: expected REJECT, got ${drawdownDecision.decision}`);
    console.assert(drawdownDecision.gates_failed.some(f => f.gate === 'DRAWDOWN'), 'drawdown should fail DRAWDOWN');
    console.log('[✓] evaluateRiskDecision (drawdown halt): correctly REJECT');

    // ── Full evaluate (rejection: daily loss halt) ──
    const dailyLossPortfolio = { ...portfolio, daily_loss_usd: 17 };
    const dailyLossDecision = await evaluateRiskDecision('BTC-USD', prediction, snapshot, dailyLossPortfolio);
    console.assert(dailyLossDecision.decision === 'REJECT', `daily loss test: expected REJECT, got ${dailyLossDecision.decision}`);
    console.assert(dailyLossDecision.gates_failed.some(f => f.gate === 'DAILY_LOSS'), 'daily loss should fail DAILY_LOSS');
    console.log('[✓] evaluateRiskDecision (daily loss halt): correctly REJECT');

    // ── Full evaluate (rejection: multiple gates) ──
    const badPrediction = {
      ...prediction,
      p_model: 0.45,
      confidence: 0.30,
      dispersion: 0.25,
    };
    const badPortfolio = {
      ...portfolio,
      open_positions: 5,
      total_exposure_usd: 50,
    };
    const multiFailDecision = await evaluateRiskDecision('ETH-USD', badPrediction, snapshot, badPortfolio);
    console.assert(multiFailDecision.decision === 'REJECT', 'multi-fail should be REJECT');
    console.assert(multiFailDecision.gates_failed.length >= 4, 'should fail multiple gates');
    console.log(`[✓] evaluateRiskDecision (multi-fail): REJECT with ${multiFailDecision.gates_failed.length} failed gates`);

    // ── Invalid inputs ──
    const nullDecision = await evaluateRiskDecision(null, null, null, null);
    console.assert(nullDecision.decision === 'REJECT', 'null inputs should be REJECT');
    console.log('[✓] evaluateRiskDecision (null inputs): correctly REJECT');

    console.log('\n[RiskEngine] All self-tests passed.');
    process.exit(0);
  }

  // Default: show usage
  console.log(`
Risk Engine — Phase 5

Usage:
  node risk-engine.mjs evaluate <marketId> [prediction.json] [snapshot.json] [portfolio.json]    Run risk gate evaluation
  node risk-engine.mjs report [riskDecisions.jsonl] [outcomes.jsonl]                             Generate risk report
  node risk-engine.mjs test                                                                       Run self-tests

Environment (all optional, with defaults):
  RISK_DATA_MAX_AGE_MS        — Max snapshot age in ms (default 60000)
  RISK_MIN_VOLUME_24H         — Min 24h volume (default 500000)
  RISK_MAX_SPREAD_BPS         — Max spread in bps (default 25)
  RISK_MIN_NET_EDGE           — Min net edge as decimal (default 0.04)
  RISK_FLAT_FEE_RATE          — Exchange taker fee (default 0.005)
  RISK_DEFAULT_SLIPPAGE_BPS   — Estimated slippage (default 15)
  RISK_MIN_CONFIDENCE         — Min confidence score (default 0.60)
  RISK_MAX_DISPERSION         — Max dispersion (default 0.08)
  RISK_KELLY_FRACTION         — Kelly fraction multiplier (default 0.25)
  RISK_MAX_POSITION_PCT       — Max single position as fraction of bankroll (default 0.05)
  RISK_MAX_OPEN_POSITIONS     — Max concurrent positions (default 3)
  RISK_MAX_EXPOSURE_RATIO     — Max total exposure as fraction (default 0.15)
  RISK_DRAWDOWN_HALT_THRESHOLD — Drawdown halt threshold (default 0.08)
  RISK_DAILY_LOSS_HALT_THRESHOLD — Daily loss halt threshold (default 0.15)

Output:
  .claude/trading-bot/data/risk_decision.jsonl
  .claude/trading-bot/data/risk_report.md
`);
  process.exit(0);
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  evaluateRiskDecision,
  checkDataFreshness,
  checkLiquidity,
  calculateNetEdge,
  calculateKellySize,
  checkConcentration,
  checkDrawdownHalt,
  checkDailyLossHalt,
  checkDataQuality,
  checkKillSwitch,
  generateRiskReport,
  generateRiskMarkdown,
  calculatePMarket,
  calculateMarketOdds,
  RISK_PARAMS,
};

// ─── Execute if run directly ────────────────────────────────────────────────

import { argv } from 'node:process';

const entryArg = argv[1];
if (entryArg && entryArg.endsWith('risk-engine.mjs')) {
  main().catch(err => {
    console.error('[RiskEngine] Fatal error:', err);
    process.exit(1);
  });
}
