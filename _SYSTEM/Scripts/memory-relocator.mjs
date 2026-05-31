#!/usr/bin/env node
/**
 * memory-relocator.mjs — the canonical "forgetting" mechanism: RELOCATE, never delete.
 *
 * Supersedes the two crude relocators (memory-evict.mjs atime-LRU, memory-archive.mjs
 * mtime+flag move-to-_archive with no recall path). A memory that has decayed below the
 * retrievability floor is DEMOTED to the subconscious cold store (memory-cold.db, body
 * verbatim) AND its source file is moved into a reversible `relocated/` dir — double
 * safety, nothing is ever deleted. The active index keeps only a tombstone. Promotion-
 * back restores the body byte-identical. Silent engram: storage ≠ retrievability.
 *
 * Decay keys on the recall-event ledger (memory-usage.mjs) — the real USE signal — with
 * file mtime as the prior for memories that predate the ledger (graceful degradation,
 * no fabricated usage). Scoring is the pure yuri-fsrs module. tier sets base stability
 * (semantic decays slowest); explicit force_keep / archive:false / pinned files are
 * exempt from decay entirely.
 *
 * Pure planning core (planRelocations) is unit-testable in isolation; the execute layer
 * does the I/O behind --dry-run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateRetention } from './math/yuri-fsrs.mjs';
import { buildUsageIndex } from './memory-usage.mjs';
import { openColdStore, upsertCold, getCold, removeCold } from './memory-cold-store.mjs';

const _HERE = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_ROOT = path.resolve(_HERE, '..');
export const DEFAULT_MEMORY_ROOT = path.join(SYSTEM_ROOT, 'memory');
const PINNED_FILES = new Set(['memory-core.md', 'MEMORY.md', 'identity.md']);
const DAY_MS = 1000 * 60 * 60 * 24;

// tier -> base stability (days). Semantic = consolidated, decays slowest; working = fast.
const TIER_STABILITY = { semantic: 60, episodic: 14, working: 3 };
const DEFAULT_STABILITY_DAYS = 14;

/** Minimal frontmatter reader — tolerant of Track A (flat name/type) and Track B (nested metadata). */
export function parseFrontmatter(content) {
  const out = { body: content };
  if (!content.startsWith('---')) return out;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return out;
  const fm = content.slice(3, end);
  out.body = content.slice(content.indexOf('\n', end + 1) + 1);
  const pick = (re) => { const m = fm.match(re); return m ? m[1].trim() : null; };
  out.name = pick(/^\s*name:\s*(.+)$/m);
  out.tier = pick(/^\s*tier:\s*(.+)$/m);
  out.trig = pick(/^\s*trig:\s*(.+)$/m) || '';
  out.refs = pick(/^\s*refs:\s*(.+)$/m) || '';
  out.description = pick(/^\s*description:\s*(.+)$/m) || '';
  const salRaw = pick(/^\s*salience:\s*(.+)$/m);
  out.salience = salRaw !== null && Number.isFinite(Number(salRaw)) ? Number(salRaw) : 0;
  const fk = fm.match(/^\s*force_keep:\s*(true|false)\s*$/im);
  const ar = fm.match(/^\s*archive:\s*(true|false)\s*$/im);
  out.forceKeepFlag = (fk && fk[1].toLowerCase() === 'true') || (ar && ar[1].toLowerCase() === 'false');
  return out;
}

function crosslinksFrom(refs) {
  return (String(refs).match(/\[\[([^\]]+)\]\]/g) || []).map((s) => s.replace(/\[\[|\]\]/g, '')).join(',');
}

/** Build a scoring item from a memory file (pure given injected usageIndex + nowMs). */
export function buildItem(file, content, { usageIndex = {}, nowMs = Date.now(), mtimeMs } = {}) {
  const fm = parseFrontmatter(content);
  const filename = path.basename(file);
  const slug = fm.name || filename.replace(/\.md$/, '');
  const usage = usageIndex[slug] || usageIndex[filename] || {};
  const forceKeep = Boolean(fm.forceKeepFlag) || PINNED_FILES.has(filename);
  const baseStabilityDays = TIER_STABILITY[fm.tier] || DEFAULT_STABILITY_DAYS;
  return {
    slug,
    file,
    filename,
    body: content,                 // store the WHOLE file (frontmatter + body) so restore is exact
    title: fm.name || filename,
    trig: [fm.trig, fm.description].filter(Boolean).join(' ').slice(0, 200),
    crosslinks: crosslinksFrom(fm.refs),
    salience: fm.salience,
    baseStabilityDays,
    forceKeep,
    useCount: usage.useCount || 0,
    lastUsedMs: usage.lastUsedMs || mtimeMs || nowMs,  // ledger first, mtime prior, else now
  };
}

