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
import { fileURLToPath } from 'node:url';
import { openLedger, ingestAll, overview } from './work-ledger.mjs';
import { openPool, rankJobs, jobStats, listJobs } from './job-pool.mjs';
import { loadDoctrine, rankByDirection, underServedAxes, axisCoverage, grade, TYPE_AXIS_HINTS } from '../mure/doctrine.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
export const DEFAULT_PORT = 4270;
export const HTML_PATH = path.join(REPO_ROOT, '_SYSTEM', 'mure', 'dashboard.html');
const INGEST_THROTTLE_MS = 5000;

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

  const server = http.createServer((req, res) => {
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
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify(ov));
        return;
      }
      if (url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); return; }
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
    process.stdout.write(`MURE dashboard → http://localhost:${port}  (api: /api/overview · html: ${path.relative(REPO_ROOT, htmlPath)}${fs.existsSync(htmlPath) ? '' : ' [placeholder]'})\n`);
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  if (argv.includes('--serve') || argv.length === 0) {
    startServer({ port: Number(val('--port', DEFAULT_PORT)), htmlPath: val('--html', HTML_PATH) });
  } else {
    process.stdout.write('usage: node work-dashboard.mjs --serve [--port 4270] [--html <path>]\n');
  }
}

export { startServer };
