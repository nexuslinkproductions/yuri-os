#!/usr/bin/env node
// Integration trio (GREEN/RED/GREY) for the skill-recall fusion into xref-query.mjs.
// The rankSkills engine has its own unit trio (skill-recall.test.mjs); this covers the
// WIRING SEAM: that xref actually surfaces a live skill, gates noise, and never points at
// a non-existent/archive path. Runs xref as a subprocess against the real corpus.
// Run: node --test _SYSTEM/Scripts/xref-query.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XREF = path.join(__dirname, 'xref-query.mjs');
const ROOT = path.resolve(__dirname, '../..');

function xref(query) {
  try {
    return execFileSync('node', [XREF, query, '--top', '2'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    // xref may exit non-zero on some surfaces; we still get stdout
    return (e.stdout || '') + (e.stderr || '');
  }
}

// ======================= GREEN =======================
test('GREEN xref surfaces the 🎯 SKILL section with the fitting live skill', () => {
  const out = xref('extract text and tables from a PDF document with OCR');
  assert.match(out, /🎯 SKILL FOR THIS TASK/);
  assert.match(out, /\/mineru-document-extractor/);
});

// ======================= RED =======================
// Noise gate (score >= 4): a query about code internals must NOT surface a skill.
// A broken/ungated impl would show the section for everything -> caught here.
test('RED code-internals query does NOT surface a spurious skill (gate works)', () => {
  const out = xref('better-sqlite3 prepared statement wal checkpoint pragma');
  assert.doesNotMatch(out, /🎯 SKILL FOR THIS TASK/);
});

// ======================= GREY =======================
// Independent oracle: every skill the seam surfaces must resolve to a REAL live skill
// directory (skills/ or .claude/skills/) — never an archive/backup path or a dangler.
test('GREY every surfaced skill resolves to a live skill dir (no archive/phantom)', () => {
  const out = xref('generate facebook ad headline variations at scale');
  const names = [...out.matchAll(/^\s*▸ \/([a-z0-9-]+) —/gm)].map((m) => m[1]);
  assert.ok(names.length >= 1, 'expected at least one surfaced skill');
  for (const n of names) {
    const live = existsSync(path.join(ROOT, 'skills', n, 'SKILL.md')) ||
                 existsSync(path.join(ROOT, '.claude/skills', n, 'SKILL.md'));
    assert.ok(live, `surfaced skill /${n} is not a live skill dir`);
  }
});
