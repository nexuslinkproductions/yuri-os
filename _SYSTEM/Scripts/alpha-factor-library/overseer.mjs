// @capability: trading-overseer
// @serves: overseer team brain | adjust ensemble weights and config | improve trading success rate | two-lane trading oversight | reweight beat | fee/regime gate steering
// @does: the TEAM BRAIN both trading overseers run (a Sonnet max-reasoning lane + a deepseek-flash
// lane). Gathers live trading state from the :4243 daemon, scores which strategies predict, derives
// fee-aware weights, writes the hot-reloaded steering config, and posts rationale to a shared board so
// the two lanes work as a team. INV-1-SAFE: writes config + weights ONLY, never an order path.
// @exports: decide, gatherState, readBoard, postBoard, reweightWeights, runOnce, DEFAULTS
// @use: runOnce({lane, baseUrl, ...paths}) on a beat (Sonnet ~10s, deepseek ~30s). decide(state) is
// the PURE testable core. With --llm <lane> it layers a bounded, CLAMPED LLM judgment on top of the
// deterministic core (advisory only — it can never write raw weights or binding config). CLI:
// --once --lane <id> [--base <url>] [--llm <ollama-model>] [--feeHurdle N] [--threshold N] [--minHold N] | --test

import { appendFileSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { reweight } from './strategy-weights.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(HERE, '..', '..', 'state');

export const DEFAULTS = {
  baseUrl: process.env.OBSERVATORY_BASE || 'http://127.0.0.1:4243/api/observatory',
  configPath: path.join(STATE_DIR, 'overseer-config.json'),
  weightsPath: path.join(STATE_DIR, 'ensemble-weights.json'),
  boardPath: path.join(STATE_DIR, 'overseer-board.jsonl'),
  forecastLedger: path.join(STATE_DIR, 'strategy-forecasts.jsonl'),
  feeHurdle: 0.002,     // ~ one taker round-trip; a strategy/trade must beat this to be worth it.
  ddPauseBps: 800,      // book drawdown ≥ 8% → pause new entries (de-risk; flatten still allowed).
  ddResumeBps: 400,     // …resume only once drawdown recovers below 4% (hysteresis, no flap).
};

// ── Blackboard (shared awareness between the two overseer lanes) ──────────────
/** postBoard(boardPath, entry) — append one team-board line. Never throws. */
export function postBoard(boardPath, entry) {
  try {
    const line = JSON.stringify({ ts: Math.floor(nowMs() / 1000), ...entry });
    appendFileSync(boardPath, line + '\n');
    return true;
  } catch { return false; }
}

/** readBoard(boardPath, limit) — last `limit` board entries (newest last). Fail-soft → []. */
export function readBoard(boardPath, limit = 20) {
  try {
    if (!existsSync(boardPath)) return [];
    const rows = readFileSync(boardPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
    return rows.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// nowMs is injectable for the deterministic test (Date.now is fine at runtime, not in workflow scripts).
let _now = () => Date.now();
function nowMs() { return _now(); }

// ── State gathering from the live daemon ─────────────────────────────────────
async function getJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** gatherState(baseUrl) — pull the trading-quality surfaces the overseer reasons over. Fail-soft per route. */
export async function gatherState(baseUrl = DEFAULTS.baseUrl) {
  const [ensemble, calibration, paper, regime, trades] = await Promise.all([
    getJSON(`${baseUrl}/ensemble`),
    getJSON(`${baseUrl}/calibration`),
    getJSON(`${baseUrl}/paper`),
    getJSON(`${baseUrl}/regime`),
    getJSON(`${baseUrl}/trades?limit=30`),
  ]);
  return { ensemble, calibration, paper, regime, trades };
}

// ── The PURE decision core (deterministic, testable, fail-soft) ──────────────
/**
 * decide(state, opts) — given gathered state + recent board + current config, produce a SAFE config
 * patch + per-market observations. Evidence-driven, conservative, clamped. No fs, no network.
 * @returns {{ configPatch:Object, observations:Array, alerts:Array }}
 */
export function decide(state = {}, opts = {}) {
  const feeHurdle = isNum(opts.feeHurdle) ? opts.feeHurdle : DEFAULTS.feeHurdle;
  const ddPauseBps = isNum(opts.ddPauseBps) ? opts.ddPauseBps : DEFAULTS.ddPauseBps;
  const ddResumeBps = isNum(opts.ddResumeBps) ? opts.ddResumeBps : DEFAULTS.ddResumeBps;
  const cur = (opts.currentConfig && typeof opts.currentConfig === 'object') ? opts.currentConfig : {};
  const board = Array.isArray(opts.board) ? opts.board : [];

  const observations = [];
  const alerts = [];
  const configPatch = {};

  // 1. Arm the fee gate through the sanctioned overseer path (the overseer IS the armed actor —
  //    DISARMED default lives in the daemon; turning it on here is the deliberate, reversible step).
  configPatch.edgeGate = true;
  configPatch.feeHurdle = feeHurdle;
  // Selectivity: raise the flat-band so only higher-conviction (→ longer-held → bigger-move) trades
  // fire. The structural answer to the fee-vs-move problem. Opt-driven; absent → leave at daemon default.
  if (isNum(opts.threshold)) configPatch.threshold = opts.threshold;
  if (isNum(opts.maxPct)) configPatch.maxPct = opts.maxPct;
  if (isNum(opts.minHoldCycles)) configPatch.minHoldCycles = opts.minHoldCycles;
  if (isNum(opts.maxHoldSec)) configPatch.maxHoldSec = opts.maxHoldSec;
  if (isNum(opts.stopLossPct)) configPatch.stopLossPct = opts.stopLossPct;
  if (isNum(opts.takeProfitPct)) configPatch.takeProfitPct = opts.takeProfitPct;

  // 2. Drawdown circuit with hysteresis: pause new exposure when bleeding, resume only after recovery.
  const dd = readDrawdownBps(state.paper);
  if (isNum(dd)) {
    const wasPaused = cur.paused === true;
    if (!wasPaused && dd >= ddPauseBps) {
      configPatch.paused = true;
      alerts.push(`drawdown ${(dd / 100).toFixed(2)}% ≥ ${(ddPauseBps / 100).toFixed(1)}% → PAUSE new entries`);
    } else if (wasPaused && dd <= ddResumeBps) {
      configPatch.paused = false;
      alerts.push(`drawdown recovered to ${(dd / 100).toFixed(2)}% ≤ ${(ddResumeBps / 100).toFixed(1)}% → RESUME`);
    } else {
      configPatch.paused = wasPaused; // hold current state in the band (no flap)
    }
  }

  // 3. Regime: if a majority of tracked markets want RECOMPUTE_CIRCUIT, gate entries during instability.
  const reg = state.regime;
  const regList = Array.isArray(reg) ? reg : (reg && typeof reg === 'object' ? Object.values(reg) : []);
  const recompute = regList.filter((r) => r && r.recommendation === 'RECOMPUTE_CIRCUIT').length;
  if (regList.length > 0) {
    const on = recompute >= Math.ceil(regList.length / 2);
    configPatch.regimeGate = on;
    if (on) alerts.push(`${recompute}/${regList.length} markets unstable → regimeGate ON`);
  }

  // 4. Per-market observations from the fused ensemble decision (what the team is actually doing).
  const ens = state.ensemble;
  const ensList = Array.isArray(ens) ? ens : (ens && typeof ens === 'object' ? Object.entries(ens).map(([market, v]) => ({ market, ...v })) : []);
  for (const e of ensList) {
    if (!e || !e.market) continue;
    const note = `${e.market}: ${e.side || '—'} str=${isNum(e.strength) ? e.strength.toFixed(3) : '—'}` +
      `${e.skipped ? ` [skip:${e.skipped}]` : ''} votes=${e.longVotes || 0}L/${e.shortVotes || 0}S`;
    observations.push(note);
  }

  // 5. Light coordination: if the teammate paused this within the last few posts, don't fight it.
  const teammatePaused = board.slice(-6).some((b) => b && b.kind === 'action' && /PAUSE/.test(b.summary || ''));
  if (teammatePaused && configPatch.paused === false && isNum(dd) && dd > ddResumeBps) {
    configPatch.paused = true; // respect teammate's pause until drawdown clears the resume band
    alerts.push('deferring to teammate PAUSE (drawdown not yet recovered)');
  }

  return { configPatch, observations, alerts };
}

/**
 * aggregatePaper(paper) — handle BOTH shapes: the live PER-MARKET map ({BTC-USD:{pnl,positions},...})
 * and a single-engine {pnl:{...}}. Returns portfolio totals + the drawdown the pause logic keys on:
 * the DEEPER of aggregate equity loss and the worst single-book maxDrawdownBps. Fail-soft → nulls.
 */
function aggregatePaper(paper) {
  const out = { equity: null, initialEquity: null, totalFees: 0, ddBps: null, positions: 0 };
  if (!paper || typeof paper !== 'object') return out;
  const markets = Object.values(paper).filter((v) => v && typeof v === 'object' && v.pnl && typeof v.pnl === 'object');
  if (markets.length) {
    let eq = 0, init = 0, fees = 0, worstDd = 0, pos = 0;
    for (const m of markets) {
      if (isNum(m.pnl.equity)) eq += m.pnl.equity;
      if (isNum(m.pnl.initialEquity)) init += m.pnl.initialEquity;
      if (isNum(m.pnl.totalFees)) fees += m.pnl.totalFees;
      if (isNum(m.pnl.maxDrawdownBps)) worstDd = Math.max(worstDd, m.pnl.maxDrawdownBps);
      pos += Array.isArray(m.positions) ? m.positions.length : 0;
    }
    const aggLossBps = init > 0 ? Math.max(0, (1 - eq / init) * 10000) : 0;
    return { equity: eq, initialEquity: init, totalFees: fees, ddBps: Math.max(worstDd, aggLossBps), positions: pos };
  }
  // single-engine shape
  const p = paper.pnl || paper;
  if (isNum(p.equity)) out.equity = p.equity;
  if (isNum(p.initialEquity)) out.initialEquity = p.initialEquity;
  if (isNum(p.totalFees)) out.totalFees = p.totalFees;
  if (isNum(p.maxDrawdownBps)) out.ddBps = p.maxDrawdownBps;
  else if (isNum(paper.drawdown)) out.ddBps = paper.drawdown * 10000;
  return out;
}

function readDrawdownBps(paper) {
  const a = aggregatePaper(paper);
  return isNum(a.ddBps) ? a.ddBps : null;
}

// ── fs apply helpers (atomic) ────────────────────────────────────────────────
function loadConfig(configPath) {
  try { if (existsSync(configPath)) return JSON.parse(readFileSync(configPath, 'utf8')) || {}; } catch { /* */ }
  return {};
}
function atomicWriteJSON(p, obj) {
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, p);
}

/** reweightWeights — close the learn loop: score accrued forecasts → fee-aware weights file. */
export function reweightWeights(opts = {}) {
  const ledgerPath = opts.forecastLedger || DEFAULTS.forecastLedger;
  const weightsPath = opts.weightsPath || DEFAULTS.weightsPath;
  const feeHurdle = isNum(opts.feeHurdle) ? opts.feeHurdle : DEFAULTS.feeHurdle;
  try { return reweight({ ledgerPath, weightsPath, horizonS: 300, minN: 20, feeHurdle }); }
  catch (e) { return { weights: {}, stats: {}, evaluated: 0, error: e.message }; }
}

// ── Optional LLM advisory layer (bounded + clamped) ──────────────────────────
// The LLM lane sees a compact state packet and returns a SMALL JSON of nudges. We CLAMP every field to
// a safe range before use — the LLM can never write a raw weight or an unsafe value. Fail-soft → null.
async function runLlmAdvisory(state, lane, board) {
  const { execFileSync } = await import('node:child_process');
  const agg = aggregatePaper(state.paper);
  const compact = {
    ensemble: summarizeEnsemble(state.ensemble),
    drawdownPct: isNum(agg.ddBps) ? +(agg.ddBps / 100).toFixed(2) : null,
    fees: isNum(agg.totalFees) ? +agg.totalFees.toFixed(2) : null,
    equity: isNum(agg.equity) ? +agg.equity.toFixed(0) : null,
    recentBoard: board.slice(-5).map((b) => `${b.lane}:${b.summary}`),
  };
  const prompt = [
    'You are a trading OVERSEER peer (lane: ' + lane + ') on a 2-lane team improving a paper-trading ensemble.',
    'You CANNOT place orders. You can only advise on steering. Be terse and skeptical; flag anomalies.',
    'Given this live state, return ONLY a fenced ```json block with: {"observations":[".."],',
    '"feeHurdle": <0..0.01 or null>, "pause": <true|false|null>, "reason":".."}.',
    'feeHurdle/pause = null means "no change". Justify any pause with the drawdown number.',
    '',
    'STATE:', JSON.stringify(compact),
  ].join('\n');
  try {
    const runner = path.resolve(HERE, '..', '..', 'Scripts', 'llm-lane.mjs');
    // Hydrate the ollama key from Keychain the way the `ai` bash wrapper does — a direct node spawn
    // skips that step (→ missing_key). Key flows ONLY into the child env, never logged (INV-2).
    const env = { ...process.env, LLM_COMPAT_PROMPT_TEXT: prompt };
    for (const key of ['OLLAMA_API_KEY', 'OLLAMA_CLOUD_API_KEY']) {
      if (env[key]) continue;
      try {
        const v = execFileSync('security', ['find-generic-password', '-a', process.env.USER || '', '-s', `YURI_OS_MUSUBI:${key}`, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (v) env[key] = v;
      } catch { /* not in chain */ }
    }
    const out = execFileSync('node', [runner, 'ollama-cloud', '--model', lane], {
      env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, // 120s: slow lanes (nemotron) need room; fast lanes (flash) finish in seconds regardless
    });
    const m = out.match(/```json\s*([\s\S]*?)```/i) || out.match(/(\{[\s\S]*\})/);
    if (!m) return { observations: [], note: 'llm: no json' };
    const j = JSON.parse(m[1]);
    const adv = { observations: Array.isArray(j.observations) ? j.observations.slice(0, 6).map(String) : [], reason: String(j.reason || '').slice(0, 200) };
    if (isNum(j.feeHurdle)) adv.feeHurdle = clamp(j.feeHurdle, 0, 0.01);   // clamp hard
    if (j.pause === true || j.pause === false) adv.pause = j.pause;
    return adv;
  } catch (e) { return { observations: [], note: `llm-fail: ${String(e.message).slice(0, 80)}` }; }
}

function summarizeEnsemble(ens) {
  const list = Array.isArray(ens) ? ens : (ens && typeof ens === 'object' ? Object.entries(ens).map(([market, v]) => ({ market, ...v })) : []);
  return list.map((e) => ({ m: e.market, side: e.side, str: isNum(e.strength) ? +e.strength.toFixed(3) : null, skip: e.skipped || null }));
}

// ── One full overseer beat: gather → reweight → decide → apply → post ────────
export async function runOnce(opts = {}) {
  const lane = opts.lane || 'overseer';
  const baseUrl = opts.baseUrl || DEFAULTS.baseUrl;
  const configPath = opts.configPath || DEFAULTS.configPath;
  const weightsPath = opts.weightsPath || DEFAULTS.weightsPath;
  const boardPath = opts.boardPath || DEFAULTS.boardPath;

  const state = await gatherState(baseUrl);
  const board = readBoard(boardPath, 20);
  const currentConfig = loadConfig(configPath);

  // COORDINATION: a lane only sets policy when EXPLICITLY told (--feeHurdle/--threshold); otherwise it
  // INHERITS the current shared config so the two lanes don't fight (one sets, both respect). The
  // config file is the structured sibling of the board — the team's shared steering state.
  const feeHurdle = isNum(opts.feeHurdle) ? opts.feeHurdle
    : (isNum(currentConfig.feeHurdle) ? currentConfig.feeHurdle : DEFAULTS.feeHurdle);
  const threshold = isNum(opts.threshold) ? opts.threshold
    : (isNum(currentConfig.threshold) ? currentConfig.threshold : undefined);
  const minHoldCycles = isNum(opts.minHoldCycles) ? opts.minHoldCycles
    : (isNum(currentConfig.minHoldCycles) ? currentConfig.minHoldCycles : undefined);
  const maxHoldSec = isNum(opts.maxHoldSec) ? opts.maxHoldSec
    : (isNum(currentConfig.maxHoldSec) ? currentConfig.maxHoldSec : undefined);
  const stopLossPct = isNum(opts.stopLossPct) ? opts.stopLossPct
    : (isNum(currentConfig.stopLossPct) ? currentConfig.stopLossPct : undefined);
  const takeProfitPct = isNum(opts.takeProfitPct) ? opts.takeProfitPct
    : (isNum(currentConfig.takeProfitPct) ? currentConfig.takeProfitPct : undefined);
  // vetoHurdle is SEPARATE from feeHurdle: reweight decides which strategies PREDICT DIRECTION (a
  // strategy can carry directional info even if a single trade won't beat fees), so it vetoes only
  // NEGATIVE-edge strategies by default (0). The fee economics live in the per-trade EDGE GATE
  // (feeHurdle), not in strategy trust — conflating them over-prunes the vote to flat (deepseek caught this).
  const vetoHurdle = isNum(opts.vetoHurdle) ? opts.vetoHurdle
    : (isNum(currentConfig.vetoHurdle) ? currentConfig.vetoHurdle : 0);

  // Close the learn loop (math-grounded): trust positive-edge strategies, weight by edge, veto losers.
  const rw = reweightWeights({ forecastLedger: opts.forecastLedger, weightsPath, feeHurdle: vetoHurdle });

  // Deterministic steering.
  const d = decide(state, { feeHurdle, currentConfig, board, threshold, maxPct: opts.maxPct, minHoldCycles, maxHoldSec, stopLossPct, takeProfitPct });

  // LLM lane = ADVISORY ONLY. Lanes over-claim (observed live: deepseek misread 0.08% drawdown as 8%
  // and urged a PAUSE). Its judgment becomes a flagged PROPOSAL on the board for the human / Sonnet lane
  // to ratify — it NEVER writes binding config. The deterministic core (real drawdown, regime, reweight)
  // owns every config change. This is "advisory until locally verified" applied to the team.
  let llm = null;
  if (opts.llm) {
    llm = await runLlmAdvisory(state, opts.llm, board);
    if (llm && (isNum(llm.feeHurdle) || llm.pause === true || llm.pause === false)) {
      const proposal = `PROPOSAL${isNum(llm.feeHurdle) ? ` feeHurdle→${llm.feeHurdle}` : ''}` +
        `${llm.pause === true ? ' PAUSE' : llm.pause === false ? ' RESUME' : ''} — ${llm.reason || ''}`;
      postBoard(boardPath, { lane, kind: 'proposal', summary: proposal.slice(0, 240) });
    }
  }

  // Apply config (merge patch over current; atomic).
  const nextConfig = { ...currentConfig, ...d.configPatch };
  atomicWriteJSON(configPath, nextConfig);

  // Post to the team board: one action line + the alerts/observations summary.
  const up = Object.values(rw.weights || {}).filter((w) => w > 1).length;
  const vetoed = Object.values(rw.weights || {}).filter((w) => w === 0).length;
  const summary = `reweight evaluated=${rw.evaluated} up=${up} veto=${vetoed} | ` +
    `feeHurdle=${nextConfig.feeHurdle} edgeGate=${nextConfig.edgeGate} regimeGate=${nextConfig.regimeGate} paused=${nextConfig.paused}` +
    (d.alerts.length ? ` | ${d.alerts.join('; ')}` : '') +
    (llm && llm.note ? ` | ${llm.note}` : (llm && llm.reason ? ` | llm:${llm.reason}` : ''));
  postBoard(boardPath, { lane, kind: 'action', summary, changed: d.configPatch });
  for (const o of [...d.observations, ...((llm && llm.observations) || [])].slice(0, 8)) {
    postBoard(boardPath, { lane, kind: 'observation', summary: o });
  }

  return { lane, config: nextConfig, reweight: { evaluated: rw.evaluated, up, vetoed }, alerts: d.alerts, observations: d.observations, llm };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const _main = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (_main && process.argv.includes('--once')) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const lane = arg('--lane', 'overseer');
  const baseUrl = arg('--base', DEFAULTS.baseUrl);
  const llm = arg('--llm', null);
  const fhArg = arg('--feeHurdle', null); const feeHurdle = fhArg !== null ? Number(fhArg) : undefined;
  const thArg = arg('--threshold', null); const threshold = thArg !== null ? Number(thArg) : undefined;
  const mhArg = arg('--minHold', null); const minHoldCycles = mhArg !== null ? Number(mhArg) : undefined;
  const xhArg = arg('--maxHold', null); const maxHoldSec = xhArg !== null ? Number(xhArg) : undefined;
  const slArg = arg('--stopLoss', null); const stopLossPct = slArg !== null ? Number(slArg) : undefined;
  const tpArg = arg('--takeProfit', null); const takeProfitPct = tpArg !== null ? Number(tpArg) : undefined;
  const r = await runOnce({ lane, baseUrl, llm, feeHurdle, threshold, minHoldCycles, maxHoldSec, stopLossPct, takeProfitPct });
  console.log(`overseer[${r.lane}] reweight=${JSON.stringify(r.reweight)} paused=${r.config.paused} feeHurdle=${r.config.feeHurdle} regimeGate=${r.config.regimeGate}`);
  if (r.alerts.length) console.log('ALERTS:', r.alerts.join(' | '));
  if (r.llm && (r.llm.reason || r.llm.note)) console.log('LLM:', r.llm.reason || r.llm.note);
  process.exit(0);
}

if (_main && process.argv.includes('--test')) {
  _now = () => 1_700_000_000_000; // frozen clock for determinism
  let pass = 0, fail = 0;
  const ok = (c, m) => { c ? pass++ : (fail++, console.error('FAIL:', m)); };

  // decide arms the fee gate by default
  const d1 = decide({}, {});
  ok(d1.configPatch.edgeGate === true, 'decide arms edgeGate');
  ok(d1.configPatch.feeHurdle === DEFAULTS.feeHurdle, 'decide sets default feeHurdle');

  // drawdown pause triggers above threshold, resumes below with hysteresis
  const dPause = decide({ paper: { pnl: { maxDrawdownBps: 900 } } }, { currentConfig: { paused: false } });
  ok(dPause.configPatch.paused === true, 'drawdown 9% → pause');
  const dHold = decide({ paper: { pnl: { maxDrawdownBps: 600 } } }, { currentConfig: { paused: true } });
  ok(dHold.configPatch.paused === true, 'in hysteresis band → stays paused (no flap)');
  const dResume = decide({ paper: { pnl: { maxDrawdownBps: 300 } } }, { currentConfig: { paused: true } });
  ok(dResume.configPatch.paused === false, 'drawdown recovered → resume');

  // per-market paper shape (the LIVE shape): aggregate equity loss + worst single-book drawdown
  const perMkt = { 'BTC-USD': { positions: [{}], pnl: { equity: 99000, initialEquity: 100000, totalFees: 10, maxDrawdownBps: 200 } }, 'ETH-USD': { positions: [], pnl: { equity: 100000, initialEquity: 100000, totalFees: 5, maxDrawdownBps: 0 } } };
  ok(decide({ paper: perMkt }, { currentConfig: { paused: false } }).configPatch.paused === false, 'per-market mild drawdown → no pause');
  const perMkt2 = { 'BTC-USD': { pnl: { equity: 88000, initialEquity: 100000, maxDrawdownBps: 1200 } } };
  ok(decide({ paper: perMkt2 }, { currentConfig: { paused: false } }).configPatch.paused === true, 'per-market deep drawdown (−12%) → pause');

  // regime majority → gate on
  const dReg = decide({ regime: { a: { recommendation: 'RECOMPUTE_CIRCUIT' }, b: { recommendation: 'RECOMPUTE_CIRCUIT' }, c: { recommendation: 'CIRCUIT_VALID' } } }, {});
  ok(dReg.configPatch.regimeGate === true, 'regime majority unstable → regimeGate on');
  const dReg2 = decide({ regime: { a: { recommendation: 'CIRCUIT_VALID' }, b: { recommendation: 'CIRCUIT_VALID' } } }, {});
  ok(dReg2.configPatch.regimeGate === false, 'regime stable → regimeGate off');

  // observations from ensemble (object form)
  const dObs = decide({ ensemble: { 'BTC-USD': { side: 'short', strength: 0.12, longVotes: 1, shortVotes: 5, skipped: 'edge<fee' } } }, {});
  ok(dObs.observations.length === 1 && /BTC-USD/.test(dObs.observations[0]) && /skip:edge<fee/.test(dObs.observations[0]), 'ensemble → per-market observation w/ skip reason');

  // teammate pause deference
  const dDefer = decide({ paper: { pnl: { maxDrawdownBps: 600 } } }, { currentConfig: { paused: false }, board: [{ lane: 'flash', kind: 'action', summary: 'drawdown 9% → PAUSE new entries' }] });
  ok(dDefer.configPatch.paused === true, 'defers to teammate PAUSE while drawdown elevated');

  // board round-trip
  const tmpBoard = `/tmp/overseer-board-test-${process.pid}.jsonl`;
  try { const fs = await import('node:fs'); if (fs.existsSync(tmpBoard)) fs.unlinkSync(tmpBoard); } catch { /* */ }
  postBoard(tmpBoard, { lane: 'sonnet', kind: 'observation', summary: 'hello' });
  postBoard(tmpBoard, { lane: 'flash', kind: 'action', summary: 'world' });
  const rb = readBoard(tmpBoard, 10);
  ok(rb.length === 2 && rb[0].lane === 'sonnet' && rb[1].lane === 'flash' && isNum(rb[0].ts), 'board append + read round-trip');
  try { const fs = await import('node:fs'); fs.unlinkSync(tmpBoard); } catch { /* */ }

  console.log(`overseer --test: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
}
