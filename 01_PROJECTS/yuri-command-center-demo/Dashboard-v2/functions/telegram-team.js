const https = require('https');

// ═══ TEAM SPOKE BOT — Webhook handler for Fanny/Silas/Marcel bots ═══
// Each team member has their own Telegram bot. This single function handles
// all three webhooks. The bot is identified by matching the webhook's token
// against the MEMBERS config.

const { MEMBERS } = require('./shared-team-config');
const { WORKSPACE, PROJECTS } = require('./shared-config');

const PLANE_KEY = process.env.PLANE_API_KEY;
const PROJECTS_LIST = Object.entries(PROJECTS).map(([code, id]) => ({ code, id }));

// ── Telegram API helpers ──

function tgSend(token, method, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.telegram.org', path: `/bot${token}/${method}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function send(token, chatId, text) {
  return tgSend(token, 'sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

// ── Plane.so API helpers ──

function planeGet(path, retries = 2) {
  return new Promise((resolve) => {
    if (!PLANE_KEY) { resolve({ error: 'PLANE_API_KEY not set' }); return; }
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'GET',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
    };
    let data = '';
    const req = https.request(opts, res => {
      data = '';
      res.on('data', d => data += d);
      res.on('end', async () => {
        if (res.statusCode >= 500 && retries > 0) {
          await new Promise(r => setTimeout(r, 800));
          resolve(planeGet(path, retries - 1));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve({ error: `HTTP ${res.statusCode}`, raw: data.slice(0, 200) }); }
      });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.end();
  });
}

function planePatch(path, body) {
  return new Promise((resolve) => {
    if (!PLANE_KEY) { resolve({ error: 'PLANE_API_KEY not set' }); return; }
    const payload = JSON.stringify(body);
    const opts = {
      hostname: 'api.plane.so', path: `/api/v1${path}`, method: 'PATCH',
      headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    let data = '';
    const req = https.request(opts, res => {
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ error: 'parse failed' }); } });
    });
    req.on('error', e => resolve({ error: e.message }));
    req.write(payload); req.end();
  });
}

// Paginated GET — fetches all pages for a given path
async function planeGetAll(path) {
  const all = [];
  let page = 1;
  while (true) {
    const sep = path.includes('?') ? '&' : '?';
    const data = await planeGet(`/workspaces/${WORKSPACE}${path}${sep}per_page=100&page=${page}`);
    const items = data.results || data.data || (Array.isArray(data) ? data : []);
    all.push(...items);
    if (data.next_page_results) page++;
    else break;
    if (page > 20) break;
  }
  return all;
}

// ── State cache (per invocation) ──
const _stateCache = {};

async function loadStates(projectCode, projectId) {
  if (_stateCache[projectId]) return _stateCache[projectId];
  const states = await planeGetAll(`/projects/${projectId}/states/`);
  const map = {};
  states.forEach(s => { if (s?.id) map[s.id] = { name: s.name, group: s.group }; });
  _stateCache[projectId] = map;
  return map;
}

// ── Fetch all assigned issues for a member ──

async function fetchAssignedIssues(member) {
  const allIssues = [];
  for (const proj of PROJECTS_LIST) {
    // Only fetch from projects this member is assigned to (or all if not scoped)
    const issues = await planeGetAll(`/projects/${proj.id}/issues/?assignees=${member.planeUserId}`);
    const states = await loadStates(proj.code, proj.id);
    issues.forEach(i => {
      const st = states[i.state] || {};
      const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };
      allIssues.push({
        id: i.id,
        ticket: `${proj.code}-${i.sequence_id}`,
        proj: proj.code,
        pid: proj.id,
        name: i.name || 'Untitled',
        state: st.name || '?',
        group: st.group || 'backlog',
        priority: typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none'),
        target_date: i.target_date || null,
        description: (i.description_stripped || '').slice(0, 150),
        updated_at: i.updated_at || null,
      });
    });
  }
  return allIssues;
}

