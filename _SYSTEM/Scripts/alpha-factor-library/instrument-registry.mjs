#!/usr/bin/env node
// @capability: instrument-registry
// @serves: instrument metadata | tick size | lot size | contract multiplier | venue mapping | nautilus instrument id | futures month code | front month | fee model by asset class | ES NQ CL contract specs
// @does: Multi-asset instrument metadata registry (MURE gap-4) — tick/lot/multiplier/venue/fee specs for CME futures (ES/NQ/RTY/YM/CL/NG), index/equity GEX underlyings (SPX/SPY), and crypto; YURI market ↔ nautilus instrument_id mapping (Databento GLBX + IB CME symbology, quarterly/monthly month codes, front-month resolution); per-asset-class fee-model factory delegating to the existing afl-paper models for crypto.
// @use: resolveInstrument('ES-USD') for the spec; resolveNautilusId('ES-USD',{contract:'M6'}) → 'ESM6.GLBX'; resolveYuriMarket('ESM6.GLBX') → 'ES-USD'; getFeeModel(market) for the paper engine's injectable feeModel. DISARMED-first: without _SYSTEM/state/mure-instruments.enabled every lookup degrades to the crypto default (existing pipeline unchanged).
// @exports: resolveInstrument, getInstrumentByVenue, resolveNautilusId, resolveYuriMarket, listInstrumentsByClass, getFeeModel, registerInstrument, frontMonthCode, MONTH_CODES
//
// MURE gap-4 (MURE_GAP_SEAM_DESIGN_2026-07-06.mjs::gap4_instrument_layer). Pure metadata leaf —
// no network. Existing modules never import this (DAG: new→existing only).
//
// SPEC PROVENANCE (lanes/E-ib-wiring.md §3 — vendor-corroborated ≥2 sources, NOT CME.com-primary):
//   ES $50×idx tick 0.25 ($12.50) CME · NQ $20 tick 0.25 ($5) CME · RTY $50 tick 0.10 ($5) CME
//   YM $5 tick 1.0 ($5) CBOT (⚠ IB exchange string 'CBOT' UNVERIFIED against live reqContractDetails)
//   CL 1000bbl tick 0.01 ($10) NYMEX · NG 10000mmBtu tick 0.001 ($10) NYMEX
//   Lane E note: nautilus builds live instruments from IB's own contract_details.minTick/multiplier —
//   this registry is for OUR pre-flight validation / GEX-multiplier math / sanity checks, not a
//   replacement for the venue's live contract truth.
//
// SYMBOLOGY:
//   Databento GLBX.MDP3 raw:  {root}{monthCode}{yearDigit}.GLBX   e.g. ESM6.GLBX (seam-spec example ESM4.GLBX)
//   Databento continuous:     {root}.c.0.GLBX                     (front-month continuous)
//   nautilus IB_SIMPLIFIED:   {root}{monthCode}{yearDigit}.{ibExchange}  e.g. ESM4.CME (Lane E)
//   IB continuous:            {root}.{ibExchange}                 e.g. ES.CME
//   Crypto (existing):        {BASE}USDT.BINANCE ↔ '<BASE>-USD'   (wraps perp-signals.cryptoMarketToPerpSymbol)
//
// DISARMED CONTRACT: flag _SYSTEM/state/mure-instruments.enabled (creation owner-gated; MURE_FLAG_DIR
// is the unit-test sandbox override only). Disarmed → resolveInstrument returns the CRYPTO DEFAULT
// spec (existing crypto pipeline behavior preserved), getInstrumentByVenue null for non-crypto,
// nautilus id mapping null, listInstrumentsByClass [], getFeeModel → binance taker (current live
// default), registerInstrument {status:'DISARMED'}. No throw, no console spam.

import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { binanceFeeModel, cryptoFeeModel } from './afl-paper.mjs';
import { cryptoMarketToPerpSymbol } from './perp-signals.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLAG_NAME = 'mure-instruments.enabled';
const FLAG_PATH = () => path.join(
  process.env.MURE_FLAG_DIR || path.resolve(__dirname, '..', '..', 'state'),
  FLAG_NAME,
);
const armed = () => { try { return existsSync(FLAG_PATH()); } catch { return false; } };

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ── futures month codes (Lane E table, CONFIRMED) ────────────────────────────
export const MONTH_CODES = Object.freeze(['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']); // Jan..Dec
const QUARTERLY_MONTHS = [3, 6, 9, 12]; // H M U Z

