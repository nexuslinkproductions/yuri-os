#!/usr/bin/env node
// Trio (GREEN/RED/GREY) for skill-recall.mjs. Hermetic temp fixture.
// Run: node --test _SYSTEM/Scripts/skill-recall.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanLiveSkills, showSkill, tokenize, rankSkills } from './skill-recall.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

function git(root, args, options = {}) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input: options.input,
    stdio: options.input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function write(root, relativePath, body) {
  const absolute = path.join(root, ...relativePath.split('/'));
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, body, 'utf8');
}

function writeJson(root, relativePath, value) {
  write(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function indexedFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'srecall-indexed-'));
  git(root, ['init', '-q']);
  const alpha = '---\nname: alpha\ndescription: Materialized canonical alpha skill.\n---\n\n# Alpha\n';
  const sparse = '---\nname: sparse\ndescription: Sparse hidden canonical skill.\n---\n\n# Sparse\nFULL_SPARSE_BODY\n';
  write(root, 'skills/alpha/SKILL.md', alpha);
  write(root, '.claude/skills/rogue/SKILL.md', '---\nname: rogue\ndescription: Must not bypass the canonical index.\n---\n');
  writeJson(root, 'skills/skill-index.json', {
    schemaVersion: 1,
    canonicalRoot: 'skills',
    count: 2,
    skills: [
      {
        id: 'alpha',
        path: 'skills/alpha/SKILL.md',
        operationalStatus: 'consult-only',
        statusReason: 'fixture advice only',
      },
      {
        id: 'sparse',
        path: 'skills/sparse/SKILL.md',
        operationalStatus: 'quarantined-stale',
        statusReason: 'fixture stale doctrine',
      },
    ],
  });
  writeJson(root, '_SYSTEM/config/cyber-skill-registry.json', {
    version: 'cyber-v1',
    source: 'fixture',
    license: 'fixture',
    generated: '2026-07-19T00:00:00Z',
    armedCount: 0,
    gatedCount: 0,
    armed: [],
    gated: [],
  });
  git(root, ['add', '--', 'skills/alpha/SKILL.md', 'skills/skill-index.json', '_SYSTEM/config/cyber-skill-registry.json']);
  const sparseOid = git(root, ['hash-object', '-w', '--stdin'], { input: sparse });
  git(root, ['update-index', '--add', '--cacheinfo', `100644,${sparseOid},skills/sparse/SKILL.md`]);
  return { root, alpha, sparse, sparseOid };
}

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

test('governed scan uses the canonical index and reads sparse-hidden blobs completely', () => {
  const { root, sparse, sparseOid } = indexedFixture();
  const skills = scanLiveSkills(root);
  assert.deepEqual(skills.map((entry) => entry.name), ['alpha', 'sparse']);
  const sparseRecord = skills.find((entry) => entry.name === 'sparse');
  assert.equal(sparseRecord.materialization, 'git-index');
  assert.equal(sparseRecord.gitBlobOid, sparseOid);
  assert.equal(sparseRecord.sourceSha256, createHash('sha256').update(sparse).digest('hex'));
  assert.equal(sparseRecord.raw, sparse);
  assert.equal(sparseRecord.operationalStatus, 'quarantined-stale');
  assert.equal(skills.find((entry) => entry.name === 'alpha').operationalStatus, 'consult-only');
  assert.equal(showSkill('sparse', { root }).content, sparse);
  assert.equal(rankSkills('sparse hidden canonical skill', { root, top: 5 }).some((entry) => entry.name === 'sparse'), false);
  assert.equal(rankSkills('sparse hidden canonical skill', { root, top: 1, includeQuarantined: true })[0].name, 'sparse');
});

test('projection provenance is verified for full-body show, including pending fields', () => {
  const { root, sparse, sparseOid } = indexedFixture();
  const sourceSha256 = createHash('sha256').update(sparse).digest('hex');
  const manifest = {
    schemaVersion: 1,
    generatedBy: '_SYSTEM/Scripts/yuri-codex-skill-projector.mjs',
    skills: [{
      id: 'sparse',
      sourcePath: 'skills/sparse/SKILL.md',
      sourceSha256,
      gitBlobOid: sparseOid,
      gitMode: '100644',
      tracked: true,
      durability: 'git-index',
      provenanceSource: 'index',
      operationalStatus: 'quarantined-stale',
      statusReason: 'fixture stale doctrine',
    }],
  };
  writeJson(root, '.agents/skills/.yuri-projection.json', manifest);
  assert.equal(showSkill('sparse', { root }).content, sparse);
  manifest.skills[0].sourceSha256 = '0'.repeat(64);
  writeJson(root, '.agents/skills/.yuri-projection.json', manifest);
  assert.throws(() => showSkill('sparse', { root }), /projection provenance mismatch/);
});

