// ═══ SHARED UTILITIES FOR NETLIFY FUNCTIONS ═══
const https = require('https');

// CORS headers — single source of truth
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Internal-Key,X-Internal-Sig,X-Internal-Timestamp',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Standard response helpers
function ok(data) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) };
}
function err(msg, status = 400) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: msg }) };
}
function options() {
  return { statusCode: 200, headers: CORS, body: '' };
}

// Anthropic Claude API call — shared across offer-gen, meeting-research, proposal-gen, chat
function anthropicPost(body) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01',
        'content-type': 'application/json', 'content-length': Buffer.byteLength(payload)
      }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ content: [{ text: 'Parse error' }] }); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

// Extract JSON from AI response text (handles markdown wrapping)
function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { return null; }
  }
  return null;
}

module.exports = { CORS, ALLOWED_ORIGIN, ok, err, options, anthropicPost, extractJSON };
