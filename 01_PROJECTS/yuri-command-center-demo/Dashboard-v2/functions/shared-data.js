/**
 * shared-data.js — Shared operational data assembly
 *
 * Extracts getDashboardData() and common helpers that were duplicated
 * between telegram.js and telegram-digest.js. Both now import from here.
 */

const { WORKSPACE, PROJECTS, PROJECTS_LIST, syncTeamIds } = require('./shared-config');
const { planeGet, planeGetAll } = require('./shared-plane');
const { storageGet } = require('./shared-storage');

// ── Storage helpers (Supabase Storage, replaces Netlify Blobs) ──
function getBlobDirect(key) {
  return storageGet('production-hub', key);
}

async function getBizData(entity) {
  const data = await storageGet('production-hub', `${entity}--_index`);
  return Array.isArray(data) ? data : [];
}

// ── Dashboard Data Assembly (full operational context) ──
async function getDashboardData() {
  const TEAM_IDS = await syncTeamIds();
  const mapAssignee = (arr) => {
    if (!arr || !arr.length) return 'unassigned';
    return arr.map(uid => TEAM_IDS[uid] || uid.slice(0, 6)).join('+');
  };

  const issues = [];
  const stateCache = {};
  const priMap = { 3: 'urgent', 2: 'high', 1: 'medium', 0: 'low' };

  // Load states + issues in parallel
  const projEntries = Object.entries(PROJECTS);
  const [stateResults, issueResults] = await Promise.all([
    Promise.all(projEntries.map(([, id]) => planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/states/`).catch(() => []))),
    Promise.all(projEntries.map(([, id]) => planeGetAll(`/workspaces/${WORKSPACE}/projects/${id}/issues/`).catch(() => []))),
  ]);

  projEntries.forEach(([, ], pi) => {
    const states = Array.isArray(stateResults[pi]) ? stateResults[pi] : [];
    states.forEach(s => { stateCache[s.id] = { name: s.name, group: s.group }; });
  });

  // Dedup safety net — even with cursor pagination fixed in planeGetAll,
  // belt-and-braces against any future regression (the "C2M-80 listed 5x"
  // morning brief came from this layer multiplying upstream duplicates).
  const seenIds = new Set();
  projEntries.forEach(([key, ], pi) => {
    const list = Array.isArray(issueResults[pi]) ? issueResults[pi] : [];
    list.forEach(i => {
      if (i.id && seenIds.has(i.id)) return;
      if (i.id) seenIds.add(i.id);
      const st = stateCache[i.state] || {};
      const pri = typeof i.priority === 'number' ? (priMap[i.priority] || 'none') : (i.priority || 'none');
      issues.push({
        id: i.id, ticket: `${key}-${i.sequence_id}`, proj: key, name: i.name || 'Untitled',
        state: st.name || '?', group: st.group || 'backlog',
        priority: pri, assignee: mapAssignee(i.assignees),
        target_date: i.target_date || null,
        start_date: i.start_date || null,
        completed_at: i.completed_at || null,
        updated_at: i.updated_at || null,
        created_at: i.created_at || null,
        parent: i.parent || null,
        sub_issues_count: i.sub_issues_count || 0,
        description: (i.description_stripped || '').slice(0, 200),
      });
    });
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay() || 7));
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const done = issues.filter(i => ['completed', 'cancelled'].includes(i.group));
  const active = issues.filter(i => !['completed', 'cancelled'].includes(i.group));
  const overdue = active.filter(i => i.target_date && i.target_date < todayStr);
  const urgent = active.filter(i => i.priority === 'urgent' || i.priority === 'high');
  const dueThisWeek = active.filter(i => i.target_date && i.target_date >= todayStr && i.target_date <= weekEndStr);
  const unassigned = active.filter(i => i.assignee === 'unassigned' && (i.priority === 'urgent' || i.priority === 'high'));
  const noPrio = active.filter(i => !i.priority || i.priority === 'none');
  const noDue = active.filter(i => !i.target_date);
  const stale = active.filter(i => {
    if (!i.updated_at) return false;
    return (Date.now() - new Date(i.updated_at).getTime()) > 14 * 86400000;
  });

  // Recently changed (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentlyChanged = issues.filter(i => i.updated_at && i.updated_at > yesterday)
    .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

  // Sprint window: overdue + due within 30 days (avoids counting all-time backlog as "capacity")
  const thirtyDaysOut = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const sprintActive = active.filter(i =>
    (i.target_date && i.target_date <= thirtyDaysOut) ||
    i.priority === 'urgent' || i.priority === 'high'
  );

  // Per-member workload
  const teamLoad = {};
  Object.values(TEAM_IDS).forEach(k => { teamLoad[k] = { active: 0, sprint: 0, overdue: 0, thisWeek: 0, urgent: 0, topFocus: [] }; });
  active.forEach(i => {
    const members = i.assignee.split('+');
    members.forEach(m => {
      if (teamLoad[m]) {
        teamLoad[m].active++;
        if (i.target_date && i.target_date < todayStr) teamLoad[m].overdue++;
        if (i.target_date && i.target_date >= todayStr && i.target_date <= weekEndStr) teamLoad[m].thisWeek++;
        if (i.priority === 'urgent' || i.priority === 'high') teamLoad[m].urgent++;
        if (teamLoad[m].topFocus.length < 3 && (i.priority === 'urgent' || i.priority === 'high' || (i.target_date && i.target_date <= weekEndStr))) {
          teamLoad[m].topFocus.push(i.ticket);
        }
      }
    });
  });
  sprintActive.forEach(i => {
    const members = i.assignee.split('+');
    members.forEach(m => { if (teamLoad[m]) teamLoad[m].sprint++; });
  });

  // Hygiene score
  const clean = active.filter(i => i.priority && i.priority !== 'none' && i.assignee !== 'unassigned' && i.target_date && !(i.target_date < todayStr));
  const hygiene = active.length ? Math.round(clean.length / active.length * 100) : 100;

  // Client summaries from KB
  let clientSummaries = [];
  try {
    const kb = await getBlobDirect('client-kb--data');
    if (kb?.clients) {
      clientSummaries = Object.entries(kb.clients).map(([code, c]) => {
        const clientTickets = active.filter(i => i.name.toLowerCase().includes(code.toLowerCase()));
        const clientOverdue = clientTickets.filter(i => i.target_date && i.target_date < todayStr);
        return {
          name: c.name || code, code, active: clientTickets.length, overdue: clientOverdue.length,
          health: clientTickets.length === 0 ? 80 : (clientOverdue.length > 2 ? 30 : clientOverdue.length > 0 ? 55 : 85),
          status: c.status, revenue: c.monthly_revenue || 0, contract_end: c.contract_end,
        };
      }).sort((a, b) => a.health - b.health);
    }
  } catch {}

  // Velocity — use completed_at when available; updated_at is polluted by bulk sync
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const completedThisWeek = done.filter(i => {
    const d = i.completed_at || (i.updated_at && !i.completed_at ? i.updated_at : null);
    return d && d > weekAgo;
  }).length;
  const completedLastWeek = done.filter(i => {
    const d = i.completed_at || (i.updated_at && !i.completed_at ? i.updated_at : null);
    return d && d > twoWeeksAgo && d <= weekAgo;
  }).length;
  const createdThisWeek = issues.filter(i => i.created_at && i.created_at > weekAgo).length;
  const velocityTrend = completedLastWeek > 0 ? Math.round((completedThisWeek - completedLastWeek) / completedLastWeek * 100) : 0;

  // Risk tickets
  const threeDaysOut = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const riskTickets = active.filter(i =>
    (i.target_date && i.target_date <= threeDaysOut && i.target_date >= todayStr && (i.group === 'backlog' || i.state === 'Backlog' || i.state === 'Todo')) ||
    (stale.includes(i) && (i.priority === 'urgent' || i.priority === 'high')) ||
    (i.assignee === 'unassigned' && (i.priority === 'urgent' || i.priority === 'high'))
  );

  // Recent meetings
  let recentMeetings = [];
  try {
    const mtgIndex = await getBizData('meetings');
    for (const id of (mtgIndex || []).slice(-10)) {
      const mtg = await getBlobDirect(`meetings--${id}`);
      if (mtg) recentMeetings.push({ client: mtg.client_name, date: mtg.date, hasTickets: (mtg.tickets_created || []).length > 0, researched: mtg.research_status === 'complete' });
    }
    recentMeetings = recentMeetings.filter(m => m.date && new Date(m.date) > new Date(Date.now() - 14 * 86400000));
  } catch {}

  return {
    total: issues.length, active: active.length, done: done.length,
    overdue, urgent, dueThisWeek, unassigned, noPrio: noPrio.length, noDue: noDue.length, stale,
    recentlyChanged, teamLoad, hygiene, issues, TEAM_IDS,
    clientSummaries, riskTickets, recentMeetings,
    completedThisWeek, completedLastWeek, createdThisWeek, velocityTrend,
    overdueList: overdue.sort((a, b) => (a.target_date || '').localeCompare(b.target_date || '')),
    sprintActive: sprintActive.length,
  };
}

module.exports = { getDashboardData, planeGet, planeGetAll, getBlobDirect, getBizData };
