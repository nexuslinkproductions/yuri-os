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
import { loadEnergyConfig, CONFIG_FILE } from './math/yuri-energy-config.mjs';
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
  if (body && body.weights && typeof body.weights === 'object') {
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
      const n = Number(body.weights[k]); if (Number.isFinite(n) && n >= 0) w[k] = n;
    }
  }
  if (Object.keys(w).length) out.weights = w;
  const t = Number(body && body.threshold); if (Number.isFinite(t)) out.threshold = t;
  if (body && body.salience && typeof body.salience === 'object') {
    const s = {};
    const dt = Number(body.salience.depthThreshold); if (Number.isFinite(dt) && dt >= 1) s.depthThreshold = Math.trunc(dt);
    const sk = Number(body.salience.surpriseK); if (Number.isFinite(sk) && sk >= 0) s.surpriseK = sk;
    const sw = Number(body.salience.surpriseWindow); if (Number.isFinite(sw) && sw >= 1) s.surpriseWindow = Math.trunc(sw);
    if (Object.keys(s).length) out.salience = s;
  }
  if (typeof (body && body.enforce) === 'boolean') out.enforce = body.enforce;
  return out;
}

function preview(body) {
  const cfg = validate(body);
  const weights = { ...DEFAULT_WEIGHTS, ...(cfg.weights || {}) };
  const threshold = Number.isFinite(cfg.threshold) ? cfg.threshold : 0;
  return SCN.map((s) => {
    const g = gateProposal({ stateBefore: s.before, stateAfter: s.after, weights, threshold });
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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  try {
    fs.mkdirSync(path.dirname(CHANGELOG), { recursive: true });
    fs.appendFileSync(CHANGELOG, JSON.stringify({ at: new Date().toISOString(), from: prev, to: cfg }) + '\n');
  } catch {}
  return { ok: true, written: cfg, path: CONFIG_FILE };
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
