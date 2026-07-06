import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openColdStore, upsertCold, queryCold, getCold, removeCold, coldCount } from './memory-cold-store.mjs';

const freshDb = () => openColdStore(':memory:');

test('upsert + query: a relocated memory is cue-matchable by its terms (BM25)', () => {
  const db = freshDb();
  upsertCold(db, { slug: 'energy-gate', title: 'Energy gate', body: 'The Lyapunov energy gate rejects ascending transitions.', trig: 'energy gate lyapunov', salience: 1.5 });
  const hits = queryCold(db, 'lyapunov energy');
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].slug, 'energy-gate');
  assert.equal(hits[0].salience, 1.5);
  db.close();
});

test('non-matching cue surfaces nothing — recall must be able to return zero', () => {
  const db = freshDb();
  upsertCold(db, { slug: 'x', body: 'apples and oranges' });
  assert.deepEqual(queryCold(db, 'quantum chromodynamics'), []);
  assert.deepEqual(queryCold(db, ''), []);
  db.close();
});

test('body preserved VERBATIM (silent engram); getCold + removeCold round-trip', () => {
  const db = freshDb();
  const body = 'EXACT BODY\nwith newlines & symbols ⟦test⟧ 100%';
  upsertCold(db, { slug: 'verb', title: 'Verbatim', body, crosslinks: ['a', 'b'] });
  const got = getCold(db, 'verb');
  assert.equal(got.body, body);                 // byte-identical — nothing lost
  assert.equal(got.crosslinks, 'a,b');
  removeCold(db, 'verb');
  assert.equal(getCold(db, 'verb'), null);
  assert.equal(coldCount(db), 0);
  db.close();
});

test('upsert is idempotent per slug (relocating twice keeps one row, newest body)', () => {
  const db = freshDb();
  upsertCold(db, { slug: 'dup', body: 'v1' });
  upsertCold(db, { slug: 'dup', body: 'v2 newer' });
  assert.equal(coldCount(db), 1);
  assert.equal(getCold(db, 'dup').body, 'v2 newer');
  db.close();
});

test('upsertCold rejects a missing slug (fail-closed)', () => {
  const db = freshDb();
  assert.throws(() => upsertCold(db, { body: 'no slug' }));
  db.close();
});
