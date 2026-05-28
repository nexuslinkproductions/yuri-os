/**
 * meeting-followup.js — Auto-draft follow-up email after meetings
 *
 * Called internally by calendar-watch (or manually) after a meeting ends.
 * Uses Claude to generate a professional German follow-up email with
 * action items, key points summary, and proposed next meeting date.
 *
 * Does NOT send the email — returns a draft for CEO approval (per CLAUDE.md rules).
 *
 * POST /.netlify/functions/meeting-followup
 * Body: {
 *   client_code: "SHI",
 *   meeting_subject: "Monthly Review",
 *   attendees: ["eugen@sl-tech.ch"],
 *   notes: "optional meeting notes",
 *   action_items: ["Send proposal", "Schedule follow-up"]
 * }
 *
 * Returns: { ok: true, draft: { subject, body_html, to, cc }, client_code }
 */

const https = require('https');
const { ok, err, options, anthropicPost } = require('./shared');
const { CLIENT_MATCH_RULES } = require('./shared-config');
const { storageGet } = require('./shared-storage');

// ── Fetch client context from Supabase Storage (client KB) ──
async function fetchClientContext(clientCode) {
  const kb = await storageGet('production-hub', 'client-kb');
  if (!kb) return null;
  const clients = kb?.clients || kb || {};
  const code = clientCode.toUpperCase();
  return clients[code] || clients[clientCode] || null;
}

// ── Resolve client display name from match rules or KB ──
function resolveClientName(clientCode, clientContext) {
  if (clientContext?.name) return clientContext.name;
  const rule = CLIENT_MATCH_RULES.find(r =>
    (r.kuerzel || '').toUpperCase() === clientCode.toUpperCase()
  );
  if (rule?.customer) return rule.customer;
  return clientCode;
}

// ── Handler ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body;
  try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }

  const { client_code: raw_code, meeting_subject, attendees, notes, action_items } = body;
  if (!raw_code) return err('Missing client_code');
  if (!meeting_subject) return err('Missing meeting_subject');
  if (!attendees || !attendees.length) return err('Missing attendees');
  const client_code = String(raw_code).replace(/[^A-Z0-9-]/gi, '').slice(0, 12);
  if (!client_code) return err('Invalid client_code');

  // Fetch client context for richer email
  const clientContext = await fetchClientContext(client_code);
  const clientName = resolveClientName(client_code, clientContext);

  // Build the today date in CEST-friendly format
  const now = new Date();
  const cestOffset = 2 * 60 * 60 * 1000; // UTC+2
  const cest = new Date(now.getTime() + cestOffset);
  const dateStr = cest.toISOString().slice(0, 10);

  // Build Claude prompt
  const systemPrompt = `Du bist EXEO, der COO-Assistent von c2moviez GmbH, einer Schweizer Kreativtechnologie-Firma.
Du schreibst professionelle, aber freundliche Business-E-Mails auf Deutsch (Schweizer Stil — "freundliche Grüsse", nicht "Mit freundlichen Grüßen").
Dein CEO heisst Claudio Tinner.
Die Firma-Website ist c2moviez.com.
Halte den Ton professionell aber persönlich — nicht steif oder generisch.`;

  const actionItemsList = (action_items || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || 'Keine spezifischen Action Items erfasst.';
  const notesSection = notes ? `\nMeeting-Notizen:\n${notes}` : '';
  const clientInfo = clientContext ? `\nKundenkontext: ${clientName}, Kontakt: ${clientContext.contact_name || 'unbekannt'}, Status: ${clientContext.stage || 'aktiv'}` : '';

  const userPrompt = `Erstelle eine Follow-up E-Mail für folgendes Meeting:

Kunde: ${clientName} (${client_code})
Betreff des Meetings: ${meeting_subject}
Datum: ${dateStr}
Teilnehmer: ${attendees.join(', ')}${clientInfo}${notesSection}

Action Items:
${actionItemsList}

Anforderungen:
1. Betreff-Zeile für die E-Mail (kurz, referenziert das Meeting)
2. E-Mail-Body in HTML-Format (mit <p>, <ul>, <li> Tags)
3. Bedanke dich für das Meeting
4. Fasse die besprochenen Punkte zusammen (basierend auf Betreff und Action Items)
5. Liste alle Action Items mit Verantwortlichen auf
6. Schlage einen nächsten Termin vor (ca. 2 Wochen nach dem Meeting-Datum)
7. Unterschrift: "Freundliche Grüsse, Claudio Tinner — c2moviez GmbH"

Antwort im JSON-Format:
{
  "subject": "Betreff-Zeile",
  "body_html": "<p>E-Mail HTML Body...</p>"
}`;

  try {
    const aiResponse = await anthropicPost({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const responseText = aiResponse?.content?.[0]?.text || '';

    // Extract JSON from response
    let draft;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try { draft = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
    }

    if (!draft || !draft.subject || !draft.body_html) {
      console.error('[MeetingFollowup] Failed to parse AI response');
      return err('Failed to generate follow-up email — AI response could not be parsed', 500);
    }

    const result = {
      ok: true,
      draft: {
        subject: draft.subject,
        body_html: draft.body_html,
        to: attendees,
        cc: [],
      },
      client_code,
      client_name: clientName,
      meeting_date: dateStr,
      meeting_subject,
    };

    console.log(`[MeetingFollowup] Draft generated for ${client_code} — "${draft.subject}"`);

    return ok(result);
  } catch (e) {
    console.error(`[MeetingFollowup] Error: ${e.message}`);
    return err(`Failed to generate follow-up: ${e.message}`, 500);
  }
};