/**
 * frontMonthCode(date, cycle) → {code, yearDigit, label} — the front contract month.
 * APPROXIMATION for pre-flight/sanity use (documented): rolls on the 1st of the expiry month
 * (quarterly cycle) / the 1st of the current month → next month (monthly cycle). Real roll dates
 * (3rd-Friday-adjacent for equity index, ~20th prior month for CL) come from the venue live —
 * never trade off this helper alone.
 */
export function frontMonthCode(date = new Date(), cycle = 'quarterly') {
  if (!armed()) return null;
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const m = d.getUTCMonth() + 1; // 1..12
  let year = d.getUTCFullYear();
  let month;
  if (cycle === 'monthly') {
    month = m + 1; // front = next calendar month (CL-style expiry ~prior-month 20th approximation)
    if (month > 12) { month = 1; year += 1; }
  } else {
    month = QUARTERLY_MONTHS.find((qm) => qm > m) ?? null; // roll on the 1st of the expiry month
    if (month === null) { month = QUARTERLY_MONTHS[0]; year += 1; }
  }
  const code = MONTH_CODES[month - 1];
  const yearDigit = String(year % 10);
  return { code, yearDigit, label: `${code}${yearDigit}` };
}

// ── the seed registry ─────────────────────────────────────────────────────────
/** @typedef {{market,nautilusRoot,nautilusVenue,ibExchange,assetClass,venue,tickSize,lotSize,contractMultiplier,quoteCurrency,pricePrecision,feeModel,tradingHours,monthCycle,optionMultiplier}} InstrumentSpec */

const futures = (market, root, ibExchange, tickSize, contractMultiplier, pricePrecision, monthCycle, tickValue) => ({
  market, nautilusRoot: root, nautilusVenue: 'GLBX', ibExchange,
  assetClass: 'future', venue: 'databento',
  tickSize, lotSize: 1, contractMultiplier, quoteCurrency: 'USD', pricePrecision,
  feeModel: 'futures-standard', tradingHours: 'CME_GLOBEX', monthCycle, tickValue,
});
const crypto = (market) => {
  const base = String(market).split('-')[0] || 'BTC';
  return {
    market, nautilusRoot: `${base}USDT`, nautilusVenue: 'BINANCE', ibExchange: null,
    assetClass: 'crypto', venue: 'binance',
    tickSize: 0.01, lotSize: 0.001, contractMultiplier: 1, quoteCurrency: 'USDT', pricePrecision: 2,
    feeModel: 'binance-taker', tradingHours: '24/7', monthCycle: null, tickValue: null,
  };
};

const REGISTRY = new Map();
function seed(spec) { REGISTRY.set(spec.market, Object.freeze({ ...spec })); }

// CME/CBOT/NYMEX futures (Lane E §3 table — see SPEC PROVENANCE above)
seed(futures('ES-USD', 'ES', 'CME', 0.25, 50, 2, 'quarterly', 12.50));
seed(futures('NQ-USD', 'NQ', 'CME', 0.25, 20, 2, 'quarterly', 5.00));
seed(futures('RTY-USD', 'RTY', 'CME', 0.10, 50, 2, 'quarterly', 5.00));
seed(futures('YM-USD', 'YM', 'CBOT', 1.00, 5, 0, 'quarterly', 5.00)); // ⚠ 'CBOT' UNVERIFIED vs live reqContractDetails (Lane E)
seed(futures('CL-USD', 'CL', 'NYMEX', 0.01, 1000, 2, 'monthly', 10.00));
seed(futures('NG-USD', 'NG', 'NYMEX', 0.001, 10000, 3, 'monthly', 10.00));
// GEX underlyings — SPX index (options: 100× multiplier), SPY equity ETF
seed({ market: 'SPX-USD', nautilusRoot: 'SPX', nautilusVenue: 'OPRA', ibExchange: 'CBOE', assetClass: 'index', venue: 'databento', tickSize: 0.01, lotSize: 1, contractMultiplier: 1, optionMultiplier: 100, quoteCurrency: 'USD', pricePrecision: 2, feeModel: 'index-none', tradingHours: 'RTH', monthCycle: null, tickValue: null });
seed({ market: 'SPY-USD', nautilusRoot: 'SPY', nautilusVenue: 'ARCX', ibExchange: 'SMART', assetClass: 'equity', venue: 'databento', tickSize: 0.01, lotSize: 1, contractMultiplier: 1, optionMultiplier: 100, quoteCurrency: 'USD', pricePrecision: 2, feeModel: 'equity-zero', tradingHours: 'RTH', monthCycle: null, tickValue: null });
// Crypto (the existing live pipeline's markets)
seed(crypto('BTC-USD'));
seed(crypto('ETH-USD'));

