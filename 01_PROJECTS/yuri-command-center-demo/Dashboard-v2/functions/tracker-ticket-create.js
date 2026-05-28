/**
 * tracker-ticket-create.js — Workstream T.7.3-C
 *
 * Creates a Plane.so issue from the tracker's manual-log "+ Create ticket"
 * flow (or the standalone TicketCreateDialog). Clones the proven pattern in
 * chat.js:388-472 (state lookup → POST issue → assign module → assign cycle
 * → link customer), but exposes a bearer-authed endpoint with strict input
 * validation + permission gate (tracker.create_ticket).
 *
 * Body:
 *   {
 *     project_code?: "C2M" | "MFB" | "C2I" | "MACL" | "...",
 *     project_id?: uuid,                       // overrides project_code if set
 *     name: string,                            // required
 *     priority?: "urgent"|"high"|"medium"|"low"|"none",
 *     assignee_id?: uuid,                      // single Plane user UUID
 *     start_date?: "YYYY-MM-DD",
 *     due_date?: "YYYY-MM-DD",
 *     state_name?: "Planning"|"Todo"|...,      // resolves to UUID
 *     module_names?: string[],                 // resolved by name-includes match
 *     cycle_name?: string,                     // e.g. "Q2-2026"
 *     customer_code?: string,                  // e.g. "SHI" — looked up by name match
 *     description_html?: string,
 *     estimated_hours?: number                 // appended to description suffix
 *   }
 *
 * Returns:
 *   { ok: true, issue_id, sequence_id, ref ("C2M-187"), url, assigned, failed }
 */
const https = require('https');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
};

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const PLANE_KEY = process.env.PLANE_API_KEY;
const PLANE_WS = process.env.PLANE_WORKSPACE_SLUG || 'c2moviez';
const CTI_ID = process.env.PLANE_CTI_ID || '8b51d49a-fa44-49a3-92c1-ad34b8d4d8aa';

// Project map — matches shared-config.js
const PROJECTS = (() => {
  try { return JSON.parse(process.env.PLANE_PROJECT_IDS_JSON || '{}'); }
  catch { return {
    C2M:  '807ce45f-495b-452e-9e6f-6b236c66a055',
    MFB:  '8ca26c5e-6e93-42ce-92ec-10ff354d2dd3',
    C2I:  '23e95ec1-0acc-47f3-a124-ddb4734bcef9',
    MACL: '5b7e31bc-5966-4c9b-b17f-39888db77605',
  }; }
})();

