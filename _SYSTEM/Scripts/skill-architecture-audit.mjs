#!/usr/bin/env node
// @capability: skill-arch-audit
// @serves: audit skill quality | grade skill architecture | is this skill well-formed | skill lint | skill eval harness | which skills need fixing | skill quality gate
// @does: grades every LIVE skill against Matt-Pocock + YURI doctrine (byte-0 frontmatter, CSO description, size/progressive-disclosure, published-not-stranded, session-notes); emits PASS/WARN/FAIL + CI exit code
// @use: to find skills that won't route or are poorly architected, as a pre-ship quality gate, or in CI; the eval/quality complement to skill-recall (discovery) and skill-security-gate (SAST)
// @exports: auditSkill, auditAll, RULES
//
// Failure-anchored (2026-06-16): the FRONTMATTER_AT_BYTE0 rule exists because 12
// openclaw-absorbed skills carried a pre-frontmatter comment that made them invisible
// to the harness Skill-tool despite rich descriptions. This linter re-catches that class.

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const CANON = 'skills';
const PUBLISHED_ROOTS = ['.agents/skills', '.claude/skills'];

// severity: FAIL = skill will not route / is structurally broken; WARN = quality/architecture smell.
export const RULES = [
  'FRONTMATTER_AT_BYTE0', 'HAS_NAME', 'HAS_DESCRIPTION', // FAIL-class
  'DESC_LENGTH', 'DESC_HAS_TRIGGER', 'SIZE', 'PUBLISHED', 'HAS_SESSION_NOTES', // WARN-class
];
const FAIL_RULES = new Set(['FRONTMATTER_AT_BYTE0', 'HAS_NAME', 'HAS_DESCRIPTION']);

function frontmatterBlock(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  return m ? m[1] : null;
}
function grabKey(block, k) {
  const lines = block.split('\n');
  const i = lines.findIndex((l) => new RegExp('^' + k + ':').test(l));
  if (i === -1) return null;
  const head = lines[i].slice(k.length + 1).trim();
  if (head && !/^[>|][+-]?$/.test(head)) return head.replace(/^["']/, '').replace(/["']$/, '');
  const out = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^\s+\S/.test(lines[j]) || lines[j].trim() === '') out.push(lines[j].trim());
    else break;
  }
  return out.join(' ').trim() || null;
}

// Audit a canonical body plus whether at least one harness discovery adapter exists.
export function auditSkill(skillPath, { published = true } = {}) {
  const raw = readFileSync(skillPath, 'utf8').replace(/^﻿/, '');
  const findings = [];
  const add = (rule, ok, detail) => findings.push({ rule, ok, severity: FAIL_RULES.has(rule) ? 'FAIL' : 'WARN', detail });

  const byte0 = /^---\s*\n/.test(raw);
  add('FRONTMATTER_AT_BYTE0', byte0, byte0 ? '' : 'frontmatter fence not at byte 0 — Skill-tool cannot read it');

  const block = byte0 ? frontmatterBlock(raw) : (frontmatterBlock(raw) || '');
  const name = block ? grabKey(block, 'name') : null;
  const desc = block ? grabKey(block, 'description') : null;
  add('HAS_NAME', !!name, name ? '' : 'no name: in frontmatter');
  add('HAS_DESCRIPTION', !!desc, desc ? '' : 'no description: in frontmatter');

  const dl = (desc || '').length;
  add('DESC_LENGTH', dl >= 40 && dl <= 1024, dl < 40 ? `description too thin (${dl} chars)` : dl > 1024 ? `description ${dl} > 1024 (Pocock cap)` : '');
  const trig = /\b(use (this|when|it)|when (the user|you)|invoke when|reach for)\b/i.test(desc || '');
  add('DESC_HAS_TRIGGER', trig, trig ? '' : 'description has no trigger phrase ("Use when…") — weak CSO routing');

  const lines = raw.split('\n').length;
  const sizeOk = lines <= 150;
  add('SIZE', sizeOk, sizeOk ? '' : lines > 400 ? `${lines} lines — bloated, split into a kit (SKILL.md <100 + refs)` : `${lines} lines — consider progressive disclosure (<150)`);

  add('PUBLISHED', published, published ? '' : 'in skills/ but absent from native discovery adapters — no harness can route it');

  const hasNotes = /^##\s+Session Notes/m.test(raw);
  add('HAS_SESSION_NOTES', hasNotes, hasNotes ? '' : 'no "## Session Notes" section (YURI skill-creation rule)');

  const fails = findings.filter((f) => !f.ok && f.severity === 'FAIL');
  const warns = findings.filter((f) => !f.ok && f.severity === 'WARN');
  const grade = fails.length ? 'FAIL' : warns.length ? 'WARN' : 'PASS';
  // identity is the DIRECTORY name (what the harness routes on), not the frontmatter name
  // (which can collide or differ, e.g. dir mineru-document-extractor vs name "MinerU …").
  return { name: path.basename(path.dirname(skillPath)), fmName: name, grade, fails, warns, findings, lines };
}

