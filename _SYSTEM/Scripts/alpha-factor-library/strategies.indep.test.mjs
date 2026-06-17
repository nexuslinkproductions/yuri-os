#!/usr/bin/env node
// @capability: strategies-indep-test
// @serves: independent conformance oracle for the alpha-factor strategy library
// @does: Black-box conformance test of strategies-trend, strategies-meanrev,
//         strategies-volume-vol, and strategy-registry. Uses deterministic LCG
//         synthetic bars (no Math.random / Date.now). Asserts shared Signal
//         contract, no NaN/Infinity leak, registry union+dedup, fail-soft on
//         garbage, NaN-bar resilience, determinism, and market scoping.
// @exports: runTests (for import), plus main-guarded execution.

import { pathToFileURL } from 'node:url';
import { computeSignals as trendSignals } from './strategies-trend.mjs';
import { computeSignals as meanrevSignals } from './strategies-meanrev.mjs';
import { computeSignals as volvolSignals } from './strategies-volume-vol.mjs';
import { computeAllStrategies } from './strategy-registry.mjs';

const FAMILIES = [
  ['trend', trendSignals],
  ['meanrev', meanrevSignals],
  ['volvol', volvolSignals],
];

// ── deterministic LCG (no Math.random) ───────────────────────────────────────
function makeLcg(seed = 0xC0FFEE) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

// ── synthetic bar generator: healthy ~120-bar series with uptrend+spike+dump
function makeHealthyBars(count = 120, market = 'TESTMKT') {
  const rng = makeLcg(0xDECAFBAD);
  const bars = [];
  let price = 100;
  const t0 = 1_700_000_000;
  for (let i = 0; i < count; i++) {
    // phase 0-39: gentle uptrend; 40-59: spike up; 60-89: dump; 90-end: recovery
    let drift = 0.3;
    if (i >= 40 && i < 60) drift = 1.2;
    else if (i >= 60 && i < 90) drift = -1.0;
    else if (i >= 90) drift = 0.5;

    const noise = (rng() - 0.5) * 1.5;
    const change = drift + noise;
    const open = price;
    const close = Math.max(0.01, price + change);
    const high = Math.max(open, close) + rng() * 0.8;
    const low = Math.min(open, close) - rng() * 0.8;
    const volume = Math.floor(1000 + rng() * 2000);
    bars.push({
      timestamp: t0 + i * 60,
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
      volume,
    });
    price = close;
  }
  return bars;
}

function shortBars(n) {
  return makeHealthyBars(n, 'TESTMKT');
}

