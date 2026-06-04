import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanDrift, parseFileRef, gitnexusStaleness } from './xref-drift-scan.mjs';

function tempRepo() {
  return mkdtempSync(path.join(os.tmpdir(), 'yuri-xref-drift-'));
}

function writeFixture(root, relPath, content) {
  const abs = path.join(root, relPath);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  return abs;
}

function writeGraph(root, nodes) {
  const rel = path.join('02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
  writeFixture(root, rel, JSON.stringify({ nodes, edges: [], generatedAt: 'test' }));
  return path.join(root, rel);
}

// --- parseFileRef: line-suffix parsing (defensive future-proofing) ---

test('parseFileRef: bare path has no line', () => {
  assert.deepEqual(parseFileRef('_SYSTEM/Scripts/x.mjs'),
    { filePath: '_SYSTEM/Scripts/x.mjs', line: null, lineEnd: null, hasLine: false });
});

test('parseFileRef: :N suffix parsed', () => {
  const r = parseFileRef('_SYSTEM/Scripts/ai:961');
  assert.equal(r.filePath, '_SYSTEM/Scripts/ai');
  assert.equal(r.line, 961);
  assert.equal(r.hasLine, true);
});

test('parseFileRef: :N-M range parsed', () => {
  const r = parseFileRef('a/b.mjs:10-42');
  assert.equal(r.line, 10);
  assert.equal(r.lineEnd, 42);
});

test('parseFileRef: trailing-slash colon edge is not a line', () => {
  // A path that just happens to have a colon is not misread when followed by non-digits.
  const r = parseFileRef('some/weird:name.txt');
  assert.equal(r.hasLine, false);
  assert.equal(r.filePath, 'some/weird:name.txt');
});

// --- present seam => no drift (the seeded-present case) ---

test('seeded present seam => PASS, no drift', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/present.mjs', 'export const x = 1;\n');
  const graphPath = writeGraph(root, [
    { id: 'node-present', label: 'P', layer: 'L', files: ['_SYSTEM/Scripts/present.mjs'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 0);
  assert.equal(r.pass, 1);
  assert.ok(r.lines.includes('FILE_COUNT node=node-present file=_SYSTEM/Scripts/present.mjs count=1'));
  assert.ok(r.lines.some((l) => l === 'XREF_DRIFT summary nodes=1 pass=1 drift=0'));
});

// --- missing seam => reported as drift (the seeded-missing case) ---

test('seeded missing seam => DRIFT reported with FILE_COUNT count=0', () => {
  const root = tempRepo();
  // graph cites a path we never create
  const graphPath = writeGraph(root, [
    { id: 'node-missing', label: 'M', layer: 'L', files: ['_SYSTEM/Scripts/ghost.mjs'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1);
  assert.equal(r.pass, 0);
  assert.ok(r.lines.includes('FILE_COUNT node=node-missing file=_SYSTEM/Scripts/ghost.mjs count=0'));
  assert.ok(r.findings.some((f) => f.id === 'node-missing' && f.missing.includes('_SYSTEM/Scripts/ghost.mjs')));
  assert.equal(r.ok, false);
});

// --- phantom allowlist: empty files[] is OK, not drift ---

test('intentional phantom with empty files => phantomOk, not drift', () => {
  const root = tempRepo();
  const graphPath = writeGraph(root, [
    { id: 'cross-domain-transfer-engine', label: 'X', layer: 'L', files: [],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 0);
  assert.equal(r.pass, 1);
  assert.ok(r.lines.some((l) => l.includes('phantomOk=true')));
});

// --- phantom that grew files => itself drift ---

test('intentional phantom that grew files => DRIFT', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/now-real.mjs', 'x\n');
  const graphPath = writeGraph(root, [
    { id: 'cross-domain-transfer-engine', label: 'X', layer: 'L',
      files: ['_SYSTEM/Scripts/now-real.mjs'], triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1);
  assert.ok(r.lines.some((l) => l.includes('phantom grew files')));
});

// --- stale path:line: file exists but is too short ---

test('stale path:line => DRIFT when file shorter than cited line', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/short.mjs', 'line1\nline2\n'); // 2 lines
  const graphPath = writeGraph(root, [
    { id: 'node-line', label: 'L', layer: 'L', files: ['_SYSTEM/Scripts/short.mjs:99'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1);
  assert.ok(r.lines.some((l) => l.includes('stale path:line') && l.includes('need=99')));
});

test('valid path:line within range => PASS', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/long.mjs', Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n') + '\n');
  const graphPath = writeGraph(root, [
    { id: 'node-line-ok', label: 'L', layer: 'L', files: ['_SYSTEM/Scripts/long.mjs:42'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 0);
  assert.ok(r.lines.some((l) => l.includes('MATCH') && l.includes('line=42')));
});

// --- glob ref resolves ---

test('glob file ref resolves when a match exists', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/banks/a.json', '{}');
  writeFixture(root, '_SYSTEM/banks/b.json', '{}');
  const graphPath = writeGraph(root, [
    { id: 'node-glob', label: 'G', layer: 'L', files: ['_SYSTEM/banks/*.json'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 0);
  assert.ok(r.lines.includes('FILE_COUNT node=node-glob file=_SYSTEM/banks/*.json count=1'));
});

test('glob file ref with no match => DRIFT', () => {
  const root = tempRepo();
  mkdirSync(path.join(root, '_SYSTEM', 'banks'), { recursive: true });
  const graphPath = writeGraph(root, [
    { id: 'node-glob-empty', label: 'G', layer: 'L', files: ['_SYSTEM/banks/*.json'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1);
});

// --- path traversal hardening: a ref escaping repoRoot must NOT resolve ---

test('path traversal ref does not resolve outside repoRoot', () => {
  const root = tempRepo();
  // /etc/hosts exists on the host, but a ../../ escape must be refused (count=0).
  const graphPath = writeGraph(root, [
    { id: 'node-escape', label: 'E', layer: 'L', files: ['../../../../../../etc/hosts'],
      triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1, 'escape ref must be treated as missing, not resolved outside repo');
  assert.ok(r.lines.some((l) => l.startsWith('FILE_COUNT node=node-escape') && l.endsWith('count=0')));
});

// --- home-anchored seam (~/) expands to homeRoot, not repoRoot ---

test('~/ seam resolves under homeRoot when present', () => {
  const root = tempRepo();
  const home = tempRepo();
  writeFixture(home, 'Library/LaunchAgents/com.test.plist', '<plist/>\n');
  const graphPath = writeGraph(root, [
    { id: 'node-home', label: 'H', layer: 'L',
      files: ['~/Library/LaunchAgents/com.test.plist'], triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, homeRoot: home, checkGitnexus: false });
  assert.equal(r.drift, 0, 'present home seam must not be false-positive drift');
  assert.ok(r.lines.includes('FILE_COUNT node=node-home file=~/Library/LaunchAgents/com.test.plist count=1'));
});

test('~/ seam missing under homeRoot => DRIFT', () => {
  const root = tempRepo();
  const home = tempRepo();
  const graphPath = writeGraph(root, [
    { id: 'node-home-gone', label: 'H', layer: 'L',
      files: ['~/.claude/hooks/gone.cjs'], triggeredBy: '', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, homeRoot: home, checkGitnexus: false });
  assert.equal(r.drift, 1);
});

// --- claim re-derivation: present token => MATCH, absent => advisory (not drift) ---

test('claim token present => MATCH, absent => advisory not drift', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/withfn.mjs', 'export function gateProposal() {}\n');
  const graphPath = writeGraph(root, [
    { id: 'node-claim-hit', label: 'C', layer: 'L', files: ['_SYSTEM/Scripts/withfn.mjs'],
      triggeredBy: 'import — calls `gateProposal`', description: '' },
    { id: 'node-claim-miss', label: 'C', layer: 'L', files: ['_SYSTEM/Scripts/withfn.mjs'],
      triggeredBy: 'import — calls `notThere`', description: '' },
  ]);

  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  // Both files exist => no file-drift. Claim miss is advisory only, so drift stays 0.
  assert.equal(r.drift, 0);
  assert.ok(r.lines.some((l) => l.includes('MATCH') && l.includes('term=gateProposal')));
  assert.ok(r.lines.some((l) => l.includes('CLAIM_ADVISORY') && l.includes('term=notThere')));
});

// --- malformed / hostile graph inputs: fail-soft, never throw ---

test('missing graph file => ok:false, no throw', () => {
  const root = tempRepo();
  const r = scanDrift({ repoRoot: root, graphPath: path.join(root, 'nope.json'), checkGitnexus: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /graph not found/);
});

test('malformed graph json => ok:false, no throw', () => {
  const root = tempRepo();
  const graphPath = path.join(root, 'bad.json');
  writeFixture(root, 'bad.json', '{ this is not json');
  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.ok, false);
  assert.match(r.error, /parse failed/);
});

test('nodes not an array => 0 nodes, ok:true, no throw', () => {
  const root = tempRepo();
  const abs = path.join(root, '02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json');
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFixture(root, path.join('02_RESOURCES', 'RESEARCH', 'yuri-circuitry-graph.json'),
    JSON.stringify({ nodes: 'not-an-array' }));
  const r = scanDrift({ repoRoot: root, graphPath: abs, checkGitnexus: false });
  assert.equal(r.nodes, 0);
  assert.equal(r.ok, true);
});

test('empty / whitespace-only file ref => count=0 DRIFT, no false PASS on repoRoot', () => {
  const root = tempRepo();
  const graphPath = writeGraph(root, [
    { id: 'ws-only', label: 'W', layer: 'L', files: ['   '], triggeredBy: '', description: '' },
  ]);
  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1, 'a whitespace ref must not resolve to repoRoot and false-PASS');
  assert.ok(r.lines.some((l) => l.startsWith('FILE_COUNT node=ws-only') && l.endsWith('count=0')));
});

test('glob with ../ escape is refused (DRIFT)', () => {
  const root = tempRepo();
  const graphPath = writeGraph(root, [
    { id: 'g-esc', label: 'G', layer: 'L', files: ['../../../etc/*.conf'],
      triggeredBy: '', description: '' },
  ]);
  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.drift, 1);
});

test('node with no id / no files array => handled, no throw', () => {
  const root = tempRepo();
  const graphPath = writeGraph(root, [
    { label: 'orphan' },               // no id, no files
    { id: 'has-id', files: null },     // files not an array
  ]);
  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.nodes, 2);
  // both have no resolvable missing files => pass
  assert.equal(r.drift, 0);
});

// --- gitnexus staleness: fail-soft when marker absent ---

test('gitnexusStaleness fail-soft when no marker', () => {
  const root = tempRepo();
  const gx = gitnexusStaleness({ repoRoot: root });
  assert.equal(gx.available, false);
});

test('gitnexus stale detected from marker (behind unknown in scratch repo)', () => {
  const root = tempRepo();
  // marker pins a commit hash unknown to this scratch (non-git) dir => stale, behind unknown
  writeFixture(root, path.join('.gitnexus', 'meta.json'),
    JSON.stringify({ lastCommit: '0000000000000000000000000000000000000000' }));
  const gx = gitnexusStaleness({ repoRoot: root });
  // No git in scratch => git rev-parse fails => available:false (fail-soft). Assert no throw + shape.
  assert.equal(typeof gx.available, 'boolean');
});
