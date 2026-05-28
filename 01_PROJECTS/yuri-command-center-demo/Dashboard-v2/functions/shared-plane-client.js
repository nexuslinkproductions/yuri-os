/**
 * shared-plane-client.js — bundleable port of Scripts/lib/plane-client.js
 *
 * The Netlify functions bundler can't reach Scripts/, so we keep this copy
 * in netlify/functions/. Keep the two files in lock-step when changing
 * either: token-bucket rate limit (30 rpm default), Retry-After honoring,
 * 429 + 5xx retry with exponential backoff capped at 45s.
 *
 * Used by tracker-push-plane and tracker-pull-plane (Workstream T.3).
 */
const https = require('https');

const DEFAULT_RPM = parseInt(process.env.PLANE_RPM || '30', 10);
const MAX_RETRIES = 3;

let tokens = DEFAULT_RPM;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  const add = elapsed * (DEFAULT_RPM / 60);
  if (add >= 1) {
    tokens = Math.min(DEFAULT_RPM, tokens + Math.floor(add));
    lastRefill = now;
  }
}

function acquire() {
  return new Promise((resolve) => {
    const take = () => {
      refill();
      if (tokens > 0) { tokens -= 1; resolve(); }
      else setTimeout(take, Math.ceil(60_000 / DEFAULT_RPM));
    };
    take();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function backoffDelay(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const s = parseInt(retryAfterHeader, 10);
    if (!isNaN(s) && s > 0) return Math.min(s * 1000, 120_000);
  }
  return [5000, 15_000, 45_000][attempt] || 45_000;
}

function request(host, path, { method = 'GET', body = null, headers = {} } = {}, apiKey) {
  const opts = {
    hostname: host, port: 443, path, method,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
  };
  const payload = body ? JSON.stringify(body) : null;
  if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let j; try { j = JSON.parse(raw); } catch { j = raw; }
        resolve({ status: res.statusCode, body: j, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Make a Plane API call with the token-bucket + retry logic. */
async function call(path, opts = {}) {
  const apiKey = process.env.PLANE_API_KEY;
  if (!apiKey) throw new Error('PLANE_API_KEY not set');
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquire();
    let res;
    try {
      res = await request('api.plane.so', path, opts, apiKey);
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      await sleep(backoffDelay(attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) {
        throw new Error(`Plane ${res.status} after ${MAX_RETRIES + 1} attempts: ${opts.method || 'GET'} ${path}`);
      }
      const delay = backoffDelay(attempt, res.headers['retry-after']);
      console.warn(`[plane] ${res.status} on ${path} — backoff ${Math.round(delay / 1000)}s`);
      await sleep(delay);
      continue;
    }
    return res;
  }
  throw new Error('plane-client: unreachable');
}

const WORKSPACE = process.env.PLANE_WORKSPACE_SLUG || 'c2moviez';

/** Format duration seconds as Plane's `HH:MM:SS`. */
function durationToPlane(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** Look up the Plane project_uuid for a given issue_uuid. Plane requires both
 *  in the worklog endpoint path. We hit /issues/{id}/ which returns project. */
async function getProjectForIssue(issueId) {
  // Plane's project_id lives on the issue. Single GET, no list pagination.
  const r = await call(`/api/v1/workspaces/${WORKSPACE}/issues/${issueId}/`);
  if (r.status >= 400) throw new Error(`getProjectForIssue ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`);
  return r.body?.project || r.body?.project_id || null;
}

/** Create a worklog entry on a Plane issue. Returns { id, ... } from Plane. */
async function createWorklog(projectId, issueId, { description, durationSeconds }) {
  const r = await call(
    `/api/v1/workspaces/${WORKSPACE}/projects/${projectId}/issues/${issueId}/worklogs/`,
    { method: 'POST', body: { description: description || '', duration: durationToPlane(durationSeconds) } },
  );
  if (r.status >= 400) throw new Error(`createWorklog ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}`);
  return r.body;
}

/** List worklogs on an issue (read-back for reconcile). */
async function listWorklogs(projectId, issueId) {
  const r = await call(`/api/v1/workspaces/${WORKSPACE}/projects/${projectId}/issues/${issueId}/worklogs/`);
  if (r.status >= 400) throw new Error(`listWorklogs ${r.status}`);
  return r.body?.results || r.body || [];
}

module.exports = { call, durationToPlane, getProjectForIssue, createWorklog, listWorklogs, WORKSPACE };
