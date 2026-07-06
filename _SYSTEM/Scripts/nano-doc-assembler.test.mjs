#!/usr/bin/env node
// Tests for the fragment+assemble doc mechanism: ownership enforcement, ordered assembly, missing/complete
// reporting, id sanitization/traversal safety, and the pure assembleFromParts core. Isolated tmp docs dir.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const DOCS = path.join(os.tmpdir(), `nano-docs-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
process.env.YURI_NANO_DOCS_DIR = DOCS;
const { defineDoc, writeSection, assembleDoc, assembleFromParts, listDocSections, readDocManifest } = await import('./nano-doc-assembler.mjs');

const reset = () => fs.rmSync(DOCS, { recursive: true, force: true });
const doc = () => defineDoc('report', {
  title: 'Swarm Report',
  sections: [
    { id: 'intro', owner: 'nano-a', title: 'Intro' },
    { id: 'findings', owner: 'nano-b', title: 'Findings' },
    { id: 'concl', owner: 'nano-c', title: 'Conclusion' },
  ],
});

test('defineDoc persists an ordered manifest', () => {
  reset();
  doc();
  const m = readDocManifest('report');
  assert.equal(m.title, 'Swarm Report');
  assert.deepEqual(m.sections.map((s) => s.id), ['intro', 'findings', 'concl']);
  assert.deepEqual(m.sections.map((s) => s.owner), ['nano-a', 'nano-b', 'nano-c']);
});

test('defineDoc rejects duplicate section ids', () => {
  reset();
  assert.throws(() => defineDoc('d', { sections: [{ id: 'x', owner: 'a' }, { id: 'x', owner: 'b' }] }), /duplicate section/);
});

test('writeSection: only the declared owner may write its section', () => {
  reset();
  doc();
  assert.equal(writeSection('report', 'intro', 'nano-a', '# Hello').ok, true, 'owner writes');
  const bad = writeSection('report', 'findings', 'nano-a', 'sneaky'); // nano-a is NOT the owner of findings
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not-owner');
  assert.equal(bad.owner, 'nano-b');
});

test('writeSection: unknown doc / unknown section are refused', () => {
  reset();
  doc();
  assert.equal(writeSection('nope', 'intro', 'nano-a', 'x').reason, 'no-doc');
  assert.equal(writeSection('report', 'ghost', 'nano-a', 'x').reason, 'unknown-section');
});

test('assembleDoc stitches present fragments in declared order with section markers', () => {
  reset();
  doc();
  // write out of order; assembly must still follow the declared order
  writeSection('report', 'concl', 'nano-c', 'The end.');
  writeSection('report', 'intro', 'nano-a', 'The start.');
  writeSection('report', 'findings', 'nano-b', 'The middle.');
  const r = assembleDoc('report');
  assert.equal(r.complete, true);
  const order = r.markdown.match(/section:(\w+)/g);
  assert.deepEqual(order, ['section:intro', 'section:findings', 'section:concl']);
  assert.ok(r.markdown.indexOf('The start.') < r.markdown.indexOf('The middle.'));
  assert.ok(r.markdown.indexOf('The middle.') < r.markdown.indexOf('The end.'));
});

test('assembleDoc reports missing sections and incomplete state', () => {
  reset();
  doc();
  writeSection('report', 'intro', 'nano-a', 'only intro');
  const r = assembleDoc('report');
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['findings', 'concl']);
  const intro = r.sections.find((s) => s.id === 'intro');
  assert.equal(intro.present, true);
  assert.ok(intro.bytes > 0);
});

test('id sanitization keeps fragment files inside the docs dir (no traversal)', () => {
  reset();
  // a traversal-y section id is flattened to a safe single filename. The real safety property is
  // CONTAINMENT: separators are stripped (dots alone can't traverse), so the fragment resolves inside DOCS.
  defineDoc('safe', { sections: [{ id: '../../etc/passwd', owner: 'a' }] });
  const m = readDocManifest('safe');
  const id = m.sections[0].id;
  assert.equal(id.includes('/'), false, 'no path separators survive');
  assert.equal(id.includes('\\'), false);
  assert.equal(writeSection('safe', '../../etc/passwd', 'a', 'x').ok, true);
  const resolved = path.resolve(DOCS, 'safe', 'sections', `${id}.md`);
  assert.ok(resolved.startsWith(`${path.resolve(DOCS)}${path.sep}`), 'fragment stays within the docs dir');
  assert.equal(fs.existsSync(resolved), true);
});

test('assembleFromParts (pure): order + coverage independent of disk', () => {
  const manifest = { sections: [{ id: 'a', owner: 'n1', title: 'A' }, { id: 'b', owner: 'n2', title: 'B' }] };
  const r = assembleFromParts(manifest, { b: 'beta' }); // only b present
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['a']);
  assert.match(r.markdown, /section:b owner:n2/);
  assert.equal(r.sections.find((s) => s.id === 'b').present, true);
});

test('listDocSections shows ownership + presence', () => {
  reset();
  doc();
  writeSection('report', 'intro', 'nano-a', 'hi');
  const secs = listDocSections('report');
  assert.equal(secs.find((s) => s.id === 'intro').present, true);
  assert.equal(secs.find((s) => s.id === 'findings').present, false);
  assert.equal(secs.find((s) => s.id === 'findings').owner, 'nano-b');
});
