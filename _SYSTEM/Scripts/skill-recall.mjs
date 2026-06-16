#!/usr/bin/env node
// @capability: skill-recall
// @serves: which skill for this task | surface the right skill | find a skill for a query | skill discovery | recall a skill by need
// @does: BM25+IDF recall over the LIVE skill corpus (skills/ + .claude/skills/ frontmatter only); ranks the skill that fits a task query — ignores archive/backup roots
// @use: to find the live YURI skill that matches a task BEFORE building anything, or to fuse a "skill for this task" pass into navigation — direct file read, no FTS index / no embeddings / no reindex dependency
// @exports: scanLiveSkills, tokenize, rankSkills
//
// WHY (2026-06-16): xref/FTS surfaced ARCHIVED skill copies (_SYSTEM/archive/…,
// external-root-backups/…) for task queries while the live skill that fits never
// appeared — a discovery failure, not an authoring one. This reads the LIVE skill
// frontmatter at query time and ranks by BM25 over name+description, so the right
// live skill surfaces. No embedding model, no FTS index, no reindex needed.

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const SKILL_ROOTS = ['skills', '.claude/skills']; // LIVE roots only — archive/backup excluded by construction

const STOP = new Set('a an the of to for and or in on with use when this that you your is are be it as at by from into use using uses skill skills'.split(' '));

export function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function parseFrontmatter(raw) {
  raw = raw.replace(/^﻿/, '');
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!m) return null;
  const lines = m[1].split('\n');
  // capture a top-level key: inline scalar OR a YAML folded/literal block (>, |) whose
  // continuation lines are indented. mineru et al. put their rich description in `>` blocks.
  const grab = (k) => {
    const i = lines.findIndex((l) => new RegExp('^' + k + ':').test(l));
    if (i === -1) return null;
    const head = lines[i].slice(k.length + 1).trim();
    if (head && !/^[>|][+-]?$/.test(head)) return head.replace(/^["']/, '').replace(/["']$/, '');
    // block scalar: gather indented continuation lines until a non-indented / next-key line
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j]) || lines[j].trim() === '') out.push(lines[j].trim());
      else break;
    }
    return out.join(' ').trim() || null;
  };
  return { name: grab('name'), description: grab('description') };
}

export function scanLiveSkills(root = REPO_ROOT) {
  const byName = new Map();
  for (const sr of SKILL_ROOTS) {
    const abs = path.join(root, sr);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skp = path.join(abs, e.name, 'SKILL.md');
      if (!existsSync(skp)) continue;
      const fm = parseFrontmatter(readFileSync(skp, 'utf8')) || {};
      const text = [e.name.replace(/-/g, ' '), fm.name || '', fm.description || ''].join(' ');
      const prev = byName.get(e.name);
      // prefer the copy whose frontmatter actually parsed a description (published > stale)
      if (!prev || (!prev.fm.description && fm.description)) {
        byName.set(e.name, { name: e.name, fm, path: `${sr}/${e.name}/SKILL.md`, tokens: tokenize(text) });
      }
    }
  }
  return [...byName.values()];
}

// Compact BM25 over the live skill corpus + a small exact-name bonus.
export function rankSkills(query, { root = REPO_ROOT, top = 5, skills = null } = {}) {
  const corpus = skills || scanLiveSkills(root);
  const qTerms = [...new Set(tokenize(query))];
  if (!qTerms.length || !corpus.length) return [];
  const N = corpus.length;
  const avgdl = corpus.reduce((s, d) => s + d.tokens.length, 0) / N || 1;
  // document frequency per query term
  const df = new Map();
  for (const t of qTerms) {
    let c = 0;
    for (const d of corpus) if (d.tokens.includes(t)) c++;
    df.set(t, c);
  }
  const k1 = 1.5, b = 0.75;
  const qNorm = query.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const scored = corpus.map((d) => {
    const dl = d.tokens.length || 1;
    const tf = new Map();
    for (const t of d.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of qTerms) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      const n = df.get(t);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5)); // BM25 idf, always > 0
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    // exact skill-name / phrase bonus (keyword channel the CSO descriptions sharpen)
    if (d.name.replace(/-/g, ' ') === qNorm) score += 3;
    else if (qNorm.includes(d.name.replace(/-/g, ' '))) score += 1.5;
    return { name: d.name, score, description: (d.fm.description || '').slice(0, 160), path: d.path };
  });
  return scored.filter((s) => s.score > 0).sort((a, b2) => b2.score - a.score).slice(0, top);
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || !argv.length) {
    process.stdout.write('skill-recall — find the LIVE skill that fits a task\n\n  skill-recall.mjs "<query>" [--top N] [--json]\n');
    process.exit(0);
  }
  const json = argv.includes('--json');
  const topIdx = argv.indexOf('--top');
  const top = topIdx !== -1 ? parseInt(argv[topIdx + 1], 10) || 5 : 5;
  const query = argv.filter((a, i) => !a.startsWith('--') && !(topIdx !== -1 && i === topIdx + 1)).join(' ');
  const hits = rankSkills(query, { top });
  if (json) { process.stdout.write(JSON.stringify(hits, null, 2) + '\n'); process.exit(0); }
  if (!hits.length) { process.stdout.write(`no live skill matched "${query}"\n`); process.exit(0); }
  process.stdout.write(`🎯 SKILL FOR THIS TASK — "${query}":\n\n`);
  for (const h of hits) process.stdout.write(`  ${h.score.toFixed(2)}  /${h.name}\n        ${h.description}\n`);
}
