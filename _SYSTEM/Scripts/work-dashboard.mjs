#!/usr/bin/env node
// @capability: work-dashboard-server
// @serves: company overview dashboard | realtime work dashboard | mure dashboard server | serve work ledger | agentic company dashboard | visualize all created work
// @does: a tiny zero-dep HTTP server that turns the work-ledger SQLite store into a REALTIME company-overview dashboard for MURE. Serves the dashboard HTML at / and a single JSON endpoint GET /api/overview (the dashboard polls it every few seconds); each poll runs a THROTTLED incremental ingest so newly-produced runs + artifacts appear live with no manual refresh. Mirrors the observatory-server pattern. Read-only on the repo; only its own work-ledger.db is written.
// @use: node _SYSTEM/Scripts/work-dashboard.mjs --serve [--port 4270] [--html <path>] then open http://localhost:4270. The HTML is GLM-5.2-designed (_SYSTEM/mure/dashboard.html); falls back to a built-in placeholder if absent.
// @exports: startServer, DEFAULT_PORT, HTML_PATH
//
// Authority: view-only telemetry surface. No mutation of indexed artifacts, no finalize, no outward calls
// (binds to localhost). DISARMED-irrelevant — it only reads the ledger + re-ingests the filesystem index.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLedger, ingestAll, overview, getRunDetail, getArtifactsByRole, getRoleProductivityTrends, getConvergenceTrend, getThroughputTrend } from './work-ledger.mjs';
import { openPool, rankJobs, jobStats, listJobs } from './job-pool.mjs';
import { loadDoctrine, rankByDirection, underServedAxes, axisCoverage, grade, TYPE_AXIS_HINTS } from '../mure/doctrine.mjs';
import { readLedger, calibrationReport } from './prediction-ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const DEFAULT_PORT = 4270;
export const HTML_PATH = path.join(REPO_ROOT, '_SYSTEM', 'mure', 'dashboard.html');
const INGEST_THROTTLE_MS = 5000;
const LANE_OUTPUT_DIR = path.join(REPO_ROOT, '_SYSTEM', 'lane-output');
const JOBS_DIR = path.join(REPO_ROOT, '.claude', 'jobs');

/** Newest helmsman-summary.json under lane-output (phase5 > phase4 > phase3 by mtime). */
function findLatestHelmsmanSummary() {
  let best = null;
  try {
    for (const phase of fs.readdirSync(LANE_OUTPUT_DIR)) {
      const candidate = path.join(LANE_OUTPUT_DIR, phase, 'helmsman-summary.json');
      if (!fs.existsSync(candidate)) continue;
      const mtime = fs.statSync(candidate).mtimeMs;
      if (!best || mtime > best.mtime) {
        best = { abs: candidate, rel: path.relative(REPO_ROOT, candidate), mtime };
      }
    }
  } catch { /* lane-output missing */ }
  return best;
}

function loadHeldQueue() {
  try {
    const latest = findLatestHelmsmanSummary();
    if (!latest) return { source: null, items: [], generatedAt: null, visualPlanGates: [] };
    const raw = JSON.parse(fs.readFileSync(latest.abs, 'utf8'));
    return {
      source: latest.rel,
      items: Array.isArray(raw.held) ? raw.held : [],
      visualPlanGates: Array.isArray(raw.visualPlanGates) ? raw.visualPlanGates : [],
      generatedAt: fs.statSync(latest.abs).mtime.toISOString(),
    };
  } catch {
    return { source: null, items: [], visualPlanGates: [], generatedAt: null };
  }
}

const TASK_GLOB = [
  '02_RESOURCES/TASKS/mure-buildout-ws-*.json',
  '02_RESOURCES/TASKS/yuri-public-release-phase2-8.json',
];

