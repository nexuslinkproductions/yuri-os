#!/usr/bin/env node
/**
 * yuri-total-recall.mjs — "Total Recall": a short, SELECTIVE, mathematically-ranked dump of what happened in a
 * timeframe, for context continuity. The TIME-axis instance of the recall layer; the antidote to context-
 * compaction loss. Given a window + optional topic + a token budget, it returns the items that maximize COVERED
 * salience per token — not a window dump.
 *
 *   salience(e,q) = w_rec·decay(age) + w_imp·importance(e) + w_rel·sim(e,q) + w_sur·infoGain(e)
 *   selection     = greedy budget-constrained MMR (redundancy-penalized) — short + selective by construction.
 *
 * Events: git history (commits) + the nerve event store (memory/telemetry sources fold in later). Deterministic:
 * the caller stamps "now" (nowMs); no Date.now in the module (falls back to the latest event time for tests).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEvents } from './yuri-nerve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

export const DEFAULT_WEIGHTS = Object.freeze({ rec: 1.0, imp: 1.2, rel: 1.5, sur: 1.0 });
const HOUR_MS = 3600000;

const tokenize = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const estTokens = (s) => Math.max(8, Math.ceil(String(s || '').length / 4));

// hazard/confidence decay: freshness = 0.5^(ageHours/halfLife). Recency TERM (not a filter) — older high-salience
// events still compete, so "recall the most recent OR an important older thing" both work.
export function decay(ageHours, halfLife = 72) {
  const a = Math.max(0, Number(ageHours) || 0);
  const hl = halfLife > 0 ? halfLife : 72;
  return Math.pow(0.5, a / hl);
}

// Jaccard overlap of two token lists — used for both relevance (vs query) and redundancy (vs chosen set).
function jaccard(aTokens, bTokens) {
  if (!aTokens || !bTokens || !aTokens.length || !bTokens.length) return 0;
  const A = new Set(aTokens), B = new Set(bTokens);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// Gather events from git history + the nerve store within the window. Each → a normalized event.
export function gatherEvents({ sinceHours = 72, store, repo = REPO } = {}) {
  const events = [];
  try {
    const since = `${Math.max(1, Math.ceil(sinceHours))} hours ago`;
    const r = spawnSync('git', ['log', `--since=${since}`, '--pretty=format:%H%ct%s', '--shortstat'], { cwd: repo, encoding: 'utf8', timeout: 8000 });
    if (r.status === 0 && r.stdout) {
      for (const b of r.stdout.split(/\n(?=[0-9a-f]{40})/)) {
        const [head, ...rest] = b.split('\n');
        const [hash, ct, subj] = head.split('');
        if (!hash || !ct) continue;
        const filesChanged = (rest.join(' ').match(/(\d+) files? changed/) || [])[1];
        events.push({ id: `git.${hash.slice(0, 8)}`, kind: 'commit', title: subj || '(no subject)', timeMs: Number(ct) * 1000, weight: 0.6, infoGain: Math.min(1, (Number(filesChanged) || 1) / 10) });
      }
    }
  } catch { /* git unavailable — skip that source */ }
  try {
    const igByKind = { correction: 1, fix: 0.8, finding: 0.7, decision: 0.7, build: 0.5, task: 0.4, idea: 0.3, handoff: 0.5 };
    for (const e of loadEvents(store)) {
      const t = Date.parse(e.stamp || '');
      events.push({ id: e.id, kind: e.type || 'task', title: e.title || '', timeMs: Number.isFinite(t) ? t : null, weight: Number.isFinite(e.value) ? e.value : 0.5, infoGain: igByKind[e.type] ?? 0.4 });
    }
  } catch { /* no nerve store — skip that source */ }
  for (const e of events) { e.tokens = estTokens(e.title); e.terms = tokenize(e.title); }
  return events;
}

export function salience(event, query, nowMs, weights = DEFAULT_WEIGHTS) {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  const dated = Number.isFinite(event.timeMs) && Number.isFinite(nowMs);
  const ageHours = dated ? Math.max(0, (nowMs - event.timeMs) / HOUR_MS) : Infinity;
  const rec = event.timeMs == null ? 0.3 : decay(ageHours);   // undated events get a low flat recency, not zero
  const imp = Math.max(0, Math.min(1, Number.isFinite(event.weight) ? event.weight : 0.5));
  const rel = query ? jaccard(event.terms || tokenize(event.title), tokenize(query)) : 0;
  const sur = Math.max(0, Math.min(1, Number.isFinite(event.infoGain) ? event.infoGain : 0.4));
  return Number((w.rec * rec + w.imp * imp + w.rel * rel + w.sur * sur).toFixed(6));
}

// Greedy budget-constrained MMR: each step pick the item with the best marginal value (salience − λ·maxRedundancy
// with the already-chosen set) that still fits the token budget; stop when nothing fits. Short + selective:
// maximizes covered salience per token instead of dumping the window.
export function selectRecall(scored, { budgetTokens = 1200, lambda = 0.7 } = {}) {
  const pool = scored.slice();
  const chosen = [];
  let used = 0;
  for (;;) {
    let bestIdx = -1, bestVal = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const cand = pool[i];
      if (used + cand.tokens > budgetTokens) continue;
      let maxRed = 0;
      for (const c of chosen) maxRed = Math.max(maxRed, jaccard(cand.terms || tokenize(cand.title), c.terms || tokenize(c.title)));
      const marginal = cand.salience - lambda * maxRed;
      if (marginal > bestVal || (marginal === bestVal && bestIdx >= 0 && String(cand.id) < String(pool[bestIdx].id))) { bestVal = marginal; bestIdx = i; }
    }
    // Stay selective: stop when the best remaining marginal is non-positive
    // (redundancy penalty >= salience). Zero-marginal items are dropped too —
    // nothing is added just to fill budget.
    if (bestIdx < 0 || bestVal <= 0) break;
    const pick = pool.splice(bestIdx, 1)[0];
    chosen.push({ ...pick, marginal: Number(bestVal.toFixed(6)) });
    used += pick.tokens;
  }
  return { items: chosen, budgetUsed: used, totalSalience: Number(chosen.reduce((s, x) => s + x.salience, 0).toFixed(6)) };
}

export function totalRecall({ sinceHours = 72, query = '', budgetTokens = 1200, nowMs, store, weights } = {}) {
  const events = gatherEvents({ sinceHours, store });
  const now = Number.isFinite(nowMs) ? nowMs : Math.max(0, ...events.map((e) => (Number.isFinite(e.timeMs) ? e.timeMs : 0)));
  const scored = events.map((e) => ({ ...e, salience: salience(e, query, now, weights) }));
  const sel = selectRecall(scored, { budgetTokens });
  return {
    op: 'total_recall',
    window: `${sinceHours}h`,
    query: query || null,
    candidateCount: events.length,
    selectedCount: sel.items.length,
    budgetTokens,
    budgetUsed: sel.budgetUsed,
    totalSalience: sel.totalSalience,
    items: sel.items.map((x) => ({ id: x.id, kind: x.kind, title: x.title, salience: x.salience, ageH: (Number.isFinite(x.timeMs) && Number.isFinite(now)) ? Number(((now - x.timeMs) / HOUR_MS).toFixed(1)) : null })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sinceHours = Number(process.argv[2]) || 72;
  const query = process.argv.slice(3).join(' ');
  process.stdout.write(JSON.stringify(totalRecall({ sinceHours, query }), null, 2) + '\n');
}
