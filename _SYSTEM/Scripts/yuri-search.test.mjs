#!/usr/bin/env node
// Tests for the corpus SEARCH system (FTS5/BM25). No Ollama, no live index needed —
// builds a throwaway in-memory FTS5 index to prove the mechanism + query sanitization + exclusion.
// Run: node _SYSTEM/Scripts/yuri-search.test.mjs
import assert from 'node:assert';
import Database from 'better-sqlite3';
import { buildMatch } from './yuri-search.mjs';
import { deleteDocsByPaths, determinePruneScope, included, pathInScope, resolveSearchPaths } from './yuri-search-index.mjs';

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
check('deleteDocsByPaths: batches UNINDEXED path replacement without per-row scans', () => {
  const db = new Database(':memory:');
  db.exec("CREATE VIRTUAL TABLE docs USING fts5(path UNINDEXED, title, body)");
  const insert = db.prepare('INSERT INTO docs(path,title,body) VALUES(?,?,?)');
  insert.run('a.md', 'a', 'alpha');
  insert.run('b.md', 'b', 'beta');
  insert.run('c.md', 'c', 'gamma');
  deleteDocsByPaths(db, ['a.md', 'c.md'], 1);
  assert.deepEqual(db.prepare('SELECT path FROM docs ORDER BY path').all(), [{ path: 'b.md' }]);
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
check('included: indexes Rust source + Cargo manifests', () => {
  assert.ok(included('03_NEXUS-LINK/nexus-engine/crates/nexus-core/src/lib.rs'));
  assert.ok(included('03_NEXUS-LINK/nexus-engine/Cargo.toml'));
});
check('included: excludes Rust build output under /target/', () => {
  assert.ok(!included('03_NEXUS-LINK/nexus-engine/target/debug/build/x.json'));
  assert.ok(!included('03_NEXUS-LINK/nexus-engine/target/debug/deps/foo.rs'));
});

// ── targeted refresh scope: sparse checkouts must not prune unseen corpus paths ───────────────
check('pathInScope: exact --file scope never includes unrelated corpus paths', () => {
  const scope = { files: ['_SYSTEM/config/october-capability-registry.json'] };
  assert.ok(pathInScope('_SYSTEM/config/october-capability-registry.json', scope));
  assert.ok(!pathInScope('_SYSTEM/docs/hidden-by-sparse-checkout.md', scope));
});
check('pathInScope: explicit --root scope is prefix-bounded', () => {
  const scope = { roots: ['_SYSTEM/config'] };
  assert.ok(pathInScope('_SYSTEM/config/a.json', scope));
  assert.ok(!pathInScope('_SYSTEM/configuration/a.json', scope));
  assert.ok(!pathInScope('_SYSTEM/Scripts/a.mjs', scope));
});
check('determinePruneScope: sparse default and root refreshes are additive-only', () => {
  assert.deepEqual(determinePruneScope({ sparseCheckout: true }), {});
  assert.deepEqual(determinePruneScope({ sparseCheckout: true, roots: ['_SYSTEM'] }), {});
  assert.ok(!pathInScope('_SYSTEM/docs/hidden-by-sparse-checkout.md', determinePruneScope({ sparseCheckout: true })));
});
check('determinePruneScope: explicit additive refresh never prunes a complete source', () => {
  assert.deepEqual(determinePruneScope({ additive: true }), {});
  assert.deepEqual(determinePruneScope({ additive: true, roots: ['_SYSTEM'] }), {});
  assert.throws(() => determinePruneScope({ additive: true, full: true }), /mutually exclusive/);
});
check('determinePruneScope: sparse --full is refused before schema reset', () => {
  assert.throws(
    () => determinePruneScope({ sparseCheckout: true, full: true }),
    /--full is refused in a sparse checkout/,
  );
});
check('determinePruneScope: complete sources retain explicit pruning semantics', () => {
  assert.deepEqual(determinePruneScope({ full: true }), { all: true });
  assert.deepEqual(determinePruneScope({ roots: ['_SYSTEM/config'] }), { roots: ['_SYSTEM/config'] });
  assert.deepEqual(determinePruneScope({ files: ['_SYSTEM/INDEX.md'], sparseCheckout: true }), { files: ['_SYSTEM/INDEX.md'] });
});
check('resolveSearchPaths: external staging root owns its default index output', () => {
  const paths = resolveSearchPaths({ YURI_SEARCH_REPO_ROOT: '/tmp/yuri-full-tree' }, '/repo');
  assert.equal(paths.repoRoot, '/tmp/yuri-full-tree');
  assert.equal(paths.indexDbPath, '/tmp/yuri-full-tree/_SYSTEM/OS_KERNEL/search-index.db');
  const overridden = resolveSearchPaths({ YURI_SEARCH_REPO_ROOT: '/tmp/yuri-full-tree', YURI_SEARCH_INDEX_DB: '/tmp/staged.db' }, '/repo');
  assert.equal(overridden.indexDbPath, '/tmp/staged.db');
});

if (failures === 0) { console.log('\n✓ yuri-search: all tests PASSED.'); process.exit(0); }
else { console.error(`\n✗ yuri-search: ${failures} FAILED.`); process.exit(1); }