function loadVisualPlanRegistry() {
  const plans = [];
  const seen = new Set();
  for (const pattern of TASK_GLOB) {
    const dir = path.dirname(pattern);
    const base = path.basename(pattern);
    const absDir = path.join(REPO_ROOT, dir);
    let files = [];
    if (base.includes('*')) {
      const prefix = base.replace('*.json', '');
      const suffix = '.json';
      try {
        files = fs.readdirSync(absDir)
          .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
          .map((f) => path.join(dir, f));
      } catch { /* missing dir */ }
    } else {
      files = [pattern];
    }
    for (const rel of files) {
      const abs = path.join(REPO_ROOT, rel);
      if (!fs.existsSync(abs) || seen.has(rel)) continue;
      seen.add(rel);
      try {
        const task = JSON.parse(fs.readFileSync(abs, 'utf8'));
        const hasVisual = task.visualPlanSlug || task.visualPlanHostedUrl || task.visualPlanUrl
          || task.visualPlanApproved || task.visualRecapUrl;
        if (!hasVisual) continue;
        plans.push({
          taskFile: rel,
          summary: task.summary || null,
          visualPlanSlug: task.visualPlanSlug || null,
          visualPlanHostedUrl: task.visualPlanHostedUrl || null,
          visualPlanUrl: task.visualPlanUrl || null,
          visualRecapUrl: task.visualRecapUrl || null,
          visualPlanApproved: task.visualPlanApproved === true,
          requiresVisualPlan: task.requiresVisualPlan === true,
        });
      } catch { /* skip malformed */ }
    }
  }
  return plans;
}

/**
 * Read-only held-subtask queue stub backed by planCompany metadata (Phase 5).
 * Reads the latest helmsman-summary.json as a task source so held subtasks
 * reflect actual governance rulings — no active dispatch, no mutation.
 * Falls back to an empty stub when no helmsman summary exists (dashboard renders "no held items").
 * @returns {Promise<{items:Array<{subtask:string,role:string,roleName:string,reason:string,rulingClass:string,groupName:string}>,generatedAt:string,source:string|null}>}
 */
async function loadHeldQueueStub() {
  try {
    const companyMod = await import('../mure/company.mjs');
    // Use the latest helmsman summary (if any) as the task source for planCompany
    // so we get real held subtasks from actual governance rulings.
    let taskSource = {};
    const latest = findLatestHelmsmanSummary();
    if (latest) {
      try {
        taskSource = JSON.parse(fs.readFileSync(latest.abs, 'utf8'));
      } catch { /* malformed summary — plan with empty task, held will be [] */ }
    }
    const plan = await companyMod.planCompany(taskSource, { dryRun: true });
    return {
      items: (plan?.held || []).map((h) => ({
        subtask: h.subtaskId,
        role: h.role,
        roleName: h.roleName || h.role,
        reason: h.reason || h.ruling?.ruling || '',
        rulingClass: h.ruling?.class || 'OWNER',
        groupName: h.group || '',
      })),
      generatedAt: new Date().toISOString(),
      source: latest ? latest.rel : null,
    };
  } catch (e) {
    console.warn('[dashboard] heldQueueStub error:', e.message);
    return {
      items: [],
      generatedAt: new Date().toISOString(),
      source: null,
    };
  }
}

/** Live child-process rows from spawns.jsonl + status.json (P5 /api/processes). Read-only. */
export function loadActiveProcesses({ jobsDir = JOBS_DIR, limit = 40 } = {}) {
  const processes = [];
  let dirs = [];
  try { dirs = fs.readdirSync(jobsDir).sort().reverse(); } catch { return { processes: [], openCount: 0, generatedAt: new Date().toISOString() }; }
  for (const runId of dirs.slice(0, limit)) {
    const base = path.join(jobsDir, runId);
    let status = null;
    let spawns = [];
    try {
      const sp = path.join(base, 'status.json');
      if (fs.existsSync(sp)) status = JSON.parse(fs.readFileSync(sp, 'utf8'));
    } catch { /* malformed */ }
    try {
      const sp = path.join(base, 'spawns.jsonl');
      if (fs.existsSync(sp)) {
        spawns = fs.readFileSync(sp, 'utf8').split('\n').filter(Boolean)
          .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      }
    } catch { /* unreadable */ }
    if (!status && !spawns.length) continue;
    const open = new Map();
    for (const s of spawns) {
      const k = `${s.label}|${s.pid}`;
      if (s.spawnedAt) open.set(k, s);
      if (s.endedAt) open.delete(k);
    }
    for (const s of spawns) {
      processes.push({
        runId,
        label: s.label || null,
        lane: s.lane || null,
        pid: s.pid ?? null,
        status: s.endedAt ? (s.status || 'done') : 'running',
        spawnedAt: s.spawnedAt || null,
        endedAt: s.endedAt || null,
        exitCode: s.exitCode ?? null,
      });
    }
    if (status) {
      processes.push({
        runId,
        label: '__run__',
        lane: status.kind || runId.split('-')[0] || 'run',
        pid: null,
        status: status.status || 'unknown',
        spawnedAt: status.startedAt || null,
        endedAt: status.endedAt || null,
        exitCode: null,
        round: status.round ?? null,
        pending: status.pending?.length ?? 0,
      });
    }
    if (open.size && !spawns.some((s) => !s.endedAt)) {
      for (const s of open.values()) {
        processes.push({ runId, label: s.label, lane: s.lane, pid: s.pid, status: 'running', spawnedAt: s.spawnedAt, endedAt: null, exitCode: null });
      }
    }
  }
  const openCount = processes.filter((p) => p.status === 'running').length;
  return { processes: processes.slice(0, 200), openCount, generatedAt: new Date().toISOString() };
}

