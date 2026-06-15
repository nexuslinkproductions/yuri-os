#!/usr/bin/env node
// @capability: yuri-freshness
// @serves: staleness orchestration | freshness report | autonomous self-maintenance | is anything stale | never-stale sweep | coverage audit | what is unregistered | continuous dirty tick
// @does: DISARMED one-sweep staleness detector across YURI's generated surfaces; prints a structured report;
//   ONLY under --heal runs the SAFE heals (search reindex). Detectors are a REGISTRY (SURFACES) so coverage
//   extends by adding a row, not editing logic. Shared/heavy surfaces are FLAG-only (never auto-commit/analyze).
//   Discovery engine finds unregistered stale-able artifacts. Continuous tick (L2) marks dirty surfaces on
//   file changes — DISARMED, NOT wired to any hook (owner-gated).
// @use: node _SYSTEM/Scripts/yuri-freshness.mjs [--heal] [--json] [--audit]
// @exports: runFreshness, SURFACES, discoverArtifacts, coverageAudit, PATH_RULES, affectedSurfaces, readDirty, markSurfacesDirty, clearDirty, tickFreshness
// ASSUMPTION: xref-drift-scan.gitnexusStaleness({repoRoot}) returns {available, stale?, indexedCommit?, head?, behind?, reason?}.
// ASSUMPTION: yuri-search.indexStaleness() returns {stale?, indexMtime?, reason?} and is fail-open.
// ASSUMPTION: capability-scan.mjs --check exits 0=fresh, 1=stale. `ai reindex` heals the search index.
// ASSUMPTION: yuri-skill-loader.mjs --validate exits 0=fresh, 1=stale.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitnexusStaleness } from './xref-drift-scan.mjs';
import { indexStaleness } from './yuri-search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const CAP = path.join(__dirname, 'capability-scan.mjs');
const AI = path.join(__dirname, 'ai');
const SKILL_LOADER = path.join(__dirname, 'yuri-skill-loader.mjs');
const DIRTY_FILE = path.join(ROOT, '_SYSTEM/state/freshness-dirty.json');

const row = (surface, status, detail, healable, action) => ({ surface, status, detail, healable, action });

