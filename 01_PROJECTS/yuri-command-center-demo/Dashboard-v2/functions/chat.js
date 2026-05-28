const https = require('https');

const OPENAI_KEY   = process.env.OPENAI_API_KEY;

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const { PROJECTS, PROJECTS_LIST, WORKSPACE: _WS, TEAM_FALLBACK } = require('./shared-config');
const { planeGet, planePatch: planePATCH, planePost: planePOST } = require('./shared-plane');
const { anthropicPost } = require('./shared');
const _PROJECTS_ARR = PROJECTS_LIST; // [{code, id}]

// Team — dynamically synced from Plane.so, fallback to shared config
let CTI = Object.keys(TEAM_FALLBACK)[0] || '';
let FK  = Object.keys(TEAM_FALLBACK)[1] || '';
let TEAM_MAP = {};
let _UID_MAP_CHAT = {};
// Initialize from fallback
Object.entries(TEAM_FALLBACK).forEach(([uid, short]) => { TEAM_MAP[short] = { id: uid, name: short, role: '' }; _UID_MAP_CHAT[uid] = short; });
let _teamSyncedChat = false;

async function syncTeamChat() {
  if (_teamSyncedChat) return;
  try {
    // Use centralized team sync from shared-config
    const { syncTeamIds } = require('./shared-config');
    const teamIds = await syncTeamIds();
    // Build TEAM_MAP and _UID_MAP_CHAT from centralized result
    const newMap = {}; const newUid = {};
    Object.entries(teamIds).forEach(([uid, short]) => {
      newMap[short] = { id: uid, name: short, role: '' };
      newUid[uid] = short;
    });
    if (Object.keys(newMap).length) { TEAM_MAP = newMap; _UID_MAP_CHAT = newUid; }
    if (newMap.CTI) CTI = newMap.CTI.id;
    _teamSyncedChat = true;
  } catch {}
}

