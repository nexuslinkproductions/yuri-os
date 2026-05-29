#!/usr/bin/env node
// Tests for the corpus SEARCH system (FTS5/BM25). No Ollama, no live index needed —
// builds a throwaway in-memory FTS5 index to prove the mechanism + query sanitization + exclusion.
// Run: node _SYSTEM/Scripts/yuri-search.test.mjs
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { buildMatch } from './yuri-search.mjs';
import { included } from './yuri-search-index.mjs';

let failures = 0;
function check(label, fn) {
  try { fn(); console.log(`PASS ${label}`); }
  catch (e) { console.error(`FAIL ${label}: ${e.message}`); failures++; }
}

// ── buildMatch: safe FTS5 expression from arbitrary input ───────────────────────
check('buildMatch: OR of terms', () => assert.equal(buildMatch('energy substrate'), '"energy" OR "substrate"'));
check('buildMatch: phrase when quoted', () => assert.equal(buildMatch('"exact phrase"'), '"exact phrase"'));
check('buildMatch: strips FTS specials (no syntax crash)', () => {
  const m = buildMatch('foo- bar* (baz)');
  // must not throw when used as MATCH
  const db = new Database(':memory:');
  db.exec("CREATE VIRTUAL TABLE t USING fts5(b)");
  db.prepare('INSERT INTO t VALUES(?)').run('foo bar baz');
  assert.doesNotThrow(() => db.prepare('SELECT count(*) c FROM t WHERE t MATCH ?').all(m));
  db.close();
});
check('buildMatch: empty/short → null', () => { assert.equal(buildMatch(''), null); assert.equal(buildMatch('a'), null); });

// ── FTS5 round-trip + bm25 ranking ──────────────────────────────────────────────
check('FTS5 indexes + bm25 ranks the more-relevant doc first', () => {
  const db = new Database(':memory:');
  db.exec("CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, title, body, tokenize='porter unicode61')");
  const ins = db.prepare('INSERT INTO docs (path,title,body) VALUES (?,?,?)');
  ins.run('a.md', 'energy', 'energy substrate descent demo energy energy');
  ins.run('b.md', 'misc', 'a passing mention of energy once');
  ins.run('c.md', 'unrelated', 'nothing to see here about cats');
  const rows = db.prepare(
    `SELECT path, bm25(docs) rank FROM docs WHERE docs MATCH ? ORDER BY rank LIMIT 5`
  ).all(buildMatch('energy substrate'));
  assert.ok(rows.length >= 2, 'should match a + b');
  assert.equal(rows[0].path, 'a.md', 'denser-match doc ranks first');
  assert.ok(!rows.find(r => r.path === 'c.md'), 'unrelated doc excluded');
  db.close();
});

// ── included(): protected + junk exclusion ──────────────────────────────────────
check('included: indexes real docs', () => {
  assert.ok(included('_SYSTEM/reports/foo.md'));
  assert.ok(included('skills/bar/SKILL.md'));
});
check('included: excludes protected + junk + binaries', () => {
  assert.ok(!included('backend/data/yuri.db'));
  assert.ok(!included('.claude/state/session-state.json'));
  assert.ok(!included('.claude/projects/x/transcript.jsonl'));
  assert.ok(!included('node_modules/lodash/index.js'));
  assert.ok(!included('_SYSTEM/archive/legacy-purge-2026-05/x.md'));
  assert.ok(!included('.env'));
  assert.ok(!included('_SYSTEM/reports/diagram.png'));   // not an indexed extension
});

if (failures === 0) { console.log('\n✓ yuri-search: all tests PASSED.'); process.exit(0); }
else { console.error(`\n✗ yuri-search: ${failures} FAILED.`); process.exit(1); }
