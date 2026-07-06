#!/usr/bin/env node
// instrument-registry.test.mjs — red/grey/green for the instrument layer (MURE gap-4).
// Run: node --test _SYSTEM/Scripts/alpha-factor-library/instrument-registry.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FLAG_DIR = mkdtempSync(path.join(tmpdir(), 'mure-instr-'));
const FLAG = path.join(FLAG_DIR, 'mure-instruments.enabled');
process.env.MURE_FLAG_DIR = FLAG_DIR;
const arm = () => writeFileSync(FLAG, '1');
const disarm = () => { try { unlinkSync(FLAG); } catch { /* absent */ } };

const {
  resolveInstrument, getInstrumentByVenue, resolveNautilusId, resolveYuriMarket,
  listInstrumentsByClass, getFeeModel, registerInstrument, frontMonthCode, MONTH_CODES,
} = await import('./instrument-registry.mjs');

test.after(() => { rmSync(FLAG_DIR, { recursive: true, force: true }); });

// ═══ RED — DISARMED degrade preserves the crypto pipeline ═════════════════════

test('DISARMED: resolveInstrument returns crypto default; mappings null; fee = binance', () => {
  disarm();
  const es = resolveInstrument('ES-USD');
  assert.equal(es.assetClass, 'crypto', 'non-crypto lookup degrades to the crypto default');
  assert.equal(es.venue, 'binance');
  assert.equal(resolveNautilusId('ES-USD', { contract: 'M6' }), null);
  assert.equal(resolveYuriMarket('ESM6.GLBX'), null);
  assert.deepEqual(listInstrumentsByClass('future'), []);
  assert.equal(frontMonthCode(new Date('2026-07-06')), null);
  assert.deepEqual(registerInstrument({ market: 'X-USD' }), { status: 'DISARMED' });
  // Disarmed fee = the current live default (binance taker, notional-fraction):
  const fee = getFeeModel('ES-USD')('binance', 100000, 0.01); // $1000 notional × 0.0005
  assert.ok(Math.abs(fee - 0.5) < 1e-9, `disarmed fee = binance taker on notional (got ${fee})`);
  // Crypto still resolves as crypto (existing pipeline unchanged):
  assert.equal(resolveInstrument('BTC-USD').assetClass, 'crypto');
  assert.equal(getInstrumentByVenue('binance', 'BTCUSDT').market, 'BTC-USD');
  assert.equal(getInstrumentByVenue('databento', 'ES'), null, 'non-crypto venue → null when disarmed');
});

// ═══ GREEN — armed registry (Lane E table values) ═════════════════════════════

test('ARMED: CME futures specs match the Lane-E table exactly', () => {
  arm();
  const es = resolveInstrument('ES-USD');
  assert.equal(es.contractMultiplier, 50);
  assert.equal(es.tickSize, 0.25);
  assert.equal(es.tickValue, 12.50);
  assert.equal(es.ibExchange, 'CME');
  assert.equal(es.monthCycle, 'quarterly');
  assert.equal(resolveInstrument('NQ-USD').contractMultiplier, 20);
  assert.equal(resolveInstrument('RTY-USD').tickSize, 0.10);
  const ym = resolveInstrument('YM-USD');
  assert.equal(ym.ibExchange, 'CBOT', 'YM routes CBOT not CME (Lane E — flagged UNVERIFIED vs live)');
  assert.equal(ym.contractMultiplier, 5);
  const cl = resolveInstrument('CL-USD');
  assert.equal(cl.contractMultiplier, 1000);
  assert.equal(cl.monthCycle, 'monthly');
  assert.equal(resolveInstrument('NG-USD').tickSize, 0.001);
  // GEX underlyings carry the 100× option multiplier:
  assert.equal(resolveInstrument('SPX-USD').optionMultiplier, 100);
  assert.equal(resolveInstrument('SPY-USD').optionMultiplier, 100);
  // Unregistered crypto-shaped market → generic crypto spec; junk → null.
  assert.equal(resolveInstrument('SOL-USD').assetClass, 'crypto');
  assert.equal(resolveInstrument('NOT_A_MARKET'), null);
  assert.equal(resolveInstrument(''), null);
});

