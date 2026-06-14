#!/usr/bin/env node
// @capability: yuri-freshness
// @serves: staleness orchestration | freshness report | autonomous self-maintenance | is anything stale | never-stale sweep
// @does: DISARMED one-sweep staleness detector across YURI's generated surfaces; prints a structured report;
//   ONLY under --heal runs the SAFE heals (search reindex). Detectors are a REGISTRY (SURFACES) so coverage
//   extends by adding a row, not editing logic. Shared/heavy surfaces are FLAG-only (never auto-commit/analyze).
// @use: node _SYSTEM/Scripts/yuri-freshness.mjs [--heal] [--json]   (engine for the periodic sweep + the
//   continuous PostToolUse tick; the tick refreshes only the surfaces a change touches — that arm is owner-gated)
// @exports: runFreshness, SURFACES
// ASSUMPTION: xref-drift-scan.gitnexusStaleness({repoRoot}) returns {available, stale?, indexedCommit?, head?, behind?, reason?}.
// ASSUMPTION: yuri-search.indexStaleness() returns {stale?, indexMtime?, reason?} and is fail-open.
// ASSUMPTION: capability-scan.mjs --check exits 0=fresh, 1=stale. `ai reindex` heals the search index.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitnexusStaleness } from './xref-drift-scan.mjs';
import { indexStaleness } from './yuri-search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CAP = path.join(__dirname, 'capability-scan.mjs');
const AI = path.join(__dirname, 'ai');

const row = (surface, status, detail, healable, action) => ({ surface, status, detail, healable, action });

// ── SURFACE REGISTRY ────────────────────────────────────────────────────────────
// Each surface: detect(ctx) -> {status:'fresh'|'stale'|'unknown', detail}; safety 'auto'|'flag'; heal(ctx) (auto only).
// EXTEND coverage by adding a row here — the entirety of YURI's generated artifacts belongs in this list over time.
// safety 'flag' = shared / heavy (capabilities.json: parallel lanes add tags → never auto-commit; gitnexus: heavy + shared → never auto-analyze).
export const SURFACES = [
  {
    id: 'gitnexus-graph', safety: 'flag',
    detect: () => { const g = gitnexusStaleness({ repoRoot: ROOT }); return { status: !g.available ? 'unknown' : (g.stale ? 'stale' : 'fresh'), detail: g.available ? `indexed=${String(g.indexedCommit || '').slice(0, 8)} head=${String(g.head || '').slice(0, 8)}${g.behind != null ? ` behind=${g.behind}` : ''}` : (g.reason || 'unavailable') }; },
    action: 'FLAG — `npx gitnexus analyze --skip-agents-md` in a safe window (heavy + shared)',
  },
  {
    id: 'capabilities.json', safety: 'flag',
    detect: (ctx) => { const r = ctx.spawn('node', [CAP, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }); return { status: r.status === 0 ? 'fresh' : (r.status === 1 ? 'stale' : 'unknown'), detail: (r.stderr || r.stdout || '').trim().slice(0, 160) }; },
    action: 'FLAG — `node _SYSTEM/Scripts/capability-scan.mjs` (shared: never auto-commit)',
  },
  {
    id: 'search-index', safety: 'auto',
    detect: () => { const s = indexStaleness(); return { status: s.stale ? 'stale' : (s.reason ? 'unknown' : 'fresh'), detail: s.indexMtime ? `last reindex ${String(s.indexMtime).slice(0, 16)}` : (s.reason || 'ok') }; },
    heal: (ctx) => { const r = ctx.spawn('bash', [AI, 'reindex'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }); return `ai reindex (exit ${r.status ?? '?'})`; },
    action: 'run with --heal to `ai reindex`',
  },
  // TODO(increment-2, comprehensive): skill-hash-registry.json, yuri-graph.json (circuitry), design-memory.json,
  // organ-guides.json, MATH-SCIENCE-MANUAL, MEMORY.md reindex, memory/alpha-factors DBs — each adds one row here.
];

export function runFreshness({ heal = false, json = false, _spawn = spawnSync } = {}) {
  const ctx = { spawn: _spawn, root: ROOT };
  const rows = [];
  for (const s of SURFACES) {
    let d; try { d = s.detect(ctx); } catch (e) { d = { status: 'unknown', detail: `detect threw: ${String(e?.message || e).slice(0, 120)}` }; }
    const isAuto = s.safety === 'auto';
    let action = s.action;
    if (heal && isAuto && typeof s.heal === 'function') { try { action = `healed: ${s.heal(ctx)}`; } catch (e) { action = `heal threw: ${String(e?.message || e).slice(0, 120)}`; } }
    rows.push(row(s.id, d.status, d.detail, isAuto, action));
  }
  const stale = rows.filter((r) => r.status === 'stale').map((r) => r.surface);
  const report = { ok: true, heal, staleCount: stale.length, stale, rows };
  if (json) console.log(JSON.stringify(report, null, 2));
  else { console.log(`YURI freshness (heal=${heal}) — ${stale.length} stale: ${stale.join(', ') || 'none'}`); for (const r of rows) console.log(`  [${r.status.toUpperCase().padEnd(7)}] ${r.surface}: ${r.detail} | ${r.action}`); }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  runFreshness({ heal: argv.includes('--heal'), json: argv.includes('--json') });
  process.exitCode = 0;
}
