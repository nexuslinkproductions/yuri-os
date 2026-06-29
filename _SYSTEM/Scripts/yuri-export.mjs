#!/usr/bin/env node
/**
 * yuri-export.mjs — materialize YURI Core invite repo from private monorepo.
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-export.mjs --dry-run
 *   node _SYSTEM/Scripts/yuri-export.mjs --out /tmp/yuri-core-export --apply
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const MANIFEST_PATH = join(REPO_ROOT, '_SYSTEM/config/export-manifest.json');

function loadManifest() {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'graphify-out', '.gitnexus', 'debug']);

function walkDir(dir, base, depth = 0) {
  const out = [];
  if (!existsSync(dir) || depth > 20) return out;
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = lstatSync(full); } catch { continue; }
    const rel = relative(base, full).split(sep).join('/');
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walkDir(full, base, depth + 1));
    else out.push(rel);
  }
  return out;
}

function globMatch(rel, pattern) {
  const re = new RegExp(
    '^' + pattern.replace(/\*\*/g, '§§').replace(/\*/g, '[^/]*').replace(/§§/g, '.*').replace(/\./g, '\\.') + '$'
  );
  return re.test(rel) || rel.startsWith(pattern.replace(/\*\*$/, '').replace(/\*$/, ''));
}

function matchesAny(rel, patterns = []) {
  return patterns.some((p) => {
    if (p.endsWith('/')) return rel.startsWith(p) || rel.startsWith(p.slice(0, -1));
    if (p.includes('*')) return globMatch(rel, p);
    return rel === p || rel.startsWith(p + '/');
  });
}

function shouldInclude(rel, manifest) {
  const { include, exclude } = manifest;
  if (matchesAny(rel, exclude.directories)) return false;
  if (matchesAny(rel, exclude.globs)) return false;
  if (exclude.files.includes(rel)) return false;
  if (include.roots.includes(rel)) return true;
  if (matchesAny(rel, include.directories)) return true;
  if (matchesAny(rel, include.globs)) return true;
  return false;
}

function scrubContent(text, manifest) {
  let out = text;
  for (const pat of manifest.scrub.pathPatterns) {
    out = out.split(pat).join(manifest.scrub.replacePathWith);
  }
  if (manifest.scrub.replaceHomeWith) {
    out = out.replace(/\/Users\/[^/\s"'`]+/g, manifest.scrub.replaceHomeWith);
  }
  for (const name of manifest.scrub.namePatterns) {
    out = out.replace(new RegExp(name, 'gi'), 'yuri-legacy');
  }
  for (const ip of manifest.scrub.ipPatterns || []) {
    out = out.replace(new RegExp(ip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[persona-overlay-removed]');
  }
  out = out.replace(/\bRick C-137\b/gi, '[persona-overlay-removed]');
  out = out.replace(/\bRick Sanchez\b/gi, '[persona-overlay-removed]');
  return out;
}

function isTextFile(rel) {
  return /\.(md|mjs|js|json|sh|yaml|yml|txt|html|css|ts|tsx|jsx|svg|example|template)$/i.test(rel);
}

export function planExport(manifest = loadManifest()) {
  const selectedSet = new Set();

  for (const root of manifest.include.roots) {
    const abs = join(REPO_ROOT, root);
    if (existsSync(abs)) selectedSet.add(root);
  }

  for (const dir of manifest.include.directories) {
    const abs = join(REPO_ROOT, dir.replace(/\/$/, ''));
    if (!existsSync(abs)) continue;
    for (const rel of walkDir(abs, REPO_ROOT)) {
      if (shouldInclude(rel, manifest)) selectedSet.add(rel);
    }
  }

  // Glob pass over _SYSTEM/Scripts only (bounded)
  const scriptsDir = join(REPO_ROOT, '_SYSTEM/Scripts');
  if (existsSync(scriptsDir)) {
    for (const rel of walkDir(scriptsDir, REPO_ROOT)) {
      if (shouldInclude(rel, manifest)) selectedSet.add(rel);
    }
  }

  const selected = [...selectedSet].sort();
  return { total: selected.length, selected: selected.length, files: selected };
}

export function runExport(opts = {}) {
  const manifest = loadManifest();
  const plan = planExport(manifest);

  if (opts.dryRun) {
    return { dryRun: true, ...plan };
  }

  const outRoot = opts.out;
  if (!outRoot) throw new Error('--out required with --apply');

  mkdirSync(outRoot, { recursive: true });
  let copied = 0;
  let scrubbed = 0;

  for (const rel of plan.files) {
    const src = join(REPO_ROOT, rel);
    if (!existsSync(src)) continue;
    const dest = join(outRoot, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (isTextFile(rel)) {
      const text = readFileSync(src, 'utf8');
      const next = scrubContent(text, manifest);
      if (next !== text) scrubbed++;
      writeFileSync(dest, next, 'utf8');
    } else {
      cpSync(src, dest);
    }
    copied++;
  }

  const soulStub = join(REPO_ROOT, '_SYSTEM/reports/SOUL.md.export-stub');
  if (existsSync(soulStub)) {
    writeFileSync(join(outRoot, 'SOUL.md'), readFileSync(soulStub, 'utf8'), 'utf8');
  }

  return { dryRun: false, outRoot, copied, scrubbed, ...plan };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  const apply = args.includes('--apply');
  const result = apply && out ? runExport({ out, dryRun: false }) : runExport({ dryRun: true });
  console.log(JSON.stringify(result, null, 2));
}