// ── assertion harness ────────────────────────────────────────────────────────
function runTests() {
  let pass = 0;
  let fail = 0;
  const failures = [];

  function ok(cond, label) {
    if (cond) {
      pass++;
    } else {
      fail++;
      failures.push(label);
      console.error(`FAIL: ${label}`);
    }
  }

  const healthy = makeHealthyBars(120, 'TESTMKT');
  const market = 'TESTMKT';

  // ── 1. Contract conformance for each family + registry ───────────────────
  for (const [name, fn] of FAMILIES) {
    let sigs = [];
    let threw = false;
    try {
      sigs = fn(healthy, market);
    } catch (e) {
      threw = true;
    }
    ok(!threw, `${name}: computeSignals does not throw on healthy bars`);
    ok(Array.isArray(sigs), `${name}: returns an array on healthy bars`);

    for (const s of sigs) {
      ok(s && typeof s === 'object', `${name}: signal is an object`);
      if (!s || typeof s !== 'object') continue;
      ok(typeof s.factorId === 'string' && s.factorId.length > 0, `${name}: factorId is non-empty string (${s.factorId})`);
      ok(s.factorId && s.factorId.endsWith(`-${market}`), `${name}: factorId ends with -${market} (${s.factorId})`);
      ok(typeof s.value === 'number' && Number.isFinite(s.value), `${name}: value is finite (${s.factorId}=${s.value})`);
      ok(s.side === 'long' || s.side === 'short', `${name}: side is long|short (${s.factorId}=${s.side})`);
      ok(typeof s.confidence === 'number' && Number.isFinite(s.confidence) && s.confidence > 0 && s.confidence <= 1, `${name}: confidence in (0,1] (${s.factorId}=${s.confidence})`);
      ok(typeof s.ts === 'number' && Number.isFinite(s.ts), `${name}: ts is finite (${s.factorId}=${s.ts})`);
      ok(typeof s.archetype === 'string' && s.archetype.length > 0, `${name}: archetype is non-empty string (${s.archetype})`);
    }
  }

  // Registry on healthy bars
  let registrySigs = [];
  let registryThrew = false;
  try {
    registrySigs = computeAllStrategies(healthy, market);
  } catch (e) {
    registryThrew = true;
  }
  ok(!registryThrew, 'registry: computeAllStrategies does not throw on healthy bars');
  ok(Array.isArray(registrySigs), 'registry: returns an array on healthy bars');
  for (const s of registrySigs) {
    ok(s && typeof s === 'object', 'registry: signal is an object');
    if (!s || typeof s !== 'object') continue;
    ok(typeof s.factorId === 'string' && s.factorId.length > 0, `registry: factorId is non-empty string (${s.factorId})`);
    ok(s.factorId && s.factorId.endsWith(`-${market}`), `registry: factorId ends with -${market} (${s.factorId})`);
    ok(typeof s.value === 'number' && Number.isFinite(s.value), `registry: value is finite (${s.factorId}=${s.value})`);
    ok(s.side === 'long' || s.side === 'short', `registry: side is long|short (${s.factorId}=${s.side})`);
    ok(typeof s.confidence === 'number' && Number.isFinite(s.confidence) && s.confidence > 0 && s.confidence <= 1, `registry: confidence in (0,1] (${s.factorId}=${s.confidence})`);
    ok(typeof s.ts === 'number' && Number.isFinite(s.ts), `registry: ts is finite (${s.factorId}=${s.ts})`);
    ok(typeof s.archetype === 'string' && s.archetype.length > 0, `registry: archetype is non-empty string (${s.archetype})`);
  }

  // ── 2. No NaN/Infinity leak anywhere ─────────────────────────────────────
  const allSigs = [
    ...trendSignals(healthy, market),
    ...meanrevSignals(healthy, market),
    ...volvolSignals(healthy, market),
    ...computeAllStrategies(healthy, market),
  ];
  for (const s of allSigs) {
    ok(!Number.isNaN(s.value) && !Number.isNaN(s.confidence), `no NaN leak: ${s.factorId} value=${s.value} conf=${s.confidence}`);
    ok(Number.isFinite(s.value) && Number.isFinite(s.confidence), `no Infinity leak: ${s.factorId} value=${s.value} conf=${s.confidence}`);
  }

  // ── 3. Registry = union + dedup ──────────────────────────────────────────
  const trendCount = trendSignals(healthy, market).length;
  const meanrevCount = meanrevSignals(healthy, market).length;
  const volvolCount = volvolSignals(healthy, market).length;
  const maxSingle = Math.max(trendCount, meanrevCount, volvolCount);
  ok(registrySigs.length >= maxSingle, `registry length ${registrySigs.length} >= largest family ${maxSingle}`);
  const idSet = new Set(registrySigs.map((s) => s.factorId));
  ok(idSet.size === registrySigs.length, `registry has no duplicate factorIds (set=${idSet.size}, array=${registrySigs.length})`);

  // ── 4. Fail-soft on garbage ──────────────────────────────────────────────
  const garbageCases = [
    ['empty array', []],
    ['null bars', null],
    ['2 short bars', shortBars(2)],
  ];
  for (const [label, badBars] of garbageCases) {
    for (const [name, fn] of FAMILIES) {
      let threw = false;
      let result;
      try {
        result = fn(badBars, market);
      } catch (e) {
        threw = true;
      }
      ok(!threw, `${name}: does not throw on ${label}`);
      ok(result === undefined || Array.isArray(result), `${name}: returns array/undefined on ${label}`);
    }
    let threw = false;
    let result;
    try {
      result = computeAllStrategies(badBars, market);
    } catch (e) {
      threw = true;
    }
    ok(!threw, `registry: does not throw on ${label}`);
    ok(Array.isArray(result), `registry: returns array on ${label}`);
  }

  // ── 5. NaN-bar resilience ────────────────────────────────────────────────
  const nanBars = healthy.map((b, i) => (i === 60 ? { ...b, close: NaN, volume: 0 } : b));
  for (const [name, fn] of FAMILIES) {
    let threw = false;
    let sigs = [];
    try {
      sigs = fn(nanBars, market);
    } catch (e) {
      threw = true;
    }
    ok(!threw, `${name}: does not throw on NaN/0-volume bar`);
    ok(Array.isArray(sigs), `${name}: returns array on NaN/0-volume bar`);
    for (const s of sigs) {
      ok(Number.isFinite(s.value) && !Number.isNaN(s.value), `${name}: no NaN value after NaN bar (${s.factorId})`);
      ok(Number.isFinite(s.confidence) && !Number.isNaN(s.confidence), `${name}: no NaN confidence after NaN bar (${s.factorId})`);
    }
  }
  let regNanThrew = false;
  let regNanSigs = [];
  try {
    regNanSigs = computeAllStrategies(nanBars, market);
  } catch (e) {
    regNanThrew = true;
  }
  ok(!regNanThrew, 'registry: does not throw on NaN/0-volume bar');
  ok(Array.isArray(regNanSigs), 'registry: returns array on NaN/0-volume bar');
  ok(!regNanSigs.some((s) => Number.isNaN(s.value) || Number.isNaN(s.confidence)), 'registry: no NaN signal after NaN bar');

  // ── 6. Determinism ─────────────────────────────────────────────────────────
  const run1 = computeAllStrategies(healthy, market);
  const run2 = computeAllStrategies(healthy, market);
  ok(run1.length === run2.length, `determinism: same length (${run1.length} vs ${run2.length})`);
  const ids1 = run1.map((s) => s.factorId).sort();
  const ids2 = run2.map((s) => s.factorId).sort();
  ok(ids1.length === ids2.length && ids1.every((id, i) => id === ids2[i]), 'determinism: same factorIds');

  // ── 7. Market scoping with ETH-USD ───────────────────────────────────────
  const ethBars = makeHealthyBars(120, 'ETH-USD');
  const ethSigs = computeAllStrategies(ethBars, 'ETH-USD');
  ok(ethSigs.every((s) => s.factorId.endsWith('-ETH-USD')), 'registry: every factorId ends with -ETH-USD');
  for (const [name, fn] of FAMILIES) {
    const sigs = fn(ethBars, 'ETH-USD');
    ok(sigs.every((s) => s.factorId.endsWith('-ETH-USD')), `${name}: every factorId ends with -ETH-USD`);
  }

  // ── 8. Extra: registry contains multiple archetypes ──────────────────────
  const archetypes = new Set(registrySigs.map((s) => s.archetype));
  ok(archetypes.size >= 2, `registry contains >=2 archetypes (${[...archetypes].join(',')})`);

  // ── 9. Extra: every family emits at least one signal on adversarial healthy bars ──
  ok(trendCount > 0, `trend family fires on healthy bars (${trendCount})`);
  ok(meanrevCount > 0, `meanrev family fires on healthy bars (${meanrevCount})`);
  ok(volvolCount > 0, `volvol family fires on healthy bars (${volvolCount})`);

  return { pass, fail, failures, registrySigs };
}

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main) {
  const { pass, fail, failures } = runTests();
  console.log(`strategies.indep: ${pass} pass, ${fail} fail`);
  if (fail > 0) {
    console.error('Independent oracle found contract violations:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

export { runTests };
