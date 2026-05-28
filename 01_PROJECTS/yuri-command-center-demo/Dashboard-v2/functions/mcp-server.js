/**
 * mcp-server.js — Custom c2moviez MCP Server
 *
 * Exposes c2moviez-specific business logic as MCP tools via HTTP.
 * Uses the same tool execution layer as the Telegram bot.
 *
 * Auth: X-Internal-Key header (same as event-dispatch, context-engine)
 *
 * Tools: get_client_context, get_dashboard, analyze_meeting, create_ticket,
 *        update_ticket, mark_done, search_tickets, dispatch_event,
 *        send_telegram, queue_obsidian_write, create_client
 */

const https = require('https');
const { CORS, ALLOWED_ORIGIN, ok, err, options } = require('./shared');
const { getDashboardData, getBlobDirect } = require('./shared-data');
const { planeGet, planeGetAll, planePatch, planePost: planePOST } = require('./shared-plane');
const { WORKSPACE, PROJECTS, PROJECTS_LIST, syncTeamIds, TEAM_FALLBACK } = require('./shared-config');
const { storageGet: _storageGet, storagePut: _storagePut } = require('./shared-storage');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// ── Supabase audit logging ──
function auditLog(toolName, input, result, durationMs) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const entry = {
    action: 'mcp.tool_call', entity_type: 'mcp', entity_name: toolName,
    actor: 'claude-code', details: { input: JSON.stringify(input).slice(0, 500), result: String(result).slice(0, 300), duration_ms: durationMs, success: !String(result).startsWith('❌') },
    metadata: { source: 'mcp-server', timestamp: Date.now() }
  };
  const payload = JSON.stringify(entry);
  const url = new URL(`${SUPABASE_URL}/rest/v1/audit_log`);
  const opts = { hostname: url.hostname, path: url.pathname, method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal', 'Content-Length': Buffer.byteLength(payload) } };
  const req = https.request(opts, () => {}); req.on('error', () => {}); req.write(payload); req.end();
}