// ── fee models ────────────────────────────────────────────────────────────────
/**
 * Per-contract futures commission: all-in retail ≈ $2.50/side/contract (commission + exchange +
 * NFA; AMP/Ironbeam-class retail floor). Override via opts or FUTURES_FEE_PER_CONTRACT env.
 * Contract: (venue, price, size) => dollar fee — SAME shape afl-paper's injectable feeModel expects
 * (size here = CONTRACTS, price ignored: futures commissions are per-contract, not notional-fraction).
 */
function futuresFeeModel(perContract = 2.50) {
  const env = Number(process.env.FUTURES_FEE_PER_CONTRACT);
  const rate = Number.isFinite(env) && env >= 0 ? env : perContract;
  return (_venue, _price, size) => (isNum(size) ? Math.abs(size) * rate : 0);
}
/** Per-contract options commission (≈$0.65/contract retail). */
function optionsFeeModel(perContract = 0.65) {
  return (_venue, _price, size) => (isNum(size) ? Math.abs(size) * perContract : 0);
}
/** Commission-free retail equity approximation (slippage/impact live in the paper engine, not here). */
const zeroFeeModel = () => (_v, _p, _s) => 0;

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * resolveInstrument(market) → InstrumentSpec.
 * DISARMED → the CRYPTO DEFAULT for the given market string (the pre-registry pipeline behavior:
 * everything is treated as crypto) — per the seam spec's degradeBehavior.
 */
export function resolveInstrument(market) {
  if (!armed()) return crypto(typeof market === 'string' && market ? market : 'BTC-USD');
  if (typeof market !== 'string' || !market) return null;
  if (REGISTRY.has(market)) return REGISTRY.get(market);
  // Unregistered but crypto-shaped ('SOL-USD') → generic crypto spec (existing pipeline tolerance).
  if (cryptoMarketToPerpSymbol(market)) return Object.freeze(crypto(market));
  return null;
}

/** getInstrumentByVenue(venue, symbol) → InstrumentSpec|null. symbol = nautilusRoot at that venue. */
export function getInstrumentByVenue(venue, symbol) {
  if (!armed()) {
    if (venue === 'binance' && typeof symbol === 'string') {
      const m = symbol.match(/^([A-Z0-9]{2,10})USDT$/i);
      return m ? crypto(`${m[1].toUpperCase()}-USD`) : null;
    }
    return null; // non-crypto venues → null when disarmed (seam spec)
  }
  if (typeof venue !== 'string' || typeof symbol !== 'string') return null;
  for (const spec of REGISTRY.values()) {
    if (spec.venue === venue && spec.nautilusRoot.toUpperCase() === symbol.toUpperCase()) return spec;
    if (venue === 'ib' && spec.ibExchange && spec.nautilusRoot.toUpperCase() === symbol.toUpperCase()) return spec;
  }
  return null;
}

/**
 * resolveNautilusId(yuriMarket, opts) → nautilus instrument_id string.
 *   {contract:'M6'}          → 'ESM6.GLBX' (Databento raw, the default venue per C1)
 *   {venue:'ib', contract}   → 'ESM6.CME'  (nautilus IB_SIMPLIFIED)
 *   {continuous:true}        → 'ES.c.0.GLBX' (Databento continuous) / 'ES.CME' (IB continuous)
 *   no contract & futures    → auto front month via frontMonthCode(date, spec.monthCycle)
 */
export function resolveNautilusId(yuriMarket, { venue = 'databento', contract = null, continuous = false, date = new Date() } = {}) {
  if (!armed()) return null;
  const spec = resolveInstrument(yuriMarket);
  if (!spec) return null;
  if (spec.assetClass === 'crypto') return `${spec.nautilusRoot}.BINANCE`;
  const suffix = venue === 'ib' ? (spec.ibExchange ?? 'SMART') : spec.nautilusVenue;
  if (spec.assetClass !== 'future') return `${spec.nautilusRoot}.${suffix}`;
  if (continuous) return venue === 'ib' ? `${spec.nautilusRoot}.${suffix}` : `${spec.nautilusRoot}.c.0.${suffix}`;
  const c = (typeof contract === 'string' && /^[FGHJKMNQUVXZ]\d{1,2}$/.test(contract))
    ? contract
    : frontMonthCode(date, spec.monthCycle)?.label;
  if (!c) return null;
  return `${spec.nautilusRoot}${c}.${suffix}`;
}

