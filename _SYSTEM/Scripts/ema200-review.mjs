#!/usr/bin/env node
// EMA200 reversal forecast evaluator — scores the 2026-07-29 frozen forecast
// against realized prices using rules fixed BEFORE any outcome data existed.
//
// DELIBERATELY OFFLINE. Every market-data host (Yahoo, Nasdaq, stooq, alphavantage,
// financialmodelingprep, stockanalysis) is 403 under this environment's egress policy,
// verified 2026-07-30. Rather than pretend to fetch, this evaluator takes prices as an
// INPUT ARTIFACT and refuses to write an authoritative verdict unless that artifact
// declares a source and verified:true. Search-scraped prose prices are not evidence.
//
// Usage:
//   node _SYSTEM/Scripts/ema200-review.mjs --template > quotes-2026-08-06.json
//   node _SYSTEM/Scripts/ema200-review.mjs 2026-08-06 --quotes quotes-2026-08-06.json
//   node _SYSTEM/Scripts/ema200-review.mjs 2026-08-06 --quotes q.json --write --ledger

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ema } from './alpha-factor-library/indicators.mjs';
import { dataQualityGate } from './alpha-factor-library/data-quality-gate.mjs';
import { recordOutcome } from './prediction-ledger.mjs';

const FREEZE_FILE = '_SYSTEM/state/ema200-freeze-2026-07-29.json';
const OUT_DIR = '_SYSTEM/state';

// ── freeze loading ────────────────────────────────────────────────────────────

// @capability: ema200-review
// @serves: score a frozen market forecast against realized prices | did the EMA200 reversal call work | evaluate a prediction freeze | forecast calibration brier spearman | entry-trigger rule did the setup ever fill
// @does: evaluates the 2026-07-29 EMA200 freeze — REVERSAL_CONFIRMED, ENTRY_TRIGGER_V2 (a bar must contain the entry before stop/target apply), R-multiples, Brier + Spearman, earnings-cohort split. Offline by contract; refuses to write a verdict unless the quotes artifact declares a named source and verified:true
// @use: at a frozen review date with an OHLCV quotes file in hand. Reach here instead of re-deriving pass/fail by eye — the rules were fixed before outcomes existed, which is the whole point of the exercise
// @exports: loadFreeze, evaluateTrade, evaluateEntry, review, aggregate, brier, spearman, renderReport, quotesTemplate
export function loadFreeze(file = FREEZE_FILE) {
  const freeze = JSON.parse(readFileSync(file, 'utf8'));
  if (freeze.schema !== 'ema200-freeze/v2') {
    throw new Error(`unexpected freeze schema: ${freeze.schema}`);
  }
  return freeze;
}

// ── quotes contract ───────────────────────────────────────────────────────────
//
// {
//   "asOf": "2026-08-06",
//   "source": "nasdaq daily OHLCV via local ema200-scan.mjs",
//   "verified": true,
//   "tickers": {
//     "WMB": {
//       "ema200": 69.9,                 // optional if `series` is supplied
//       "bars": [                       // trading days AFTER 2026-07-29 through asOf
//         {"date":"2026-07-30","open":..,"high":..,"low":..,"close":..,"volume":..}
//       ],
//       "series": [ ...>=200 closes ending on asOf ]   // optional, EMA200 computed from it
//     }
//   }
// }

export function quotesTemplate(freeze, asOf) {
  const tickers = {};
  for (const e of freeze.entries) {
    tickers[e.ticker] = {
      ema200: null,
      bars: [{ date: '', open: null, high: null, low: null, close: null, volume: null }],
      series: null,
    };
  }
  return {
    asOf,
    source: '',
    verified: false,
    note: 'Fill bars with every trading day AFTER 2026-07-29 through asOf. Either set ema200 directly, or supply >=200 trailing closes in series and it is computed. Set verified:true only when the numbers come from a real OHLCV source.',
    tickers,
  };
}

// ── per-entry evaluation ──────────────────────────────────────────────────────

