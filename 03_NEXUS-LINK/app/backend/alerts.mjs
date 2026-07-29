// NEXUS backend spine, module 4 — risk-based alerting. Alerts accumulate
// risk per actor+rule over a rolling 24h window; the banner only shows
// groups whose cumulative score reaches the threshold (default 75). No
// per-event noise.

import { store as defaultStore } from './store.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createAlerts({ store = defaultStore, threshold = 75, windowMs = DAY_MS } = {}) {
  /**
   * Current banner state. Returns only actor+rule groups at or above the
   * risk threshold: { threshold, window_hours, alerts: [...] }.
   */
  function getBanner(now = Date.now()) {
    const since = new Date(now - windowMs).toISOString();
    const groups = new Map();
    for (const obj of store.query({ type: 'alert' })) {
      const d = obj.data || {};
      const ts = d.ts || obj.created;
      if (ts < since) continue; // ISO-8601 strings compare lexicographically
      const key = `${d.actor}|${d.rule_id}`;
      let g = groups.get(key);
      if (!g) {
        g = { actor: d.actor, rule_id: d.rule_id, severity: d.severity, score: 0, count: 0, latest_ts: ts, descriptions: new Set() };
        groups.set(key, g);
      }
      g.score += d.score || 0;
      g.count += 1;
      if (ts > g.latest_ts) g.latest_ts = ts;
      if (d.description) g.descriptions.add(d.description);
    }
    const alerts = [...groups.values()]
      .filter(g => g.score >= threshold)
      .map(g => ({ ...g, descriptions: [...g.descriptions] }))
      .sort((a, b) => b.score - a.score || b.latest_ts.localeCompare(a.latest_ts));
    return { threshold, window_hours: Math.round(windowMs / 3600000), alerts };
  }

  return { getBanner };
}

let _alerts = null;
export function getAlerts() {
  if (!_alerts) _alerts = createAlerts();
  return _alerts;
}

export const alerts = {
  getBanner: (...a) => getAlerts().getBanner(...a),
};
