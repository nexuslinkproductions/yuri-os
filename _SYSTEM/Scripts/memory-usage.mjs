#!/usr/bin/env node
/**
 * memory-usage.mjs — the recall-event ledger: YURI's real "use" signal.
 *
 * The old evictor keyed on filesystem atime, which never advanced because nothing
 * stat-reads the memory files (it decayed on write/checkout time, not USE). This is the
 * fix: an append-only ledger that records every recall/reinforce, replayed into a usage
 * index (lastUsed, useCount, lastReinforced). The relocator scores retrievability off
 * THIS (not atime), and a cue-recall surfacing appends a 'recall' here so forgetting
 * tracks genuine retrieval — the testing effect / spacing effect made real.
 *
 * Append-only + replayable (an event log, not mutable state). Pure-ish: writers default
 * to Date.now() but accept an injected nowMs; the ledger path is overridable for tests.
 * Best-effort writes (never throw into a hot recall path). Embedding-free.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(_HERE, '..'); // _SYSTEM/Scripts -> _SYSTEM
export const LEDGER_FILE = path.join(SYSTEM_ROOT, 'state', 'memory-usage.jsonl');

/**
 * Append one recall/reinforce event. Best-effort: failures are swallowed (a recall must
 * never crash because the ledger dir is missing). event: 'recall' | 'reinforce'.
 */
export function recordUse(slug, { event = 'recall', nowMs = Date.now(), query, ledgerFile = LEDGER_FILE } = {}) {
  if (!slug || typeof slug !== 'string') return false;
  const ev = event === 'reinforce' ? 'reinforce' : 'recall';
  const line = JSON.stringify({ t: Math.trunc(Number(nowMs) || 0), slug, event: ev, ...(query ? { q: String(query).slice(0, 80) } : {}) });
  try {
    fs.mkdirSync(path.dirname(ledgerFile), { recursive: true });
    fs.appendFileSync(ledgerFile, line + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Replay the ledger into a usage index keyed by slug:
 *   { [slug]: { useCount, lastUsedMs, lastReinforcedMs, firstSeenMs } }
 * A 'reinforce' counts as a use AND advances lastReinforcedMs (the strengthening write).
 * Missing/malformed file or lines fail safe (skipped), returning what is parseable.
 */
export function buildUsageIndex({ ledgerFile = LEDGER_FILE } = {}) {
  const index = {};
  let raw;
  try { raw = fs.readFileSync(ledgerFile, 'utf8'); } catch { return index; }
  for (const lineRaw of raw.split('\n')) {
    const line = lineRaw.trim();
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (!rec || typeof rec.slug !== 'string') continue;
    const t = Number(rec.t);
    if (!Number.isFinite(t)) continue;
    const cur = index[rec.slug] || { useCount: 0, lastUsedMs: 0, lastReinforcedMs: 0, firstSeenMs: t };
    cur.useCount += 1;
    cur.lastUsedMs = Math.max(cur.lastUsedMs, t);
    cur.firstSeenMs = Math.min(cur.firstSeenMs, t);
    if (rec.event === 'reinforce') cur.lastReinforcedMs = Math.max(cur.lastReinforcedMs, t);
    index[rec.slug] = cur;
  }
  return index;
}

/** Usage stats for one slug ({} if it has never been recorded). */
export function usageFor(slug, opts = {}) {
  return buildUsageIndex(opts)[slug] || {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, slug, ev] = process.argv.slice(2);
  if (cmd === 'record' && slug) {
    console.log(JSON.stringify({ ok: recordUse(slug, { event: ev || 'recall' }), slug }));
  } else if (cmd === 'index') {
    console.log(JSON.stringify(buildUsageIndex(), null, 2));
  } else {
    console.log('usage: memory-usage.mjs record <slug> [recall|reinforce] | index');
  }
}
