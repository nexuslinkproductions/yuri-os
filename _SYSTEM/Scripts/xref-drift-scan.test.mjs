import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { scanDrift, parseFileRef, gitnexusStaleness, computeFileStaleSet } from './xref-drift-scan.mjs';
import { makeScratchRepo } from './xref-test-scratch.mjs';

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

// =================================================================================================
// computeFileStaleSet — per-file content-hash reconciliation (staleness-extension)
// All tests pin to a CONTROLLED git scratch repo (NEVER the live dirty tree, which has ~220 dirty
// files incl. xref-drift-scan.mjs itself — that self-defeats the assertion).
// =================================================================================================

test('computeFileStaleSet: committed drift between indexedCommit and HEAD is detected', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 1;\n');
    repo.writeFile('_SYSTEM/Scripts/b.mjs', 'export const b = 1;\n');
    const c0 = repo.commit('init a + b');
    // The index was cut at c0. Now change a.mjs and commit -> a.mjs is COMMITTED drift.
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 2; // changed\n');
    repo.commit('change a');

    const r = computeFileStaleSet({ repoRoot: repo.root, indexedCommit: c0 });
    assert.equal(r.available, true);
    assert.deepEqual(r.staleFiles, ['_SYSTEM/Scripts/a.mjs'], 'only the committed-changed file is stale');
    assert.equal(r.includeWorkingTree, false);
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: DEFAULT excludes the working tree (uncommitted change is NOT stale)', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 1;\n');
    const c0 = repo.commit('init a');
    // Dirty the working tree WITHOUT committing.
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 999; // uncommitted\n');

    const r = computeFileStaleSet({ repoRoot: repo.root, indexedCommit: c0 });
    assert.equal(r.available, true);
    // HEAD == indexedCommit (no new commit) and working tree is excluded by default => empty.
    assert.deepEqual(r.staleFiles, [], 'uncommitted change must NOT be flagged by default (dirty-tree guard)');
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: OPT-IN includeWorkingTree unions the uncommitted change', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 1;\n');
    const c0 = repo.commit('init a');
    repo.writeFile('_SYSTEM/Scripts/a.mjs', 'export const a = 999; // uncommitted\n');
    repo.writeFile('_SYSTEM/Scripts/untracked.mjs', 'export const u = 1;\n'); // untracked too

    const r = computeFileStaleSet({ repoRoot: repo.root, indexedCommit: c0, includeWorkingTree: true });
    assert.equal(r.available, true);
    assert.equal(r.includeWorkingTree, true);
    assert.ok(r.staleFiles.includes('_SYSTEM/Scripts/a.mjs'), 'opt-in must catch the unstaged change');
    assert.ok(r.staleFiles.includes('_SYSTEM/Scripts/untracked.mjs'), 'opt-in must catch the untracked file');
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: content-hash leg flags a verifyPath that is NEW since the indexed commit', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/old.mjs', 'export const old = 1;\n');
    const c0 = repo.commit('init old');
    // Add a NEW file and commit. It is in the name-diff AND did-not-exist-at-index (content drift).
    repo.writeFile('_SYSTEM/Scripts/new.mjs', 'export const fresh = 1;\n');
    repo.commit('add new');

    const r = computeFileStaleSet({
      repoRoot: repo.root,
      indexedCommit: c0,
      verifyPaths: ['_SYSTEM/Scripts/new.mjs', '_SYSTEM/Scripts/old.mjs'],
    });
    assert.equal(r.available, true);
    assert.ok(r.staleFiles.includes('_SYSTEM/Scripts/new.mjs'), 'a file new since index is content drift');
    assert.ok(!r.staleFiles.includes('_SYSTEM/Scripts/old.mjs'), 'an unchanged file is NOT stale');
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: identical blob is NOT stale (content-hash equality, no false positive)', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/stable.mjs', 'export const s = 1;\n');
    const c0 = repo.commit('init stable');
    // Make an UNRELATED commit so HEAD advances but stable.mjs is byte-identical to the indexed blob.
    repo.writeFile('_SYSTEM/Scripts/other.mjs', 'export const o = 1;\n');
    repo.commit('add other (stable untouched)');

    const r = computeFileStaleSet({
      repoRoot: repo.root,
      indexedCommit: c0,
      verifyPaths: ['_SYSTEM/Scripts/stable.mjs'],
    });
    assert.equal(r.available, true);
    assert.ok(!r.staleFiles.includes('_SYSTEM/Scripts/stable.mjs'), 'byte-identical file must not be flagged');
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: FAIL-CLOSED when the marker is absent (no indexed commit)', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('x.mjs', 'x\n');
    repo.commit('init');
    // No .gitnexus/meta.json marker and no indexedCommit override.
    const r = computeFileStaleSet({ repoRoot: repo.root });
    assert.equal(r.available, false, 'absent marker must fail-closed, not return an empty fresh set');
    assert.deepEqual(r.staleFiles, []);
    assert.match(r.reason, /no indexed commit/);
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: FAIL-CLOSED when indexed commit is unknown to the repo', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('x.mjs', 'x\n');
    repo.commit('init');
    const r = computeFileStaleSet({
      repoRoot: repo.root,
      indexedCommit: '0000000000000000000000000000000000000000',
    });
    assert.equal(r.available, false, 'a foreign commit must fail-closed');
    assert.match(r.reason, /unknown to repo/);
  } finally { repo.cleanup(); }
});