// ── SURFACE REGISTRY ────────────────────────────────────────────────────────────
// Each surface: detect(ctx) -> {status:'fresh'|'stale'|'unknown', detail}; safety 'auto'|'flag'; heal(ctx) (auto only).
// EXTEND coverage by adding a row here — the entirety of YURI's generated artifacts belongs in this list over time.
// safety 'flag' = shared / heavy (capabilities.json: parallel lanes add tags → never auto-commit; gitnexus: heavy + shared → never auto-analyze).
export const SURFACES = [
  {
    id: 'gitnexus-graph', safety: 'flag', path: undefined,
    detect: () => { const g = gitnexusStaleness({ repoRoot: ROOT }); return { status: !g.available ? 'unknown' : (g.stale ? 'stale' : 'fresh'), detail: g.available ? `indexed=${String(g.indexedCommit || '').slice(0, 8)} head=${String(g.head || '').slice(0, 8)}${g.behind != null ? ` behind=${g.behind}` : ''}` : (g.reason || 'unavailable') }; },
    action: 'FLAG — `npx gitnexus analyze --skip-agents-md` in a safe window (heavy + shared)',
  },
  {
    id: 'capabilities.json', safety: 'flag', path: '_SYSTEM/capabilities.json',
    detect: (ctx) => { const r = ctx.spawn('node', [CAP, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }); return { status: r.status === 0 ? 'fresh' : (r.status === 1 ? 'stale' : 'unknown'), detail: (r.stderr || r.stdout || '').trim().slice(0, 160) }; },
    action: 'FLAG — `node _SYSTEM/Scripts/capability-scan.mjs` (shared: never auto-commit)',
  },
  {
    id: 'search-index', safety: 'auto', path: '_SYSTEM/OS_KERNEL/search-index.db',
    detect: () => { const s = indexStaleness(); return { status: s.stale ? 'stale' : (s.reason ? 'unknown' : 'fresh'), detail: s.indexMtime ? `last reindex ${String(s.indexMtime).slice(0, 16)}` : (s.reason || 'ok') }; },
    heal: (ctx) => { const r = ctx.spawn('bash', [AI, 'reindex'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 }); return `ai reindex (exit ${r.status ?? '?'})`; },
    action: 'run with --heal to `ai reindex`',
  },
  {
    id: 'skill-hash-registry', safety: 'flag', path: '_SYSTEM/skill-hash-registry.json',
    detect: (ctx) => { try { const r = ctx.spawn('node', [SKILL_LOADER, '--validate'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }); return { status: r.status === 0 ? 'fresh' : (r.status === 1 ? 'stale' : 'unknown'), detail: (r.stderr || r.stdout || '').trim().slice(0, 160) }; } catch (e) { return { status: 'unknown', detail: `detect threw: ${String(e?.message || e).slice(0, 120)}` }; } },
    action: 'FLAG — `node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest` (shared: never auto-commit)',
  },
  {
    id: 'yuri-graph', safety: 'flag', path: '_SYSTEM/yuri-graph.json',
    detect: () => ({ status: 'unknown', detail: 'circuitry graph — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/yuri-graph-unify.mjs` (heavy + shared)',
  },
  {
    id: 'yuri-graph-state', safety: 'flag', path: '_SYSTEM/yuri-graph-state.json',
    detect: () => ({ status: 'unknown', detail: 'arch graph state — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/arch-graph-engine.mjs`',
  },
  {
    id: 'design-memory', safety: 'flag', path: '_SYSTEM/design-memory.json',
    detect: () => ({ status: 'unknown', detail: 'design memory — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/design-context-inject.mjs`',
  },
  {
    id: 'organ-guides', safety: 'flag', path: '_SYSTEM/organ-guides.json',
    detect: () => ({ status: 'unknown', detail: 'organ guides — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/yuri-guide-seed.mjs`',
  },
  {
    id: 'mechanism-pattern-registry', safety: 'flag', path: '_SYSTEM/data/math/mechanism-pattern-registry.json',
    detect: () => ({ status: 'unknown', detail: 'mechanism pattern registry — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/math/mechanism-pattern-registry.mjs`',
  },
  {
    id: 'context-registry', safety: 'flag', path: '_SYSTEM/context/context-registry.json',
    detect: () => ({ status: 'unknown', detail: 'context registry — detector pending' }),
    action: 'FLAG — regenerate via `node _SYSTEM/Scripts/context-router.mjs`',
  },
  {
    id: 'memory-index', safety: 'flag', path: '.claude/memory/MEMORY.md',
    detect: () => ({ status: 'unknown', detail: 'memory index — self-heals at SessionStart' }),
    action: 'FLAG — SessionStart reindex (self-healing)',
  },
  {
    id: 'manuals', safety: 'flag', path: '_SYSTEM/INDEX.md',
    detect: () => ({ status: 'unknown', detail: 'referenced-path integrity — detector pending' }),
    action: 'FLAG — hand-authored; referenced-path integrity pending',
  },
];

// ── DISCOVERY + COVERAGE AUDIT ──────────────────────────────────────────────────
const EXCLUDE_RE = /node_modules|\/archive\/|\/recovery\/|backend\/data|_SYSTEM\/_SYSTEM\/|\/worktrees\/|yuri-history-archive|legacy-purge|\.test\.|backup|\/fixtures?\/|\/test\/|\.curator|\.sync-manifest|external-root/;

export function discoverArtifacts({ spawn = spawnSync } = {}) {
  try {
    const r = spawn('find', [
      '_SYSTEM', '-type', 'f', '(',
      '-name', '*registry*.json', '-o', '-name', '*manifest*.json', '-o',
      '-name', '*-graph*.json', '-o', '-name', '*guides*.json', '-o',
      '-name', '*-memory.json', '-o', '-name', 'capabilities.json', '-o',
      '-name', '*.db', ')'
    ], { cwd: ROOT, encoding: 'utf8', timeout: 20000 });
    if (!r || r.status !== 0 || typeof r.stdout !== 'string') return [];
    return r.stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.replace(/^\.\//, '')).filter(p => !EXCLUDE_RE.test(p)).map(p => {
      let kind = 'json';
      if (p.endsWith('.db')) kind = 'database';
      else {
        const base = path.basename(p);
        for (const kw of ['registry', 'manifest', 'graph', 'guides', 'memory']) {
          if (base.includes(kw)) { kind = kw; break; }
        }
      }
      return { path: p, kind };
    });
  } catch (_) { return []; }
}

export function coverageAudit(ctx = {}) {
  const discovered = discoverArtifacts(ctx);
  const registered = new Set(SURFACES.map(s => s.path).filter(Boolean));
  const unregistered = discovered.filter(d => !registered.has(d.path));
  const watched = discovered.length - unregistered.length;
  const coverage = discovered.length ? +(watched / discovered.length).toFixed(3) : 1;
  return {
    discovered: discovered.length,
    registeredSurfaces: registered.size,
    watched,
    unregisteredCount: unregistered.length,
    coverage,
    unregistered: unregistered.map(u => `${u.path} [${u.kind}]`),
  };
}

// ── DISARMED CONTINUOUS TICK (L2) ──────────────────────────────────────────────
// NOT wired to any hook. Wiring tickFreshness into post-tool-use.js is OWNER-GATED
// (fires on every tool call = hot-path). Exported for testing and future opt-in.

export const PATH_RULES = [
  { re: /\.(mjs|cjs|js|ts)$/, surfaces: ['gitnexus-graph', 'search-index', 'capabilities.json', 'yuri-graph'] },
  { re: /\.(md|markdown|txt)$/, surfaces: ['search-index'] },
  { re: /(\.claude\/skills\/|skills\/[^/]+\/SKILL\.md)/, surfaces: ['skill-hash-registry'] },
  { re: /(\.claude|_SYSTEM)\/memory\//, surfaces: ['memory-index', 'search-index'] },
  { re: /design/i, surfaces: ['design-memory'] },
  { re: /(organ|guide)/i, surfaces: ['organ-guides'] },
  { re: /(INDEX\.md|LANE-MANUAL|MANUAL)/, surfaces: ['manuals'] },
];

export function affectedSurfaces(changedPath) {
  if (typeof changedPath !== 'string') return [];
  const set = new Set();
  for (const rule of PATH_RULES) {
    if (rule.re.test(changedPath)) {
      for (const s of rule.surfaces) set.add(s);
    }
  }
  return [...set];
}

export function readDirty({ file = DIRTY_FILE } = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return {}; }
}

export function markSurfacesDirty(ids, { file = DIRTY_FILE, now = Date.now() } = {}) {
  if (!ids || !ids.length) return {};
  try {
    const dirty = readDirty({ file });
    for (const id of ids) dirty[id] = now;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(dirty));
    return dirty;
  } catch (_) { return {}; }
}

export function clearDirty(ids, { file = DIRTY_FILE } = {}) {
  try {
    const dirty = readDirty({ file });
    if (ids) { for (const id of ids) delete dirty[id]; }
    else { for (const k of Object.keys(dirty)) delete dirty[k]; }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(dirty));
    return dirty;
  } catch (_) { return {}; }
}

export function tickFreshness(changedPath, opts = {}) {
  const dirty = affectedSurfaces(changedPath);
  if (dirty.length) markSurfacesDirty(dirty, opts);
  return { changedPath, dirty };
}

// ── RUN FRESHNESS ────────────────────────────────────────────────────────────────
export function runFreshness({ heal = false, json = false, _spawn = spawnSync } = {}) {
  const ctx = { spawn: _spawn, root: ROOT };
  const dirty = readDirty();
  const rows = [];
  for (const s of SURFACES) {
    let d; try { d = s.detect(ctx); } catch (e) { d = { status: 'unknown', detail: `detect threw: ${String(e?.message || e).slice(0, 120)}` }; }
    const isAuto = s.safety === 'auto';
    let action = s.action;
    if (heal && isAuto && typeof s.heal === 'function') { try { action = `healed: ${s.heal(ctx)}`; } catch (e) { action = `heal threw: ${String(e?.message || e).slice(0, 120)}`; } }
    rows.push(row(s.id, d.status, d.detail, isAuto, action));
  }
  const stale = rows.filter((r) => r.status === 'stale').map((r) => r.surface);
  const cov = coverageAudit(ctx);
  const report = {
    ok: true, heal, staleCount: stale.length, stale, rows,
    coverage: cov.coverage, unregisteredCount: cov.unregisteredCount, unregistered: cov.unregistered,
    dirtySurfaces: Object.keys(dirty),
  };
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const pct = (cov.coverage * 100).toFixed(1);
    console.log(`YURI freshness (heal=${heal}) — ${stale.length} stale, coverage ${pct}% (${cov.unregisteredCount} unregistered)`);
    for (const r of rows) console.log(`  [${r.status.toUpperCase().padEnd(7)}] ${r.surface}: ${r.detail} | ${r.action}`);
    if (cov.unregisteredCount) {
      console.log('UNREGISTERED stale-able artifacts:');
      for (const u of cov.unregistered) console.log(`  - ${u}`);
    }
  }
  return report;
}

// ── CLI ──────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--audit')) {
    console.log(JSON.stringify(coverageAudit(), null, 2));
  } else {
    runFreshness({ heal: argv.includes('--heal'), json: argv.includes('--json') });
  }
  process.exitCode = 0;
}