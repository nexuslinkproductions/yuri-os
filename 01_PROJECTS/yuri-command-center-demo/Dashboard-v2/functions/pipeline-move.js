const { checkAuth } = require('./auth-check');

const { CORS } = require('./shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { client_code, client_name, to_lane, stage, source } = payload;
  if (!client_code || !to_lane) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'client_code and to_lane required' }) };
  }

  console.log('[pipeline-move]', JSON.stringify({ client_code, client_name, to_lane, stage, source, ts: new Date().toISOString() }));

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      client_code,
      to_lane,
      stage,
      queued: true,
      note: 'Stage change logged. Plane.so customer stage update will apply on next sync.',
    }),
  };
};
