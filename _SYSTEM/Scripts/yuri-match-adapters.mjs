#!/usr/bin/env node
/**
 * yuri-match-adapters.mjs — pure {id,text} loaders for universal YURI matching.
 *
 * These adapters do not build a matcher index and do not mutate any registry. They only turn
 * existing YURI surfaces into deterministic, clipped records that a future yuri-match service can
 * register. Protected runtime/private surfaces are skipped by construction.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCircuitryRecords } from './circuitry-auto-register.mjs';
import { loadFtsCorpus } from './corpus-match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const MAX_TEXT_CHARS = 2000;
export const DEFAULT_DOC_DB = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'search-index.db');
export const DEFAULT_GRAPH_PATH = path.join(REPO_ROOT, '02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');

export const PROTECTED_PREFIXES = [
  'backend/data/',
  '.claude/state/',
  '.claude/history/',
  '.claude/file-history/',
  '.claude/projects/',
  '.env',
  'node_modules/',
  '.amp/',
];

export const protectedSkips = [];

function normRel(p) {
  return String(p || '').replaceAll(path.sep, '/').replace(/^\.\//, '');
}

export function isProtectedRel(rel) {
  const n = normRel(rel);
  return PROTECTED_PREFIXES.some((p) => {
    const base = p.replace(/\/$/, '');
    return n === base || n.startsWith(p);
  });
}

function recordSkip(rel, reason = 'protected') {
  const normalized = normRel(rel);
  if (!protectedSkips.some((s) => s.path === normalized && s.reason === reason)) {
    protectedSkips.push({ path: normalized, reason });
  }
}

function containedAbs(input, label = 'path') {
  const abs = path.resolve(REPO_ROOT, input);
  const root = fs.realpathSync(REPO_ROOT);
  let real;
  try { real = fs.realpathSync(abs); } catch { real = abs; }
  if (real !== root && !real.startsWith(root + path.sep)) {
    throw new Error(`${label} escapes repo: ${input}`);
  }
  return real;
}

function sanitizeProtectedMentions(s) {
  let out = String(s || '');
  for (const prefix of PROTECTED_PREFIXES) {
    const bare = prefix.replace(/\/$/, '');
    out = out.split(prefix).join('[protected-path]/');
    out = out.split(bare).join('[protected-path]');
  }
  return out;
}

function clip(s, limit = MAX_TEXT_CHARS) {
  return sanitizeProtectedMentions(s).replace(/\s+/g, ' ').trim().slice(0, limit);
}

function readTextRel(rel, { maxChars = MAX_TEXT_CHARS } = {}) {
  const normalized = normRel(rel);
  if (isProtectedRel(normalized)) {
    recordSkip(normalized);
    return '';
  }
  const abs = containedAbs(normalized, 'read');
  try {
    return fs.readFileSync(abs, 'utf8').slice(0, maxChars);
  } catch {
    return '';
  }
}

function walkFiles(rootRel, predicate) {
  const root = normRel(rootRel);
  if (isProtectedRel(root) || isProtectedRel(root + '/')) {
    recordSkip(root);
    return [];
  }
  const absRoot = containedAbs(root, 'root');
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = normRel(path.relative(REPO_ROOT, abs));
      if (isProtectedRel(rel) || isProtectedRel(rel + '/')) {
        recordSkip(rel);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(abs);
      } else if (entry.isFile() && predicate(rel, entry.name)) {
        out.push(rel);
      }
    }
  };
  walk(absRoot);
  return out.sort();
}

function uniqueRecords(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    const id = String(r.id || '').trim();
    const text = clip(r.text);
    if (!id || !text || seen.has(id) || isProtectedRel(id)) {
      if (isProtectedRel(id)) recordSkip(id);
      continue;
    }
    seen.add(id);
    out.push({ id, text });
  }
  return out;
}

export function codeAdapter({ roots = ['_SYSTEM/Scripts'] } = {}) {
  const safeRoots = roots.filter((root) => {
    if (isProtectedRel(root) || isProtectedRel(root + '/')) {
      recordSkip(root);
      return false;
    }
    return true;
  });
  const { modules, symbols, tests } = extractCircuitryRecords({ roots: safeRoots });
  return uniqueRecords([...modules, ...symbols, ...tests].map((r) => ({ id: r.id, text: r.text })));
}

export function graphAdapter({ graphPath = DEFAULT_GRAPH_PATH } = {}) {
  const rel = normRel(path.relative(REPO_ROOT, path.resolve(graphPath)));
  if (isProtectedRel(rel)) {
    recordSkip(rel);
    return [];
  }
  let graph;
  try { graph = JSON.parse(fs.readFileSync(containedAbs(rel, 'graph'), 'utf8')); } catch { return []; }
  const records = (graph.nodes || []).map((node) => {
    const files = Array.isArray(node.files) ? node.files.filter((f) => {
      if (isProtectedRel(f)) {
        recordSkip(f, 'protected-graph-reference');
        return false;
      }
      return true;
    }) : [];
    return {
      id: String(node.id || ''),
      text: clip(`${node.label || ''} ${node.description || ''} ${files.join(' ')}`),
    };
  });
  return uniqueRecords(records);
}

function frontmatterField(body, field) {
  const fm = body.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return '';
  const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
  const m = fm[1].match(re);
  return m ? m[1].replace(/^["']|["']$/g, '').trim() : '';
}

export function skillAdapter({ roots = ['.claude/skills', '.agents/skills'] } = {}) {
  const records = [];
  for (const root of roots) {
    for (const rel of walkFiles(root, (_rel, name) => name === 'SKILL.md')) {
      const body = readTextRel(rel);
      const name = frontmatterField(body, 'name') || path.basename(path.dirname(rel));
      const description = frontmatterField(body, 'description');
      records.push({ id: rel, text: clip(`${name} ${description} ${body}`) });
    }
  }
  return uniqueRecords(records);
}

export function memoryAdapter({ root = '_SYSTEM/memory', trackBRoot = null } = {}) {
  const roots = [root];
  if (trackBRoot) roots.push(trackBRoot);
  const records = [];
  for (const r of roots) {
    for (const rel of walkFiles(r, (_rel, name) => name.endsWith('.md'))) {
      const body = readTextRel(rel);
      records.push({ id: rel, text: clip(`${rel} ${body}`) });
    }
  }
  return uniqueRecords(records);
}

export function docAdapter({ dbPath = DEFAULT_DOC_DB, limit } = {}) {
  const rel = normRel(path.relative(REPO_ROOT, path.resolve(dbPath)));
  if (isProtectedRel(rel)) {
    recordSkip(rel);
    return [];
  }
  const abs = containedAbs(rel, 'doc db');
  if (!fs.existsSync(abs)) return [];
  const rows = loadFtsCorpus(abs, 'docs', { idCol: 'path', textCols: ['title', 'body'], limit });
  return uniqueRecords(rows.map((r) => ({ id: r.id, text: r.text })));
}

export function allAdapters(options = {}) {
  return {
    code: () => codeAdapter(options.code || {}),
    graph: () => graphAdapter(options.graph || {}),
    skills: () => skillAdapter(options.skills || {}),
    memory: () => memoryAdapter(options.memory || {}),
    docs: () => docAdapter(options.docs || {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = allAdapters();
  for (const [name, loader] of Object.entries(registry)) {
    const records = loader();
    console.log(`${name}\t${records.length}`);
  }
  if (protectedSkips.length) {
    console.log(`protectedSkips\t${protectedSkips.length}`);
  }
}