// ── Helpers ──

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Zurich' });
}

function isOverdue(issue) {
  return issue.target_date && issue.target_date < todayStr();
}

function isDueToday(issue) {
  return issue.target_date && issue.target_date === todayStr();
}

const PRIORITY_EMOJI = { urgent: '\u{1F534}', high: '\u{1F7E0}', medium: '\u{1F7E1}', low: '\u{1F7E2}', none: '\u{26AA}' };

function formatIssue(issue) {
  const prio = PRIORITY_EMOJI[issue.priority] || '\u{26AA}';
  const due = issue.target_date ? ` | Due: ${issue.target_date}` : '';
  const overdue = isOverdue(issue) ? ' \u{26A0}\u{FE0F} OVERDUE' : '';
  return `${prio} <b>${issue.ticket}</b> ${escapeHtml(issue.name)}\n   <i>${issue.state}</i>${due}${overdue}`;
}

// Sort: urgent/high first, then by due date
function sortIssues(issues) {
  const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  return issues.sort((a, b) => {
    const pa = prioOrder[a.priority] ?? 4;
    const pb = prioOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    if (a.target_date && b.target_date) return a.target_date.localeCompare(b.target_date);
    if (a.target_date) return -1;
    if (b.target_date) return 1;
    return 0;
  });
}

// Filter to only active (not completed/cancelled) issues
function activeOnly(issues) {
  return issues.filter(i => i.group !== 'completed' && i.group !== 'cancelled');
}

// ── Identify which member this webhook belongs to ──
// The webhook URL contains the bot token: /bot<TOKEN>/...
// We extract the token from the event path and match it against MEMBERS config.

function identifyMember(event) {
  // Netlify webhook path: /.netlify/functions/telegram-team?token=<key>
  // We use a query param to identify which bot, matched against env var names
  const params = event.queryStringParameters || {};
  const tokenParam = params.token || params.bot || '';

  for (const [key, member] of Object.entries(MEMBERS)) {
    const botToken = process.env[member.botTokenEnv];
    if (!botToken) continue;

    // Match by query param (member key or token value)
    if (tokenParam === key || tokenParam === botToken) {
      return { key, member, botToken };
    }
  }

  // Fallback: try to identify from the request body's bot info
  // Some webhook setups include bot username in the update
  return null;
}

// ── Parse ticket reference (e.g. "C2M-123") ──
function parseTicketRef(ref) {
  const match = ref.toUpperCase().match(/^([A-Z]{2,4})-(\d+)$/);
  if (!match) return null;
  const code = match[1];
  const seq = parseInt(match[2]);
  const proj = PROJECTS_LIST.find(p => p.code === code);
  if (!proj) return null;
  return { code, seq, projectId: proj.id };
}

// Find a ticket by reference across all projects for this member
async function findTicket(member, ticketRef) {
  const parsed = parseTicketRef(ticketRef);
  if (!parsed) return null;

  // Fetch issues for this specific project and find by sequence_id
  const issues = await planeGetAll(`/projects/${parsed.projectId}/issues/?assignees=${member.planeUserId}`);
  const match = issues.find(i => i.sequence_id === parsed.seq);
  if (!match) {
    // Also check without assignee filter — they might need to mark a ticket done
    // that isn't assigned to them (e.g., shared task)
    const allIssues = await planeGetAll(`/projects/${parsed.projectId}/issues/`);
    const anyMatch = allIssues.find(i => i.sequence_id === parsed.seq);
    if (anyMatch) return { ...anyMatch, _projectId: parsed.projectId, _projectCode: parsed.code };
    return null;
  }
  return { ...match, _projectId: parsed.projectId, _projectCode: parsed.code };
}

// ── Command Handlers ──

