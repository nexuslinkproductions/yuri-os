#!/usr/bin/env node
/**
 * yuri-control-server — turns the Energy Cockpit into a live control surface.
 *
 * Localhost only, no deps. Three jobs:
 *   GET  /          → serve the cockpit
 *   POST /preview   → score the 3 scenarios with the REAL gate (all 9 terms)
 *   POST /apply     → DEV-GATED write of tuned dials to energy-weights.json
 *                     (backs up the prior file + logs old→new); the live gate
 *                     reads that file, so apply = the dials become real.
 *   POST /reset     → DEV-GATED revert to standards (removes the override file)
 *
 * The write path is the ONLY mutation, and it is gated on the resolved operator
 * role being `dev` (fail-closed: a coworker/keyless run can preview but not apply).
 * Run:  node _SYSTEM/Scripts/yuri-control-server.mjs   → http://127.0.0.1:7717
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeU, gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { loadEnergyConfig, CONFIG_FILE, num, MIN_SURPRISE_WINDOW } from './math/yuri-energy-config.mjs';
import operator from './yuri-operator.cjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(_HERE, '..', '..');
const COCKPIT = path.join(REPO_ROOT, '_SYSTEM', 'reports', 'yuri-control', 'index.html');
const CHANGELOG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'energy-config-changes.jsonl');
const HOST = '127.0.0.1';
const PORT = Number(process.env.YURI_COCKPIT_PORT) || 7717;

// Per-process bearer token for mutating endpoints (defense-in-depth). The dev-role
// check authenticates the SERVER process, not the REQUESTER — so any local process,
// or a browser page via DNS-rebinding, could POST /apply to a dev-run server. The
// token (handed only to the dev cockpit via GET /config) plus an Origin/Host
// allow-list close that. Env override supports tests/automation.
const APPLY_TOKEN = process.env.YURI_COCKPIT_TOKEN || crypto.randomBytes(24).toString('hex');

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function localOriginOk(req) {
  const host = String((req.headers && req.headers.host) || '').toLowerCase();
  const okHost = host === `${HOST}:${PORT}` || host === `localhost:${PORT}`;
  const origin = req.headers && req.headers.origin;
  // Absent Origin (curl/native client) is allowed; if present it must be local —
  // blocks cross-site / DNS-rebinding writes initiated from a browser page.
  const okOrigin = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  return okHost && okOrigin;
}

function authedMutation(req) {
  const m = String((req.headers && req.headers.authorization) || '').match(/^Bearer\s+(.+)$/i);
  return Boolean(m) && timingSafeEqualStr(m[1], APPLY_TOKEN);
}

// The 3 cockpit scenarios, in the energy-tick state model.
const SCN = [
  { name: 'Healthy edit lands', before: { verifiedEvidenceCount: 2 }, after: { verifiedEvidenceCount: 3 } },
  { name: 'A check FAILS', before: { predictions: [], outcomes: [], forecasts: [], results: [] }, after: { predictions: [0.9], outcomes: [0], forecasts: [0.9], results: [0] } },
  { name: 'Protected-path write', before: { protectedPathViolations: 0 }, after: { protectedPathViolations: 1 } },
];

function validate(body) {
  const out = {};
  const w = {};
  if (body && body.weights && typeof body.weights === 'object' && !Array.isArray(body.weights)) {
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const n = num(body.weights[k]); if (n !== null && n >= 0) w[k] = n;
    }
  }
  if (Object.keys(w).length) out.weights = w;
  const t = num(body && body.threshold); if (t !== null) out.threshold = t;
  if (body && body.salience && typeof body.salience === 'object' && !Array.isArray(body.salience)) {
    const s = {};
    const dt = num(body.salience.depthThreshold); if (dt !== null && dt >= 1) s.depthThreshold = Math.trunc(dt);
    const sk = num(body.salience.surpriseK); if (sk !== null && sk >= 0) s.surpriseK = sk;
    const sw = num(body.salience.surpriseWindow); if (sw !== null && sw >= MIN_SURPRISE_WINDOW) s.surpriseWindow = Math.trunc(sw);
    if (Object.keys(s).length) out.salience = s;
  }
  // evict.ttlDays — the forgetting horizon, so the cockpit can carry it (attack-finding:
  // previously dropped here, making the knob unreachable from the canonical surface's own UI).
  if (body && body.evict && typeof body.evict === 'object' && !Array.isArray(body.evict)) {
    const e = {};
    const ttl = num(body.evict.ttlDays); if (ttl !== null && ttl >= 1) e.ttlDays = Math.trunc(ttl);
    if (Object.keys(e).length) out.evict = e;
  }
  // fsrs — subconscious forgetting-curve knobs (cockpit fsrs sliders → memory-relocator/yuri-fsrs).
  // Same fail-closed rules as loadEnergyConfig: rFloor in (0,1], decay < 0, factor > 0, weights >= 0.
  if (body && body.fsrs && typeof body.fsrs === 'object' && !Array.isArray(body.fsrs)) {
    const f = {};
    const rf = num(body.fsrs.rFloor);   if (rf !== null && rf > 0 && rf <= 1) f.rFloor = rf;
    const dc = num(body.fsrs.decay);    if (dc !== null && dc < 0) f.decay = dc;
    const ft = num(body.fsrs.factor);   if (ft !== null && ft > 0) f.factor = ft;
    const sa = num(body.fsrs.salience); if (sa !== null && sa >= 0) f.salience = sa;
    const fq = num(body.fsrs.freq);     if (fq !== null && fq >= 0) f.freq = fq;
    const du = num(body.fsrs.deltaU);   if (du !== null && du >= 0) f.deltaU = du;
    if (Object.keys(f).length) out.fsrs = f;
  }
  return out;
}

function preview(body) {
  const cfg = validate(body);
  const weights = { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) };
  const threshold = Number.isFinite(cfg.threshold) ? cfg.threshold : 0;
  return SCN.map((s) => {
    const g = gateProposal({ stateBefore: s.before, stateAfter: s.after, weights, threshold, origin: 'control-server' });
    return {
      name: s.name,
      uBefore: computeU(s.before, weights).result.U,
      uAfter: computeU(s.after, weights).result.U,
      deltaU: g.result.deltaU, accept: g.result.accept, dominantTerm: g.result.dominantTerm,
    };
  });
}

function isDev() { try { return operator.resolveRole() === 'dev'; } catch { return false; } }

function apply(body) {
  if (!isDev()) return { ok: false, error: 'dev role required to write the live config' };
  const cfg = validate(body);
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch {}
  try { if (fs.existsSync(CONFIG_FILE)) fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.bak'); } catch {}
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  // Merge over the prior file (attack-finding): a wholesale replace silently dropped the
  // _doc block AND evict.ttlDays (validate only emits cockpit-owned sections), collapsing
  // the tuned forgetting horizon back to 90. Top-level merge updates the tuned sections
  // while preserving _doc and any section the request body omitted.
  const merged = { ...prev, ...cfg };
  // Atomic write (attack-finding): a reader (tickAndTrace / memory-evict) hitting the file
  // mid-write would JSON.parse a torn file and silently fall back to ALL defaults. tmp +
  // rename means a reader sees either the old or the new file, never a partial.
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2) + '\n');
  fs.renameSync(tmp, CONFIG_FILE);
  try {
    fs.mkdirSync(path.dirname(CHANGELOG), { recursive: true });
    fs.appendFileSync(CHANGELOG, JSON.stringify({ at: new Date().toISOString(), from: prev, to: merged }) + '\n');
  } catch {}
  return { ok: true, written: merged, path: CONFIG_FILE };
}

function reset() {
  if (!isDev()) return { ok: false, error: 'dev role required' };
  try { if (fs.existsSync(CONFIG_FILE)) { fs.copyFileSync(CONFIG_FILE, CONFIG_FILE + '.bak'); fs.unlinkSync(CONFIG_FILE); } } catch {}
  return { ok: true, reset: true };
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(COCKPIT));
      return;
    }
    if (req.method === 'GET' && req.url === '/config') {
      return send(200, { config: loadEnergyConfig(), dev: isDev(), ...(isDev() ? { applyToken: APPLY_TOKEN } : {}) });
    }
    if (req.method === 'POST' && req.url === '/preview') return send(200, { scenarios: preview(await readBody(req)) });
    if (req.method === 'POST' && (req.url === '/apply' || req.url === '/reset')) {
      if (!localOriginOk(req)) return send(403, { ok: false, error: 'forbidden: non-local Origin/Host' });
      if (!authedMutation(req)) return send(401, { ok: false, error: 'unauthorized: missing/invalid bearer token' });
      const result = req.url === '/apply' ? apply(await readBody(req)) : reset();
      return send(200, result);
    }
    send(404, { error: 'not found' });
  } catch (e) { send(500, { error: String((e && e.message) || e) }); }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, HOST, () => {
    console.log(`YURI Energy Cockpit → http://${HOST}:${PORT}  (preview=anyone · apply=dev-only · localhost)`);
  });
}

export { preview, validate, apply, reset, server, PORT, HOST, APPLY_TOKEN, localOriginOk, authedMutation };
