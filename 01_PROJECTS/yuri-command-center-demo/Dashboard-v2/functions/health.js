// ═══ HEALTH MONITORING — Service Status Checker ═══
// GET /.netlify/functions/health
// Returns JSON status report for all integrated services.
// Auth: X-Internal-Key header (same as other internal endpoints).

const https = require('https');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Internal-Key',
  'Access-Control-Allow-Credentials': 'true'
};

const CHECK_TIMEOUT = 5000; // 5 seconds per check

// ── Generic HTTPS request with timeout ──
function httpRequest(options, body) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Timeout after ${CHECK_TIMEOUT}ms`));
    }, CHECK_TIMEOUT);

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ statusCode: res.statusCode, body: raw });
      });
    });
    req.on('error', e => {
      clearTimeout(timer);
      reject(e);
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── Individual health checks ──

async function checkPlane() {
  const apiKey = process.env.PLANE_API_KEY;
  if (!apiKey) throw new Error('PLANE_API_KEY not configured');

  const workspace = process.env.WORKSPACE_SLUG || 'c2moviez';
  const res = await httpRequest({
    hostname: 'api.plane.so',
    path: `/api/v1/workspaces/${workspace}/projects/`,
    method: 'GET',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (res.statusCode >= 500) throw new Error(`Plane.so returned HTTP ${res.statusCode}`);
  if (res.statusCode === 401 || res.statusCode === 403) throw new Error('Plane.so auth failed');
  if (res.statusCode >= 400) throw new Error(`Plane.so returned HTTP ${res.statusCode}`);
  return res.statusCode;
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');

  const parsed = new URL(`${url}/rest/v1/audit_log?select=id&limit=1`);
  const res = await httpRequest({
    hostname: parsed.hostname,
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }
  });

  if (res.statusCode >= 500) throw new Error(`Supabase returned HTTP ${res.statusCode}`);
  if (res.statusCode === 401 || res.statusCode === 403) throw new Error('Supabase auth failed');
  if (res.statusCode >= 400) throw new Error(`Supabase returned HTTP ${res.statusCode}`);
  return res.statusCode;
}

async function checkM365() {
  const tenantId = process.env.M365_TENANT_ID;
  const clientId = process.env.M365_CLIENT_ID;
  const clientSecret = process.env.M365_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('M365 credentials not configured');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default'
  }).toString();

  const res = await httpRequest({
    hostname: 'login.microsoftonline.com',
    path: `/${tenantId}/oauth2/v2.0/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (res.statusCode !== 200) {
    let detail = '';
    try { detail = JSON.parse(res.body).error_description || ''; } catch {}
    if (detail) console.error('[health] M365 error detail:', detail.slice(0, 200));
    throw new Error(`M365 authentication failed (HTTP ${res.statusCode})`);
  }

  const parsed = JSON.parse(res.body);
  if (!parsed.access_token) throw new Error('M365 token response missing access_token');
  return res.statusCode;
}

async function checkTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');

  const res = await httpRequest({
    hostname: 'api.telegram.org',
    path: `/bot${token}/getMe`,
    method: 'GET'
  });

  if (res.statusCode !== 200) throw new Error(`Telegram returned HTTP ${res.statusCode}`);
  const parsed = JSON.parse(res.body);
  if (!parsed.ok) throw new Error(parsed.description || 'Telegram getMe failed');
  return res.statusCode;
}

async function checkNetlifyBlobs() {
  const { storageGet } = require('./shared-storage');
  // Try to read a known key — null means missing (still healthy), throw on real error
  try {
    await storageGet('production-hub', 'pipeline--_index');
    return 200;
  } catch (e) {
    throw new Error(`Supabase Storage check failed: ${e.message}`);
  }
}

// ── Run a single check with timing and error handling ──
async function runCheck(name, fn) {
  const start = Date.now();
  try {
    await fn();
    const latency = Date.now() - start;
    return {
      service: name,
      status: latency > 3000 ? 'degraded' : 'healthy',
      latency_ms: latency,
      error: null
    };
  } catch (e) {
    return {
      service: name,
      status: 'down',
      latency_ms: Date.now() - start,
      error: e.message || String(e)
    };
  }
}

// ── Handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // Auth: require X-Internal-Key
  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  // Run all checks in parallel
  const services = await Promise.all([
    runCheck('plane', checkPlane),
    runCheck('supabase', checkSupabase),
    runCheck('m365', checkM365),
    runCheck('telegram', checkTelegram),
    runCheck('netlify_blobs', checkNetlifyBlobs),
  ]);

  const healthy = services.filter(s => s.status === 'healthy').length;
  const degraded = services.filter(s => s.status === 'degraded').length;
  const down = services.filter(s => s.status === 'down').length;

  // Overall status: down if any service is down, degraded if any degraded
  let overallStatus = 'healthy';
  if (down > 0) overallStatus = 'down';
  else if (degraded > 0) overallStatus = 'degraded';

  // Timestamp in CEST (UTC+2)
  const now = new Date();
  const cest = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const timestamp = cest.toISOString().replace('Z', '+02:00');

  const body = {
    status: overallStatus,
    timestamp,
    services,
    uptime_checks: services.length,
    healthy,
    degraded,
    down
  };

  return {
    statusCode: overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body, null, 2)
  };
};
