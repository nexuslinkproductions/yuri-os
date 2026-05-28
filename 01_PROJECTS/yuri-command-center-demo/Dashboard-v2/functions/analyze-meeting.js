/**
 * analyze-meeting.js — Claude-powered meeting analysis
 * POST { transcript, title, client_code?, duration_seconds? }
 * Returns { summary, actions, proposals, claims }
 *
 * Phase L (2026-04-27): the analyzer now also (a) reads existing facts
 * about the meeting's client BEFORE generating the analysis so the model
 * doesn't contradict known truth, and (b) instructs the model to emit a
 * `claims` array of structured facts it extracted from the transcript.
 * Each claim is asserted into the fact ledger via assert_fact, with
 * source='meeting' and confidence 0.8 (CEO can later confirm to bump to 1.0).
 */

const { CORS, ok, err, options, anthropicPost, extractJSON } = require('./shared');
const { getKnownFacts, formatFacts, assertFact } = require('./shared-facts');
const { checkAuth } = require('./auth-check');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  // Auth gate: HMAC-signed internal call OR cookie/Bearer JWT.
  // Legacy bare X-Internal-Key still accepted for backward compat.
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return err('Invalid JSON', 400); }

  const { transcript, title, client_code, duration_seconds } = body;
  if (!transcript || transcript.trim().length < 10) return err('No transcript', 400);

  const durationStr = duration_seconds ? `${Math.floor(duration_seconds / 60)}m ${duration_seconds % 60}s` : 'unknown';

  // Pull authoritative facts so the AI doesn't re-state outdated values.
  const facts = client_code ? await getKnownFacts('client', client_code) : null;
  const factsBlock = client_code ? formatFacts(facts) : '';

  const systemPrompt = `You are NEX, COO of c2moviez GmbH (Swiss creative tech firm — formerly branded EXEO; both names refer to you). Analyze this meeting transcript and return structured data.

Company context: c2moviez GmbH, CEO is Claudio Tinner (CTI), projects include videography, photography, web, social media for Swiss/Austrian SMEs.
${client_code ? `This meeting is about client: ${client_code}` : ''}

${factsBlock ? factsBlock + '\n' : ''}
Return ONLY valid JSON in this exact shape:
{
  "summary": "3-5 sentence executive summary of the meeting",
  "actions": ["action item 1", "action item 2"],
  "proposals": [
    { "title": "(Q2-2026) Ticket title", "priority": "urgent|high|medium|low", "due": "YYYY-MM-DD or empty string" }
  ],
  "sentiment": "positive|neutral|negative",
  "next_steps": "1-2 sentence next steps",
  "claims": [
    { "predicate": "monthly_revenue|billing_model|contact_email|contact_phone|contact_name|contract_status|stage|industry|domain|...", "value": <jsonb>, "rationale": "why this came from the transcript" }
  ]
}

CLAIMS RULES (very important):
- ONLY extract claims the speakers explicitly stated or confirmed in the transcript. Never infer. Never copy values from the KNOWN FACTS section.
- Prefer compact value shapes: amounts as {amount: 4000, currency: "CHF"}; text as {text: "..."}; counts as {count: 5}; date ranges as {start: "YYYY-MM-DD", end: "YYYY-MM-DD"}.
- Skip claims that match the KNOWN FACTS exactly (no point re-asserting unchanged values).
- If you can't extract any new structured claims, return claims: [].
- NEVER fabricate contact names — leave that predicate out unless the speaker explicitly named the person.

Hard rule: do NOT state values that contradict the KNOWN FACTS section unless the transcript explicitly says they changed (e.g. "starting next month our retainer is X" — then assert it).`;

  try {
    const resp = await anthropicPost({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Meeting: "${title || 'Untitled'}"\nDuration: ${durationStr}\n\nTranscript:\n${transcript}` }],
    });

    const raw = resp?.content?.[0]?.text || '';
    const parsed = extractJSON(raw);

    if (!parsed?.summary) {
      // Fallback: return raw text in summary
      return ok({ summary: raw, actions: [], proposals: [], sentiment: 'neutral', next_steps: '', claims: [] });
    }

    // Phase L: write any extracted claims back to the fact ledger.
    // Fail-soft — if the assertion fails for any reason we still return
    // the analysis to the caller.
    let claimsAsserted = 0;
    if (client_code && Array.isArray(parsed.claims)) {
      for (const c of parsed.claims) {
        if (!c?.predicate || c?.value === undefined) continue;
        const result = await assertFact({
          subject_type: 'client',
          subject_id: client_code,
          predicate: c.predicate,
          value: c.value,
          source: 'meeting',
          source_ref: title || 'meeting-analyzer',
          actor: 'exeo',
          confidence: 0.8,
          rationale: c.rationale || `Extracted from meeting transcript: ${title || ''}`,
        });
        if (result?.id) claimsAsserted++;
      }
    }

    return ok({ ...parsed, claims_asserted: claimsAsserted });
  } catch (e) {
    return err(`Analysis failed: ${e.message}`, 500);
  }
};
