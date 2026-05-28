const { CORS } = require('./shared');
const { storageGet, storagePut } = require('./shared-storage');

const MAX_BODY = 65_536;
const BUCKET = 'production-hub';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  try {
    if (event.httpMethod === 'GET') {
      const data = await storageGet(BUCKET, 'weekly-plans--plan.json');
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: data ? JSON.stringify(data) : '{}' };
    }

    if (event.httpMethod === 'POST') {
      if ((event.body || '').length > MAX_BODY) {
        return { statusCode: 413, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: 'Payload too large' }) };
      }
      await storagePut(BUCKET, 'weekly-plans--plan.json', JSON.parse(event.body));
      return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: '{"ok":true}' };
    }
  } catch (e) {
    // Fallback: return empty plan if blobs not configured
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: '{}' };
  }

  return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
};
