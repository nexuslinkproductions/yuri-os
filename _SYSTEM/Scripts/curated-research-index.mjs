#!/usr/bin/env node
/**
 * curated-research-index.mjs — build PUBLIC-RESEARCH index manifest for export.
 *
 * Usage:
 *   node _SYSTEM/Scripts/curated-research-index.mjs
 *   node _SYSTEM/Scripts/curated-research-index.mjs --verify
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MANIFEST = join(REPO_ROOT, '_SYSTEM/config/curated-research-manifest.json');
const OUT_DIR = join(REPO_ROOT, '02_RESOURCES/PUBLIC-RESEARCH');
const INDEX_OUT = join(OUT_DIR, 'index.json');

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(REPO_ROOT, full);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else if (/\.(md|json)$/i.test(name)) out.push(rel);
  }
  return out;
}

function shouldExclude(rel, excludePatterns) {
  return excludePatterns.some((p) => {
    const re = new RegExp('^' + p.replace(/\*/g, '.*').replace(/\//g, '\\/'));
    return re.test(rel);
  });
}

export function buildIndex() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const entries = [];

  for (const src of manifest.sources) {
    const abs = join(REPO_ROOT, src.path);
    if (!existsSync(abs)) continue;
    let files = [];
    const st = statSync(abs);
    if (st.isDirectory()) {
      files = walk(abs).filter((f) => !shouldExclude(f, manifest.exclude));
    } else if (/\.(md|json)$/i.test(abs)) {
      const rel = relative(REPO_ROOT, abs);
      if (!shouldExclude(rel, manifest.exclude)) files = [rel];
    }
    for (const f of files) {
      entries.push({ path: f, source: src.path, score: src.score, reason: src.reason });
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const index = {
    generatedAt: new Date().toISOString(),
    count: entries.length,
    entries,
  };
  writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2), 'utf8');
  return index;
}

export function verifyIndex() {
  const index = JSON.parse(readFileSync(INDEX_OUT, 'utf8'));
  const leaks = [];
  for (const e of index.entries) {
    const text = readFileSync(join(REPO_ROOT, e.path), 'utf8');
    if (/marcelspatz|\/Users\/marcel|bug-bounty|Deadpool|Rick Sanchez/i.test(text)) {
      leaks.push(e.path);
    }
  }
  return { ok: leaks.length === 0, count: index.count, leaks };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes('--verify')) {
    console.log(JSON.stringify(verifyIndex(), null, 2));
  } else {
    console.log(JSON.stringify(buildIndex(), null, 2));
  }
}