function http(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: host, port: 443, path, method,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    };
    const req = https.request(opts, (res) => {
      let raw = ''; res.on('data', (c) => (raw += c));
      res.on('end', () => { let j; try { j = JSON.parse(raw); } catch { j = raw; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const planeHdr = { 'X-API-Key': PLANE_KEY, Accept: 'application/json' };
async function planeGet(path) {
  const r = await http('GET', 'api.plane.so', `/api/v1${path}`, planeHdr);
  if (r.status >= 400) throw new Error(`Plane GET ${path}: ${r.status} ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 200)}`);
  return r.body;
}
async function planePost(path, body) {
  const r = await http('POST', 'api.plane.so', `/api/v1${path}`, planeHdr, body);
  if (r.status >= 400) throw new Error(`Plane POST ${path}: ${r.status} ${(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 200)}`);
  return r.body;
}
const toArray = (r) => Array.isArray(r) ? r : (r?.results || []);

async function verifyBearer(authHeader) {
  if (!authHeader) return null;
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  if (!bearer) return null;
  const u = new URL(SUPA_URL);
  const r = await http('GET', u.host, '/auth/v1/user',
    { apikey: SUPA_KEY, Authorization: `Bearer ${bearer}`, Accept: 'application/json' });
  return r.status === 200 && r.body?.id ? r.body : null;
}

async function checkPermission(userId, module, action) {
  // Uses public.has_permission(user_id, module, action) which already covers
  // CEO/CTO bypass + per-user override + role default fallback.
  const u = new URL(SUPA_URL);
  const r = await http('POST', u.host, '/rest/v1/rpc/has_permission',
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Accept: 'application/json' },
    { p_user_id: userId, p_module_key: module, p_action_key: action });
  return r.status === 200 && r.body === true;
}

async function writeAudit(action, entityId, entityName, actorId, details) {
  const u = new URL(SUPA_URL);
  await http('POST', u.host, '/rest/v1/audit_log',
    { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    { action, entity_type: 'plane_issue', entity_id: entityId, entity_name: entityName, actor: actorId, details });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ ok: false, error: 'method not allowed' }) };
  if (!SUPA_URL || !SUPA_KEY || !PLANE_KEY) {
    return { statusCode: 503, headers: CORS, body: JSON.stringify({ ok: false, error: 'env not configured' }) };
  }

  const caller = await verifyBearer(event.headers?.authorization || event.headers?.Authorization);
  if (!caller) return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'not authenticated' }) };

  // Permission gate
  const allowed = await checkPermission(caller.id, 'tracker', 'create_ticket');
  if (!allowed) return { statusCode: 403, headers: CORS, body: JSON.stringify({ ok: false, error: 'tracker.create_ticket required' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'bad json' }) }; }

  const p = body || {};
  if (!p.name || typeof p.name !== 'string') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'name required' }) };
  }

  const projCode = p.project_code || 'C2M';
  const projId = p.project_id || PROJECTS[projCode];
  if (!projId) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: `unknown project_code: ${projCode}` }) };
  }

  try {
    // ── 1. Resolve state by name (optional) ───────────────────────
    let stateId;
    if (p.state_name) {
      try {
        const states = toArray(await planeGet(`/workspaces/${PLANE_WS}/projects/${projId}/states/`));
        const match = states.find((s) => (s.name || '').toLowerCase() === p.state_name.toLowerCase());
        if (match) stateId = match.id;
      } catch { /* leave default */ }
    }

    // ── 2. Build issue payload + create ───────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    let descriptionHtml = p.description_html || '';
    if (Number.isFinite(p.estimated_hours) && p.estimated_hours > 0) {
      descriptionHtml += `\n<p><em>Estimated: ${p.estimated_hours}h</em></p>`;
    }
    const issueBody = {
      name: p.name,
      priority: p.priority || 'medium',
      assignees: [p.assignee_id || CTI_ID],
      start_date: p.start_date || today,
      target_date: p.due_date || null,
      description_html: descriptionHtml.trim() ? descriptionHtml : `<p>${p.name}</p>`,
    };
    if (stateId) issueBody.state = stateId;

    const created = await planePost(`/workspaces/${PLANE_WS}/projects/${projId}/issues/`, issueBody);
    const ref = `${projCode}-${created.sequence_id}`;
    const url = `https://app.plane.so/${PLANE_WS}/projects/${projId}/issues/${created.id}/`;
    const assigned = [];
    const failed = [];

    // ── 3. Modules ────────────────────────────────────────────────
    const moduleNames = Array.isArray(p.module_names) ? p.module_names : (p.module_name ? [p.module_name] : []);
    if (moduleNames.length) {
      try {
        const mods = toArray(await planeGet(`/workspaces/${PLANE_WS}/projects/${projId}/modules/?per_page=50`));
        for (const modName of moduleNames) {
          const mod = mods.find((m) => (m.name || '').toLowerCase().includes(modName.toLowerCase()));
          if (mod) {
            await planePost(`/workspaces/${PLANE_WS}/projects/${projId}/modules/${mod.id}/module-issues/`, { issues: [created.id] });
            assigned.push({ kind: 'module', name: mod.name });
          } else {
            failed.push({ kind: 'module', name: modName, reason: 'not_found' });
          }
        }
      } catch (e) { failed.push({ kind: 'module', reason: e.message }); }
    }

    // ── 4. Cycle ──────────────────────────────────────────────────
    if (p.cycle_name) {
      try {
        const cycs = toArray(await planeGet(`/workspaces/${PLANE_WS}/projects/${projId}/cycles/?per_page=20`));
        const cyc = cycs.find((c) => (c.name || '').toLowerCase().includes(p.cycle_name.toLowerCase()));
        if (cyc) {
          await planePost(`/workspaces/${PLANE_WS}/projects/${projId}/cycles/${cyc.id}/cycle-issues/`, { issues: [created.id] });
          assigned.push({ kind: 'cycle', name: cyc.name });
        } else {
          failed.push({ kind: 'cycle', name: p.cycle_name, reason: 'not_found' });
        }
      } catch (e) { failed.push({ kind: 'cycle', reason: e.message }); }
    }

    // ── 5. Customer link ──────────────────────────────────────────
    if (p.customer_code || p.customer_id) {
      try {
        let custId = p.customer_id;
        if (!custId) {
          const custs = toArray(await planeGet(`/workspaces/${PLANE_WS}/customers/?per_page=200`));
          const cust = custs.find((c) =>
            (c.name || '').toLowerCase().includes((p.customer_code || '').toLowerCase()) ||
            (c.customer_code || '').toLowerCase() === (p.customer_code || '').toLowerCase()
          );
          if (cust) custId = cust.id;
        }
        if (custId) {
          await planePost(`/workspaces/${PLANE_WS}/customers/${custId}/issues/`, { issue_ids: [created.id] });
          assigned.push({ kind: 'customer', id: custId });
        } else {
          failed.push({ kind: 'customer', name: p.customer_code, reason: 'not_found' });
        }
      } catch (e) { failed.push({ kind: 'customer', reason: e.message }); }
    }

    // ── 6. Audit ──────────────────────────────────────────────────
    await writeAudit('tracker_ticket_created', created.id, ref, caller.id, {
      project_code: projCode, ref, url,
      priority: issueBody.priority,
      assigned, failed,
      estimated_hours: p.estimated_hours || null,
      source: 'tracker_create_ticket',
    });

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        issue_id: created.id,
        sequence_id: created.sequence_id,
        ref, url, assigned, failed,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ ok: false, error: e.message || String(e) }) };
  }
};