function windowBars(bars, asOf) {
  return (bars ?? [])
    .filter(b => b && typeof b.date === 'string' && b.date > '2026-07-29' && b.date <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function resolveEma200(q) {
  if (Number.isFinite(q?.ema200)) return { value: q.ema200, from: 'supplied' };
  if (Array.isArray(q?.series) && q.series.length >= 200) {
    const line = ema(q.series, 200);
    const last = line[line.length - 1];
    if (Number.isFinite(last)) return { value: last, from: 'computed-from-series' };
  }
  return { value: null, from: 'missing' };
}

/**
 * Walk the window applying ENTRY_TRIGGER_V2 then TRADE_OUTCOME.
 * Stop takes precedence over target within a single bar — no intrabar path is assumed.
 */
export function evaluateTrade(entry, bars) {
  const { entry: level, stop, target } = entry;
  const risk = level - stop;
  let triggerIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.low <= level && level <= b.high) { triggerIdx = i; break; }
  }
  if (triggerIdx === -1) {
    return { state: 'NOT_TRIGGERED', r: null, exit: null, exitDate: null, triggerDate: null };
  }
  const triggerDate = bars[triggerIdx].date;
  for (let i = triggerIdx; i < bars.length; i++) {
    const b = bars[i];
    if (b.low <= stop) {
      return { state: 'STOPPED', r: risk > 0 ? (stop - level) / risk : null, exit: stop, exitDate: b.date, triggerDate };
    }
    if (b.high >= target) {
      return { state: 'TARGET', r: risk > 0 ? (target - level) / risk : null, exit: target, exitDate: b.date, triggerDate };
    }
  }
  const last = bars[bars.length - 1];
  return {
    state: 'OPEN',
    r: risk > 0 ? (last.close - level) / risk : null,
    exit: last.close,
    exitDate: last.date,
    triggerDate,
  };
}

export function evaluateEntry(entry, quote, asOf) {
  const bars = windowBars(quote?.bars, asOf);
  const gate = bars.length ? dataQualityGate(bars) : { ok: false, rejects: ['no-bars'] };
  const emaRes = resolveEma200(quote);
  const lastBar = bars.length ? bars[bars.length - 1] : null;
  const closeAsOf = Number.isFinite(quote?.close) ? quote.close : lastBar?.close ?? null;

  const missing = [];
  if (!bars.length) missing.push('bars');
  if (!Number.isFinite(closeAsOf)) missing.push('close');
  if (!Number.isFinite(emaRes.value)) missing.push('ema200');

  if (missing.length) {
    return {
      ticker: entry.ticker, p: entry.p, rank: entry.rank,
      status: 'NO_DATA', missing,
      reversal: null, trade: { state: 'NO_DATA', r: null },
      closeAsOf, ema200: emaRes.value, ret: null,
      dataQuality: gate.ok === true ? 'ok' : (gate.rejects ?? gate.hardRejects ?? ['unknown']),
    };
  }

  const reversal = closeAsOf > entry.close && closeAsOf > emaRes.value;
  const trade = evaluateTrade(entry, bars);
  return {
    ticker: entry.ticker,
    rank: entry.rank,
    p: entry.p,
    status: 'SCORED',
    reversal,
    reversalParts: {
      aboveFreezeClose: closeAsOf > entry.close,
      aboveEma200: closeAsOf > emaRes.value,
      freezeClose: entry.close,
      ema200: emaRes.value,
      ema200From: emaRes.from,
    },
    closeAsOf,
    ema200: emaRes.value,
    ret: (closeAsOf - entry.close) / entry.close,
    trade,
    dataQuality: gate.ok === true ? 'ok' : (gate.rejects ?? gate.hardRejects ?? gate.flags ?? 'flagged'),
  };
}

// ── aggregates ────────────────────────────────────────────────────────────────

export function brier(pairs) {
  const scored = pairs.filter(x => Number.isFinite(x.p) && typeof x.outcome === 'boolean');
  if (!scored.length) return null;
  const sum = scored.reduce((a, x) => a + (x.p - (x.outcome ? 1 : 0)) ** 2, 0);
  return sum / scored.length;
}

