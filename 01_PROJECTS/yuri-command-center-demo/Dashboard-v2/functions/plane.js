const https = require('https');

exports.handler = async (event) => {
  const path = event.queryStringParameters?.path || '/workspaces/c2moviez/projects/';
  const method = event.httpMethod === 'OPTIONS' ? 'GET' : event.httpMethod;
  const body = event.body || null;

  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
  const CORS = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-API-Key'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  // SECURITY: Whitelist allowed API paths — prevent SSRF
  const workspace = process.env.WORKSPACE_SLUG || 'c2moviez';
  const allowedPrefix = `/workspaces/${workspace}/`;
  if (!path.startsWith(allowedPrefix)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden path' }) };
  }
  // Prevent path traversal
  if (path.includes('..') || path.includes('//')) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Invalid path' }) };
  }

  // Retry logic for transient Plane.so errors (500/502/503/504)
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 800; // ms

  async function callPlane() {
    return new Promise((resolve) => {
      const data = body || null;
      const opts = {
        hostname: 'api.plane.so',
        path: `/api/v1${path}`,
        method,
        headers: {
          'X-API-Key': process.env.PLANE_API_KEY,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      };
      const req = https.request(opts, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          headers: { 'Content-Type': 'application/json', ...CORS },
          body: raw
        }));
      });
      req.on('error', e => resolve({ statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) }));
      if (data) req.write(data);
      req.end();
    });
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const result = await callPlane();
    // Only retry on server errors for GET requests (safe to retry)
    if (result.statusCode >= 500 && method === 'GET' && attempt < MAX_RETRIES) {
      console.warn(`[Plane Proxy] HTTP ${result.statusCode} on attempt ${attempt + 1}, retrying in ${RETRY_DELAY}ms...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY * (attempt + 1)));
      continue;
    }
    return result;
  }
};
