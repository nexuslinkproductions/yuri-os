#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketLayer, bucketHits, classifyRisk, parseGrepOutput, scanDeps, scanBatchDeps } from './filing-deps.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── bucketLayer: each reference layer is classified by the host file + matching line (first-match priority) ──
ok(bucketLayer('CLAUDE.md', '@SOUL.md') === 'atIncludes', 'an @-include line in CLAUDE.md → atIncludes');
ok(bucketLayer('CLAUDE.md', 'see SOUL.md for persona') === 'markdownRefs', 'a plain prose mention in CLAUDE.md is NOT an @-include');
ok(bucketLayer('_SYSTEM/INDEX.md', '- x') === 'indexRefs', 'INDEX.md hit → indexRefs');
ok(bucketLayer('02_RESOURCES/RESEARCH/yuri-circuitry-graph.json', '"files":[...]') === 'graphRefs', 'circuitry graph hit → graphRefs');
ok(bucketLayer('_SYSTEM/yuri-graph.json', 'x') === 'graphRefs', 'the _SYSTEM graph json also → graphRefs');
ok(bucketLayer('.claude/hooks/foo.mjs', 'x') === 'hookRefs', 'a hook file hit → hookRefs');
ok(bucketLayer('.claude/settings.json', 'x') === 'hookRefs', 'settings.json hit → hookRefs');
ok(bucketLayer('skills/foo/SKILL.md', 'x') === 'skillRefs', 'a SKILL.md hit → skillRefs');
ok(bucketLayer('_SYSTEM/organ-guides.json', 'x') === 'organGuideRefs', 'organ-guides.json hit → organGuideRefs');
ok(bucketLayer('_SYSTEM/config/folder-registry.json', 'x') === 'registryRefs', 'a registry json hit → registryRefs');
ok(bucketLayer('_SYSTEM/memory/x.md', 'x') === 'memoryRefs', 'a memory file hit → memoryRefs');
ok(bucketLayer('.claude/memory/MEMORY.md', 'x') === 'memoryRefs', 'MEMORY.md hit → memoryRefs');
ok(bucketLayer('_SYSTEM/Scripts/x.mjs', "import y from './foo.mjs'") === 'imports', 'a code import line → imports');
ok(bucketLayer('_SYSTEM/Scripts/x.mjs', '// just a comment about foo') === 'otherRefs', 'a non-import code line → otherRefs (no false import)');
ok(bucketLayer('_SYSTEM/reports/x.html', 'x') === 'htmlRefs', 'an html hit → htmlRefs');
ok(bucketLayer('some/other.json', 'x') === 'jsonConfigRefs', 'a generic json hit → jsonConfigRefs');
ok(bucketLayer('02_RESOURCES/RESEARCH/x.md', 'x') === 'markdownRefs', 'a research md hit → markdownRefs');

// ── parseGrepOutput: "path:line:text" → structured hits ──
const parsed = parseGrepOutput('a/b.md:12:hello world\nc/d.mjs:3:import x\n\nbadline');
ok(parsed.length === 2 && parsed[0].file === 'a/b.md' && parsed[0].line === 12 && parsed[1].text === 'import x',
  'parseGrepOutput parses path:line:text and drops malformed lines');
ok(parseGrepOutput('').length === 0, 'parseGrepOutput on empty string → []');

// ── bucketHits: rolls up, excludes self, caps samples ──
const hits = [
  { file: 'CLAUDE.md', line: 1, text: '@SOUL.md' },
  { file: '_SYSTEM/INDEX.md', line: 9, text: '- SOUL.md' },
  { file: 'SOUL.md', line: 1, text: '# SOUL.md self-mention' },   // self — excluded
  { file: 'a.md', line: 2, text: 'x' }, { file: 'b.md', line: 2, text: 'x' },
  { file: 'c.md', line: 2, text: 'x' }, { file: 'd.md', line: 2, text: 'x' }, { file: 'e.md', line: 2, text: 'x' },
];
const rolled = bucketHits(hits, 'SOUL.md', 4);
ok(rolled.counts.atIncludes === 1 && rolled.counts.indexRefs === 1, 'bucketHits counts atIncludes + indexRefs');
ok(rolled.counts.markdownRefs === 5, 'bucketHits counts 5 markdownRefs (self-mention excluded)');
ok(rolled.samples.markdownRefs.length === 4, 'bucketHits caps samples at 4');

