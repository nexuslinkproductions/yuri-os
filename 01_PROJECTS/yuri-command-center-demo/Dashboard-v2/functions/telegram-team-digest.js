const https = require('https');

// ═══ TEAM DAILY DIGEST — Scheduled function for team member bots ═══
// Runs Mon-Fri at 06:30 UTC (08:30 CEST). Sends each team member a
// personalized morning digest via their own bot.
// Respects quiet hours — skips members who are in their quiet window.

const { MEMBERS } = require('./shared-team-config');
const { WORKSPACE, PROJECTS } = require('./shared-config');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');

const PLANE_KEY = process.env.PLANE_API_KEY;
const PROJECTS_LIST = Object.entries(PROJECTS).map(([code, id]) => ({ code, id }));

// ── Telegram API ──

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

// ── Plane.so API ──

function planeGetAll(basePath) {
  const all = [];
  let page = 1;
  async function fetchPage() {
    const sep = basePath.includes('?') ? '&' : '?';
    const data = await new Promise((resolve) => {
      if (!PLANE_KEY) { resolve({}); return; }
      const opts = {
        hostname: 'api.plane.so',
        path: `/api/v1/workspaces/${WORKSPACE}${basePath}${sep}per_page=100&page=${page}`,
        method: 'GET',
        headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
      };
      let d = '';
      const req = https.request(opts, res => {
        d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch { resolve({}); }
        });
      });
      req.on('error', () => resolve({}));
      req.end();
    });
    const items = data.results || data.data || (Array.isArray(data) ? data : []);
    all.push(...items);
    if (data.next_page_results && page < 20) {
      page++;
      await fetchPage();
    }
  }
  return fetchPage().then(() => all);
}

// ── State cache ──
const _stateCache = {};

async function loadStates(projectId) {
  if (_stateCache[projectId]) return _stateCache[projectId];
  const states = await planeGetAll(`/projects/${projectId}/states/`);
  const map = {};
  states.forEach(s => { if (s?.id) map[s.id] = { name: s.name, group: s.group }; });
  _stateCache[projectId] = map;
  return map;
}

// ── Fetch assigned issues for a member ──

