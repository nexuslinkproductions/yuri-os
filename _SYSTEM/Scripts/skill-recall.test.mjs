#!/usr/bin/env node
// Trio (GREEN/RED/GREY) for skill-recall.mjs. Hermetic temp fixture.
// Run: node --test _SYSTEM/Scripts/skill-recall.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanLiveSkills, tokenize, rankSkills } from './skill-recall.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'srecall-'));
  const mk = (rel, name, descLines) => {
    const d = path.join(root, rel);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${name}\n${descLines}\n---\n\n# ${name}\nbody\n`);
  };
  // inline-scalar descriptions
  mk('skills/pdf-extractor', 'pdf-extractor', 'description: Convert scanned PDF documents to markdown with OCR and table recognition.');
  mk('skills/ad-writer', 'ad-writer', 'description: Generate facebook headline variations for paid advertising campaigns.');
  // decoy that only shares the common word "documents" — must NOT outrank pdf-extractor on a PDF query
  mk('skills/note-keeper', 'note-keeper', 'description: Keep personal documents and notes organized.');
  // folded block-scalar description (the mineru class)
  mk('.claude/skills/mineru', 'mineru', 'description: >\n  High fidelity formula recognition and batch PDF parsing\n  across eighty languages including japanese and arabic.');
  return root;
}

// ======================= GREEN =======================
test('GREEN scanLiveSkills reads live skills (inline + folded descriptions)', () => {
  const skills = scanLiveSkills(fixture());
  const byName = Object.fromEntries(skills.map((s) => [s.name, s]));
  assert.ok(byName['pdf-extractor'] && byName['mineru']);
  assert.match(byName['pdf-extractor'].fm.description, /OCR/);
  assert.match(byName['mineru'].fm.description, /formula recognition/); // folded `>` block captured
});

test('GREEN tokenize drops stopwords + short tokens', () => {
  const t = tokenize('Use this to extract a PDF document');
  assert.ok(t.includes('extract') && t.includes('pdf') && t.includes('document'));
  assert.ok(!t.includes('use') && !t.includes('to') && !t.includes('a'));
});

test('GREEN rankSkills returns the fitting skill #1 for a discriminating query', () => {
  const root = fixture();
  assert.equal(rankSkills('scanned PDF table recognition OCR', { root, top: 3 })[0].name, 'pdf-extractor');
  assert.equal(rankSkills('facebook advertising headline variations', { root, top: 3 })[0].name, 'ad-writer');
});

test('GREEN empty / no-match query returns []', () => {
  const root = fixture();
  assert.deepEqual(rankSkills('', { root }), []);
  assert.deepEqual(rankSkills('zzzz qqqq', { root }), []);
});

// ======================= RED =======================
// Load-bearing property: IDF weighting makes the SPECIFIC match beat a decoy that only
// shares a common word. A vacuous/no-IDF ranker would not discriminate -> caught.
test('RED specific match beats common-word decoy (vacuous ranker is caught)', () => {
  const root = fixture();
  const real = rankSkills('PDF OCR table', { root, top: 3 });
  assert.equal(real[0].name, 'pdf-extractor');           // real ranker: specific wins
  // note-keeper shares only "documents"-ish generic content; must not top a PDF query
  assert.notEqual(real[0].name, 'note-keeper');
  // mutant: constant-score ranker (no IDF, no tf) -> insertion/alpha order, NOT pdf-extractor#1
  const skills = scanLiveSkills(root);
  const mutantTop = [...skills].sort((a, b) => a.name.localeCompare(b.name))[0].name; // 'ad-writer'
  assert.notEqual(mutantTop, real[0].name);              // the test discriminates real from mutant
});

// ======================= GREY =======================
// 1) self-recall invariant (independent of the exact BM25 constants): a skill's own
//    description, used as the query, must recall that skill #1.
test('GREY self-recall: each skill description recalls its own skill #1', () => {
  const root = fixture();
  const skills = scanLiveSkills(root);
  for (const s of skills) {
    const top = rankSkills(s.fm.description, { root, top: 1 });
    assert.equal(top[0]?.name, s.name, `self-recall failed for ${s.name}`);
  }
});

// 2) substring oracle (independent of scoring): a query content-token appears in the
//    top hit's name or description.
test('GREY top hit shares a real query token with its text (substring oracle)', () => {
  const root = fixture();
  const q = 'scanned PDF document OCR';
  const top = rankSkills(q, { root, top: 1 })[0];
  const hay = (top.name + ' ' + top.description).toLowerCase();
  assert.ok(tokenize(q).some((t) => hay.includes(t)));
});

// 3) metamorphic: appending an irrelevant stopword does not change the #1 result.
test('GREY metamorphic: irrelevant stopword does not change #1', () => {
  const root = fixture();
  const a = rankSkills('PDF OCR table', { root, top: 1 })[0].name;
  const b = rankSkills('PDF OCR table the of to', { root, top: 1 })[0].name;
  assert.equal(a, b);
});
