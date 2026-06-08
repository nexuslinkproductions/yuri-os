#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyArtifact, assess, assessAll, stalenessScore, ZONE_RULES } from './filing-assessor.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// classification: first-match-wins deterministic placement
ok(classifyArtifact('02_RESOURCES/RESEARCH/yuri-formula-foundry-spec-2026-06-08.md').zone === '02_RESOURCES/RESEARCH', 'a research doc → 02_RESOURCES/RESEARCH');
ok(classifyArtifact('/tmp/foundry-synth-native-drafts.txt').zone === 'EPHEMERAL', 'a /tmp scratch file → EPHEMERAL');
ok(classifyArtifact('_SYSTEM/Scripts/math/formula-foundry.mjs').zone === '_SYSTEM/Scripts/math', 'a math module → _SYSTEM/Scripts/math');
ok(classifyArtifact('_SYSTEM/Scripts/yuri-navigate.mjs').zone === '_SYSTEM/Scripts', 'a non-math script → _SYSTEM/Scripts');
ok(classifyArtifact('_SYSTEM/config/schemas/x.schema.json').zone === '_SYSTEM/config/schemas', 'a schema → _SYSTEM/config/schemas');
ok(classifyArtifact('_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_CLAUDE_HANDOFF_2026-06-08.md').zone === '_SYSTEM/docs', 'a handoff doc → _SYSTEM/docs');
ok(classifyArtifact('_SYSTEM/state/originator-telemetry.jsonl').zone === '_SYSTEM/state', 'a jsonl telemetry → _SYSTEM/state');
ok(classifyArtifact('some/random/thing.xyz').zone === null, 'an unknown artifact → unclassified (owner decision), not a guess');

// determinism
ok(JSON.stringify(classifyArtifact('a/b.mjs')) === JSON.stringify(classifyArtifact('a/b.mjs')), 'classification deterministic');
const src = fs.readFileSync(path.join(__dirname, 'filing-assessor.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic)');

// misplaced detection: a research .md sitting in the wrong zone
const mis = assess('_SYSTEM/Scripts/some-spec-synthesis.md');
ok(mis.recommendedZone === '02_RESOURCES/RESEARCH' && mis.misplaced === true, 'a research doc in _SYSTEM/Scripts is flagged misplaced');
ok(assess('02_RESOURCES/RESEARCH/x-spec.md').misplaced === false, 'a research doc already in RESEARCH is NOT misplaced');

// staleness: hazard-decay, older ⇒ higher purge pressure
ok(stalenessScore(0) === 0, 'a brand-new artifact has zero purge pressure');
ok(stalenessScore(336) > stalenessScore(24), 'an older temp file has MORE purge pressure (hazard-decay)');
ok(stalenessScore(168) > 0.49 && stalenessScore(168) < 0.51, 'at one half-life, purge pressure ≈ 0.5');

// assessAll report: read-only, surfaces misplaced + ephemeral-in-repo
const r = assessAll(['02_RESOURCES/RESEARCH/ok.md', '_SYSTEM/Scripts/wrongplace-synthesis.md', 'some/junk.xyz']);
ok(r.advisory_only === true, 'the report is advisory/read-only (no file is moved)');
ok(r.misplaced.length === 1 && r.unclassified.length === 1, 'report surfaces misplaced + unclassified counts');
ok(r.rows.every((x, i) => i === 0 || r.rows[i - 1].path.localeCompare(x.path) <= 0), 'report rows are sorted');

console.log(`\nfiling-assessor.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