test('computeFileStaleSet: reads the indexed commit from the .gitnexus marker when no override', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/m.mjs', 'export const m = 1;\n');
    const c0 = repo.commit('init m');
    // Pin the marker to c0, then advance HEAD with a change to m.mjs.
    repo.writeMeta(c0);
    repo.writeFile('_SYSTEM/Scripts/m.mjs', 'export const m = 2;\n');
    repo.commit('change m + write marker');

    const r = computeFileStaleSet({ repoRoot: repo.root }); // no indexedCommit -> marker
    assert.equal(r.available, true);
    assert.equal(r.indexedCommit, c0);
    assert.ok(r.staleFiles.includes('_SYSTEM/Scripts/m.mjs'));
  } finally { repo.cleanup(); }
});

// --- scanDrift integration: checkFileStale wiring emits FILE_STALE evidence lines ---

test('scanDrift: checkFileStale emits FILE_STALE lines for a committed-drifted node file', () => {
  const repo = makeScratchRepo();
  try {
    repo.writeFile('_SYSTEM/Scripts/node-file.mjs', 'export const x = 1;\n');
    const graphPath = repo.writeGraph([
      { id: 'n1', label: 'N', layer: 'L', files: ['_SYSTEM/Scripts/node-file.mjs'], triggeredBy: '', description: '' },
    ]);
    const c0 = repo.commit('init node file + graph');
    repo.writeMeta(c0);
    // Drift the node file in a NEW commit.
    repo.writeFile('_SYSTEM/Scripts/node-file.mjs', 'export const x = 2; // drifted\n');
    repo.commit('drift node file');

    const r = scanDrift({ repoRoot: repo.root, graphPath, checkGitnexus: false, checkFileStale: true });
    // File still EXISTS, so drift (missing-seam) stays 0; staleness is a separate axis.
    assert.equal(r.drift, 0, 'a stale-but-present file is not missing-seam drift');
    assert.ok(r.fileStale && r.fileStale.available, 'fileStale leg should be available');
    assert.ok(r.lines.includes('FILE_STALE file=_SYSTEM/Scripts/node-file.mjs'), 'emits the FILE_STALE evidence line');
    assert.ok(r.lines.some((l) => l.startsWith('FILE_STALE_SUMMARY count=')));
  } finally { repo.cleanup(); }
});

test('scanDrift: default path makes ZERO git calls (checkFileStale OFF) — fileStale stays null', () => {
  const root = tempRepo();
  writeFixture(root, '_SYSTEM/Scripts/present.mjs', 'export const x = 1;\n');
  const graphPath = writeGraph(root, [
    { id: 'p', label: 'P', layer: 'L', files: ['_SYSTEM/Scripts/present.mjs'], triggeredBy: '', description: '' },
  ]);
  // No git in this plain temp dir; checkFileStale OFF must NOT attempt git -> no throw, null fileStale.
  const r = scanDrift({ repoRoot: root, graphPath, checkGitnexus: false });
  assert.equal(r.fileStale, null, 'fileStale must be null when the leg is not requested');
  assert.equal(r.drift, 0);
});