async function handleStart(token, chatId, member) {
  const firstName = member.name.split(' ')[0];
  const msg = [
    `<b>Hey ${firstName}!</b> \u{1F44B}`,
    '',
    `I'm your c2moviez task bot. I'll help you stay on top of your work.`,
    '',
    `<b>Your role:</b> ${member.role}`,
    `<b>Modules:</b> ${member.modules.join(', ')}`,
    '',
    `<b>Commands:</b>`,
    `/tasks \u{2014} All your assigned tickets`,
    `/today \u{2014} Due today + overdue + in progress`,
    `/done C2M-123 \u{2014} Mark a ticket as done`,
    `/note C2M-123 text \u{2014} Add a comment to a ticket`,
    `/status \u{2014} Quick overview (open/overdue counts)`,
    `/help \u{2014} Show this list again`,
  ].join('\n');
  return send(token, chatId, msg);
}

async function handleTasks(token, chatId, member) {
  if (!PLANE_KEY) return send(token, chatId, '\u{26A0}\u{FE0F} Plane.so API key not configured. Contact Claudio.');

  await send(token, chatId, '\u{1F50D} Fetching your tickets...');
  const issues = activeOnly(await fetchAssignedIssues(member));

  if (issues.length === 0) {
    return send(token, chatId, '\u{2705} No open tickets assigned to you. Enjoy the calm!');
  }

  sortIssues(issues);

  // Group by project
  const byProject = {};
  issues.forEach(i => {
    if (!byProject[i.proj]) byProject[i.proj] = [];
    byProject[i.proj].push(i);
  });

  const lines = [`<b>\u{1F4CB} Your Tickets (${issues.length})</b>`, ''];
  for (const [code, list] of Object.entries(byProject)) {
    lines.push(`<b>\u{1F4C1} ${code}</b>`);
    list.forEach(i => lines.push(formatIssue(i)));
    lines.push('');
  }

  // Telegram 4096 char limit — split if needed
  const fullMsg = lines.join('\n');
  if (fullMsg.length > 4000) {
    for (const [code, list] of Object.entries(byProject)) {
      const chunk = [`<b>\u{1F4C1} ${code}</b> (${list.length} tickets)`, ''];
      list.forEach(i => chunk.push(formatIssue(i)));
      await send(token, chatId, chunk.join('\n'));
    }
    return;
  }
  return send(token, chatId, fullMsg);
}

async function handleToday(token, chatId, member) {
  if (!PLANE_KEY) return send(token, chatId, '\u{26A0}\u{FE0F} Plane.so API key not configured. Contact Claudio.');

  await send(token, chatId, '\u{1F305} Checking your day...');
  const allIssues = activeOnly(await fetchAssignedIssues(member));

  const todayItems = allIssues.filter(i =>
    isDueToday(i) || isOverdue(i) || i.group === 'started'
  );

  if (todayItems.length === 0) {
    return send(token, chatId, `\u{2600}\u{FE0F} Nothing urgent for today. Check /tasks for the full list.`);
  }

  const overdue = todayItems.filter(i => isOverdue(i));
  const dueToday = todayItems.filter(i => isDueToday(i) && !isOverdue(i));
  const inProgress = todayItems.filter(i => i.group === 'started' && !isDueToday(i) && !isOverdue(i));

  const today = todayStr();
  const lines = [`<b>\u{1F305} Today's Focus</b> (${today})`, ''];

  if (overdue.length > 0) {
    lines.push(`<b>\u{26A0}\u{FE0F} Overdue (${overdue.length})</b>`);
    overdue.forEach(i => lines.push(formatIssue(i)));
    lines.push('');
  }

  if (dueToday.length > 0) {
    lines.push(`<b>\u{1F4C5} Due Today (${dueToday.length})</b>`);
    dueToday.forEach(i => lines.push(formatIssue(i)));
    lines.push('');
  }

  if (inProgress.length > 0) {
    lines.push(`<b>\u{1F3C3} In Progress (${inProgress.length})</b>`);
    inProgress.forEach(i => lines.push(formatIssue(i)));
    lines.push('');
  }

  return send(token, chatId, lines.join('\n'));
}