/** Active in-flight leaves from recent swarm manifests (mid-flight visibility, replaces external pgrep PID monitoring). */
function loadActiveSwarmLeaves() {
  const out = { swarms: [], totalLeaves: 0, zaiSidecar: { active: false, handled: 0 } };
  try {
    if (!fs.existsSync(JOBS_DIR)) return out;
    const dirs = fs.readdirSync(JOBS_DIR).filter((d) => d.startsWith('swarm-')).sort().reverse().slice(0, 3);
    for (const dir of dirs) {
      const manifestPath = path.join(JOBS_DIR, dir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const leaves = Array.isArray(m.leaves) ? m.leaves : [];
      const zai = m.zaiSidecarResults || null;
      out.swarms.push({
        runId: m.runId || dir,
        phase: m.phase || null,
        leaves: leaves.length,
        substrates: [...new Set(leaves.map((l) => l.target?.substrate || l.substrate || 'unknown'))],
        converged: m.converged ?? null,
        zaiHandled: zai?.handledLeafIds?.length || 0,
      });
      out.totalLeaves += leaves.length;
      if (zai && zai.handledLeafIds?.length) {
        out.zaiSidecar.active = true;
        out.zaiSidecar.handled += zai.handledLeafIds.length;
      }
    }
  } catch { /* ignore */ }
  return out;
}

/** Router MLP + prediction-ledger summary for dashboard panel. */
async function loadRouterStats() {
  try {
    const router = await import('./fleet-router-mlp.mjs');
    const w = await router.loadWeights();
    const ledger = readLedger();
    const preds = ledger.filter((r) => r.type === 'prediction' && r.source === 'fleet-router-mlp');
    const cal = calibrationReport();
    return {
      weightVersion: w?.version ?? 1,
      hiddenSize: 8,
      ledgerEntries: ledger.length,
      fleetPredictions: preds.length,
      meanBrier: cal.n > 0 ? cal.meanBrier : null,
      resolvedPredictions: cal.n,
      unresolved: cal.unresolved?.length ?? 0,
      mlpLearnArmed: process.env.YURI_MLP_LEARN === '1',
    };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
}

const PLACEHOLDER = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>MURE</title>
<style>body{font-family:system-ui;background:#1a1a18;color:#f1efe8;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.b{text-align:center}.b h1{font-weight:500}.b code{background:#30302e;padding:.2rem .5rem;border-radius:6px}</style></head>
<body><div class="b"><h1>MURE 群れ — dashboard</h1><p>The GLM-5.2-designed interface is not yet in place.</p>
<p>Expected at <code>_SYSTEM/mure/dashboard.html</code>. The data API is live at <code>/api/overview</code>.</p></div></body></html>`;

function startServer({ port = DEFAULT_PORT, htmlPath = HTML_PATH } = {}) {
  const db = openLedger();
  const jdb = openPool(); // jobs table (same work-ledger.db) — opened once, reused per request
  let lastIngest = 0;
  ingestAll(db); // warm once at boot

  const server = http.createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];
    try {
      if (url === '/api/overview') {
        const now = Date.now();
        if (now - lastIngest > INGEST_THROTTLE_MS) { ingestAll(db); lastIngest = now; } // throttled live refresh
        const ov = overview(db);
        try {
          ov.jobStats = jobStats(jdb);
          let doctrine = null; try { doctrine = loadDoctrine(); } catch { /* doctrine optional */ }
          const ranked = rankJobs(jdb);
          ov.jobs = (doctrine ? rankByDirection(ranked, { doctrine }) : ranked).slice(0, 50);
          if (doctrine) {
            // coverage = each completed job advanced its primary axis (mirrors nexus-company gradeJob v1)
            const grades = listJobs(jdb, { state: 'done', limit: 200 }).map((j) => {
              const ax = (j.fit ? Object.keys(j.fit) : (TYPE_AXIS_HINTS[j.type] || []))[0];
              return ax ? grade({ axis: ax, verdict: 'advanced', evidence: 'done' }, { doctrine }) : null;
            }).filter(Boolean);
            const coverage = axisCoverage(grades, { doctrine });
            ov.doctrine = {
              version: doctrine.version, ratified: doctrine.ratified, vector: doctrine.currentVector,
              axes: doctrine.axes.map((a) => ({ id: a.id, name: a.name })),
              coverage, underServed: underServedAxes(coverage, { doctrine }),
            };
          }
        } catch (e) { ov.jobs = ov.jobs || []; ov.jobStats = ov.jobStats || { error: String(e?.message || e) }; }
        // Held subtask queue — read-only stub from planCompany (Phase 5)
        // Awaited here so the response includes the held data (no fire-and-forget).
        try {
          ov.heldQueue = await loadHeldQueueStub();
        } catch (e) {
          console.warn('[dashboard] heldQueueStub error:', e.message);
          ov.heldQueue = { items: [], generatedAt: new Date().toISOString(), source: null };
        }
        ov.active = loadActiveSwarmLeaves();
        ov.visualPlans = loadVisualPlanRegistry();
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify(ov));
        return;
      }
      if (url === '/api/stream') {
        // SSE for live ops — mid-flight leaf visibility, replaces dead monitor PID pattern
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'access-control-allow-origin': '*',
        });
        const send = () => {
          try {
            const now = Date.now();
            if (now - lastIngest > INGEST_THROTTLE_MS) { ingestAll(db); lastIngest = now; }
            const payload = {
              ts: new Date().toISOString(),
              overview: overview(db),
              active: loadActiveSwarmLeaves(),
            };
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch { /* client may have closed */ }
        };
        send();
        const iv = setInterval(send, 4000);
        req.on('close', () => clearInterval(iv));
        return;
      }
      if (url === '/api/visual-plans') {
        const plans = loadVisualPlanRegistry();
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(plans));
        return;
      }
      if (url === '/api/router-stats') {
        loadRouterStats().then((stats) => {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(stats));
        }).catch((e) => {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: String(e?.message || e) }));
        });
        return;
      }
      if (url === '/api/processes') {
        const proc = loadActiveProcesses();
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify(proc));
        return;
      }
      if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
      if (url === '/api/run') {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const runId = params.get('id');
        if (!runId) { res.writeHead(400); res.end('{"error":"missing id"}'); return; }
        const detail = getRunDetail(db, runId);
        if (!detail) { res.writeHead(404); res.end('{"error":"run not found"}'); return; }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(detail));
        return;
      }
      if (url === '/api/artifacts') {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const roleId = params.get('role') || null;
        const runId = params.get('run') || null;
        const limit = Math.min(Number(params.get('limit')) || 100, 500);
        const arts = getArtifactsByRole(db, { roleId, runId, limit });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(arts));
        return;
      }
      if (url === '/api/trends') {
        const params = new URLSearchParams(req.url.split('?')[1] || '');
        const type = params.get('type') || 'throughput';
        let data;
        if (type === 'throughput') data = getThroughputTrend(db, 30, 7);
        else if (type === 'convergence') data = getConvergenceTrend(db, 60);
        else if (type === 'productivity') data = getRoleProductivityTrends(db, 30);
        else { res.writeHead(400); res.end('{"error":"unknown type"}'); return; }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(data));
        return;
      }
      if (url === '/' || url === '/index.html') {
        let html = PLACEHOLDER;
        try { if (fs.existsSync(htmlPath)) html = fs.readFileSync(htmlPath, 'utf8'); } catch { /* placeholder */ }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(html);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`MURE dashboard → http://localhost:${port}  (api: /api/overview · /api/processes · html: ${path.relative(REPO_ROOT, htmlPath)}${fs.existsSync(htmlPath) ? '' : ' [placeholder]'})\n`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  if (argv.includes('--serve') || argv.length === 0) {
    startServer({ port: Number(val('--port', DEFAULT_PORT)), htmlPath: val('--html', HTML_PATH) });
  } else {
    process.stdout.write('usage: node work-dashboard.mjs --serve [--port 4270] [--html <path>]\n');
  }
}

export { startServer, loadVisualPlanRegistry, findLatestHelmsmanSummary, loadHeldQueue, loadHeldQueueStub };