/** PURE: split items into demote/keep by retrievability. cfg = the fsrs knob block + nowMs. */
export function planRelocations(items, cfg = {}) {
  const demote = [];
  const keep = [];
  for (const item of items) {
    const r = evaluateRetention(item, cfg);
    (r.demote ? demote : keep).push({ ...item, R: r.R, reason: r.reason });
  }
  return { demote, keep };
}

/** Scan a memory root into scoring items (reads files + ledger; mtime prior). */
export function loadItems(root = DEFAULT_MEMORY_ROOT, { nowMs = Date.now(), usageIndex } = {}) {
  if (!fs.existsSync(root)) return [];
  const usage = usageIndex || buildUsageIndex();
  return fs.readdirSync(root)
    .filter((f) => f.endsWith('.md') && !PINNED_FILES.has(f))
    .map((f) => {
      const file = path.join(root, f);
      let mtimeMs = nowMs;
      try { mtimeMs = fs.statSync(file).mtimeMs; } catch { /* keep nowMs */ }
      return buildItem(file, fs.readFileSync(file, 'utf8'), { usageIndex: usage, nowMs, mtimeMs });
    });
}

/**
 * Execute demotions: upsert each into the cold store (body verbatim), move the source
 * file into root/relocated/ (reversible), and record a relocation-index entry. dryRun
 * plans without touching anything. Returns a summary.
 */
export function executeRelocation(plan, { coldDb, root = DEFAULT_MEMORY_ROOT, dryRun = true, nowMs = Date.now() } = {}) {
  const relocatedDir = path.join(root, 'relocated');
  const indexPath = path.join(root, 'relocation-index.json');
  const moved = [];
  if (!dryRun) fs.mkdirSync(relocatedDir, { recursive: true });
  const index = (() => { try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { return { relocated: {} }; } })();

  for (const item of plan.demote) {
    if (dryRun) { moved.push({ slug: item.slug, R: item.R, dryRun: true }); continue; }
    upsertCold(coldDb, {
      slug: item.slug, title: item.title, body: item.body, trig: item.trig,
      salience: item.salience, baseStabilityDays: item.baseStabilityDays,
      crosslinks: item.crosslinks, sourcePath: item.file, reason: item.reason, nowMs,
    });
    const dest = path.join(relocatedDir, item.filename);
    fs.renameSync(item.file, dest);                       // reversible move, not delete
    index.relocated[item.slug] = { coldHome: 'memory-cold.db', relocatedFile: dest, demotedAt: Math.trunc(nowMs), R: item.R, reason: item.reason, sourcePath: item.file };
    moved.push({ slug: item.slug, R: item.R, dest });
  }
  if (!dryRun) fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
  return { demoted: moved.length, kept: plan.keep.length, moved, dryRun };
}

/** Promotion-back: restore a cold memory to the active root byte-identical, clear cold + index. */
export function promoteHot(slug, { coldDb, root = DEFAULT_MEMORY_ROOT, nowMs = Date.now() } = {}) {
  const rec = getCold(coldDb, slug);
  if (!rec) return { ok: false, reason: 'not in cold store' };
  const indexPath = path.join(root, 'relocation-index.json');
  const index = (() => { try { return JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { return { relocated: {} }; } })();
  const entry = index.relocated[slug];
  const destName = entry ? path.basename(entry.sourcePath || `${slug}.md`) : `${slug}.md`;
  const dest = path.join(root, destName);
  fs.writeFileSync(dest, rec.body);                       // restore verbatim
  removeCold(coldDb, slug);
  // remove the relocated/ copy if present, mark index promoted
  if (entry) { try { if (entry.relocatedFile && fs.existsSync(entry.relocatedFile)) fs.unlinkSync(entry.relocatedFile); } catch {} ; entry.promotedBackAt = Math.trunc(nowMs); index.relocated[slug] = entry; }
  try { fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n'); } catch {}
  return { ok: true, restored: dest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = !process.argv.includes('--execute');
  const items = loadItems();
  const cfg = { nowMs: Date.now(), rFloor: 0.6 };
  const plan = planRelocations(items, cfg);
  const db = dryRun ? null : openColdStore();
  const res = executeRelocation(plan, { coldDb: db, dryRun });
  if (db) db.close();
  console.log(JSON.stringify({ scanned: items.length, ...res, demoteSlugs: plan.demote.map((d) => `${d.slug} (R=${d.R.toFixed(2)})`) }, null, 2));
}
