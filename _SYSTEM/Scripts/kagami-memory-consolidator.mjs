#!/usr/bin/env node
// kagami-memory-consolidator.mjs
// Daily local-model task (06:00) — Qwen3.5-4B reviews all memory files and:
//   1. Flags stale/contradicted memories (>30 days without validation)
//   2. Identifies near-duplicates
//   3. Writes a consolidation report to _SYSTEM/training/state/memory-health.json
//   4. Appends action items to /tmp/kagami-memory-consolidator.log
// Does NOT auto-delete. Flags for downstream approval pipeline.

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
// L6 — subconscious consolidation: FSRS demote pass + cold re-promotion proposals.
import { loadItems, planRelocations, executeRelocation, DEFAULT_MEMORY_ROOT } from './memory-relocator.mjs';
import { openColdStore, getCold } from './memory-cold-store.mjs';
import { buildUsageIndex } from './memory-usage.mjs';
import { proposeMemoryWrite, listMemoryProposals } from './memory-kernel.mjs';
import { loadEnergyConfig } from './math/yuri-energy-config.mjs';
import { saturationProbe } from './math/yuri-jaccard.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..', '..');
// FIX (2026-07-04): was hardcoded to $HOME/.claude/projects/.../memory, which resolves
// through TWO symlink hops (~/.claude -> repo/.claude, then repo/.claude/projects ->
// ~/.claude-local/projects since 2026-06-09) into an almost-empty side pocket (5 files).
// The real, git-tracked, actively-written Track-B corpus (302 files, confirmed identical
// to the live MEMORY.md loaded into session context) is the repo-relative .claude/memory/
// dir. claude-memory-write.mjs's memoryRoot() has the SAME stale-resolution bug (it also
// derives from $HOME/.claude/projects/<id>/memory) — do not copy that helper here; it
// would just reproduce the bug. Point straight at the repo dir instead.
const MEMORY_DIR = resolve(REPO_ROOT, '.claude/memory');
const MEMORY_IDX = resolve(MEMORY_DIR, 'MEMORY.md');
const STATE_DIR  = resolve(REPO_ROOT, '_SYSTEM/training/state');
const REPORT     = resolve(STATE_DIR, 'memory-health.json');
const LOG        = '/tmp/kagami-memory-consolidator.log';

const RAPID_MLX_URL   = process.env.RAPID_MLX_URL   || 'http://localhost:8000';
const RAPID_MLX_MODEL = process.env.RAPID_MLX_MODEL || 'qwen3.5-4b';
const STALE_DAYS      = parseInt(process.env.MEMORY_STALE_DAYS || '30', 10);

const log = (...a) => {
  const line = `[mem-consolidator ${new Date().toISOString()}] ${a.join(' ')}\n`;
  process.stderr.write(line);
  try { writeFileSync(LOG, line, { flag: 'a' }); } catch {}
};

