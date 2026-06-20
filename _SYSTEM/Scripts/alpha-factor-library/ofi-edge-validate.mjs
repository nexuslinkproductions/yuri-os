#!/usr/bin/env node
// @capability: ofi-edge-validate
// @serves: OFI predictive validation | does order-flow imbalance predict returns | microstructure edge test | Cont-Kukanov crypto | HFT edge gate
// @does: The predictive-R² gate for OFI (order-flow imbalance) as a sizing edge. Streams a recorded L2 tape (tape-recorder JSONL), reconstructs the book via tape-replay (the TESTED reconstructor — NOT a hand-rolled one, which silently desyncs without depth-book's pu-chaining), computes OFI contributions via ofi.mjs (Cont-Kukanov-Stoikov) between consecutive bookAt samples, and measures predictive R² of OFI@t vs forward mid-return@[t,t+h]. Validation bar: R²>0.15 meaningful, <0.10 noise. Handles >V8-string-limit tapes by streaming a bounded window into an array (loadTape's array branch expects parsed OBJECTS, not strings).
// @use: `node ofi-edge-validate.mjs <tape.jsonl>` — prints per-horizon R² + verdict. Re-run on fresh tapes / other assets. Class-A measurement (changes what we KNOW; never what the system DOES). The equity-literature R²~0.3 @1s (Cont-Kukanov) did NOT replicate on Binance BTCUSDT in the first run (~0.006) — crypto perp microstructure differs; treat as asset/venue-specific, not universal.
// @exports: validateOFI
//
// CONSTRAINTS: pure read of a local tape (INV-1), no keys (INV-2), deterministic + offline (INV-7). Capability-first: wraps tape-replay + ofi.mjs.

import { loadTape } from './tape-replay.mjs';
import { ofiContribution } from './ofi.mjs';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const STEP_MS = 200, WINDOW_MS = 30 * 60 * 1000, STREAM_BUFFER_MS = 90 * 60 * 1000, HORIZONS = [200, 500, 1000, 5000];

async function streamEvents(tapePath, bufferMs = STREAM_BUFFER_MS) {
  const events = [];
  const rl = readline.createInterface({ input: createReadStream(tapePath), crlfDelay: Infinity });
  let firstTs = null;
  for await (const line of rl) {
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!Number.isFinite(o?.ts)) continue;
    if (firstTs === null) firstTs = o.ts;
    if (o.ts - firstTs > bufferMs) break;
    events.push(o);   // loadTape's array branch expects parsed OBJECTS (classifyEvent reads .t)
  }
  return events;
}

export async function validateOFI(tapePath) {
  const tape = loadTape(await streamEvents(tapePath));
  const snaps = tape._snaps || [];
  if (!snaps.length) throw new Error('no snaps in streamed subset');
  const t0 = snaps[0].ts, t1 = t0 + WINDOW_MS;
  const samples = [];
  let prev = null;
  for (let ts = t0; ts <= t1; ts += STEP_MS) {
    const bk = tape.bookAt(ts);
    if (!bk || !bk.topBids?.length || !bk.topAsks?.length) continue;
    const bb = bk.topBids[0], aa = bk.topAsks[0];
    if (!(bb.size > 0) || !(aa.size > 0) || !(aa.price > bb.price)) continue;
    const oc = ofiContribution(prev, { ts, bidPx: bb.price, bidSz: bb.size, askPx: aa.price, askSz: aa.size });
    prev = { ts, bidPx: bb.price, bidSz: bb.size, askPx: aa.price, askSz: aa.size };
    if (oc.skipped || oc.crossedBook) continue;
    samples.push({ ts, mid: bk.mid, ofi: oc.e });
  }
  const r2 = (h) => {
    let n = 0, sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0, j = 0;
    for (let i = 0; i < samples.length; i++) {
      const target = samples[i].ts + h;
      while (j < samples.length && samples[j].ts < target) j++;
      if (j >= samples.length) break;
      const x = samples[i].ofi, y = (samples[j].mid - samples[i].mid) / samples[i].mid;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      n++; sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y;
    }
    if (n < 50) return { n, r2: NaN };
    const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
    const r = den ? (n * sxy - sx * sy) / den : 0;
    return { n, r2: r * r, r };
  };
  return { samples: samples.length, snaps: snaps.length, diffs: tape._diffs?.length, t0, byHorizon: HORIZONS.map(h => ({ h, ...r2(h) })) };
}

const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_main && process.argv.includes('--test')) {
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };
  ok(typeof validateOFI === 'function', 'validateOFI exported');
  ok(STEP_MS === 200 && HORIZONS.length === 4, 'config sane');
  console.log(`ofi-edge-validate --test: ${pass} pass, ${fail} fail`);   // full validation needs a real tape (run on _SYSTEM/state/tape/*.jsonl)
  process.exit(fail ? 1 : 0);
} else if (_main) {
  const tape = process.argv[2];
  if (!tape) { console.error('usage: node ofi-edge-validate.mjs <tape.jsonl>'); process.exit(1); }
  console.log(`streaming ~${STREAM_BUFFER_MS/60000}min of ${tape}...`);
  const res = await validateOFI(tape);
  console.log(`samples: ${res.samples} | snaps ${res.snaps} diffs ${res.diffs} | window ${new Date(res.t0).toISOString().slice(11,19)} +${WINDOW_MS/60000}min`);
  console.log('horizon   n        R²        r        VERDICT');
  for (const { h, n, r2, r } of res.byHorizon) {
    if (!Number.isFinite(r2)) { console.log(`${String(h+'ms').padEnd(9)} (insufficient)`); continue; }
    console.log(`${String(h+'ms').padEnd(9)} ${String(n).padEnd(8)} ${r2.toFixed(4).padEnd(9)} ${(r||0).toFixed(4).padEnd(8)} ${r2 > 0.15 ? '✓ MEANINGFUL' : r2 < 0.10 ? '✗ noise' : '~ weak'}`);
  }
  const best = res.byHorizon.filter(x => Number.isFinite(x.r2)).sort((a, b) => b.r2 - a.r2)[0];
  console.log(`\nOFI VERDICT: best R²=${best?.r2?.toFixed(4)} @${best?.h}ms (equity lit predicts ~0.3@1s). ` +
    (best && best.r2 > 0.15 ? '→ OFI VALIDATES — wire it.' : best && best.r2 < 0.10 ? '→ OFI does not predict on this tape (honest no).' : '→ marginal.'));
}
