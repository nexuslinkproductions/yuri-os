/**
 * Dashboard-v2/netlify/functions/nexbox-fleet.js — Phase H
 *
 * Internal-key-gated JSON endpoint exposing the NEXBOX fleet status from the
 * vendor's `tenant_heartbeat_status` view. Consumed by:
 *   - the SvelteKit page at /nexbox (Phase H.sweep — not deployed tonight)
 *   - the c2moviez ops Telegram bot
 *   - external monitoring (Pingdom etc.) if pointed at this URL
 *
 * Auth:
 *   - Header X-Internal-Key must match process.env.INTERNAL_KEY (Netlify env).
 *   - Without it, returns 401 + a fixed 5s delay to deter scanners.
 *
 * Output shape:
 *   GET /.netlify/functions/nexbox-fleet
 *     {
 *       "generated_at": "2026-05-05T08:00:00Z",
 *       "summary": { total: N, green: G, yellow: Y, red: R, errors_24h_count, degraded_agents_count },
 *       "tenants": [{ tenant_id, display_name, health, minutes_stale, agents_alive, agents_total,
 *                     errors_24h, decisions_24h, commitments_open, brain_nodes, open_tickets,
 *                     pinned_tag, app_version, posted_at }, ...]
 *     }
 *
 * Status: ships in source. Production deploy = H.sweep.1.
 */

const https = require('https');

// 6-min red threshold matches Threshold Tuning.tenant_heartbeat_dead_minutes
const RED_THRESHOLD_MIN = parseInt(process.env.NEXBOX_FLEET_RED_THRESHOLD_MIN || '6', 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function supaSelect(urlPath) {
  return new Promise((resolve, reject) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return reject(new Error('Supabase env vars missing'));
    const u = new URL(`${url}/rest/v1/${urlPath}`);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`SELECT ${urlPath} ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(raw ? JSON.parse(raw) : []); } catch { reject(new Error('Bad JSON')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  // Auth
  const got = event.headers['x-internal-key'] || event.headers['X-Internal-Key'] || '';
  const expected = process.env.INTERNAL_KEY || '';
  if (!expected || got !== expected) {
    await sleep(5000);
    return { statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) };
  }

  try {
    // Read the view
    const rows = await supaSelect('tenant_heartbeat_status?select=*&order=minutes_stale.desc');

    // Recompute health locally with the configured threshold
    const tenants = (rows || []).map(r => {
      const minutesStale = parseFloat(r.minutes_stale) || 0;
      let health = 'green';
      if (minutesStale >= RED_THRESHOLD_MIN * 2.5) health = 'red';
      else if (minutesStale >= RED_THRESHOLD_MIN) health = 'yellow';
      return {
        tenant_id: r.tenant_id,
        display_name: r.display_name,
        health,
        minutes_stale: Math.round(minutesStale * 10) / 10,
        posted_at: r.posted_at,
        agents_alive: r.agents_alive,
        agents_total: r.agents_total,
        errors_24h: r.errors_24h,
        decisions_24h: r.decisions_24h,
        commitments_open: r.commitments_open,
        brain_nodes: r.brain_nodes,
        open_tickets: r.open_tickets,
        pinned_tag: r.pinned_tag,
        app_version: r.app_version,
      };
    });

    const summary = {
      total: tenants.length,
      green: tenants.filter(t => t.health === 'green').length,
      yellow: tenants.filter(t => t.health === 'yellow').length,
      red: tenants.filter(t => t.health === 'red').length,
      errors_24h_count: tenants.filter(t => (t.errors_24h || 0) > 0).length,
      degraded_agents_count: tenants.filter(t => (t.agents_alive || 0) < (t.agents_total || 0)).length,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        generated_at: new Date().toISOString(),
        red_threshold_min: RED_THRESHOLD_MIN,
        summary,
        tenants,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', message: e.message }),
    };
  }
};
