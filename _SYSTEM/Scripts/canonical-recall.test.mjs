// _SYSTEM/Scripts/canonical-recall.test.mjs
// Peer-open recall surface. drainOnce needs a lease -> isolated leases dir:
//   YURI_NANO_LEASES_DIR=$(mktemp -d) node --test _SYSTEM/Scripts/canonical-recall.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { appendClaim, drainOnce } from './memory-canonical-store.mjs';
import { recallCanonical, recallByKey, recallBySubject, contestedClaims, claimText } from './canonical-recall.mjs';

const mk = () => mkdtempSync(path.join(tmpdir(), 'crecall-'));
function seed(dir) {
  appendClaim('claude', 's', { subject: 'yuri-store', predicate: 'status', object: 'live', tier: 1 }, { dir });
  appendClaim('claude', 's', { subject: 'yuri-arch', predicate: 'track-count', object: 2 }, { dir });            // numeric object
  appendClaim('yuri-memory', 's', { subject: 'mem:abc', predicate: 'evidence', object: { content: 'Jan = Jan-Erich Meister, YURI collaborator', scope: 'permanent' }, tier: 'permanent', domain: 'memory' }, { dir }); // object object
  appendClaim('yuri-memory', 's', { subject: 'mem:def', predicate: 'rule', object: { content: 'address the user as Marcel' }, tier: 'project', domain: 'memory' }, { dir });
  appendClaim('filing', 's', { subject: 'some/path.md', predicate: 'recommended-zone', object: { zone: 'DOCS' }, tier: 'advisory' }, { dir }); // advisory lane
  appendClaim('nullobj', 's', { subject: 'x', predicate: 'p', object: null }, { dir });                          // null object
  appendClaim('laneA', 's', { subject: 'topic', predicate: 'value', object: 'A' }, { dir });                     // contested pair
  appendClaim('laneB', 's', { subject: 'topic', predicate: 'value', object: 'B' }, { dir });
  drainOnce('t', { dir });
}

test('object-shape safety: string/number/{content}/null never crash claimText or recall', () => {
  const dir = mk(); seed(dir);
  const all = recallCanonical({ dir, limit: 100 });
  assert.ok(all.length >= 6, 'all non-advisory claims returned');
  assert.ok(all.find((c) => c.subject === 'yuri-arch'));     // numeric object survived
  assert.ok(all.find((c) => c.subject === 'x'));             // null object survived
  assert.equal(typeof claimText({ subject: 's', predicate: 'p', object: 2 }), 'string');
  assert.equal(typeof claimText({ subject: 's', predicate: 'p', object: null }), 'string');
  rmSync(dir, { recursive: true, force: true });
});

test('freeText ranks by weighted overlap — "jan collaborator" surfaces the Jan evidence first', () => {
  const dir = mk(); seed(dir);
  const hits = recallCanonical({ dir, freeText: 'jan collaborator' });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].object.content.includes('Jan-Erich Meister'), 'top hit is the Jan claim');
  assert.ok(hits[0]._score > 0);
  rmSync(dir, { recursive: true, force: true });
});

test('filters: predicate / domain / minTier', () => {
  const dir = mk(); seed(dir);
  assert.equal(recallCanonical({ dir, predicate: 'rule' }).length, 1);
  assert.equal(recallCanonical({ dir, domain: 'memory' }).length, 2);
  const perm = recallCanonical({ dir, minTier: 'permanent' });
  assert.ok(perm.length === 1 && perm.every((c) => c.tier === 'permanent'), 'minTier permanent floors out project/numeric/null');
  rmSync(dir, { recursive: true, force: true });
});

test('advisory (filing) excluded by default, surfaced with includeAdvisory', () => {
  const dir = mk(); seed(dir);
  assert.equal(recallCanonical({ dir, predicate: 'recommended-zone' }).length, 0);
  assert.equal(recallCanonical({ dir, predicate: 'recommended-zone', includeAdvisory: true }).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('contested: flagged on the claim + surfaced by contestedClaims()', () => {
  const dir = mk(); seed(dir);
  assert.ok(contestedClaims({ dir }).length >= 1, 'topic/value is contested');
  const topic = recallCanonical({ dir, subject: 'topic' });
  assert.ok(topic.length >= 1 && topic.every((c) => c.contested === true), 'winner flagged contested');
  rmSync(dir, { recursive: true, force: true });
});

test('recallByKey / recallBySubject exact lookups', () => {
  const dir = mk(); seed(dir);
  assert.equal(recallByKey('yuri-store', 'status', { dir })?.object, 'live');
  assert.equal(recallByKey('nope', 'nope', { dir }), null);
  assert.equal(recallBySubject('mem:abc', { dir }).length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('empty store -> empty recall, no throw (peer-open, no wrapper)', () => {
  const dir = mk();
  assert.deepEqual(recallCanonical({ dir }), []);
  assert.deepEqual(contestedClaims({ dir }), []);
  rmSync(dir, { recursive: true, force: true });
});