async function fetchAssignedIssues(member) {
  const allIssues = [];
  for (const proj of PROJECTS_LIST) {
    const issues = await planeGetAll(`/projects/${proj.id}/issues/?assignees=${member.planeUserId}`);
    const states = await loadStates(proj.id);
    issues.forEach(i => {
      const st = states[i.state] || {};
      const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };
      allIssues.push({
        ticket: `${proj.code}-${i.sequence_id}`,
        proj: proj.code,
        name: i.name || 'Untitled',
        state: st.name || '?',
        group: st.group || 'backlog',
        priority: typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none'),
        target_date: i.target_date || null,
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

function isDueThisWeek(issue) {
  if (!issue.target_date) return false;
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (7 - today.getDay() || 7));
  const weekEndStr = weekEnd.toISOString().slice(0, 10);
  return issue.target_date >= todayStr() && issue.target_date <= weekEndStr;
}

const PRIORITY_EMOJI = { urgent: '\u{1F534}', high: '\u{1F7E0}', medium: '\u{1F7E1}', low: '\u{1F7E2}', none: '\u{26AA}' };

function formatIssue(issue) {
  const prio = PRIORITY_EMOJI[issue.priority] || '\u{26AA}';
  const due = issue.target_date ? ` | ${issue.target_date}` : '';
  const overdue = isOverdue(issue) ? ' \u{26A0}\u{FE0F}' : '';
  return `${prio} <code>${issue.ticket}</code> ${escapeHtml(issue.name.slice(0, 40))}${due}${overdue}`;
}

// ── Quiet hours check ──
// Returns true if the member should NOT receive messages right now

function isQuietHour(member) {
  const qh = member.quietHours;
  if (!qh) return false;

  // Current hour in Europe/Zurich (CEST)
  const nowHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'Europe/Zurich', hour: '2-digit', hour12: false })
  );

  // Quiet hours can wrap midnight: e.g. start=22, end=7 means 22:00-07:00
  if (qh.start > qh.end) {
    // Wraps midnight: quiet if hour >= start OR hour < end
    return nowHour >= qh.start || nowHour < qh.end;
  } else {
    // Doesn't wrap: quiet if hour >= start AND hour < end
    return nowHour >= qh.start && nowHour < qh.end;
  }
}

// ── Build digest message for a member ──

async function buildDigest(memberKey, member) {
  const firstName = member.name.split(' ')[0];
  const issues = await fetchAssignedIssues(member);
  const active = issues.filter(i => i.group !== 'completed' && i.group !== 'cancelled');

  // Zero-assignment guard
  if (active.length === 0) {
    return [
      `\u{2600}\u{FE0F} <b>Good Morning ${firstName}!</b>`,
      '',
      'No open tickets assigned to you right now.',
      'Enjoy the calm \u{2014} or check in with Claudio for new tasks.',
    ].join('\n');
  }

  const overdue = active.filter(i => isOverdue(i));
  const dueToday = active.filter(i => isDueToday(i));
  const inProgress = active.filter(i => i.group === 'started');
  const dueWeek = active.filter(i => isDueThisWeek(i) && !isDueToday(i));
  const today = todayStr();
  const dayName = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Zurich', weekday: 'long' });
  const isMonday = new Date().getDay() === 1;

  const lines = [
    `\u{2600}\u{FE0F} <b>Good Morning ${firstName}!</b> \u{2014} ${dayName}, ${today}`,
    '',
    `\u{1F4CA} <b>Quick Stats</b>`,
    `   \u{1F4CB} ${active.length} open | \u{1F3C3} ${inProgress.length} in progress | \u{1F4C5} ${dueToday.length} due today`,
    '',
  ];

  // Overdue alert (always show first)
  if (overdue.length > 0) {
    // Sort: urgent/high first
    const prioOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    overdue.sort((a, b) => (prioOrder[a.priority] ?? 4) - (prioOrder[b.priority] ?? 4));
    lines.push(`\u{1F534} <b>Overdue (${overdue.length})</b>`);
    overdue.slice(0, 5).forEach(i => lines.push(`   ${formatIssue(i)}`));
    if (overdue.length > 5) lines.push(`   <i>+ ${overdue.length - 5} more</i>`);
    lines.push('');
  }

  // Due today
  if (dueToday.length > 0) {
    lines.push(`\u{1F4C5} <b>Due Today (${dueToday.length})</b>`);
    dueToday.slice(0, 5).forEach(i => lines.push(`   ${formatIssue(i)}`));
    lines.push('');
  }

  // In progress (not already shown)
  const ipNotDue = inProgress.filter(i => !isDueToday(i) && !isOverdue(i));
  if (ipNotDue.length > 0) {
    lines.push(`\u{1F3C3} <b>In Progress (${ipNotDue.length})</b>`);
    ipNotDue.slice(0, 5).forEach(i => lines.push(`   ${formatIssue(i)}`));
    if (ipNotDue.length > 5) lines.push(`   <i>+ ${ipNotDue.length - 5} more</i>`);
    lines.push('');
  }

  // Monday: weekly summary
  if (isMonday && dueWeek.length > 0) {
    lines.push(`\u{1F4C6} <b>Due This Week (${dueWeek.length})</b>`);
    dueWeek.slice(0, 5).forEach(i => lines.push(`   ${formatIssue(i)}`));
    if (dueWeek.length > 5) lines.push(`   <i>+ ${dueWeek.length - 5} more</i>`);
    lines.push('');
  }

  // Footer
  if (overdue.length === 0 && dueToday.length === 0) {
    lines.push('\u{2705} Nothing urgent today \u{2014} great day ahead!');
    lines.push('');
  }

  lines.push(`\u{1F4AC} Use /tasks for full list or /done C2M-123 to close a ticket`);

  return lines.join('\n');
}

// ── Netlify Scheduled Function Handler ──

exports.handler = async () => {
  if (!PLANE_KEY) {
    console.warn('[team-digest] PLANE_API_KEY not set — skipping');
    return { statusCode: 200, body: 'No API key' };
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (await alreadySentToday('team-digest', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }
  // Mark FIRST to prevent race condition on simultaneous Netlify invocations
  await markSentToday('team-digest', todayKey);

  const results = [];

  for (const [key, member] of Object.entries(MEMBERS)) {
    const botToken = process.env[member.botTokenEnv];
    const chatId = process.env[member.chatIdEnv];

    if (!botToken || !chatId) {
      console.log(`[team-digest] [${key}] Skipping — missing token or chat ID`);
      results.push({ member: key, status: 'skipped', reason: 'no token/chatId' });
      continue;
    }

    // Respect quiet hours
    if (isQuietHour(member)) {
      console.log(`[team-digest] [${key}] Skipping — quiet hours (${member.quietHours.start}:00-${member.quietHours.end}:00)`);
      results.push({ member: key, status: 'skipped', reason: 'quiet hours' });
      continue;
    }

    try {
      const msg = await buildDigest(key, member);
      const res = await send(botToken, chatId, msg);
      if (res.ok) {
        console.log(`[team-digest] [${key}] Digest sent successfully`);
        results.push({ member: key, status: 'sent' });
      } else {
        console.warn(`[team-digest] [${key}] Send failed:`, JSON.stringify(res));
        results.push({ member: key, status: 'error', detail: res.description || 'unknown' });
      }
    } catch (err) {
      console.error(`[team-digest] [${key}] Error:`, err.message);
      results.push({ member: key, status: 'error', detail: err.message });
    }
  }

  const sent = results.filter(r => r.status === 'sent').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'error').length;

  return {
    statusCode: 200,
    body: `Team digest complete: ${sent} sent, ${skipped} skipped, ${failed} failed`
  };
};