/** resolveYuriMarket(nautilusId) → YURI market string|null. Accepts raw-month, continuous, IB and crypto ids. */
export function resolveYuriMarket(nautilusId) {
  if (!armed()) return null;
  if (typeof nautilusId !== 'string' || !nautilusId.includes('.')) return null;
  const venueSuffix = nautilusId.slice(nautilusId.lastIndexOf('.') + 1).toUpperCase();
  const head = nautilusId.slice(0, nautilusId.lastIndexOf('.'));
  // crypto: BTCUSDT.BINANCE
  if (venueSuffix === 'BINANCE') {
    const m = head.match(/^([A-Z0-9]{2,10})USDT$/i);
    return m ? `${m[1].toUpperCase()}-USD` : null;
  }
  // continuous: ES.c.0 → root 'ES'
  const contMatch = head.match(/^([A-Z0-9]+?)\.c\.\d+$/i);
  const root = contMatch
    ? contMatch[1].toUpperCase()
    // raw month: ESM6 / CLZ7 / ESM26 → strip {monthCode}{1-2 digits}; plain root (ES) passes through
    : head.replace(/([FGHJKMNQUVXZ]\d{1,2})$/, '').toUpperCase();
  if (!root) return null;
  for (const spec of REGISTRY.values()) {
    if (spec.nautilusRoot.toUpperCase() !== root) continue;
    if (spec.nautilusVenue.toUpperCase() === venueSuffix) return spec.market;
    if (spec.ibExchange && spec.ibExchange.toUpperCase() === venueSuffix) return spec.market;
    if (venueSuffix === 'SMART' && spec.ibExchange === 'SMART') return spec.market;
  }
  return null;
}

/** listInstrumentsByClass(assetClass) → InstrumentSpec[] (frozen specs). */
export function listInstrumentsByClass(assetClass) {
  if (!armed()) return [];
  return [...REGISTRY.values()].filter((s) => s.assetClass === assetClass);
}

/**
 * getFeeModel(marketOrSpec, {role}) → (venue, price, size) => fee — afl-paper injectable shape.
 * crypto → existing binanceFeeModel/cryptoFeeModel (REUSE); future → per-contract; option/index
 * with optionMultiplier → per-contract options; equity → zero-commission approximation.
 */
export function getFeeModel(marketOrSpec, { role = 'taker', perContract } = {}) {
  if (!armed()) return binanceFeeModel(role); // current live default preserved
  const spec = (marketOrSpec && typeof marketOrSpec === 'object') ? marketOrSpec : resolveInstrument(marketOrSpec);
  if (!spec) return binanceFeeModel(role);
  switch (spec.feeModel) {
    case 'binance-taker': return binanceFeeModel(role);
    case 'coinbase-tiered': return cryptoFeeModel(role);
    case 'futures-standard': return futuresFeeModel(isNum(perContract) ? perContract : 2.50);
    case 'options-standard': return optionsFeeModel(isNum(perContract) ? perContract : 0.65);
    case 'equity-zero':
    case 'index-none': return zeroFeeModel();
    default: return spec.assetClass === 'crypto' ? binanceFeeModel(role) : zeroFeeModel();
  }
}

/** registerInstrument(spec) — add/update. Minimal validation; frozen on insert. */
export function registerInstrument(spec) {
  if (!armed()) return { status: 'DISARMED' };
  if (!spec || typeof spec !== 'object' || typeof spec.market !== 'string' || !spec.market) {
    return { status: 'rejected', reason: 'spec.market (string) required' };
  }
  for (const f of ['tickSize', 'lotSize', 'contractMultiplier']) {
    if (spec[f] !== undefined && !isNum(spec[f])) return { status: 'rejected', reason: `${f} must be a finite number` };
  }
  const merged = Object.freeze({ ...(REGISTRY.get(spec.market) ?? {}), ...spec });
  REGISTRY.set(spec.market, merged);
  return { status: 'ok', spec: merged };
}

export default {
  resolveInstrument, getInstrumentByVenue, resolveNautilusId, resolveYuriMarket,
  listInstrumentsByClass, getFeeModel, registerInstrument, frontMonthCode, MONTH_CODES,
};

// ── CLI smoke: node instrument-registry.mjs --smoke ──────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--smoke')) {
  console.log(`armed=${armed()} flag=${FLAG_PATH()}`);
  console.log('ES-USD:', JSON.stringify(resolveInstrument('ES-USD')));
  console.log('ES nautilus (M6):', resolveNautilusId('ES-USD', { contract: 'M6' }));
  console.log('ES nautilus (auto):', resolveNautilusId('ES-USD'));
  console.log('reverse ESM6.GLBX:', resolveYuriMarket('ESM6.GLBX'));
  console.log('front month (quarterly, today):', JSON.stringify(frontMonthCode()));
  console.log('futures fee (2 contracts):', getFeeModel('ES-USD')('databento', 5000, 2));
}