async function handleDone(token, chatId, member, args) {
  if (!PLANE_KEY) return send(token, chatId, '\u{26A0}\u{FE0F} Plane.so API key not configured. Contact Claudio.');

  const ticketRef = (args || '').trim().toUpperCase();
  if (!ticketRef) return send(token, chatId, '\u{26A0}\u{FE0F} Usage: <code>/done C2M-123</code>');

  const issue = await findTicket(member, ticketRef);
  if (!issue) return send(token, chatId, `\u{26A0}\u{FE0F} Ticket <code>${escapeHtml(ticketRef)}</code> not found.`);

  // Find the "completed" state for this project
  const states = await loadStates(issue._projectCode, issue._projectId);
  const doneState = Object.entries(states).find(([, s]) => s.group === 'completed');
  if (!doneState) return send(token, chatId, `\u{26A0}\u{FE0F} No "completed" state found for ${issue._projectCode}`);

  const r = await planePatch(
    `/workspaces/${WORKSPACE}/projects/${issue._projectId}/issues/${issue.id}/`,
    { state: doneState[0] }
  );

  if (r.id) {
    return send(token, chatId, `\u{2705} <code>${escapeHtml(ticketRef)}</code> marked as <b>completed</b>!`);
  }
  return send(token, chatId, `\u{26A0}\u{FE0F} Failed to update: ${JSON.stringify(r).slice(0, 80)}`);
}