// Safe array extractor — handles any Plane.so response format (.data, .results, or direct array)
function toArray(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  if (Array.isArray(r.data)) return r.data;
  if (Array.isArray(r.results)) return r.results;
  return [];
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Not allowed' };

  // Auth check
  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  try {
    // Sync team members on first invocation
    await syncTeamChat();

    const { messages, audioBase64, audioUrl, documentText, mimeType, createTicket, fixTicket, ticketData, summarize, bulkUpdate, analyzeMeeting } = JSON.parse(event.body || '{}');

    // ── 0.1. BULK OPERATIONS ─────────────────────────────────────────────────
    if (bulkUpdate) {
      const { action, issueIds, projectId, fields } = bulkUpdate;
      if (!issueIds || !issueIds.length) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No issue IDs provided' }) };

      const results = { updated: 0, failed: 0, details: [] };
      const projId = projectId || _PROJECTS_ARR[0].id;

      for (const issueId of issueIds) {
        try {
          // Find the project for this issue (try provided or scan all)
          let pid = projId;

          if (action === 'patchFields') {
            // Patch issue fields: priority, state, assignee, dates
            const patch = {};
            if (fields.priority) patch.priority = fields.priority;
            if (fields.start_date) patch.start_date = fields.start_date;
            if (fields.target_date) patch.target_date = fields.target_date;
            if (fields.assignee_id) patch.assignees = [fields.assignee_id];
            if (fields.state_id) patch.state = fields.state_id;

            if (Object.keys(patch).length) {
              await planePATCH('/workspaces/' + _WS + '/projects/' + pid + '/issues/' + issueId + '/', patch);
            }

            // State by name (need to resolve to ID)
            if (fields.state_name) {
              const statesR = await planeGet('/workspaces/' + _WS + '/projects/' + pid + '/states/');
              const states = toArray(statesR);
              const match = states.find(s => s.name.toLowerCase() === fields.state_name.toLowerCase());
              if (match) {
                await planePATCH('/workspaces/' + _WS + '/projects/' + pid + '/issues/' + issueId + '/', { state: match.id });
              }
            }
            results.updated++;
          }

          if (action === 'assignCycle') {
            // Assign to cycle by name
            const cycsR = await planeGet('/workspaces/' + _WS + '/projects/' + pid + '/cycles/?per_page=50');
            const cycs = toArray(cycsR);
            const cyc = cycs.find(c => c.name.toLowerCase().includes(fields.cycleName.toLowerCase()));
            if (cyc) {
              await planePOST('/workspaces/' + _WS + '/projects/' + pid + '/cycles/' + cyc.id + '/cycle-issues/', { issues: [issueId] });
              results.updated++;
            } else { results.failed++; results.details.push(issueId.slice(0,8) + ': cycle not found'); }
          }

          if (action === 'assignModule') {
            const modsR = await planeGet('/workspaces/' + _WS + '/projects/' + pid + '/modules/?per_page=50');
            const mods = toArray(modsR);
            const mod = mods.find(m => m.name.toLowerCase().includes(fields.moduleName.toLowerCase()));
            if (mod) {
              await planePOST('/workspaces/' + _WS + '/projects/' + pid + '/modules/' + mod.id + '/module-issues/', { issues: [issueId] });
              results.updated++;
            } else { results.failed++; results.details.push(issueId.slice(0,8) + ': module not found'); }
          }

        } catch(e) {
          results.failed++;
          results.details.push(issueId.slice(0,8) + ': ' + e.message);
        }
      }

      return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
    }

    // ── 0.3. SUMMARIZE TRANSCRIPT ────────────────────────────────────────────
    if (summarize && summarize.transcript) {
      const res = await anthropicPost({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: 'You are a concise assistant. Summarize the following voice memo transcript into a clear, structured ticket description. Keep it professional and actionable. Use bullet points if there are multiple topics. Write in the same language as the transcript. Do not add any preamble.',
        messages: [{ role: 'user', content: summarize.transcript }]
      });
      const text = (res.content && res.content[0] && res.content[0].text) || '';
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ summary: text }) };
    }

    // ── 0.5. FIX EXISTING TICKET — assign module/cycle/customer ──────────────
    if (fixTicket) {
      const { issueId, projId, module: modName, cycle: cycName, customer: custName } = fixTicket;
      const assigned = [], failed = [];
      const fixModules = Array.isArray(modName) ? modName : (modName ? [modName] : []);
      if (fixModules.length) {
        try {
          const modsR = await planeGet('/workspaces/' + _WS + '/projects/' + projId + '/modules/?per_page=50');
          const mods = toArray(modsR);
          for (const mn of fixModules) {
            const mod = mods.find(m => m.name.toLowerCase().includes(mn.toLowerCase()));
            if (mod) {
              await planePOST('/workspaces/' + _WS + '/projects/' + projId + '/modules/' + mod.id + '/module-issues/', { issues: [issueId] });
              assigned.push('📦 Module: ' + mod.name);
            } else { failed.push('module "' + mn + '" not found'); }
          }
        } catch(e) { failed.push('module: ' + e.message); }
      }
      if (cycName) {
        try {
          const cycsR = await planeGet('/workspaces/' + _WS + '/projects/' + projId + '/cycles/?per_page=20');
          const cycs = toArray(cycsR);
          const cyc = cycs.find(c => c.name.toLowerCase().includes(cycName.toLowerCase()));
          if (cyc) {
            await planePOST('/workspaces/' + _WS + '/projects/' + projId + '/cycles/' + cyc.id + '/cycle-issues/', { issues: [issueId] });
            assigned.push('🔄 Cycle: ' + cyc.name);
          } else { failed.push('cycle "' + cycName + '" not found'); }
        } catch(e) { failed.push('cycle: ' + e.message); }
      }
      if (custName) {
        try {
          const custsR = await planeGet('/workspaces/' + _WS + '/customers/?per_page=100');
          const custs = toArray(custsR);
          const cust = custs.find(c => c.name.toLowerCase().includes(custName.toLowerCase()));
          if (cust) {
            await planePOST('/workspaces/' + _WS + '/customers/' + cust.id + '/issues/', { issue_ids: [issueId] });
            assigned.push('👤 Customer: ' + cust.name);
          } else { failed.push('customer "' + custName + '" not found'); }
        } catch(e) { failed.push('customer: ' + e.message); }
      }
      const reply = (assigned.length ? '✅ Applied:\n' + assigned.join('\n') : '') +
        (failed.length ? '\n⚠️ Failed:\n' + failed.map(f=>'- '+f).join('\n') : '');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply: reply || 'Nothing to fix.' }) };
    }

    // ── 0.5. ANALYZE MEETING — AI ticket detection from transcript + context ──
    if (analyzeMeeting) {
      const { transcript, clientContext, clientName, attendees, date, autoNotify } = analyzeMeeting;
      if (!transcript) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'No transcript provided' }) };

      // Build context summary for Claude
      const ctx = clientContext || {};
      const clientInfo = ctx.client || {};
      const existingTickets = (ctx.tickets?.items || []).map(t =>
        `${t.id}: "${t.name}" [${t.state}, ${t.priority}] → ${t.assignee}`
      ).join('\n') || 'No existing tickets found';

      const systemPrompt = `You are an expert COO assistant for c2moviez GmbH, a Swiss creative technology firm.
Your task: Analyze a meeting transcript and extract actionable tickets.

CLIENT CONTEXT:
- Name: ${clientInfo.name || clientName || 'Unknown'}
- Status: ${clientInfo.status || 'unknown'} | Stage: ${clientInfo.stage || 'unknown'}
- Revenue: CHF ${clientInfo.monthly_revenue || 0}/month | Total: CHF ${clientInfo.total_value || 0}
- Contract: ${clientInfo.contract_status || 'unknown'} | Billing: ${clientInfo.billing_type || 'unknown'}
- Domain: ${clientInfo.domain || 'unknown'}
- Open tickets: ${ctx.tickets?.open || 0} | Overdue: ${ctx.tickets?.overdue || 0}

EXISTING OPEN TICKETS (check for duplicates):
${existingTickets}

MEETING INFO:
- Date: ${date || new Date().toISOString().slice(0, 10)}
- Attendees: ${(attendees || []).join(', ') || 'Not specified'}

RULES:
1. Extract ONLY actionable commitments, tasks, and deliverables from the transcript
2. Each ticket must have: title, description, priority (urgent/high/medium/low), project (C2M for customer work, MFB for Med For Balance, C2I for internal), module (one of: Videography, Photography, Social Media, Marketing, IT & Web, Design, Consulting, Process Management), assignee suggestion (CTI=Claudio/CEO, FK=Fanny/Marketing)
3. Check each proposed ticket against existing open tickets — if a similar ticket exists, flag it as "duplicate_of" with the existing ticket ID
4. Assign confidence: high (explicitly stated), medium (strongly implied), low (might be needed)
5. Extract a follow-up date if mentioned
6. Assess overall meeting sentiment: positive/neutral/negative

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "summary": "2-3 sentence meeting summary",
  "action_items": ["item1", "item2"],
  "tickets": [
    {
      "title": "Clear descriptive title",
      "description": "What needs to be done and why",
      "priority": "high",
      "project": "C2M",
      "module": "Marketing",
      "assignee": "CTI",
      "reasoning": "Why this ticket should be created",
      "confidence": "high",
      "duplicate_of": null
    }
  ],
  "follow_up_date": "YYYY-MM-DD or null",
  "sentiment": "positive"
}`;

      try {
        const { anthropicPost, extractJSON } = require('./shared');
        const aiResponse = await anthropicPost({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 3000,
          messages: [{ role: 'user', content: `Meeting transcript:\n\n${transcript.slice(0, 8000)}` }],
          system: systemPrompt,
        });

        const text = aiResponse?.content?.[0]?.text || '';
        const parsed = extractJSON(text);

        if (parsed) {
          // Filter out low-confidence duplicates
          const tickets = (parsed.tickets || []).filter(t =>
            !(t.duplicate_of && t.confidence === 'low')
          );

          // Auto-dispatch to Telegram if requested (zero-click pipeline)
          if (autoNotify && tickets.length > 0) {
            try {
              const tgPayload = JSON.stringify({
                meetingProposal: {
                  client: clientName, date, summary: parsed.summary,
                  tickets: tickets, follow_up_date: parsed.follow_up_date,
                  sentiment: parsed.sentiment,
                }
              });
              const dashUrl = process.env.URL || 'https://ops.c2moviez.com';
              await new Promise(resolve => {
                const opts = {
                  hostname: new URL(dashUrl).hostname,
                  path: '/.netlify/functions/telegram',
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(tgPayload) }
                };
                const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
                req.on('error', () => resolve());
                req.write(tgPayload); req.end();
              });
              console.log(`[analyzeMeeting] Auto-dispatched ${tickets.length} proposals to Telegram`);
            } catch (e) { console.warn('[analyzeMeeting] Auto-dispatch failed:', e.message); }
          }

          return { statusCode: 200, headers: CORS, body: JSON.stringify({
            summary: parsed.summary || '',
            action_items: parsed.action_items || [],
            tickets: tickets,
            follow_up_date: parsed.follow_up_date || null,
            sentiment: parsed.sentiment || 'neutral',
            raw_response: text.slice(0, 200),
          })};
        }

        return { statusCode: 200, headers: CORS, body: JSON.stringify({
          summary: text.slice(0, 500),
          action_items: [],
          tickets: [],
          error: 'Could not parse structured response',
        })};
      } catch (e) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Analysis failed: ' + e.message }) };
      }
    }

    // ── 1. WHISPER TRANSCRIPTION ──────────────────────────────────────────────
    if (audioBase64) {
      try {
        const buf = Buffer.from(audioBase64, 'base64');
        if (buf.length > 5000000) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Recording too large (max ~5MB / ~5 minutes).' }) };
        const mt = (mimeType || '').toLowerCase();
        const ext = mt.includes('m4a') ? 'm4a' : mt.includes('mp4') ? 'mp4' : mt.includes('ogg') ? 'ogg' : mt.includes('mpeg') || mt.includes('mp3') ? 'mp3' : mt.includes('wav') ? 'wav' : mt.includes('flac') ? 'flac' : mt.includes('aac') ? 'm4a' : 'webm';
        const boundary = 'B' + Date.now();
        const form = Buffer.concat([
          Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="a.' + ext + '"\r\nContent-Type: ' + (mimeType || 'audio/webm') + '\r\n\r\n'),
          buf,
          Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--' + boundary + '--\r\n')
        ]);
        const whisper = await new Promise(resolve => {
          const opts = { hostname: 'api.openai.com', path: '/v1/audio/transcriptions', method: 'POST',
            headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': form.length } };
          let data = '';
          const req = https.request(opts, res => { res.on('data', d => data += d); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ error: data.slice(0,100) }); } }); });
          req.on('error', e => resolve({ error: e.message }));
          req.write(form); req.end();
        });
        if (whisper.error) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Whisper: ' + JSON.stringify(whisper.error) }) };
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ transcript: whisper.text || '' }) };
      } catch(e) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Transcription failed: ' + e.message }) };
      }
    }

    // ── 1.5. WHISPER FROM URL (large files via Supabase Storage) ──────────────
    if (audioUrl) {
      try {
        // Validate URL against allowlist before fetching (SSRF guard)
        const parsedAudioUrl = new URL(audioUrl);
        const ALLOWED_AUDIO_HOSTS = /\.(supabase\.co|supabase\.in|c2moviez\.com)$/i;
        if (parsedAudioUrl.protocol !== 'https:' || !ALLOWED_AUDIO_HOSTS.test(parsedAudioUrl.hostname)) {
          return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Invalid audio URL host' }) };
        }
        // Download audio from Supabase Storage
        const audioData = await new Promise((resolve, reject) => {
          const url = parsedAudioUrl;
          const mod = https;
          mod.get(audioUrl, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          }).on('error', reject);
        });
        if (audioData.length > 25000000) return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'Audio too large (max 25MB for Whisper). Try recording shorter segments.' }) };
        const mt = (mimeType || '').toLowerCase();
        const ext = mt.includes('ogg') ? 'ogg' : mt.includes('mp4') ? 'mp4' : mt.includes('wav') ? 'wav' : 'webm';
        const boundary = 'B' + Date.now();
        const form = Buffer.concat([
          Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="meeting.' + ext + '"\r\nContent-Type: ' + (mimeType || 'audio/webm') + '\r\n\r\n'),
          audioData,
          Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--' + boundary + '--\r\n')
        ]);
        const whisper = await new Promise(resolve => {
          const opts = { hostname: 'api.openai.com', path: '/v1/audio/transcriptions', method: 'POST',
            headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': form.length } };
          let data = '';
          const req = https.request(opts, res => { res.on('data', d => data += d); res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ error: data.slice(0,200) }); } }); });
          req.on('error', e => resolve({ error: e.message }));
          req.write(form); req.end();
        });
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ transcript: whisper.text || '', error: whisper.error?.message || whisper.error || null }) };
      } catch(e) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ error: 'URL transcription failed: ' + e.message }) };
      }
    }

    // ── 2. DIRECT TICKET CREATION ─────────────────────────────────────────────
    if (createTicket) {
      const p = createTicket;
      const projId = p.project_id || PROJECTS[p.project] || _PROJECTS_ARR[0].id;
      const proj = p.project || 'C2M';
      try {
        // ── 1. Resolve state by name ──
        let stateId = undefined;
        if (p.state) {
          try {
            const statesR = await planeGet('/workspaces/' + _WS + '/projects/' + projId + '/states/');
            const states = toArray(statesR);
            const match = states.find(s => s.name.toLowerCase() === p.state.toLowerCase());
            if (match) stateId = match.id;
          } catch(e) { /* use default */ }
        }
        // ── 2. Create the issue ──
        const issueBody = {
          name: p.name, priority: p.priority || 'high',
          assignees: [p.assignee_id || CTI],
          start_date: p.start_date || new Date().toISOString().slice(0, 10),
          target_date: p.due_date || null,
          description_html: p.description ? '<p>' + p.description + '</p>' : ''
        };
        if (stateId) issueBody.state = stateId;
        const created = await planePOST('/workspaces/' + _WS + '/projects/' + projId + '/issues/', issueBody);
        const ref = proj + '-' + created.sequence_id;
        const url = 'https://app.plane.so/c2moviez/projects/' + projId + '/issues/' + created.id + '/';
        const emo = { urgent: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[p.priority] || '🔵';
        const assigned = [];
        const failed  = [];

        // ── 2. Assign to module(s) — supports single string or array ──
        const moduleNames = Array.isArray(p.module) ? p.module : (p.module ? [p.module] : []);
        if (moduleNames.length) {
          try {
            const modsR = await planeGet('/workspaces/' + _WS + '/projects/' + projId + '/modules/?per_page=50');
            const mods = toArray(modsR);
            for (const modName of moduleNames) {
              const mod = mods.find(m => m.name.toLowerCase().includes(modName.toLowerCase()));
              if (mod) {
                await planePOST('/workspaces/' + _WS + '/projects/' + projId + '/modules/' + mod.id + '/module-issues/', { issues: [created.id] });
                assigned.push('📦 Module: ' + mod.name);
              } else {
                failed.push('module "' + modName + '" not found');
              }
            }
          } catch(e) { failed.push('module: ' + e.message); }
        }

        // ── 3. Assign to cycle (by name if provided) ──
        if (p.cycle) {
          try {
            const cycsR = await planeGet('/workspaces/' + _WS + '/projects/' + projId + '/cycles/?per_page=20');
            const cycs = toArray(cycsR);
            const cyc = cycs.find(c => c.name.toLowerCase().includes(p.cycle.toLowerCase()));
            if (cyc) {
              await planePOST('/workspaces/' + _WS + '/projects/' + projId + '/cycles/' + cyc.id + '/cycle-issues/', { issues: [created.id] });
              assigned.push('🔄 Cycle: ' + cyc.name);
            } else {
              failed.push('cycle "' + p.cycle + '" not found (available: ' + cycs.map(c=>c.name).join(', ') + ')');
            }
          } catch(e) { failed.push('cycle: ' + e.message); }
        }

        // ── 4. Assign to customer (by name if provided) ──
        if (p.customer) {
          try {
            const custsR = await planeGet('/workspaces/' + _WS + '/customers/?per_page=100');
            const custs = toArray(custsR);
            const cust = custs.find(c => c.name.toLowerCase().includes(p.customer.toLowerCase()));
            if (cust) {
              await planePOST('/workspaces/' + _WS + '/customers/' + cust.id + '/issues/', { issue_ids: [created.id] });
              assigned.push('👤 Customer: ' + cust.name);
            } else {
              failed.push('customer "' + p.customer + '" not found');
            }
          } catch(e) { failed.push('customer: ' + e.message); }
        }

        const assignedStr = assigned.length ? '\n' + assigned.join('\n') : '';
        const failedStr   = failed.length   ? '\n\n⚠️ Could not auto-assign:\n' + failed.map(f=>'- '+f).join('\n') : '';
        const reply = '✅ **[' + ref + '](' + url + ') created**\n\n**' + p.name + '**\n\n' +
          emo + ' ' + (p.priority || 'high') + '  ·  👤 ' + (p.assignee || 'CTI') +
          (p.due_date ? '  ·  📅 ' + p.due_date : '') +
          assignedStr + failedStr +
          '\n\n[Open in Plane.so](' + url + ')';
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply, ref, url }) };
      } catch(e) {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ reply: '⚠️ Could not create ticket: ' + e.message }) };
      }
    }

    // ── 3. GET TICKET DATA — from frontend (fast) or Plane API (fallback) ──
    let all, ticketMap = {};

    if (ticketData && ticketData.length > 0) {
      // Frontend provided pre-loaded data — skip expensive API calls
      all = ticketData;
      all.forEach(i => { ticketMap[i.ticket] = { id: i.id, pid: i.pid }; });
    } else {
      // Fallback: fetch from Plane.so API (slow, rate-limited)
      const stateMaps = {}, issuesByProj = {};
      const sleep = ms => new Promise(res => setTimeout(res, ms));
      for (const proj of _PROJECTS_ARR) {
        if (Object.keys(stateMaps).length > 0) await sleep(400);
        const [issR, stR] = await Promise.all([
          planeGet('/workspaces/' + _WS + '/projects/' + proj.id + '/issues/?per_page=250'),
          planeGet('/workspaces/' + _WS + '/projects/' + proj.id + '/states/')
        ]);
        stateMaps[proj.code] = {};
        toArray(stR).forEach(s => { stateMaps[proj.code][s.id] = { name: s.name, group: s.group }; });
        issuesByProj[proj.code] = { issues: toArray(issR), id: proj.id };
      }
      // Membership from cache
      const modIds = new Set(), cycIds = new Set();
      try {
        const memR = await new Promise(resolve => {
          const opts = { hostname: process.env.URL ? new URL(process.env.URL).hostname : 'ops.c2moviez.com',
            path: '/.netlify/functions/membership', method: 'GET', headers: {} };
          let d = '';
          const req = https.request(opts, res => { res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } }); });
          req.on('error', () => resolve(null));
          req.end();
        });
        if (memR && memR.modIds && memR.cycIds) {
          memR.modIds.forEach(id => modIds.add(id));
          memR.cycIds.forEach(id => cycIds.add(id));
        }
      } catch(e) {}

      all = [];
      _PROJECTS_ARR.forEach(proj => {
        const { issues, id } = issuesByProj[proj.code];
        issues.forEach(issue => {
          const st = stateMaps[proj.code][issue.state] || { name: 'Unknown', group: 'unstarted' };
          const assignees = (issue.assignees || []).map(x => _UID_MAP_CHAT[x] || '?').join('+') || 'unassigned';
          all.push({
            ticket: proj.code + '-' + issue.sequence_id,
            id: issue.id, proj: proj.code, pid: id,
            name: issue.name,
            priority: issue.priority || 'none',
            state: st.name,
            group: st.group,
            assignee: assignees,
            start_date: issue.start_date || null,
            target_date: issue.target_date || null,
            updated_at: issue.updated_at || null,
            desc: (issue.description_stripped || '').slice(0, 100)
          });
        });
      });
      all.forEach(i => { ticketMap[i.ticket] = { id: i.id, pid: i.pid }; });
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const active  = all.filter(i => !['completed','cancelled'].includes(i.group));
    const overdue = active.filter(i => i.target_date && new Date(i.target_date) < today);

    // 6-condition hygiene
    const isClean = i => i.priority && i.priority !== 'none' && i.assignee !== 'unassigned' && i.start_date && i.target_date && !(i.target_date && new Date(i.target_date) < new Date());
    const dirtyTickets = active.filter(i => !isClean(i));
    const hygScore = active.length ? Math.round(active.filter(isClean).length / active.length * 100) : 100;

    // Missing field summary for each dirty ticket
    function missingFields(i) {
      const m = [];
      if (!i.priority || i.priority === 'none') m.push('priority');
      if (i.assignee === 'unassigned') m.push('assignee');
      if (!i.start_date) m.push('start_date');
      if (!i.target_date) m.push('due_date');
      return m;
    }

    // ── Load Client KB from Supabase Storage (pushed by Obsidian) ──
    let clientKBContext = 'SHI=SHIPSTER AG, MFB=Med For Balance GmbH, GANZ=GANZ BOATS AG, GRYD=GRYD SWISS, RIBO=Carosserie RIBO, UPG=UPGREAT AG, KAP=Kappiserie, CHI=Chicano, BOV=Boviro Security, BAL=Balas, GLG=Gianluca Giardino, SLT=SLTECH, ISO=Isorol Tacker, OREA=OREA CARE, BBA=BBA Baumaschinen, PDRT=PDR Tech, NOBA=NOBA Shop, ALP=ALPHAVIVO';
    try {
      const { storageGet } = require('./shared-storage');
      const kb = await storageGet('production-hub', 'client-kb--data');
      if (kb) {
        if (kb && kb.clients) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const lines = [];
          const staleList = [];
          for (const [code, c] of Object.entries(kb.clients)) {
            let line = `${code}=${c.name || ''}`;
            if (c.domain) line += ` (${c.domain})`;
            if (c.budget_tier) line += ` [${c.budget_tier}]`;
            if (c.open_tickets) line += ` ${c.open_tickets}tix`;
            if (c.overdue_tickets) line += ` ${c.overdue_tickets}OD`;
            lines.push(line);
            // Stale detection
            const lastAct = c.last_work_item_activity;
            if (lastAct && c.status === 'active') {
              const daysSince = Math.floor((Date.now() - new Date(lastAct).getTime()) / 86400000);
              if (daysSince >= 14) staleList.push(`${code} (${daysSince}d, email: ${c.contact_email || '?'})`);
            } else if (!lastAct && c.status === 'active' && c.contract_status === 'active') {
              staleList.push(`${code} (no activity ever, email: ${c.contact_email || '?'})`);
            }
          }
          clientKBContext = lines.join(', ') + '\n';
          if (staleList.length > 0) {
            clientKBContext += 'STALE CLIENTS (no activity 14+ days): ' + staleList.join(', ') + '\n';
          }
          clientKBContext += '(source: Obsidian vault, updated ' + (kb.updatedAt || 'unknown').slice(0, 10) + ')';
        }
      }
    } catch (e) { /* fallback to hardcoded context */ }

    const byState = {};
    active.forEach(i => { byState[i.state] = (byState[i.state] || 0) + 1; });
    const stateBreakdown = Object.entries(byState).sort((a,b) => b[1]-a[1]).map(([s,n]) => s+':'+n).join(', ');

    // Compact ticket list — prioritize overdue + active work, cap total
    const activeWork = active.filter(i => ['In Progress','Editing','Recording'].includes(i.state));
    const planning = active.filter(i => i.state === 'Planning');
    const rest = active.filter(i => !activeWork.includes(i) && !overdue.includes(i) && !planning.includes(i));
    const prioritized = [...overdue, ...activeWork, ...planning.slice(0,15), ...rest.slice(0,20)];
    const uniqueTickets = [...new Map(prioritized.map(i=>[i.ticket,i])).values()].slice(0,80);

    const liveData =
      'Total:' + all.length + ' | Active:' + active.length + ' | Overdue:' + overdue.length + ' | Hygiene:' + hygScore + '%\n' +
      'BY STATE: ' + stateBreakdown + '\n\n' +
      'TICKETS (ref|state|priority|assignee|start|due|updated|score|name|desc):\n' +
      uniqueTickets.map(i => [
        i.ticket, i.state, i.priority, i.assignee,
        i.start_date ? i.start_date.slice(5,10) : '-',
        i.target_date ? i.target_date.slice(5,10) : '-',
        i.updated_at ? i.updated_at.slice(5,10) : '-',
        i.score !== undefined ? i.score : '-',
        i.name.slice(0, 40),
        (i.desc || '').slice(0, 60)
      ].join('|')).join('\n') +
      (active.length > 80 ? '\n... +' + (active.length-80) + ' more tickets (ask to see specific filters)' : '') + '\n\n' +
      'HYGIENE ISSUES (' + dirtyTickets.length + '):\n' +
      (dirtyTickets.length ? dirtyTickets.slice(0,20).map(i => i.ticket + '|' + missingFields(i).join(',') + '|' + i.name.slice(0,40)).join('\n') : 'All clean') + '\n\n' +
      'OVERDUE:\n' +
      (overdue.length ? overdue.map(i => i.ticket + '|' + Math.floor((Date.now()-new Date(i.target_date))/86400000) + 'd|' + i.assignee + '|' + i.state + '|' + i.name.slice(0,40)).join('\n') : 'None');

    // ── 4. SYSTEM PROMPT ──────────────────────────────────────────────────────
    const system =
      'You are NEX, the COO intelligence system for c2moviez (Swiss creative agency). (NEX is the agent — formerly EXEO; both refer to you.) Today: ' + new Date().toISOString().slice(0,10) + '\n\n' +
      '━━ LIVE PLANE.SO DATA (open tickets only — done/cancelled excluded) ━━\n' +
      liveData + '\n\n' +
      '━━ TICKET UUID MAP (for deep links) ━━\n' +
      JSON.stringify(Object.fromEntries(uniqueTickets.map(i=>[i.ticket,{id:i.id,pid:i.pid}]))).slice(0,3000) + '\n\n' +
      '━━ PROJECT UUIDs ━━\n' +
      Object.entries(PROJECTS).map(([k,v])=>k+'='+v).join(' | ') + '\n\n' +
      '━━ CORE FIELDS — every ticket MUST have these 4 + not be overdue ━━\n' +
      '1. priority   → urgent/high/medium/low (NEVER "none")\n' +
      '2. assignee   → ' + Object.entries(TEAM_MAP).map(([k,v])=>k+'='+v.name).join(' | ') + ' (NEVER unassigned)\n' +
      '3. start_date → when work begins\n' +
      '4. due_date   → deadline (target_date in data)\n' +
      'States: Backlog/Todo/Planning/In Progress/on-site/remote/Recording/Editing/Pending Customer/pending internal\n' +
      'Modules: Videography/Social Media/Marketing/IT/Website Creation/Meta ADS/Photography/LinkedIn/Google Ads/Finance/Sales/Process Management\n' +
      'Cycles: Q1-' + new Date().getFullYear() + ' / Q2-' + new Date().getFullYear() + ' / Q3-' + new Date().getFullYear() + ' / Q4-' + new Date().getFullYear() + ' / Q1-' + (new Date().getFullYear()+1) + '\n\n' +
      '━━ HYGIENE ━━\n' +
      'Clean = has priority + assignee + start_date + due_date + NOT overdue.\n' +
      'Score: ' + hygScore + '% (' + active.filter(isClean).length + '/' + active.length + ')\n\n' +
      '━━ BEHAVIOUR ━━\n' +
      '- Answer EXACTLY what was asked. Be specific and concise.\n' +
      '- Only reference open/active tickets from live data.\n' +
      '- Filter by any field: state, priority, assignee, project, client\n' +
      '- "data hygiene" → list tickets missing priority/assignee/start/due or overdue\n' +
      '- "briefing" → full status: overdue, hygiene, priorities\n' +
      '- "overdue" → list overdue with days past due\n' +
      '- "in planning" → filter state=Planning\n' +
      '- ALWAYS link ticket refs: [C2M-87](https://app.plane.so/' + _WS + '/projects/' + PROJECTS.C2M + '/issues/UUID/)\n' +
      '- Use UUID map to find correct issue UUID — NEVER invent one\n' +
      '- Use markdown: **bold**, bullets, links\n' +
      '- For ticket creation proposals, ALWAYS infer module (from service type), cycle (current or next quarter), and customer (from client code). Include all fields.\n' +
      '- End your proposal with:\n' +
      '```json\n{"propose":{"name":"TICKET NAME","project":"C2M","project_id":"' + PROJECTS.C2M + '","priority":"high","assignee":"' + Object.keys(TEAM_MAP)[0] + '","assignee_id":"' + (TEAM_MAP[Object.keys(TEAM_MAP)[0]]?.id || CTI) + '","due_date":null,"start_date":null,"module":"Website Creation","cycle":"Q' + Math.ceil((new Date().getMonth()+1)/3) + ' ' + new Date().getFullYear() + '","customer":null,"description":""}}\n```\n' +
      '- Module must match exactly: Website Creation / Videography / Social Media / Marketing / IT / Meta ADS / Photography / LinkedIn / Google Ads / Finance / Sales / Process Management\n' +
      '- Cycle must be exactly: Q1 ' + new Date().getFullYear() + ' / Q2 ' + new Date().getFullYear() + ' / Q3 ' + new Date().getFullYear() + ' / Q4 ' + new Date().getFullYear() + ' / Q1 ' + (new Date().getFullYear()+1) + '\n' +
      '- Customer = client full name (e.g. SHIPSTER AG, Med For Balance GmbH). Set null if internal.\n' +
      '- When user says YES/confirm/ja/do it → reply only: CONFIRMED\n' +
      '━━ FIXING EXISTING TICKETS ━━\n' +
      '- You CAN directly assign module, cycle, and customer to ANY existing ticket via the API — you do NOT need to tell the user to do it manually.\n' +
      '- When user asks to assign/fix/add module or cycle or customer to a ticket, output ONLY this JSON (no other text needed):\n' +
      '```json\n{"fix":{"ticket":"C2M-85","project":"C2M","project_id":"' + PROJECTS.C2M + '","issue_id":"UUID_FROM_MAP","module":"IT","cycle":"Q' + Math.ceil((new Date().getMonth()+1)/3) + ' ' + new Date().getFullYear() + '","customer":null}}\n```\n' +
      '- Use the UUID map to find the issue_id. Set module/cycle/customer to null if not being changed.\n' +
      '- project_id: ' + Object.entries(PROJECTS).map(([k,v])=>k+'='+v).join(' | ') + '\n\n' +
      '━━ CLIENTS & CONTEXT (enriched from Obsidian vault) ━━\n' +
      clientKBContext + '\n' +
      'TEAM: ' + Object.entries(TEAM_MAP).map(([k,v])=>k+'='+v.name+' ('+v.role+', id='+v.id+')').join(', ') + '\n' +
      'MACL GmbH = invoicing/Shopify/admin company. EXEOFLOW = upcoming business OS replacing Bexio.';

    // ── 5. CALL CLAUDE ────────────────────────────────────────────────────────
    let msgs = messages || [{ role: 'user', content: 'briefing' }];
    if (documentText && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      msgs = [...msgs.slice(0,-1), { ...last, content: last.content + '\n\n[DOCUMENT]:\n' + documentText.slice(0, 8000) }];
    }

    const response = await anthropicPost({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system, messages: msgs });
    const reply = response.content?.[0]?.text || 'Sorry, could not process that.';

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, ticketCount: all.length, overdueCount: overdue.length, hygScore })
    };

  } catch(err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
