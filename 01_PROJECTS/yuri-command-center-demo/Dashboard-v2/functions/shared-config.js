// ═══ SHARED CONFIGURATION FOR NETLIFY FUNCTIONS ═══
// Single source of truth — all functions import from here.
// If a project or team member changes in Plane.so, update ONLY this file.

const WORKSPACE = process.env.WORKSPACE_SLUG || 'c2moviez';

// ── Netlify Site ID (required for Blobs) — fail fast if missing in production ──
const SITE_ID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
if (!SITE_ID && process.env.NODE_ENV !== 'development') {
  console.error('[shared-config] CRITICAL: SITE_ID / NETLIFY_SITE_ID not set');
}

// ── Phase C tenant-aware overrides (additive: literals stay as the c2moviez fallback) ──
// At Netlify build time the NEXBOX bootstrap injects these env vars from tenant.json.
// Production c2moviez has none of them set today, so behaviour is unchanged.
function parseEnvJson(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[shared-config] Failed to parse env ${name} as JSON; using fallback. Error: ${e.message}`);
    return fallback;
  }
}

const PROJECTS = parseEnvJson('PLANE_PROJECT_IDS_JSON', {
  C2M:  '807ce45f-495b-452e-9e6f-6b236c66a055',
  MFB:  '8ca26c5e-6e93-42ce-92ec-10ff354d2dd3',
  C2I:  '23e95ec1-0acc-47f3-a124-ddb4734bcef9',
  MACL: '5b7e31bc-5966-4c9b-b17f-39888db77605'
});

// Array form for iteration (code, id)
const PROJECTS_LIST = Object.entries(PROJECTS).map(([code, id]) => ({ code, id }));

// Fallback team mapping — overwritten at runtime by syncTeamIds()
const TEAM_FALLBACK = parseEnvJson('TEAM_FALLBACK_JSON', {
  '2d7e4403-be9f-455b-811d-f09a91fee061': 'CTI',
  'bff07aa8-a285-460b-bd38-760cd24b8513': 'FK'
});

// Client label codes
const CLIENT_LABELS = parseEnvJson('CLIENT_LABELS_JSON', [
  'SHI','MFB','GANZ','GRYD','RIBO','UPG','KAP','CHI','BOV','BAL',
  'GLG','SLT','ISO','OREA','BBA','PDRT','NOBA','ALP','BABA','MACL',
  'CASA','ALPEA'
]);

// Client match rules — single source of truth: client-match-rules.json
// To add a new client, edit client-match-rules.json (used by both Dashboard and Scripts/)
const CLIENT_MATCH_RULES = require('./client-match-rules.json');

// ── Unified Team Member Sync (shared across all backend functions) ──
const https = require('https');
let _teamIds = null;
let _teamSyncedAt = 0;
const TEAM_CACHE_TTL = 3600000; // 1 hour

async function syncTeamIds() {
  // Return cached if still fresh
  if (_teamIds && (Date.now() - _teamSyncedAt) < TEAM_CACHE_TTL) return _teamIds;

  const PLANE_KEY = process.env.PLANE_API_KEY;
  if (!PLANE_KEY) {
    _teamIds = { ...TEAM_FALLBACK };
    return _teamIds;
  }

  try {
    const data = await new Promise((resolve) => {
      const opts = {
        hostname: 'api.plane.so',
        path: `/api/v1/workspaces/${WORKSPACE}/members/?per_page=100`,
        method: 'GET',
        headers: { 'X-API-Key': PLANE_KEY, 'Content-Type': 'application/json' }
      };
      let d = '';
      const req = https.request(opts, res => {
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
      });
      req.on('error', () => resolve({}));
      req.end();
    });

    const members = data?.results || (Array.isArray(data) ? data : []);
    if (!members.length) {
      _teamIds = { ...TEAM_FALLBACK };
      return _teamIds;
    }

    // Build UUID→short mapping, respecting canonical fallback
    const canonical = new Map(Object.entries(TEAM_FALLBACK));
    const result = {};

    members.forEach(m => {
      const uid = m.member?.id || m.id;
      const role = m.role ?? 5;
      if (role < 10) return; // skip Guests
      const email = m.member?.email || m.email || '';
      if (email.endsWith('@plane.so')) return; // skip bot accounts

      const fname = m.member?.first_name || m.first_name || '';
      const lname = m.member?.last_name || m.last_name || '';
      const full = `${fname} ${lname}`.trim();
      if (!full) return;

      // Use canonical short if exists, else auto-generate
      let short = canonical.get(uid);
      if (!short) {
        const parts = full.split(/\s+/).filter(Boolean);
        short = parts.length >= 2
          ? (parts[0][0] + parts[parts.length - 1][0] + (parts[parts.length - 1][1] || '')).toUpperCase()
          : full.slice(0, 3).toUpperCase();
        // Avoid collisions
        let attempt = short; let c = 2;
        while (Object.values(result).includes(attempt)) attempt = short + c++;
        short = attempt;
      }

      result[uid] = short;
    });

    _teamIds = Object.keys(result).length ? result : { ...TEAM_FALLBACK };
    _teamSyncedAt = Date.now();
    console.log(`[shared-config] Synced ${Object.keys(result).length} team members`);
    return _teamIds;
  } catch (e) {
    console.warn(`[shared-config] Team sync failed: ${e.message}`);
    _teamIds = { ...TEAM_FALLBACK };
    return _teamIds;
  }
}

module.exports = { WORKSPACE, SITE_ID, PROJECTS, PROJECTS_LIST, TEAM_FALLBACK, CLIENT_LABELS, CLIENT_MATCH_RULES, syncTeamIds };