test('ARMED: nautilus id mapping — Databento GLBX default (C1), IB alternate, continuous, crypto', () => {
  arm();
  assert.equal(resolveNautilusId('ES-USD', { contract: 'M4' }), 'ESM4.GLBX', 'seam-spec example shape');
  assert.equal(resolveNautilusId('ES-USD', { venue: 'ib', contract: 'M4' }), 'ESM4.CME', 'Lane E IB_SIMPLIFIED');
  assert.equal(resolveNautilusId('YM-USD', { venue: 'ib', contract: 'Z6' }), 'YMZ6.CBOT');
  assert.equal(resolveNautilusId('ES-USD', { continuous: true }), 'ES.c.0.GLBX', 'Databento continuous');
  assert.equal(resolveNautilusId('ES-USD', { venue: 'ib', continuous: true }), 'ES.CME', 'IB continuous');
  assert.equal(resolveNautilusId('BTC-USD'), 'BTCUSDT.BINANCE');
  assert.equal(resolveNautilusId('SPX-USD'), 'SPX.OPRA');
  // Auto front-month resolves through frontMonthCode:
  const auto = resolveNautilusId('ES-USD', { date: new Date('2026-07-06T00:00:00Z') });
  assert.equal(auto, 'ESU6.GLBX', `Jul 2026 → front quarterly = Sep (U6) (got ${auto})`);
  // Bad contract code rejected → falls back to auto (not garbage passthrough):
  const bad = resolveNautilusId('ES-USD', { contract: 'XX99', date: new Date('2026-07-06T00:00:00Z') });
  assert.equal(bad, 'ESU6.GLBX', 'malformed contract code → auto front month');
  assert.equal(resolveNautilusId('GHOST-MARKET'), null);
});

test('ARMED: reverse mapping — raw month, 2-digit year, continuous, IB, crypto, junk', () => {
  arm();
  assert.equal(resolveYuriMarket('ESM4.GLBX'), 'ES-USD');
  assert.equal(resolveYuriMarket('ESM26.GLBX'), 'ES-USD', '2-digit year form');
  assert.equal(resolveYuriMarket('ES.c.0.GLBX'), 'ES-USD', 'continuous form');
  assert.equal(resolveYuriMarket('ESM4.CME'), 'ES-USD', 'IB venue form');
  assert.equal(resolveYuriMarket('CLZ7.NYMEX'), 'CL-USD', 'Lane E verbatim example');
  assert.equal(resolveYuriMarket('YMZ6.CBOT'), 'YM-USD');
  assert.equal(resolveYuriMarket('BTCUSDT.BINANCE'), 'BTC-USD');
  assert.equal(resolveYuriMarket('ZZZM4.GLBX'), null, 'unknown root → null');
  assert.equal(resolveYuriMarket('no-dot'), null);
  assert.equal(resolveYuriMarket(42), null);
  // Round-trip property: id → market → id (same contract) is identity for every future.
  for (const spec of listInstrumentsByClass('future')) {
    const id = resolveNautilusId(spec.market, { contract: 'H7' });
    assert.equal(resolveYuriMarket(id), spec.market, `round-trip ${spec.market} ↔ ${id}`);
  }
});