export function auditAll(root = REPO_ROOT) {
  const canonAbs = path.join(root, CANON);
  const pubNames = new Set();
  for (const publishedRoot of PUBLISHED_ROOTS) {
    const rootPath = path.join(root, publishedRoot);
    if (!existsSync(rootPath)) continue;
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(path.join(rootPath, entry.name, 'SKILL.md'))) {
        pubNames.add(entry.name);
      }
    }
  }
  const results = [];
  if (existsSync(canonAbs)) {
    for (const e of readdirSync(canonAbs, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const skp = path.join(canonAbs, e.name, 'SKILL.md');
      if (!existsSync(skp)) continue;
      results.push(auditSkill(skp, { published: pubNames.has(e.name) }));
    }
  }
  results.sort((a, b) => (a.grade === b.grade ? a.name.localeCompare(b.name) : (a.grade === 'FAIL' ? -1 : b.grade === 'FAIL' ? 1 : a.grade === 'WARN' ? -1 : 1)));
  const summary = {
    total: results.length,
    pass: results.filter((r) => r.grade === 'PASS').length,
    warn: results.filter((r) => r.grade === 'WARN').length,
    fail: results.filter((r) => r.grade === 'FAIL').length,
  };
  return { summary, results };
}

// --- CLI --------------------------------------------------------------------
function isMain() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (isMain()) {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('skill-architecture-audit — grade live skills (byte-0 frontmatter, CSO desc, size, published, session-notes)\n\n  skill-architecture-audit.mjs [--json] [--fail-only] [--warn]\n  exit 1 if any skill FAILs (CI gate).\n');
    process.exit(0);
  }
  const json = argv.includes('--json');
  const failOnly = argv.includes('--fail-only');
  const showWarn = argv.includes('--warn');
  const { summary, results } = auditAll();
  if (json) { process.stdout.write(JSON.stringify({ summary, results }, null, 2) + '\n'); process.exit(summary.fail ? 1 : 0); }
  process.stdout.write(`skill-architecture-audit: ${summary.total} skills — ✅ ${summary.pass} PASS · ⚠️  ${summary.warn} WARN · ❌ ${summary.fail} FAIL\n\n`);
  for (const r of results) {
    if (r.grade === 'PASS') continue;
    if (failOnly && r.grade !== 'FAIL') continue;
    if (r.grade === 'WARN' && !showWarn && !failOnly) { /* summarize warns unless --warn */ }
    const icon = r.grade === 'FAIL' ? '❌' : '⚠️ ';
    if (r.grade === 'FAIL' || showWarn) {
      process.stdout.write(`${icon} ${r.name} (${r.lines}L)\n`);
      for (const f of [...r.fails, ...r.warns]) process.stdout.write(`     ${f.severity === 'FAIL' ? '✗' : '·'} ${f.rule}: ${f.detail}\n`);
    }
  }
  if (!showWarn && !failOnly && summary.warn) process.stdout.write(`\n(${summary.warn} WARN skills hidden — pass --warn to list, --fail-only for FAILs only)\n`);
  process.exit(summary.fail ? 1 : 0);
}