async function handleNote(token, chatId, member, args) {
  if (!PLANE_KEY) return send(token, chatId, '\u{26A0}\u{FE0F} Plane.so API key not configured. Contact Claudio.');

  const parts = (args || '').trim().split(/\s+/);
  const ticketRef = (parts[0] || '').toUpperCase();
  const noteText = parts.slice(1).join(' ').trim();

  if (!ticketRef || !noteText) {
    return send(token, chatId, '\u{26A0}\u{FE0F} Usage: <code>/note C2M-123 Client feedback pending</code>');
  }

  const issue = await findTicket(member, ticketRef);
  if (!issue) return send(token, chatId, `\u{26A0}\u{FE0F} Ticket <code>${escapeHtml(ticketRef)}</code> not found.`);

  // Append note to description (same pattern as telegram.js /note)
  const existing = issue.description_stripped || issue.description || '';
  const timestamp = new Date().toLocaleString('de-CH', {
    timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const memberFirst = member.name.split(' ')[0];
  const updated = existing + `\n\n---\n\u{1F4DD} [${timestamp} \u{2014} ${memberFirst}] ${noteText}`;

  const r = await planePatch(
    `/workspaces/${WORKSPACE}/projects/${issue._projectId}/issues/${issue.id}/`,
    { description_html: `<p>${updated.replace(/\n/g, '<br>')}</p>` }
  );

  if (r.id) {
    return send(token, chatId, `\u{1F4DD} Note added to <code>${escapeHtml(ticketRef)}</code>:\n<i>"${escapeHtml(noteText.slice(0, 100))}"</i>`);
  }
  return send(token, chatId, `\u{26A0}\u{FE0F} Failed: ${JSON.stringify(r).slice(0, 80)}`);
}

async function handleStatus(token, chatId, member) {
  if (!PLANE_KEY) return send(token, chatId, '\u{26A0}\u{FE0F} Plane.so API key not configured. Contact Claudio.');

  const issues = await fetchAssignedIssues(member);
  const firstName = member.name.split(' ')[0];

  // Zero-assignment guard: if no tickets at all, show clear message
  if (!issues || issues.length === 0) {
    return send(token, chatId, [
      `<b>\u{1F4CA} Status for ${firstName}</b>`,
      '',
      'No tickets assigned to you yet.',
      'Ask Claudio to assign tickets in Plane.so.',
    ].join('\n'));
  }

  let total = 0, inProgress = 0, backlogTodo = 0, overdueCnt = 0;
  issues.forEach(i => {
    if (i.group === 'completed' || i.group === 'cancelled') return;
    total++;
    if (i.group === 'started') inProgress++;
    else backlogTodo++;
    if (isOverdue(i)) overdueCnt++;
  });

  const lines = [
    `<b>\u{1F4CA} Status for ${firstName}</b>`,
    '',
    `\u{1F4CB} Open tickets: <b>${total}</b>`,
    `\u{1F3C3} In progress: <b>${inProgress}</b>`,
    `\u{1F4E5} Backlog/Todo: <b>${backlogTodo}</b>`,
    overdueCnt > 0 ? `\u{26A0}\u{FE0F} Overdue: <b>${overdueCnt}</b>` : '\u{2705} Nothing overdue',
  ];
  return send(token, chatId, lines.join('\n'));
}

async function handleHelp(token, chatId, member) {
  const msg = [
    `<b>c2moviez Task Bot</b> \u{2014} ${member.role}`,
    '',
    '/tasks \u{2014} All your assigned tickets',
    '/today \u{2014} Due today + overdue + in progress',
    '/done C2M-123 \u{2014} Mark a ticket as done',
    '/note C2M-123 text \u{2014} Add a comment to a ticket',
    '/status \u{2014} Quick ticket counts',
    '/help \u{2014} This message',
    '',
    `<i>Tickets are pulled live from Plane.so</i>`,
  ].join('\n');
  return send(token, chatId, msg);
}

// ── Command Router ──

const COMMANDS = {
  '/start': { handler: handleStart, needsArgs: false },
  '/tasks': { handler: handleTasks, needsArgs: false },
  '/today': { handler: handleToday, needsArgs: false },
  '/done': { handler: handleDone, needsArgs: true },
  '/note': { handler: handleNote, needsArgs: true },
  '/status': { handler: handleStatus, needsArgs: false },
  '/help': { handler: handleHelp, needsArgs: false },
};

// ── Netlify Function Handler ──

exports.handler = async (event) => {
  // Only accept POST (webhook from Telegram)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Identify which team member's bot this is
  const identified = identifyMember(event);
  if (!identified) {
    console.warn('[telegram-team] Could not identify member from webhook');
    return { statusCode: 200, body: 'Unknown bot' };
  }

  const { key, member, botToken } = identified;

  // Parse the Telegram update
  let update;
  try {
    update = JSON.parse(event.body);
  } catch {
    return { statusCode: 200, body: 'Invalid JSON' };
  }

  const message = update.message;
  if (!message || !message.text) {
    return { statusCode: 200, body: 'No text message' };
  }

  const chatId = message.chat?.id;
  const text = (message.text || '').trim();
  const from = message.from?.first_name || message.from?.username || 'unknown';

  if (!chatId) return { statusCode: 200, body: 'No chat ID' };

  console.log(`[telegram-team] [${key}] ${from}: ${text}`);

  // Extract command (handle /command@botname format)
  const cmdMatch = text.match(/^(\/\w+)(@\S+)?(\s+(.*))?$/);
  const cmd = cmdMatch ? cmdMatch[1].toLowerCase() : null;
  const args = cmdMatch ? (cmdMatch[4] || '').trim() : '';

  if (cmd && COMMANDS[cmd]) {
    try {
      const { handler, needsArgs } = COMMANDS[cmd];
      if (needsArgs) {
        await handler(botToken, chatId, member, args);
      } else {
        await handler(botToken, chatId, member);
      }
    } catch (err) {
      console.error(`[telegram-team] [${key}] Error handling ${cmd}:`, err.message);
      await send(botToken, chatId,
        `\u{274C} Something went wrong. Try again or contact Claudio.\n<i>${escapeHtml(err.message.slice(0, 100))}</i>`
      );
    }
  } else if (text.startsWith('/')) {
    await send(botToken, chatId, 'Unknown command. Try /help for available commands.');
  }
  // Non-command messages are silently ignored

  return { statusCode: 200, body: 'OK' };
};
