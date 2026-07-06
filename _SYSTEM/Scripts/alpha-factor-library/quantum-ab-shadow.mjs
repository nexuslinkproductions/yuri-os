// @capability: quantum-ab-shadow
// @serves: quantum factor ordering A/B shadow | does order-optimal sequencing lift outcomes | classical vs quantum combined signal | instrument before arming | quantum advantage measurement
// @does: DISARMED telemetry harness — for each cycle, derives the combined directional call two ways from the SAME factor signals (classical equal-weight vote vs quantum bestOrdering-weighted vote, using the factor-circuit's live snap.circuit output), records leak-free shadow predictions, and scores them against LATER realized returns to measure whether the quantum ordering would lift outcomes. NEVER sizes a position or touches the paper engine.
// @use: reach for this to ANSWER "does running the quantum factor-circuit in the background improve outcomes?" with measured evidence (A/B hit-rate + return lift) BEFORE anyone arms ordering→sizing. Arming is a separate owner-gated step.
// @exports: shadowCompare, recordShadowPrediction, scoreShadow
//
// WHY a shadow, not a driver: the factor-circuit proves an ORDER effect exists (ratio>1 when
// factors don't commute), but ordering can only improve outcomes by better-combining factors that
// ALREADY have edge. Today every factor is edge-less (DSR≈0). So we MEASURE the lift in the
// background and only arm ordering→sizing once it's proven on factors with real edge.
//
// LEAK-FREE: a shadow prediction recorded at cycle T is scored only against a return realized
// AFTER T (supplied by the caller via realizedByKey). DETERMINISTIC. Never throws out of the API.

import { appendFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** side → signed direction. LONG=+1, SHORT=-1, anything else (NEUTRAL/flat)=0. */
function sideDir(side) {
  if (side === 'LONG' || side === 'long' || side === 'buy' || side === 'BUY') return 1;
  if (side === 'SHORT' || side === 'short' || side === 'sell' || side === 'SELL') return -1;
  return 0;
}

/** sign of a number with a dead-zone at 0 → -1 | 0 | 1. */
function sgn(x, eps = 1e-12) {
  if (!isNum(x) || Math.abs(x) <= eps) return 0;
  return x > 0 ? 1 : -1;
}

/**
 * bestOrdering position weights. The circuit says the FIRST factor in bestOrdering dominates the
 * signal subspace; later factors refine within it. So weight factor at ordering-position p (0-based)
 * by a linear decay (n - p)/n. factorIds[orderingIndex] maps the circuit's index → factor id.
 * Returns Map<factorId, weight in (0,1]>. Falls back to equal weights when ordering is unusable.
 */
function orderingWeights(circuit) {
  const ids = Array.isArray(circuit?.factorIds) ? circuit.factorIds : [];
  const ord = Array.isArray(circuit?.bestOrdering) ? circuit.bestOrdering : [];
  const w = new Map();
  if (!ids.length) return w;
  if (!ord.length || ord.length !== ids.length) {
    // No usable ordering → equal weights (classical).
    for (const id of ids) w.set(id, 1);
    return w;
  }
  const n = ord.length;
  for (let p = 0; p < ord.length; p++) {
    const idx = ord[p];
    const id = ids[idx];
    if (id == null) continue;
    w.set(id, (n - p) / n); // first position → 1, last → 1/n
  }
  // Any id not covered by the ordering → smallest weight (defensive).
  for (const id of ids) if (!w.has(id)) w.set(id, 1 / n);
  return w;
}

/**
 * shadowCompare({ signals, circuit }) — derive the combined directional call two ways from the
 * SAME signals. classical = equal-weight signed-confidence vote; quantum = bestOrdering-weighted vote.
 * FAIL-OPEN: degenerate / allCommute / <2 directional signals → quantum === classical, agree:true.
 * @returns {{ratio, allCommute, degenerate, classicalDir, quantumDir, agree, classicalScore, quantumScore, n}}
 */
export function shadowCompare({ signals, circuit } = {}) {
  const out = {
    ratio: isNum(circuit?.ratio) ? circuit.ratio : 1,
    allCommute: circuit?.allCommute !== false, // default true (=classical) unless explicitly false
    degenerate: circuit?.degenerate === true,
    classicalDir: 0, quantumDir: 0, agree: true,
    classicalScore: 0, quantumScore: 0, n: 0,
  };
  const sigs = Array.isArray(signals)
    ? signals.filter((s) => s && sideDir(s.side) !== 0)
    : [];
  out.n = sigs.length;
  if (sigs.length === 0) return out;

  // Classical: equal-weight signed-confidence vote.
  let cScore = 0;
  for (const s of sigs) {
    const conf = isNum(s.confidence) ? s.confidence : 0.5;
    cScore += sideDir(s.side) * conf;
  }
  out.classicalScore = cScore;
  out.classicalDir = sgn(cScore);

  // Quantum: bestOrdering-weighted vote. If the circuit is degenerate/commuting or the ordering is
  // unusable, the weights are equal → quantum === classical (no faked advantage).
  const useQuantum = out.allCommute === false && !out.degenerate;
  if (!useQuantum) {
    out.quantumScore = cScore;
    out.quantumDir = out.classicalDir;
    out.agree = true;
    return out;
  }
  const w = orderingWeights(circuit);
  let qScore = 0;
  for (const s of sigs) {
    const conf = isNum(s.confidence) ? s.confidence : 0.5;
    const weight = w.has(s.factorId) ? w.get(s.factorId) : 1;
    qScore += sideDir(s.side) * conf * weight;
  }
  out.quantumScore = qScore;
  out.quantumDir = sgn(qScore);
  out.agree = out.quantumDir === out.classicalDir;
  return out;
}

/** stable shadow-record key. */
function shadowKey(market, ts) {
  return `${market}@${ts}`;
}

/**
 * recordShadowPrediction(cmp, { market, ts, ledgerPath }) — append a LEAK-FREE shadow record
 * (the cycle-T predicted directions; NO outcome yet). Idempotent per (market, ts): a key already
 * present in the ledger is not re-appended. Returns { recorded:boolean, key }.
 */
export function recordShadowPrediction(cmp, { market, ts, ledgerPath } = {}) {
  if (!cmp || !market || !isNum(ts) || !ledgerPath) return { recorded: false, key: null };
  const key = shadowKey(market, ts);
  try {
    if (existsSync(ledgerPath)) {
      const raw = readFileSync(ledgerPath, 'utf8');
      // Cheap dedupe: the key appears verbatim in its own record line.
      if (raw.includes(`"key":"${key}"`)) return { recorded: false, key };
    }
  } catch { /* unreadable → treat as absent, proceed to append */ }
  const rec = {
    type: 'shadow',
    key,
    market,
    ts,
    classicalDir: cmp.classicalDir,
    quantumDir: cmp.quantumDir,
    agree: cmp.agree,
    ratio: cmp.ratio,
    degenerate: cmp.degenerate,
  };
  try {
    appendFileSync(ledgerPath, JSON.stringify(rec) + '\n');
    return { recorded: true, key };
  } catch {
    return { recorded: false, key };
  }
}

/**
 * scoreShadow({ ledgerPath, realizedByKey }) — join recorded shadow predictions with LATER realized
 * returns (realizedByKey: { [key]: forwardReturn }) and compute the A/B verdict. A record with no
 * realized entry is EXCLUDED (leak-free — never scored as a hit or a miss). A direction d is "right"
 * when d*realizedReturn > 0; directional return captured = d*realizedReturn.
 * @returns {{n, classicalHitRate, quantumHitRate, classicalMeanRet, quantumMeanRet, quantumLift, disagree:{n, classicalHitRate, quantumHitRate, classicalMeanRet, quantumMeanRet}}}
 */
export function scoreShadow({ ledgerPath, realizedByKey } = {}) {
  const empty = {
    n: 0, classicalHitRate: null, quantumHitRate: null,
    classicalMeanRet: null, quantumMeanRet: null, quantumLift: null,
    disagree: { n: 0, classicalHitRate: null, quantumHitRate: null, classicalMeanRet: null, quantumMeanRet: null },
  };
  const realized = realizedByKey && typeof realizedByKey === 'object' ? realizedByKey : {};
  let records = [];
  try {
    if (ledgerPath && existsSync(ledgerPath)) {
      records = readFileSync(ledgerPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((r) => r && r.type === 'shadow');
    }
  } catch { return empty; }
  if (!records.length) return empty;

  let n = 0, cHit = 0, qHit = 0, cRet = 0, qRet = 0;
  let dN = 0, dcHit = 0, dqHit = 0, dcRet = 0, dqRet = 0;
  for (const r of records) {
    const ret = realized[r.key];
    if (!isNum(ret)) continue; // leak-free: only score records with a realized forward return
    n++;
    const cd = isNum(r.classicalDir) ? r.classicalDir : 0;
    const qd = isNum(r.quantumDir) ? r.quantumDir : 0;
    const cRight = cd * ret > 0 ? 1 : 0;
    const qRight = qd * ret > 0 ? 1 : 0;
    cHit += cRight; qHit += qRight;
    cRet += cd * ret; qRet += qd * ret;
    if (cd !== qd) {
      dN++; dcHit += cRight; dqHit += qRight; dcRet += cd * ret; dqRet += qd * ret;
    }
  }
  if (n === 0) return empty;
  const div = (a, b) => (b > 0 ? a / b : null);
  return {
    n,
    classicalHitRate: cHit / n,
    quantumHitRate: qHit / n,
    classicalMeanRet: cRet / n,
    quantumMeanRet: qRet / n,
    quantumLift: (qRet / n) - (cRet / n),
    disagree: {
      n: dN,
      classicalHitRate: div(dcHit, dN),
      quantumHitRate: div(dqHit, dN),
      classicalMeanRet: div(dcRet, dN),
      quantumMeanRet: div(dqRet, dN),
    },
  };
}

// ── main-guarded self-test ──────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  const tmp = `/tmp/qab-shadow-test-${process.pid}.jsonl`;
  try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* noop */ }

  // 1) degenerate / commuting circuit → quantum === classical, agree.
  const deg = shadowCompare({
    signals: [{ factorId: 'a', side: 'LONG', confidence: 0.6 }, { factorId: 'b', side: 'SHORT', confidence: 0.5 }],
    circuit: { ratio: 1, allCommute: true, degenerate: false, factorIds: ['a', 'b'], bestOrdering: [0, 1] },
  });
  ok(deg.agree === true && deg.classicalDir === deg.quantumDir, 'degenerate → agree, identical dirs');

  // 2) <2 directional signals → agree.
  const one = shadowCompare({ signals: [{ factorId: 'a', side: 'LONG', confidence: 0.7 }], circuit: { allCommute: false, factorIds: ['a'], bestOrdering: [0] } });
  ok(one.agree === true, '<2 directional signals → agree');

  // 3) non-degenerate where ordering FLIPS the sign vs equal weight.
  //    Equal weight: +0.5 (a LONG .5) + -0.55 (b SHORT .55) = -0.05 → classical SHORT(-1).
  //    Ordering puts 'a' first (weight 1) and 'b' last (weight 1/2): +0.5*1 - 0.55*0.5 = 0.225 → quantum LONG(+1).
  const flip = shadowCompare({
    signals: [{ factorId: 'a', side: 'LONG', confidence: 0.5 }, { factorId: 'b', side: 'SHORT', confidence: 0.55 }],
    circuit: { ratio: 1.6, allCommute: false, degenerate: false, factorIds: ['a', 'b'], bestOrdering: [0, 1] },
  });
  ok(flip.classicalDir === -1, `non-degenerate classicalDir=-1 (got ${flip.classicalDir})`);
  ok(flip.quantumDir === 1, `non-degenerate quantumDir=+1 (got ${flip.quantumDir})`);
  ok(flip.agree === false, 'non-degenerate dirs differ → agree=false');

  // 4) recording is leak-free + idempotent.
  try { unlinkSync(tmp); } catch { /* noop */ }
  const r1 = recordShadowPrediction(flip, { market: 'BTC-USD', ts: 1000, ledgerPath: tmp });
  const r2 = recordShadowPrediction(flip, { market: 'BTC-USD', ts: 1000, ledgerPath: tmp }); // dup
  ok(r1.recorded === true && r2.recorded === false, 'recordShadowPrediction idempotent per (market,ts)');
  recordShadowPrediction(deg, { market: 'ETH-USD', ts: 1000, ledgerPath: tmp });

  // 5) scoreShadow: leak-free (only keys with realized returns scored) + correct math.
  //    BTC@1000: classicalDir=-1, quantumDir=+1. realized=+0.01 → classical wrong, quantum right.
  //    ETH@1000: classical==quantum (deg). realized MISSING → excluded.
  const sc = scoreShadow({ ledgerPath: tmp, realizedByKey: { 'BTC-USD@1000': 0.01 } });
  ok(sc.n === 1, `scoreShadow scored only records with realized return (n=${sc.n}, expected 1)`);
  ok(sc.quantumHitRate === 1 && sc.classicalHitRate === 0, 'quantum right, classical wrong on the flip');
  ok(Math.abs(sc.quantumLift - 0.02) < 1e-9, `quantumLift = +0.02 (got ${sc.quantumLift})`);
  ok(sc.disagree.n === 1, 'disagree bucket captured the flip');

  // 6) empty / absent ledger → empty verdict, no throw.
  const e = scoreShadow({ ledgerPath: '/tmp/does-not-exist-qab.jsonl', realizedByKey: {} });
  ok(e.n === 0 && e.quantumLift === null, 'empty ledger → empty verdict');

  try { unlinkSync(tmp); } catch { /* noop */ }
  console.log(`quantum-ab-shadow --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