test('sparse-hidden Git symlink entries fail closed in recall', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'srecall-symlink-'));
  git(root, ['init', '-q']);
  writeJson(root, 'skills/skill-index.json', {
    schemaVersion: 1,
    canonicalRoot: 'skills',
    count: 1,
    skills: [{ id: 'linked', path: 'skills/linked/SKILL.md' }],
  });
  writeJson(root, '_SYSTEM/config/cyber-skill-registry.json', {
    version: 'cyber-v1', source: 'fixture', license: 'fixture', generated: 'fixture',
    armedCount: 0, gatedCount: 0, armed: [], gated: [],
  });
  git(root, ['add', '--', 'skills/skill-index.json', '_SYSTEM/config/cyber-skill-registry.json']);
  const objectId = git(root, ['hash-object', '-w', '--stdin'], { input: '../target/SKILL.md\n' });
  git(root, ['update-index', '--add', '--cacheinfo', `120000,${objectId},skills/linked/SKILL.md`]);
  assert.throws(() => scanLiveSkills(root), /symlink refused/);
});

test('byte-zero frontmatter is mandatory and BOM-prefixed skills fail visibly', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'srecall-bom-'));
  write(root, 'skills/bom/SKILL.md', '\ufeff---\nname: bom\ndescription: Invalid byte-zero fixture.\n---\n');
  assert.throws(() => scanLiveSkills(root), /invalid frontmatter/);
});

test('equal-score recall ties are deterministic by governed id', () => {
  const common = {
    fm: { description: 'same token' },
    tokens: ['same', 'token'],
    sourceClass: 'canonical',
    sourceSha256: '0'.repeat(64),
    gitBlobOid: null,
    ownerAuthorizedDiscovery: false,
    runtimeAuthorization: null,
    riskReason: null,
    operationalStatus: 'active',
    statusReason: null,
  };
  const hits = rankSkills('same token', {
    top: 2,
    skills: [
      { ...common, name: 'zeta', path: 'skills/zeta/SKILL.md' },
      { ...common, name: 'alpha', path: 'skills/alpha/SKILL.md' },
    ],
  });
  assert.deepEqual(hits.map((entry) => entry.name), ['alpha', 'zeta']);
});

test('workspace corpus is exactly the governed 127 + 300 + 39 set', () => {
  const skills = scanLiveSkills(REPO_ROOT);
  const counts = Object.groupBy(skills, (entry) => entry.sourceClass);
  assert.equal(skills.length, 466);
  assert.equal(counts.canonical?.length, 127);
  assert.equal(counts['cyber-armed']?.length, 300);
  assert.equal(counts.labgated?.length, 39);
  assert.ok(counts.labgated.every((entry) => entry.ownerAuthorizedDiscovery === true && entry.runtimeAuthorization === false && entry.riskReason));
  assert.ok(counts['cyber-armed'].every((entry) => entry.ownerAuthorizedDiscovery === false && entry.runtimeAuthorization === null));
  assert.deepEqual(
    counts.canonical.filter((entry) => entry.operationalStatus === 'quarantined-stale').map((entry) => entry.name).sort(),
    ['fleet-economy', 'mure-role-variant-matrix'],
  );
  assert.deepEqual(
    counts.canonical.filter((entry) => entry.operationalStatus === 'consult-only').map((entry) => entry.name).sort(),
    ['mure-advisor', 'opus-fleet'],
  );
  assert.equal(rankSkills('MURE role model variant matrix', { root: REPO_ROOT, top: 100 }).some((entry) => entry.name === 'mure-role-variant-matrix'), false);
  assert.equal(new Set(skills.map((entry) => entry.name)).size, 466);
});

test('full-body show matches governed hashes for canonical, armed, and lab-gated classes', () => {
  const skills = scanLiveSkills(REPO_ROOT);
  for (const sourceClass of ['canonical', 'cyber-armed', 'labgated']) {
    const expected = skills.find((entry) => entry.sourceClass === sourceClass);
    assert.ok(expected, `missing ${sourceClass} fixture in governed corpus`);
    const shown = showSkill(expected.name, { root: REPO_ROOT });
    assert.equal(shown.skill.sourceSha256, expected.sourceSha256);
    assert.equal(createHash('sha256').update(shown.content).digest('hex'), expected.sourceSha256);
    assert.equal(shown.content, expected.raw);
  }
});
