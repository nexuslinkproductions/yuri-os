/**
 * shared-plane.js — Plane.so API helpers (single source of truth)
 *
 * Extracted from shared-data.js, chat.js, mcp-server.js, context-engine.js
 * to eliminate ~120 lines of duplicated HTTP plumbing.
 *
 * All functions read PLANE_API_KEY from process.env at call time.
 */

const https = require('https');

// ── GET with retry ──
function planeGet(path, _retries = 2) {
  return new Promise(resolve => {
    const PLANE_KEY = process.env.PLANE_API_KEY;
    if (!PLANE_KEY) { resolve({}); return; }
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'GET',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
    };
    let data = '';
    const req = https.request(opts, res => {
      data = '';
      res.on('data', d => data += d);
      res.on('end', async () => {
        if (res.statusCode >= 500 && _retries > 0) {
          await new Promise(r => setTimeout(r, 800));
          resolve(planeGet(path, _retries - 1));
          return;
        }
        try { resolve(JSON.parse(data)); } catch { resolve({}); }
      });
    });
    req.on('error', () => resolve({}));
    req.end();
  });
}

// ── Paginated GET — fetches all pages ──
//
// Plane.so uses CURSOR pagination, not page-number. Passing &page=N is
// silently ignored — every request returns page 1, with next_page_results=true,
// so a naive `while (next_page_results) page++` loop appends the same 100
// rows 20 times until the safety cap hits. That bug produced the
// "C2M-80 listed 5x" + variable due-today counts seen in the morning briefs
// at 2026-04-27 09:31. Fix: use cursor=, dedupe by id as a safety net,
// hard-cap at 50 pages.
async function planeGetAll(path) {
  const seen = new Set();
  const all = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const data = await planeGet(`${path}${sep}per_page=100${cursorParam}`);
    const items = data?.results || data?.data || (Array.isArray(data) ? data : []);
    let newRows = 0;
    for (const it of items) {
      const id = it?.id;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      all.push(it);
      newRows++;
    }
    if (!data?.next_page_results) break;
    if (newRows === 0) break; // cursor stalled — bail rather than loop forever
    cursor = data?.next_cursor || null;
    if (!cursor) break;
  }
  return all;
}

// ── PATCH (update) ──
function planePatch(path, body) {
  return new Promise((resolve, reject) => {
    const PLANE_KEY = process.env.PLANE_API_KEY;
    if (!PLANE_KEY) { resolve({}); return; }
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'PATCH',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => {
        if (!data.trim()) { resolve({}); return; }
        try {
          const p = JSON.parse(data);
          if (p.error || p.detail) reject(new Error(String(p.error || p.detail)));
          else resolve(p);
        } catch { reject(new Error('Parse error: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// ── POST (create) ──
function planePost(path, body) {
  return new Promise((resolve, reject) => {
    const PLANE_KEY = process.env.PLANE_API_KEY;
    if (!PLANE_KEY) { reject(new Error('PLANE_API_KEY not set')); return; }
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'POST',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => {
        if (!data.trim()) { resolve({}); return; }
        try {
          const p = JSON.parse(data);
          if (p.error || p.detail) reject(new Error(String(p.error || p.detail)));
          else resolve(p);
        } catch { reject(new Error('Parse error: ' + data.slice(0, 80))); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

module.exports = { planeGet, planeGetAll, planePatch, planePost };
