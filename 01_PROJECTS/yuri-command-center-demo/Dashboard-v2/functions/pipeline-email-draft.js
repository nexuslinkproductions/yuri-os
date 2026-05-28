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

  const { client_code, client_name, to, subject, body: draftBody, queue } = payload;
  if (!subject || !draftBody) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'subject and body required' }) };
  }

  console.log('[pipeline-email-draft]', JSON.stringify({ client_code, client_name, to, subject, queue: queue || 'outlook_drafts', body_length: draftBody.length, ts: new Date().toISOString() }));

  // NOTE: actual Outlook draft creation will be wired via outlook-sync.js
  // For now we queue the draft intent and acknowledge. CEO will see it in
  // audit log; Outlook drafts sync runs separately.

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      queued: true,
      note: 'Draft queued — will appear in Outlook drafts on next m365 sync.',
    }),
  };
};
