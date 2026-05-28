const https = require('https');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function anthropicPost(body) {
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Not allowed' };

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  const ok = (data) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) });

  try {
    const { client_name, services, requirements, meeting_summary, research_template } = JSON.parse(event.body || '{}');

    // Build dynamic output schema from template (if provided)
    const defaultSections = [
      { key: 'competitors', prompt: 'competitors digital presence and content strategy' },
      { key: 'benchmarks', prompt: 'industry benchmarks for engagement, content frequency, platforms' },
      { key: 'recommendations', prompt: 'specific services and deliverables with rationale and hours' },
      { key: 'pricing_context', prompt: 'market positioning and value propositions' },
      { key: 'timeline_suggestion', prompt: 'phased timeline for delivery' }
    ];
    const sections = (research_template && research_template.length) ? research_template : defaultSections;

    // Build JSON schema dynamically
    const schemaDesc = sections.map(s => `  "${s.key}": [Research: ${s.prompt || s.label || s.key}]`).join(',\n');

    const systemPrompt = `You are a business research assistant for c2moviez, a Swiss creative agency based in Wetzikon, Switzerland.
The agency provides: Video Production, Photography, Website Creation, Visuals/Production, Digital Marketing, Branding Design, and Technology Solutions.

Research the given client and provide strategic recommendations for the proposal. Be practical and Switzerland-market aware.
Output ONLY valid JSON with this structure:
{
${schemaDesc}
}

For each section, provide rich, detailed data. Arrays should contain objects with descriptive fields. Strings should be comprehensive.`;

    const userMsg = `Client: ${client_name || 'Unknown'}
Services interested in: ${(services || []).join(', ')}
Requirements from meeting: ${(requirements || []).join('; ')}
Meeting summary: ${meeting_summary || 'No summary available'}

Provide research and strategic recommendations for the c2moviez proposal.`;

    const result = await anthropicPost({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }]
    });

    const text = result?.content?.[0]?.text || '{}';
    let research;
    try {
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      research = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      research = { raw: text };
    }

    return ok({ status: 'complete', results: research });
  } catch (e) {
    return ok({ status: 'error', error: e.message });
  }
};