function httpPost(urlStr, bodyObj, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(bodyObj);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const req = http.request(u, { method: 'POST', headers, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// MEM-04 — mirror the relocator's subconscious exclusion so the MLX consolidation prompt
// never ingests operational telemetry (the ~1.3MB append-only session journal) or any
// oversized file. Keeps the two scan surfaces consistent: one exclusion truth, two readers.
const CONSOLIDATOR_EXCLUDE = new Set(['MEMORY.md', 'session-journal.md']);
const MAX_CONSOLIDATE_BYTES = 64 * 1024;

function readMemoryFiles() {
  if (!existsSync(MEMORY_DIR)) return [];
  const files = readdirSync(MEMORY_DIR).filter(f => {
    if (!f.endsWith('.md') || CONSOLIDATOR_EXCLUDE.has(f)) return false;
    try { if (statSync(resolve(MEMORY_DIR, f)).size > MAX_CONSOLIDATE_BYTES) { log(`skip ${f} (over ${MAX_CONSOLIDATE_BYTES}B)`); return false; } } catch {}
    return true;
  });
  return files.map(f => {
    const path = resolve(MEMORY_DIR, f);
    const content = readFileSync(path, 'utf8');
    const stat = statSync(path);
    const agedays = (Date.now() - stat.mtimeMs) / 86400000;
    return { filename: f, content: content.slice(0, 600), agedays: Math.round(agedays) };
  });
}

/**
 * MEM-03 (card 30) — deterministic, embedding-free hot-tier dedup over the memory files.
 * Runs the Jaccard saturation probe and returns merge candidates + a saturation load. This
 * is the LLM-FREE dedup: it produces a non-empty mergePairs signal WHETHER OR NOT rapid-mlx
 * is up, downgrading the LLM eyeball (analyzeMemories) from primary detector to tie-breaker.
 *
 * Pure given the `memories` array ({filename, content}); thresholds come from the energy-config
 * recall/fsrs knobs (TUNED, never the hard-coded 0.138 AGS constant — that is cited structurally
 * only). The Hopfield pattern-completion mechanism is PARKED (embedding-free constraint).
 *
 * @returns {{ overCapacity:boolean, load:number, mergePairs:Array, n:number, overlapThreshold:number, loadThreshold:number }}
 */
export function deterministicDedup(memories, { overlapThreshold = 0.6, loadThreshold = 0.15 } = {}) {
  const entries = (memories || [])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => ({ id: m.filename, text: m.content }));
  const probe = saturationProbe(entries, { overlapThreshold, loadThreshold, metric: 'jaccard' });
  return {
    overCapacity: probe.overCapacity,
    load: probe.load,
    mergePairs: probe.mergePairs,
    n: probe.n,
    overlapThreshold: probe.overlapThreshold,
    loadThreshold: probe.loadThreshold,
  };
}

async function analyzeMemories(memories) {
  if (!memories.length) return { stale: [], duplicates: [], total: 0 };

  const memList = memories.map((m, i) =>
    `[${i}] ${m.filename} (${m.agedays}d old):\n${m.content.slice(0, 300)}`
  ).join('\n\n---\n\n');

  const prompt = `You are a memory health analyzer. Review these ${memories.length} memory files and identify issues.

${memList}

Identify:
1. STALE: memories older than ${STALE_DAYS} days that likely need validation
2. DUPLICATE: memories that cover the same topic and should be merged
3. CONTRADICTION: memories that conflict with each other

Output ONLY this JSON:
{
  "stale": [{"filename": "...", "reason": "..."}],
  "duplicates": [{"files": ["...", "..."], "reason": "..."}],
  "contradictions": [{"files": ["...", "..."], "conflict": "..."}],
  "health_score": 0-100
}`;

  try {
    const res = await httpPost(`${RAPID_MLX_URL}/v1/chat/completions`, {
      model: RAPID_MLX_MODEL,
      stream: false,
      enable_thinking: false,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = res.choices?.[0]?.message?.content?.trim() ?? '{}';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { stale: [], duplicates: [], contradictions: [], health_score: 100 };
    return JSON.parse(match[0]);
  } catch (e) {
    log('analyze error:', e.message);
    return { stale: [], duplicates: [], contradictions: [], health_score: 100, error: e.message };
  }
}

/**
 * L6 — cold re-promotion candidates: demoted (cold) memories the subconscious keeps
 * surfacing. Recall pressure (ledger useCount ≥ minUse) on a slug that is STILL in cold
 * means "this dormant trace keeps getting queried" → an operator-gated re-consolidation
 * candidate. Pure read (ledger + cold store); never promotes on its own.
 */
export function findRepromotionCandidates(coldDb, { ledgerFile, minUse = 3 } = {}) {
  const usage = buildUsageIndex(ledgerFile ? { ledgerFile } : {});
  const out = [];
  for (const [slug, u] of Object.entries(usage)) {
    if ((u.useCount || 0) < minUse) continue;
    const rec = getCold(coldDb, slug);          // only cold (demoted) items are re-promotable
    if (!rec) continue;
    out.push({ slug, useCount: u.useCount, lastUsedMs: u.lastUsedMs, title: rec.title });
  }
  return out.sort((a, b) => b.useCount - a.useCount);
}

/**
 * L6 — subconscious consolidation pass. DRY-RUN by default: it only PLANS demotions and
 * logs them. Real relocation (which creates the cold store + moves source files) and
 * re-promotion proposal recording happen only when execute=true. Both halves are offline
 * and operator-gated — relocation is reversible (relocated/ + cold body), re-promotion is
 * a pending memory-kernel proposal the operator must approve. Fully injectable for tests.
 */
export async function runSubconsciousPass(opts = {}) {
  const {
    root = DEFAULT_MEMORY_ROOT,
    ledgerFile,
    nowMs = Date.now(),
    execute = false,
    rFloor,                    // explicit override; else fsrs.rFloor; else 0.6
    fsrs = {},                 // fsrs knob block (main() sources it from loadEnergyConfig); {} = code defaults
    repromotionMinUse = 3,
    coldDb: injectedDb = null,
    propose = proposeMemoryWrite,
    listProposals = listMemoryProposals,
    log: logFn = log,
  } = opts;

  // 1. DEMOTE — pure plan always (read-only); relocation I/O only when execute=true. The fsrs
  // knob block (rFloor + decay/factor/salience/freq/deltaU stability weights) steers the demote
  // threshold; an empty fsrs falls back to evaluateRetention's in-code defaults (rFloor 0.6).
  const effRFloor = rFloor != null ? rFloor : (fsrs.rFloor != null ? fsrs.rFloor : 0.6);
  const usageIndex = buildUsageIndex(ledgerFile ? { ledgerFile } : {});
  const items = loadItems(root, { nowMs, usageIndex });
  const plan = planRelocations(items, { nowMs, ...fsrs, rFloor: effRFloor });
  logFn(`subconscious: scanned=${items.length} demote-candidates=${plan.demote.length} execute=${execute}`);
  for (const d of plan.demote) logFn(`  DEMOTE-CANDIDATE ${d.slug} R=${Number(d.R).toFixed(3)}`);

  let db = injectedDb;
  let ownsDb = false;
  let relocation = { dryRun: true, demoted: 0, kept: plan.keep.length };
  const proposed = [];

  if (execute) {
    if (!db) { db = openColdStore(); ownsDb = true; }       // creates the cold store
    relocation = executeRelocation(plan, { coldDb: db, root, dryRun: false, nowMs });
    logFn(`subconscious: demoted=${relocation.demoted} kept=${relocation.kept}`);

    // 2. RE-PROMOTION — cold slugs under recall pressure → operator-gated proposals.
    const candidates = findRepromotionCandidates(db, { ledgerFile, minUse: repromotionMinUse });
    const pendingTags = new Set();                          // dedup vs already-pending (no daily spam)
    try {
      for (const p of (listProposals('', {}).proposals || [])) {
        if ((p.status || 'pending') === 'pending') for (const t of (p.tags || [])) pendingTags.add(t);
      }
    } catch (_) { /* proposal log unreadable → propose anyway */ }
    for (const c of candidates) {
      if (pendingTags.has(c.slug)) { logFn(`  REPROMOTE-SKIP ${c.slug} (already pending)`); continue; }
      const res = propose({
        content: `Re-promote dormant memory "${c.slug}" — recalled ${c.useCount}× from the subconscious cold store. The subconscious keeps surfacing it; consider restoring it to active memory (memory-relocator promoteHot).`,
        surface: 'yuri-memory',
        tags: ['cold-repromotion', c.slug],
        confidence: 0.6,
        reason: 'recall pressure on a demoted memory (testing effect → re-consolidation candidate)',
      }, { record: true, session: 'kagami-memory-consolidator', lane: 'consolidator' });
      proposed.push({ slug: c.slug, ok: !!(res && res.ok) });
      logFn(`  REPROMOTE-PROPOSED ${c.slug} useCount=${c.useCount} ok=${!!(res && res.ok)}`);
    }
  }

  if (ownsDb && db) db.close();
  return { scanned: items.length, demoteCandidates: plan.demote.length, relocation, proposed };
}

async function main() {
  log('starting memory consolidation run');

  // L6 — subconscious consolidation. Independent of Rapid-MLX (pure scoring + file ops),
  // so it runs even when the local model is down. DRY-RUN unless --execute /
  // YURI_SUBCONSCIOUS_EXECUTE=1 — the scheduled daily run only REPORTS demote candidates;
  // the forgetting loop never fires unattended before the operator has verified it.
  try {
    const execute = process.argv.includes('--execute') || process.env.YURI_SUBCONSCIOUS_EXECUTE === '1';
    const ec = (() => { try { return loadEnergyConfig(); } catch { return {}; } })();
    // Explicit root=MEMORY_DIR (not the DEFAULT_MEMORY_ROOT fallback) — that default is
    // imported from memory-relocator.mjs and has the SAME stale $HOME-symlink resolution
    // bug fixed above for readMemoryFiles(). See the MEMORY_DIR comment for the full chain.
    await runSubconsciousPass({ root: MEMORY_DIR, execute, fsrs: ec.fsrs || {} });
  } catch (e) { log('subconscious pass error:', e.message); }

  const memories = readMemoryFiles();
  log(`found ${memories.length} memory files`);

  if (!memories.length) { log('no memories to consolidate'); return; }

  // MEM-03 (card 30) — DETERMINISTIC dedup FIRST, before the mlx gate. This is the LLM-free
  // hot-tier saturation probe: it surfaces merge candidates whether or not rapid-mlx is up, so
  // the report always carries a dedup signal (today it wrote nothing on an mlx-down run). Write
  // a partial report immediately so the deterministic signal survives even if mlx is offline.
  const ec2 = (() => { try { return loadEnergyConfig(); } catch { return {}; } })();
  const dedup = deterministicDedup(memories, {
    overlapThreshold: 0.6,
    loadThreshold: (ec2.fsrs && Number.isFinite(ec2.fsrs.redundancyFloor)) ? Math.max(ec2.fsrs.redundancyFloor, 0.05) : 0.15,
  });
  log(`deterministic-dedup: n=${dedup.n} load=${dedup.load} overCapacity=${dedup.overCapacity} mergePairs=${dedup.mergePairs.length}`);
  mkdirSync(STATE_DIR, { recursive: true });
  const baseReport = {
    analyzedAt: new Date().toISOString(),
    totalFiles: memories.length,
    deterministicDedup: dedup,
    mlxAvailable: false,
    mode: 'deterministic-only',
  };
  writeFileSync(REPORT, JSON.stringify(baseReport, null, 2));
  log(`deterministic report written → ${REPORT} (mode=deterministic-only until mlx confirmed)`);

  // Check Rapid-MLX available — when DOWN, the deterministic report above stands (dedup signal
  // preserved). When UP, the LLM pass runs as a TIE-BREAKER: it confirms/explains the
  // deterministic merge candidates rather than being the sole detector.
  let mlxUp = false;
  try {
    mlxUp = await new Promise((res) => {
      const req = http.request(new URL('/v1/models', RAPID_MLX_URL), { timeout: 2000 }, r => {
        res(r.statusCode === 200);
        r.resume();
      });
      req.on('error', () => res(false));
      req.on('timeout', () => { req.destroy(); res(false); });
      req.end();
    });
  } catch { mlxUp = false; }
  if (!mlxUp) { log('rapid-mlx not available — deterministic-only report stands (dedup signal preserved)'); return; }

  const analysis = await analyzeMemories(memories);
  log(`health_score=${analysis.health_score} stale=${analysis.stale?.length ?? 0} dupes=${analysis.duplicates?.length ?? 0} contradictions=${analysis.contradictions?.length ?? 0}`);

  // Write report — mlx UP: the deterministic dedup remains the source of truth for merge
  // candidates; the LLM analysis is folded in as the TIE-BREAKER (contradictions + human
  // reasons). mlxAvailable:true, mode:enriched.
  mkdirSync(STATE_DIR, { recursive: true });
  const report = {
    analyzedAt: new Date().toISOString(),
    totalFiles: memories.length,
    deterministicDedup: dedup,
    mlxAvailable: true,
    mode: 'enriched',
    ...analysis,
  };
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log(`report written → ${REPORT} (mode=enriched, mlx tie-breaker)`);

  // Log action items
  for (const s of analysis.stale ?? []) {
    log(`STALE: ${s.filename} — ${s.reason}`);
  }
  for (const d of analysis.duplicates ?? []) {
    log(`DUPLICATE: ${d.files?.join(' + ')} — ${d.reason}`);
  }
  for (const c of analysis.contradictions ?? []) {
    log(`CONFLICT: ${c.files?.join(' vs ')} — ${c.conflict}`);
  }
}

// Run only when executed directly (the plist invokes it as a script); importing the module
// for tests must NOT trigger a live consolidation run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => log('fatal:', e.message));
}
