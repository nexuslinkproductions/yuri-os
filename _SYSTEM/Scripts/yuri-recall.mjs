#!/usr/bin/env node
/**
 * yuri-recall.mjs — cue-based associative recall from the subconscious (cold) store.
 *
 * "Checking that area": when the current task gives a cue, query the cold store and
 * surface only the few most relevant dormant traces back into context — the subconscious
 * being queried associatively, no deliberate search. Cue-dependent retrieval (Tulving
 * encoding-specificity) via BM25 + a 1-hop spreading-activation walk over the crosslink
 * graph (so conceptually-linked items that share no literal terms can still surface) +
 * recency/salience blend (ACT-R base-level activation). Bounded top-K keeps the conscious
 * set small. Surfacing an item BUMPS the recall ledger (testing effect → re-promotion).
 *
 * Pure ranking core (rankRecall) is unit-testable; recall() wires it to the live cold
 * store + ledger. Embedding-free (FTS5/BM25 only). NEVER auto-writes to memory — it only
 * surfaces advisory candidates; promotion-back stays gated (consolidation pass).
 */
import fs from 'node:fs';
import { queryCold, openColdStore, COLD_DB_PATH } from './memory-cold-store.mjs';
import { buildUsageIndex, recordUse } from './memory-usage.mjs';

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * PURE: rank + filter cold hits into the top-K to surface.
 * hits = queryCold rows ({slug, title, snip, bm25, salience, crosslinks}).
 */
export function rankRecall(hits, { usageIndex = {}, nowMs = Date.now(), weights = {}, relevanceFloor = 0, topK = 5, halfLifeDays = 30 } = {}) {
  const w = { bm25: 1.0, recency: 0.5, salience: 0.5, crosslink: 0.3, ...weights };
  const scored = hits.map((h) => {
    const usage = usageIndex[h.slug] || {};
    const ageDays = usage.lastUsedMs ? Math.max(0, (nowMs - usage.lastUsedMs) / DAY_MS) : Infinity;
    const recency = Number.isFinite(ageDays) ? Math.exp(-ageDays / Math.max(1, halfLifeDays)) : 0;
    const relevance = -Number(h.bm25 || 0);                 // SQLite bm25 is negative; flip so higher = better
    const base = w.bm25 * relevance + w.recency * recency + w.salience * Math.max(0, Number(h.salience) || 0);
    return { ...h, relevance, recency, score: base };
  });
  // 1-hop spreading activation: an item crosslinked-to by another surfaced hit gets a bonus.
  const present = new Set(scored.map((s) => s.slug));
  const inbound = {};
  for (const s of scored) {
    for (const link of String(s.crosslinks || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      if (present.has(link)) inbound[link] = (inbound[link] || 0) + 1;
    }
  }
  for (const s of scored) if (inbound[s.slug]) s.score += w.crosslink * inbound[s.slug];
  return scored
    .filter((s) => s.relevance >= relevanceFloor)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, topK));
}

/** Render a compact, budget-bounded block for re-injection (path + snippet, not full bodies). */
export function renderRecallBlock(ranked) {
  if (!ranked.length) return '';
  const lines = ranked.map((r) => `- [${r.slug}] ${String(r.snip || r.title || '').replace(/\s+/g, ' ').slice(0, 140)}`);
  return `<subconscious-recall>\n${lines.join('\n')}\n</subconscious-recall>`;
}

/**
 * Live recall: query the cold store with a cue, rank, surface top-K, and BUMP the ledger
 * for each surfaced slug (reactivation strengthens the trace). Returns the ranked items.
 */
export function recall(cue, { coldDb, ledgerFile, nowMs = Date.now(), ...cfg } = {}) {
  const db = coldDb || openColdStore(COLD_DB_PATH);
  const ownsDb = !coldDb;
  try {
    const hits = queryCold(db, cue, { topK: cfg.topK || 5 });
    const ranked = rankRecall(hits, { usageIndex: buildUsageIndex({ ledgerFile }), nowMs, ...cfg });
    for (const r of ranked) recordUse(r.slug, { event: 'recall', nowMs, query: cue, ledgerFile });
    return ranked;
  } finally {
    if (ownsDb) db.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  let outFile = null;
  const outIdx = argv.indexOf('--out');
  if (outIdx !== -1) { outFile = argv[outIdx + 1]; argv.splice(outIdx, 2); }
  const cue = argv.join(' ');
  if (!cue) { console.log('usage: yuri-recall.mjs [--out <file>] "<task cue>"'); process.exit(0); }
  // Source the recall blend knobs (relevanceFloor/topK/halfLifeDays/weights) from the canonical
  // energy-weights surface. Dynamic import keeps this off the module-load path (tests import the
  // pure functions only); fail-closed to rankRecall's in-code defaults if the config is absent/bad.
  const rc = await (async () => {
    try { const { loadEnergyConfig } = await import('./math/yuri-energy-config.mjs'); return loadEnergyConfig().recall || {}; }
    catch { return {}; }
  })();
  const ranked = recall(cue, { ...rc });
  const block = renderRecallBlock(ranked);
  if (outFile) {
    // prior-turn-lag persistence: write a JSON envelope the UserPromptSubmit hook re-injects on
    // the NEXT turn (the hook cannot block on this detached recall). Atomic (tmp+rename) so a
    // mid-write read never sees a partial file. Only write when something surfaced — an empty
    // recall leaves no file, so the reader injects nothing. Never throws (detached child).
    try {
      if (block) {
        const tmp = `${outFile}.${process.pid}.tmp`;
        const doc = { turnId: process.env.YURI_RECALL_TURN || null, ts: Date.now(), cue, block };
        fs.writeFileSync(tmp, JSON.stringify(doc));
        fs.renameSync(tmp, outFile);
      }
    } catch { /* best-effort: recall must never crash the turn */ }
  } else {
    process.stdout.write(block + (ranked.length ? '\n' : 'no subconscious recall\n'));
  }
}