test('ARMED: front month codes — quarterly + monthly cycles, year rollover', () => {
  arm();
  assert.equal(MONTH_CODES.join(''), 'FGHJKMNQUVXZ');
  assert.deepEqual(frontMonthCode(new Date('2026-07-06T00:00:00Z'), 'quarterly'), { code: 'U', yearDigit: '6', label: 'U6' }, 'Jul → Sep (U)');
  assert.deepEqual(frontMonthCode(new Date('2026-01-15T00:00:00Z'), 'quarterly'), { code: 'H', yearDigit: '6', label: 'H6' }, 'Jan → Mar (H)');
  assert.deepEqual(frontMonthCode(new Date('2026-12-20T00:00:00Z'), 'quarterly'), { code: 'H', yearDigit: '7', label: 'H7' }, 'Dec (post-roll) → next-year Mar');
  assert.deepEqual(frontMonthCode(new Date('2026-07-06T00:00:00Z'), 'monthly'), { code: 'Q', yearDigit: '6', label: 'Q6' }, 'Jul → Aug (Q) monthly');
  assert.deepEqual(frontMonthCode(new Date('2026-12-06T00:00:00Z'), 'monthly'), { code: 'F', yearDigit: '7', label: 'F7' }, 'Dec → next-year Jan monthly');
});

test('ARMED: fee models — futures per-contract, crypto notional (reused), equity zero', () => {
  arm();
  const esFee = getFeeModel('ES-USD');
  assert.equal(esFee('databento', 5000, 2), 5.00, '2 ES contracts × $2.50 all-in');
  assert.equal(esFee('databento', 999999, 2), 5.00, 'futures fee ignores price (per-contract, not notional)');
  assert.equal(getFeeModel('ES-USD', { perContract: 1.25 })('x', 0, 4), 5.00, 'perContract override');
  const btcFee = getFeeModel('BTC-USD');
  assert.ok(Math.abs(btcFee('binance', 100000, 0.01) - 0.5) < 1e-9, 'crypto delegates to binanceFeeModel (REUSE)');
  assert.equal(getFeeModel('SPY-USD')('x', 500, 100), 0, 'equity zero-commission approximation');
  assert.equal(getFeeModel('SPX-USD')('x', 5000, 1), 0);
  assert.ok(getFeeModel('GHOST')('x', 100, 1) >= 0, 'unknown market → safe default, never throws');
});

test('ARMED: registerInstrument — upsert, validation, listByClass', () => {
  arm();
  const r = registerInstrument({ market: 'MES-USD', nautilusRoot: 'MES', nautilusVenue: 'GLBX', ibExchange: 'CME', assetClass: 'future', venue: 'databento', tickSize: 0.25, lotSize: 1, contractMultiplier: 5, quoteCurrency: 'USD', pricePrecision: 2, feeModel: 'futures-standard', monthCycle: 'quarterly' });
  assert.equal(r.status, 'ok');
  assert.equal(resolveInstrument('MES-USD').contractMultiplier, 5);
  assert.equal(resolveYuriMarket('MESU6.GLBX'), 'MES-USD', 'registered instrument reverse-maps');
  assert.ok(listInstrumentsByClass('future').some((s) => s.market === 'MES-USD'));
  // Validation: bad numeric field / missing market rejected.
  assert.equal(registerInstrument({ market: 'BAD-USD', tickSize: 'huge' }).status, 'rejected');
  assert.equal(registerInstrument({}).status, 'rejected');
  assert.equal(registerInstrument(null).status, 'rejected');
  // Upsert merge: override one field, keep the rest.
  registerInstrument({ market: 'MES-USD', tickValue: 1.25 });
  assert.equal(resolveInstrument('MES-USD').tickValue, 1.25);
  assert.equal(resolveInstrument('MES-USD').contractMultiplier, 5, 'merge preserved multiplier');
});

test('ARMED: getInstrumentByVenue', () => {
  arm();
  assert.equal(getInstrumentByVenue('databento', 'ES').market, 'ES-USD');
  assert.equal(getInstrumentByVenue('databento', 'es').market, 'ES-USD', 'case-insensitive');
  assert.equal(getInstrumentByVenue('binance', 'BTCUSDT').market, 'BTC-USD');
  assert.equal(getInstrumentByVenue('databento', 'NOPE'), null);
  assert.equal(getInstrumentByVenue(null, null), null);
});
