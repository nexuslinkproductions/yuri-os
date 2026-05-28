/**
 * client-update.js — edits to a client from the Dashboard Pipeline drawer.
 *
 * Writes:
 *   1. audit_log insert (what changed)
 *   2. entity_state upsert (merges edited fields — broadcasts via Realtime)
 *   3. obsidian_queue insert (vault-watch agent picks this up + writes frontmatter)
 *
 * Auth: session token OR X-Internal-Key
 */

const https = require('https');
const { checkAuth } = require('./auth-check');
const { planeGet, planePatch } = require('./shared-plane');
const { WORKSPACE } = require('./shared-config');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Internal-Key,X-Internal-Sig,X-Internal-Timestamp',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

function supabaseInsert(table, data) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify(data);
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

function supabaseUpsertEntityState(entityType, entityId, state, source) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return Promise.resolve(null);
  return new Promise(resolve => {
    const payload = JSON.stringify({
      p_entity_type: entityType,
      p_entity_id: String(entityId),
      p_state: state || {},
      p_source: source || 'client-update',
    });
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/upsert_entity_state`);
    const opts = {
      hostname: url.hostname, path: url.pathname, method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    let d = '';
    const req = https.request(opts, res => {
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(payload); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { client_code, client_name, fields, source } = payload;
  if (!client_code || !fields || typeof fields !== 'object') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'client_code and fields required' }) };
  }

  // Strip null/undefined values from patch
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== ''));

  // 1. entity_state upsert (merges patch into existing state — drives realtime Dashboard update)
  await supabaseUpsertEntityState('client', client_code, patch, source || 'dashboard-v2');

  // 2. audit_log queue row → obsidian-queue-consumer writes frontmatter in local vault
  const targetPath = `02 - Clients/${client_code} - ${client_name || client_code}.md`;
  await supabaseInsert('audit_log', {
    action: 'obsidian.queue.client_frontmatter',
    entity_type: 'client',
    entity_id: client_code,
    entity_name: client_name || client_code,
    actor: source || 'dashboard-v2',
    details: {
      target_path: targetPath,
      frontmatter_patch: patch,
      field_count: Object.keys(patch).length,
    },
    metadata: { source: source || 'dashboard-v2', timestamp: Date.now() },
  });

  // 3. Plane.so customer PATCH — bi-directional sync closed
  //    Only whitelisted fields are mapped; never touch what Plane doesn't expect.
  const planeFieldMap = {
    contact_email: 'email',
    email:         'email',
    stage:         'stage',
    contract_status: 'contract_status',
    website:       'website',
    employees:     'employees',
    name:          'name',
  };
  const planePayload = {};
  for (const [src, dst] of Object.entries(planeFieldMap)) {
    if (patch[src] !== undefined && patch[src] !== '') planePayload[dst] = patch[src];
  }

  let planeSync = { attempted: false, updated: [], matched_id: null, error: null };
  if (Object.keys(planePayload).length > 0) {
    planeSync.attempted = true;
    try {
      // Find the Plane customer by matching client_name or client_code
      const custs = await planeGet(`/workspaces/${WORKSPACE}/customers/?per_page=200`);
      const list = custs?.results || custs?.data || (Array.isArray(custs) ? custs : []);
      const needle = (client_name || client_code).toLowerCase();
      const codeNeedle = client_code.toLowerCase();
      let matched = list.find(c => (c.name || '').toLowerCase() === needle);
      if (!matched) matched = list.find(c => (c.name || '').toLowerCase().startsWith(codeNeedle));
      if (!matched) matched = list.find(c => (c.name || '').toLowerCase().includes(codeNeedle));
      if (matched?.id) {
        planeSync.matched_id = matched.id;
        await planePatch(`/workspaces/${WORKSPACE}/customers/${matched.id}/`, planePayload);
        planeSync.updated = Object.keys(planePayload);
      } else {
        planeSync.error = 'customer_not_found';
      }
    } catch (err) {
      planeSync.error = err.message;
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      client_code,
      fields_updated: Object.keys(patch),
      queued_path: targetPath,
      plane_sync: planeSync,
    }),
  };
};