// ── Supabase RPC helper (for fact ledger) ──
function supabaseRpc(fnName, payload) {
  return new Promise((resolve, reject) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return reject(new Error('Supabase env vars missing'));
    const body = JSON.stringify(payload || {});
    const u = new URL(`${url}/rest/v1/rpc/${fnName}`);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`RPC ${fnName} ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function supabaseSelect(path) {
  return new Promise((resolve, reject) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return reject(new Error('Supabase env vars missing'));
    const u = new URL(`${url}/rest/v1/${path}`);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`SELECT ${path} ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(raw ? JSON.parse(raw) : []); } catch { reject(new Error('Bad JSON')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Storage queue for Obsidian writes ──
function queueObsidianWrite(type, data) {
  const key = `obsidian-queue--${Date.now()}--${type}`;
  _storagePut('telegram-state', key, { type, data, ts: Date.now() }).catch(() => {});
}

// ── Tool implementations ──
async function executeTool(name, input) {
  const TEAM_IDS = await syncTeamIds();
  const PROJ_IDS = Object.fromEntries(Object.entries(PROJECTS).map(([k, v]) => [k, v]));

  switch (name) {
    case 'get_client_context': {
      const d = await getDashboardData();
      const cn = (input.client_name || '').toLowerCase();
      const tickets = d.issues.filter(i => (i.name || '').toLowerCase().includes(cn.split(' ')[0]) && !['completed', 'cancelled'].includes(i.group));
      const ov = tickets.filter(i => i.target_date && i.target_date < new Date().toISOString().slice(0, 10));
      const cs = (d.clientSummaries || []).find(c => c.name?.toLowerCase().includes(cn.split(' ')[0]));
      return { client: input.client_name, open: tickets.length, overdue: ov.length, health: cs?.health, revenue: cs?.revenue, status: cs?.status, tickets: tickets.slice(0, 10).map(t => ({ ref: t.ticket, name: t.name, state: t.state, priority: t.priority, assignee: t.assignee, due: t.target_date })) };
    }
    case 'get_dashboard': {
      const d = await getDashboardData();
      return { active: d.active, done: d.done, overdue: (d.overdue || []).length, urgent: (d.urgent || []).length, dueThisWeek: (d.dueThisWeek || []).length, velocity: d.completedThisWeek, velocityTrend: d.velocityTrend, hygiene: d.hygiene, team: d.teamLoad, clients: (d.clientSummaries || []).slice(0, 10) };
    }
    case 'create_ticket': {
      const proj = input.project || 'C2M';
      const projId = PROJ_IDS[proj];
      const assigneeKey = input.assignee || 'CTI';
      const assigneeId = Object.entries(TEAM_IDS).find(([, v]) => v === assigneeKey)?.[0] || Object.keys(TEAM_IDS)[0];
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + (input.due_days || 14));
      const created = await planePOST(`/workspaces/${WORKSPACE}/projects/${projId}/issues/`, {
        name: input.title, priority: input.priority || 'medium', assignees: [assigneeId],
        start_date: new Date().toISOString().slice(0, 10), target_date: dueDate.toISOString().slice(0, 10),
        description_html: input.description ? `<p>${input.description}</p>` : '',
      });
      const ref = `${proj}-${created.sequence_id}`;
      queueObsidianWrite('work-item', { ticket: ref, name: input.title, client: proj, priority: input.priority || 'medium', state: 'Todo', assignee: assigneeKey, due: dueDate.toISOString().slice(0, 10), start: new Date().toISOString().slice(0, 10), project: proj });
      return { ref, id: created.id, url: `https://app.plane.so/${WORKSPACE}/projects/${projId}/issues/${created.id}/` };
    }
    case 'update_ticket': {
      const d = await getDashboardData();
      const ticket = d.issues.find(i => i.ticket === input.ticket_ref?.toUpperCase());
      if (!ticket) return { error: `Ticket ${input.ticket_ref} not found` };
      const projId = PROJ_IDS[ticket.proj];
      const patch = {};
      if (input.field === 'priority') patch.priority = input.value;
      if (input.field === 'due_date') patch.target_date = input.value;
      if (input.field === 'assignee') { const aid = Object.entries(TEAM_IDS).find(([, v]) => v === input.value.toUpperCase())?.[0]; if (aid) patch.assignees = [aid]; }
      if (Object.keys(patch).length) await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, patch);
      if (input.field !== 'note') queueObsidianWrite('work-item-update', { ticket: input.ticket_ref, field: input.field === 'due_date' ? 'due' : input.field, value: input.value });
      return { updated: input.ticket_ref, field: input.field, value: input.value };
    }
    case 'mark_done': {
      const d = await getDashboardData();
      const ticket = d.issues.find(i => i.ticket === input.ticket_ref?.toUpperCase());
      if (!ticket) return { error: `Ticket ${input.ticket_ref} not found` };
      const projId = PROJ_IDS[ticket.proj];
      const states = await planeGet(`/workspaces/${WORKSPACE}/projects/${projId}/states/`);
      const stateList = states.results || states.data || (Array.isArray(states) ? states : []);
      const doneState = stateList.find(s => s.group === 'completed');
      if (!doneState) return { error: 'No completed state found' };
      await planePatch(`/workspaces/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`, { state: doneState.id });
      queueObsidianWrite('work-item-update', { ticket: input.ticket_ref, field: 'state', value: 'Done' });
      return { completed: input.ticket_ref };
    }
    case 'search_tickets': {
      const d = await getDashboardData();
      const q = (input.query || '').toLowerCase();
      return d.issues.filter(i => (i.name || '').toLowerCase().includes(q) || i.ticket.toLowerCase().includes(q) || (i.assignee || '').toLowerCase().includes(q)).slice(0, 10).map(t => ({ ref: t.ticket, name: t.name, state: t.state, priority: t.priority, assignee: t.assignee, due: t.target_date }));
    }
    case 'dispatch_event': {
      const serviceKey = process.env.INTERNAL_SERVICE_KEY;
      if (!serviceKey) throw new Error('INTERNAL_SERVICE_KEY not configured');
      const payload = JSON.stringify({ event: input.event, data: input.data || {} });
      const dashUrl = process.env.URL || 'https://ops.c2moviez.com';
      await new Promise(resolve => {
        const opts = { hostname: new URL(dashUrl).hostname, path: '/.netlify/functions/event-dispatch', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Internal-Key': serviceKey, 'Content-Length': Buffer.byteLength(payload) } };
        const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
        req.on('error', () => resolve()); req.write(payload); req.end();
      });
      return { dispatched: input.event };
    }
    case 'send_telegram': {
      const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
      const USERS = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
      for (const uid of USERS) {
        const payload = JSON.stringify({ chat_id: uid, text: input.text, parse_mode: 'HTML' });
        await new Promise(resolve => {
          const opts = { hostname: 'api.telegram.org', path: `/bot${BOT_TOKEN}/sendMessage`, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
          const req = https.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve()); });
          req.on('error', () => resolve()); req.write(payload); req.end();
        });
      }
      // Update EXEO last-active timestamp so scheduled fallback functions know we're live
      _storagePut('telegram-state', 'exeo-last-active', { timestamp: Date.now(), source: 'mcp-send_telegram' }).catch(() => {});
      return { sent: true, users: USERS.length };
    }
    case 'queue_obsidian_write': {
      queueObsidianWrite(input.type, input.data);
      return { queued: input.type };
    }
    case 'create_client': {
      // Full client onboarding: Plane.so customer + ticket + Obsidian note
      const clientName = input.name;
      const kuerzel = (input.kuerzel || '').toUpperCase();
      if (!clientName || !kuerzel) return { error: 'Both name and kuerzel are required' };

      const contactName = input.contact_name || '';
      const contactEmail = input.contact_email || '';
      const domain = input.domain || '';
      const source = input.source || 'referral';
      const stage = input.stage || 'pre_sales';
      const notes = input.notes || '';
      const projId = PROJ_IDS['C2M'];
      const ctiId = '2d7e4403-be9f-455b-811d-f09a91fee061';
      const planningStateId = '31443696-674d-41f9-a73e-01471e943bef';

      // 1. Create Plane.so customer
      const customer = await planePOST(`/workspaces/${WORKSPACE}/customers/`, { name: clientName });
      const customerId = customer.id;

      // 2. Create onboarding ticket
      const now = new Date();
      const quarter = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
      const year = now.getFullYear();
      const ticketName = `${kuerzel} — Client Onboarding (${quarter}-${year})`;
      const dueDate = new Date(now);
      dueDate.setDate(dueDate.getDate() + 14);

      const ticket = await planePOST(`/workspaces/${WORKSPACE}/projects/${projId}/issues/`, {
        name: ticketName,
        priority: 'high',
        state: planningStateId,
        assignees: [ctiId],
        start_date: now.toISOString().slice(0, 10),
        target_date: dueDate.toISOString().slice(0, 10),
        description_html: `<p>Client onboarding for ${clientName} (${kuerzel}).</p>${notes ? `<p>Context: ${notes}</p>` : ''}`,
      });
      const ticketRef = `C2M-${ticket.sequence_id}`;

      // 3. Link ticket to customer
      try {
        await planePOST(`/workspaces/${WORKSPACE}/customers/${customerId}/issues/`, { issue: ticket.id });
      } catch (linkErr) {
        // Non-fatal — log but continue
        console.warn(`[create_client] Customer-issue link failed: ${linkErr.message}`);
      }

      // 4. Queue Obsidian client note
      const today = now.toISOString().slice(0, 10);
      const filePath = `02 - Clients/${kuerzel}/${kuerzel} - ${clientName}.md`;
      const frontmatter = [
        '---',
        `client: "${clientName}"`,
        `kuerzel: "${kuerzel}"`,
        'type: "Client Acquisition"',
        'priority: 15',
        'status: active',
        `contact_name: "${contactName}"`,
        `contact_email: "${contactEmail}"`,
        'contact_phone: ""',
        `source: ${source}`,
        'website: ""',
        `domain: "${domain}"`,
        'employees: 0',
        `stage: "${stage}"`,
        'contract_status: "pre_contract"',
        'budget_tier: "tier-3"',
        'open_tickets: 1',
        'overdue_tickets: 0',
        'billing_type: per-project',
        'revenue_status: pre-sales',
        'monthly_revenue: 0',
        'total_value: 0',
        'pipeline_value: 0',
        'payment_terms: ""',
        'contract_start:',
        'contract_end:',
        'last_invoiced:',
        'next_invoice:',
        'invoice_cadence:',
        'project_type: ""',
        `next_deadline: "${dueDate.toISOString().slice(0, 10)}"`,
        'tags:',
        '  - client',
        '---',
      ].join('\n');

      const body = [
        '',
        `# ${clientName}`,
        '',
        '## Contact',
        `- **Contact:** ${contactName || '(to be researched)'}`,
        `- **Email:** ${contactEmail || '(to be researched)'}`,
        '- **Website:** (to be researched)',
        `- **Domain:** ${domain || '(to be researched)'}`,
        `- **Stage:** ${stage}`,
        '',
        '## Engagement',
        `- **Type:** Client Acquisition (${quarter}-${year})`,
        `- **Source:** ${source}`,
        '- **Priority:** 15',
        '',
        '## Team',
        '- **Sales:** [[04 - Team/CTI - Claudio Tinner|CTI]]',
        '',
        '## Open Work Items',
        `- [[05 - Work Items/${ticketRef}|${ticketRef}]] — ${ticketName}`,
        `  - Planning · high · CTI · Due: ${dueDate.toISOString().slice(0, 10)}`,
        '',
        '## Notes',
        notes ? `**First Contact (${today}):** ${notes}` : '*(No notes yet)*',
        '',
        '## Links',
        '- [[07 - Resources/Service Modules|Service Modules]]',
        '- [[07 - Resources/Revenue Tracker|Revenue Tracker]]',
        '',
      ].join('\n');

      const noteContent = frontmatter + body;
      queueObsidianWrite('client-note', { path: filePath, content: noteContent });

      // Also queue the work-item note for the onboarding ticket
      queueObsidianWrite('work-item', {
        ticket: ticketRef, name: ticketName, client: 'C2M',
        priority: 'high', state: 'Planning', assignee: 'CTI',
        due: dueDate.toISOString().slice(0, 10),
        start: today, project: 'C2M',
      });

      // ── Phase G additions: cluster note, intro HTML, commitment, audit_log ──
      // All additive; failures are non-fatal so the original 4 artifacts still ship.
      const phaseG_artifacts = {};

      // 5. Brain cluster note — queues for the obsidian-queue-consumer to write.
      try {
        const verticalSlug = input.vertical_pack || 'services';
        const verticalLabel = ({
          construction: 'Construction', medical: 'Medical', real_estate: 'Real Estate',
          manufacturing: 'Manufacturing', retail: 'Retail', automotive: 'Automotive',
          services: 'Services', legal: 'Legal', iso_9001: 'ISO 9001'
        })[verticalSlug] || 'Services';
        const verifyDue = new Date(now); verifyDue.setDate(verifyDue.getDate() + 30);
        const clusterPath = `11 - NEX Brain/${kuerzel} Cluster.md`;
        const clusterContent = [
          '---',
          'type: exeo-brain',
          `node: ${kuerzel.toLowerCase()}-cluster`,
          `client_code: ${kuerzel}`,
          `last_updated: ${today}`,
          '---',
          '',
          `# ${kuerzel} Cluster — ${clientName}`,
          '',
          `→ [[NEX Brain]] | Client → [[${kuerzel} - ${clientName}]] | Vertical → [[Industry — ${verticalLabel}]] | Hub → [[Zone — Clients]]`,
          '',
          `${clientName} ist ab ${today} bei c2moviez an Bord.`,
          '',
          `## What We Do for ${kuerzel}`,
          '',
          '> Filled in as work happens. Agents append when tickets land or content ships.',
          '',
          '### Active Workstreams',
          `- *(first onboarding ticket: [[05 - Work Items/${ticketRef}|${ticketRef}]])*`,
          '',
          '### Recent Decisions',
          '- *(none yet — `intel-analyst` populates this)*',
          '',
          `## Open Questions for ${kuerzel}`,
          '',
          `- [ ] Verify contract terms (${verifyDue.toISOString().slice(0,10)})`,
          '',
          '## Pack Hooks',
          '',
          `- **Industry:** \`${verticalSlug === 'iso_9001' ? 'services' : verticalSlug}\``,
          `- **Vertical pack:** \`${verticalSlug}\``,
          '- **Status:** `active`',
          `- **Stage:** \`${stage}\``,
          '',
          '## Notes',
          '',
          notes ? `**First Contact (${today}):** ${notes}` : '*(notes added during onboarding kickoff)*',
          '',
        ].join('\n');
        queueObsidianWrite('cluster-note', { path: clusterPath, content: clusterContent });
        phaseG_artifacts.cluster_path = clusterPath;
      } catch (e) {
        console.warn(`[create_client phase-G] cluster note queue failed: ${e.message}`);
      }

      // 6. Brand-rendered intro HTML (queue for obsidian consumer).
      try {
        const introPath = `02 - Clients/${kuerzel}/${kuerzel}-intro.html`;
        const introHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><title>${clientName} — ${kuerzel}</title></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#0a0a14;color:#f5f5fa;padding:3rem;">
<h1 style="background:linear-gradient(135deg,#00d4ff,#7b00ff);-webkit-background-clip:text;color:transparent;">Willkommen, ${clientName}</h1>
<p style="color:#9b9bb0;">${kuerzel} · ${stage} · ${today}</p>
<p>${notes || `${clientName} ist neu an Bord.`}</p>
<p style="margin-top:2rem;color:#9b9bb0;">Onboarding-Ticket: <strong>${ticketRef}</strong></p>
<p style="color:#9b9bb0;">Kontakt: ${contactName || '(zu erfassen)'} · ${contactEmail || ''}</p>
</body></html>`;
        queueObsidianWrite('client-intro', { path: introPath, content: introHtml });
        phaseG_artifacts.intro_path = introPath;
      } catch (e) {
        console.warn(`[create_client phase-G] intro html queue failed: ${e.message}`);
      }

      // 7. commitments row.
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (SUPABASE_URL && SUPABASE_KEY) {
          const verifyDue = new Date(now); verifyDue.setDate(verifyDue.getDate() + 30);
          const cBody = JSON.stringify({
            actor: 'CTI',
            promise: `Verify ${kuerzel} contract terms`,
            entity_type: 'client',
            entity_id: kuerzel,
            source: 'create_client',
            source_ref: ticketRef,
            due_at: verifyDue.toISOString(),
            status: 'open',
          });
          await new Promise((resolve) => {
            const u = new URL(`${SUPABASE_URL}/rest/v1/commitments`);
            const req = https.request({
              hostname: u.hostname, path: u.pathname, method: 'POST',
              headers: {
                apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', Prefer: 'return=representation',
                'Content-Length': Buffer.byteLength(cBody),
              },
            }, (res) => {
              let raw = ''; res.on('data', c => raw += c);
              res.on('end', () => {
                try {
                  const parsed = JSON.parse(raw);
                  phaseG_artifacts.commitment_id = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;
                } catch {}
                resolve();
              });
            });
            req.on('error', () => resolve());
            req.write(cBody); req.end();
          });
        }
      } catch (e) {
        console.warn(`[create_client phase-G] commitment insert failed: ${e.message}`);
      }

      // 8. audit_log entry — single canonical "client.onboarded" event.
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
        if (SUPABASE_URL && SUPABASE_KEY) {
          const aBody = JSON.stringify({
            action: 'client.onboarded',
            entity_type: 'client',
            entity_id: kuerzel,
            entity_name: clientName,
            actor: 'mcp-server',
            details: {
              tenant_id: 'c2moviez',
              kuerzel,
              customer_id: customerId,
              ticket_ref: ticketRef,
              vault_note: filePath,
              cluster_note: phaseG_artifacts.cluster_path,
              intro_html: phaseG_artifacts.intro_path,
              commitment_id: phaseG_artifacts.commitment_id || null,
              vertical_pack: input.vertical_pack || 'services',
              source: 'create_client.phase_g',
            },
          });
          await new Promise((resolve) => {
            const u = new URL(`${SUPABASE_URL}/rest/v1/audit_log`);
            const req = https.request({
              hostname: u.hostname, path: u.pathname, method: 'POST',
              headers: {
                apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json', Prefer: 'return=minimal',
                'Content-Length': Buffer.byteLength(aBody),
              },
            }, () => resolve());
            req.on('error', () => resolve());
            req.write(aBody); req.end();
          });
        }
      } catch (e) {
        console.warn(`[create_client phase-G] audit_log insert failed: ${e.message}`);
      }

      return {
        customer_id: customerId,
        customer_name: clientName,
        ticket_ref: ticketRef,
        ticket_id: ticket.id,
        ticket_url: `https://app.plane.so/${WORKSPACE}/projects/${projId}/issues/${ticket.id}/`,
        obsidian_path: filePath,
        cluster_path: phaseG_artifacts.cluster_path || null,
        intro_path: phaseG_artifacts.intro_path || null,
        commitment_id: phaseG_artifacts.commitment_id || null,
        summary: `Onboarded ${clientName} (${kuerzel}): customer + ticket ${ticketRef} + 5-artifact chain (note, cluster, intro-html, commitment, audit-log).`,
      };
    }
    case 'get_known_facts': {
      // Returns the AI's authoritative truth about an entity. Query this
      // BEFORE stating any claim about a client/ticket/team member.
      // Phase L (2026-04-27).
      if (!input.subject_type || !input.subject_id) {
        return { error: 'subject_type and subject_id required' };
      }
      const rows = await supabaseSelect(
        `facts_current?subject_type=eq.${encodeURIComponent(input.subject_type)}` +
        `&subject_id=eq.${encodeURIComponent(input.subject_id)}` +
        `&select=predicate,value,confidence,source,observed_at,actor` +
        `&order=predicate.asc`
      );
      return {
        subject: { type: input.subject_type, id: input.subject_id },
        facts: rows,
        count: rows.length,
      };
    }
    case 'assert_fact': {
      // Record a stable claim with provenance. Auto-supersedes the previous
      // fact for the same (subject, predicate) and emits a contradiction
      // marker in audit_log if the value changed. Phase L (2026-04-27).
      if (!input.subject_type || !input.subject_id || !input.predicate || input.value === undefined) {
        return { error: 'subject_type, subject_id, predicate, value required' };
      }
      const result = await supabaseRpc('assert_fact', {
        p_subject_type: input.subject_type,
        p_subject_id: input.subject_id,
        p_predicate: input.predicate,
        p_value: input.value,
        p_source: input.source || 'mcp-call',
        p_actor: input.actor || 'exeo',
        p_confidence: input.confidence ?? 0.5,
        p_source_ref: input.source_ref || null,
        p_rationale: input.rationale || null,
        p_observed_at: input.observed_at || null,
      });
      return {
        asserted: true,
        fact_id: result?.id,
        contradicts: result?.contradicts,
        confidence: result?.confidence,
      };
    }
    default: return { error: `Unknown tool: ${name}` };
  }
}

// ── Handler — simple JSON-RPC style for now ──
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return options();
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405);

  const { checkAuth } = require('./auth-check');
  const authFail = await checkAuth(event);
  if (authFail) return authFail;

  let body;
  try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }

  const { tool, input } = body;
  if (!tool) return err('Missing tool name');

  const start = Date.now();
  try {
    const result = await executeTool(tool, input || {});
    const duration = Date.now() - start;
    // Audit log every tool call
    auditLog(tool, input, JSON.stringify(result).slice(0, 300), duration);
    return ok({ result, duration_ms: duration });
  } catch (e) {
    const duration = Date.now() - start;
    auditLog(tool, input, `ERROR: ${e.message}`, duration);
    return err(`Tool execution failed: ${e.message}`, 500);
  }
};