// ── classifyRisk: worst-blast-radius wins ──
const z = bucketHits([], 'x.md').counts;
ok(classifyRisk({ ...z, atIncludes: 1 }, 'x.md') === 'CRITICAL', 'atIncludes → CRITICAL');
ok(classifyRisk({ ...z, hookRefs: 1 }, 'x.md') === 'CRITICAL', 'hookRefs → CRITICAL');
ok(classifyRisk({ ...z, graphRefs: 1 }, 'x.md') === 'CRITICAL', 'graphRefs → CRITICAL');
ok(classifyRisk({ ...z, imports: 1 }, 'x.mjs') === 'HIGH', 'imports → HIGH');
ok(classifyRisk({ ...z, indexRefs: 1 }, 'x.md') === 'HIGH', 'indexRefs → HIGH');
ok(classifyRisk({ ...z, markdownRefs: 6 }, 'x.md') === 'HIGH', '>5 markdownRefs → HIGH');
ok(classifyRisk({ ...z, registryRefs: 1 }, 'x.md') === 'MEDIUM', 'registryRefs → MEDIUM');
ok(classifyRisk({ ...z, markdownRefs: 2 }, 'x.md') === 'MEDIUM', 'a few markdownRefs → MEDIUM');
ok(classifyRisk({ ...z }, 'x.md') === 'LOW', 'no refs → LOW');
ok(classifyRisk({ ...z }, 'SOUL.md') === 'CRITICAL', 'a PINNED anchor is CRITICAL even with zero refs');
ok(classifyRisk({ ...z }, 'x.md', { pinned: true }) === 'CRITICAL', 'explicit pinned flag → CRITICAL');

// ── LIVE smoke: scanDeps on real files (git grep + graph parse) ──
const soul = scanDeps('SOUL.md');
ok(soul.pinned === true && soul.blockMove === true, 'scanDeps(SOUL.md): pinned + blockMove (an @-include anchor)');
ok(soul.riskLevel === 'CRITICAL', 'scanDeps(SOUL.md): CRITICAL risk');
ok(soul.needsReindex.fts5 === true && soul.needsReindex.gitnexus === true, 'scanDeps flags fts5 + gitnexus reindex');
ok(soul.counts.atIncludes >= 1, 'scanDeps(SOUL.md): finds the @SOUL.md @-include in CLAUDE.md (live git grep)');

const assessor = scanDeps('_SYSTEM/Scripts/filing-assessor.mjs');
ok(assessor.pinned === false, 'scanDeps(filing-assessor.mjs): not pinned');
ok(assessor.totalRefs >= 1, 'scanDeps(filing-assessor.mjs): finds at least its test/scanner importers');
ok(['HIGH', 'CRITICAL', 'MEDIUM'].includes(assessor.riskLevel), 'scanDeps(filing-assessor.mjs): imported → non-LOW risk');

const orig = scanDeps('_SYSTEM/yuri-origin.md');
ok(orig.blockMove === true, 'scanDeps(yuri-origin.md): an @-include anchor is blockMove');

// determinism: two scans of the same file agree on counts + risk
const s1 = scanDeps('_SYSTEM/Scripts/filing-assessor.mjs');
const s2 = scanDeps('_SYSTEM/Scripts/filing-assessor.mjs');
ok(JSON.stringify(s1.counts) === JSON.stringify(s2.counts) && s1.riskLevel === s2.riskLevel, 'scanDeps is deterministic');

// no RNG / clock in the source
const src = fs.readFileSync(path.join(__dirname, 'filing-deps.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic)');

// batch is sorted
const batch = scanBatchDeps(['_SYSTEM/Scripts/filing-assessor.mjs', 'SOUL.md']);
ok(batch.length === 2 && batch[0].path.localeCompare(batch[1].path) <= 0, 'scanBatchDeps returns sorted rows');

console.log(`\nfiling-deps.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