function rankOf(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

export function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const rx = rankOf(xs), ry = rankOf(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

function inEarningsWindow(entry, asOf) {
  return typeof entry.earnings === 'string' && entry.earnings > '2026-07-29' && entry.earnings <= asOf;
}

export function aggregate(results, freeze, asOf) {
  const byTicker = new Map(freeze.entries.map(e => [e.ticker, e]));
  const scored = results.filter(r => r.status === 'SCORED');
  const cohort = (name, pred) => {
    const rs = scored.filter(r => pred(byTicker.get(r.ticker)));
    const reversals = rs.filter(r => r.reversal === true).length;
    const triggered = rs.filter(r => r.trade.state !== 'NOT_TRIGGERED');
    const closed = triggered.filter(r => r.trade.state === 'STOPPED' || r.trade.state === 'TARGET');
    const rVals = closed.map(r => r.trade.r).filter(Number.isFinite);
    return {
      cohort: name,
      n: rs.length,
      reversalsConfirmed: reversals,
      reversalRate: rs.length ? reversals / rs.length : null,
      notTriggered: rs.length - triggered.length,
      closed: closed.length,
      open: triggered.filter(r => r.trade.state === 'OPEN').length,
      meanClosedR: rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null,
      brier: brier(rs.map(r => ({ p: r.p, outcome: r.reversal }))),
      spearmanPvsReturn: spearman(rs.map(r => r.p), rs.map(r => r.ret)),
      meanReturn: rs.length ? rs.reduce((a, r) => a + r.ret, 0) / rs.length : null,
    };
  };
  return {
    all: cohort('all', () => true),
    clean: cohort('clean (no earnings in window)', e => !inEarningsWindow(e, asOf)),
    event: cohort('event (earnings in window)', e => inEarningsWindow(e, asOf)),
    noData: results.filter(r => r.status === 'NO_DATA').map(r => ({ ticker: r.ticker, missing: r.missing })),
  };
}

// ── report ────────────────────────────────────────────────────────────────────

function pct(x, d = 1) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—'; }
function num(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : '—'; }

export function renderReport(review) {
  const L = [];
  const { asOf, authoritative, quotesSource, results, aggregates, freezeMeta } = review;
  L.push(`EMA200-REVERSAL REVIEW — Stichtag ${asOf}`);
  L.push(`Freeze: ${freezeMeta.id} (Stand Schluss ${freezeMeta.asOfClose}, ${freezeMeta.universe} Titel)`);
  L.push(`Kursquelle: ${quotesSource || '(keine)'} · ${authoritative ? 'VERIFIZIERT' : 'PROVISORISCH — nicht ledger-fähig'}`);
  const rd = freezeMeta.reviewDates?.find(d => d.date === asOf);
  if (rd) L.push(`Charakter: ${rd.kind} (${rd.weight}) — ${rd.caveat}`);
  L.push('');
  L.push('Titel  P     Reversal  Trade         R      Ret     Close     EMA200');
  for (const r of results) {
    if (r.status === 'NO_DATA') {
      L.push(`${r.ticker.padEnd(6)} ${pct(r.p, 0).padStart(4)}  NO_DATA   fehlt: ${r.missing.join(',')}`);
      continue;
    }
    L.push(
      `${r.ticker.padEnd(6)} ${pct(r.p, 0).padStart(4)}  ` +
      `${(r.reversal ? 'JA' : 'nein').padEnd(9)} ${r.trade.state.padEnd(13)} ` +
      `${num(r.trade.r).padStart(6)} ${pct(r.ret).padStart(7)} ` +
      `${num(r.closeAsOf).padStart(9)} ${num(r.ema200).padStart(9)}`
    );
  }
  L.push('');
  for (const key of ['all', 'clean', 'event']) {
    const a = aggregates[key];
    if (!a || !a.n) continue;
    L.push(
      `${a.cohort.padEnd(34)} n=${String(a.n).padStart(2)} · Reversal ${a.reversalsConfirmed}/${a.n} (${pct(a.reversalRate, 0)}) · ` +
      `NOT_TRIGGERED ${a.notTriggered} · geschlossen ${a.closed} (mittleres R ${num(a.meanClosedR)}) · ` +
      `Brier ${num(a.brier, 3)} · Spearman ${num(a.spearmanPvsReturn, 2)} · mittlere Rendite ${pct(a.meanReturn)}`
    );
  }
  if (aggregates.noData.length) {
    L.push('');
    L.push(`OHNE DATEN (${aggregates.noData.length}): ${aggregates.noData.map(x => x.ticker).join(', ')}`);
  }
  L.push('');
  L.push(`Grenzen: ${freezeMeta.statisticalLimits.correlation}`);
  L.push(`         ${freezeMeta.statisticalLimits.earningsCohort}`);
  if (!authoritative) {
    L.push('');
    L.push('PROVISORISCH: quotes.verified ist nicht true. Kein Verdikt geschrieben, kein Ledger-Eintrag.');
  }
  return L.join('\n');
}

// ── driver ────────────────────────────────────────────────────────────────────

export function review(freeze, quotes, asOf) {
  const results = freeze.entries.map(e => evaluateEntry(e, quotes.tickers?.[e.ticker], asOf));
  const authoritative = quotes.verified === true && typeof quotes.source === 'string' && quotes.source.length > 0;
  return {
    schema: 'ema200-review/v1',
    asOf,
    authoritative,
    quotesSource: quotes.source ?? '',
    rulesApplied: ['REVERSAL_CONFIRMED', 'ENTRY_TRIGGER_V2', 'TRADE_OUTCOME', 'CALIBRATION'],
    freezeMeta: {
      id: freeze.id,
      asOfClose: freeze.asOfClose,
      universe: freeze.universe,
      reviewDates: freeze.reviewDates,
      statisticalLimits: freeze.statisticalLimits,
      provenanceReconstructed: freeze.provenance?.reconstructed === true,
    },
    results,
    aggregates: aggregate(results, freeze, asOf),
  };
}

function main(argv) {
  const args = argv.slice(2);
  const flag = n => args.includes(n);
  const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const freeze = loadFreeze(val('--freeze') ?? FREEZE_FILE);
  const asOf = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? freeze.reviewDates[0].date;

  if (flag('--template')) {
    console.log(JSON.stringify(quotesTemplate(freeze, asOf), null, 2));
    return 0;
  }

  const qPath = val('--quotes');
  if (!qPath) {
    console.error('EMA200-REVIEW: keine Kursdatei.');
    console.error('');
    console.error(`  Stichtag ${asOf} · Freeze ${freeze.id} · ${freeze.universe} Titel`);
    console.error('  Diese Umgebung hat keinen Marktdatenzugang (alle Quote-Hosts 403 per Egress-Policy).');
    console.error('  Gebraucht wird eine Kursdatei mit Tages-OHLCV je Titel ab 2026-07-30 bis zum Stichtag:');
    console.error('');
    console.error(`      node _SYSTEM/Scripts/ema200-review.mjs --template ${asOf} > quotes-${asOf}.json`);
    console.error(`      node _SYSTEM/Scripts/ema200-review.mjs ${asOf} --quotes quotes-${asOf}.json --write --ledger`);
    console.error('');
    console.error(`  Titel: ${freeze.entries.map(e => e.ticker).join(' ')}`);
    return 2;
  }

  const quotes = JSON.parse(readFileSync(qPath, 'utf8'));
  if (quotes.asOf && quotes.asOf !== asOf) {
    console.error(`EMA200-REVIEW: Stichtag ${asOf} passt nicht zu quotes.asOf ${quotes.asOf}`);
    return 2;
  }
  const rv = review(freeze, quotes, asOf);
  console.log(renderReport(rv));

  if (flag('--write')) {
    if (!rv.authoritative) {
      console.error('\nEMA200-REVIEW: --write verweigert — quotes.verified !== true oder quotes.source leer.');
      return 3;
    }
    const out = resolve(`${OUT_DIR}/ema200-review-${asOf}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(rv, null, 2), 'utf8');
    console.error(`\ngeschrieben: ${out}`);
  }

  if (flag('--ledger')) {
    if (!rv.authoritative) {
      console.error('EMA200-REVIEW: --ledger verweigert — Kurse nicht verifiziert.');
      return 3;
    }
    recordOutcome({
      predictionId: `${freeze.id}:${asOf}`,
      observedEffects: rv.results
        .filter(r => r.status === 'SCORED')
        .map(r => ({ target: r.ticker, effect: r.reversal ? 'reversal-confirmed' : 'no-reversal' })),
      ts: `${asOf}T22:15:00Z`,
    });
    console.error(`Ledger-Eintrag: ${freeze.id}:${asOf}`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv));
}
