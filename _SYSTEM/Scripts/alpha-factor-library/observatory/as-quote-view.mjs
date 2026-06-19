#!/usr/bin/env node
// @capability: as-quote-view
// @serves: verify A-S quoter running | watch live paper quoter | as-quote terminal view | is the daemon quoting
// @does: Human-readable terminal view of the live A-S PAPER quoter (GET /api/observatory/as-quote on the daemon). One-shot or --watch (refresh every 3s). Pure read of the local daemon HTTP route — no orders, no writes.
// @use: node as-quote-view.mjs   (snapshot)   |   node as-quote-view.mjs --watch   (live)
// @exports: (CLI only)
const PORT = process.env.OBSERVATORY_PORT || 4243;
const URL = `http://127.0.0.1:${PORT}/api/observatory/as-quote`;
const watch = process.argv.includes('--watch');
const f = (x, d = 2) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : '—');

async function one() {
  let s;
  try { s = await (await fetch(URL)).json(); }
  catch (e) { console.log(`✗ A-S quoter unreachable on :${PORT} — is the daemon up? (${e.message})`); return; }
  if (watch && console.clear) console.clear();
  if (!s || !s.armed) { console.log(`A-S quoter: DISARMED (OBSERVATORY_AS_QUOTE not set on the daemon)`); return; }
  const lq = s.lastQuote || {};
  const dot = s.quoting ? '● QUOTING' : '○ idle';
  console.log(`┌─ A-S PAPER QUOTER ${dot}  ${new Date().toLocaleTimeString()} ──────────────`);
  console.log(`│ ${s.symbol}  uptime ${f(s.uptimeMs / 60000, 1)}m  quotes ${s.quoteCount}  ${s.paper ? 'PAPER (no real orders)' : ''}`);
  console.log(`│ quote   bid ${f(lq.bidPx, 1)}   ask ${f(lq.askPx, 1)}   halfSpread ${f(lq.halfSpread)}   reservation ${f(lq.reservation, 1)}`);
  console.log(`│ inputs  σ(price) ${f(s.sigmaPrice, 3)}   κ ${f(s.kappaPrice, 4)}  [${s.kappaSource}]`);
  console.log(`│ FILLS   ${s.fills}   inventory ${f(s.qLots, 0)} lots (max ${f(s.maxInventoryLots, 0)})`);
  console.log(`│ PnL/fill  net ${f(s.netBps, 3)} bps  =  spread ${f(s.grossSpreadBps)}  − adv ${f(s.adverseSelBps)}  − fee ${f(s.feeBps, 1)}`);
  console.log(`│ regime  ${s.regime?.lastAction}   halts ${s.regime?.haltCount}   widens ${s.regime?.widenCount}`);
  console.log(`│ funding ${s.funding?.rate ?? '—'}  skewTicks ${f(s.funding?.skewTicks, 4)}   OFI λ ${s.ofi?.lambda != null ? s.ofi.lambda.toExponential(2) : '—'} R² ${f(s.ofi?.r2, 4)} n ${s.ofi?.n}`);
  if (s.lastError) console.log(`│ ⚠ lastError: ${s.lastError}`);
  console.log(`└─ ${s.note || ''}`);
}

if (watch) { await one(); setInterval(one, 3000); }
else { await one(); process.exit(0); }
