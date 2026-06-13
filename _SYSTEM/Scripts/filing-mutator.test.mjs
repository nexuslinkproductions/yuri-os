#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  replaceToken, countToken, computeTargetPath, computeRefUpdates, riskWeight, sortByRisk, buildSteps,
  planMove, planBatch, executeMove, executeBatch,
} from './filing-mutator.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── replaceToken / countToken: conservative standalone-path-token rewrite (cannot corrupt longer siblings) ──
ok(replaceToken('see _SYSTEM/foo.md here', '_SYSTEM/foo.md', '_SYSTEM/docs/foo.md') === 'see _SYSTEM/docs/foo.md here',
  'rewrites a standalone path token');
ok(replaceToken('backup _SYSTEM/foo.md.bak kept', '_SYSTEM/foo.md', '_SYSTEM/docs/foo.md') === 'backup _SYSTEM/foo.md.bak kept',
  'does NOT corrupt a longer sibling (_SYSTEM/foo.md.bak left intact)');
ok(replaceToken('other evil/_SYSTEM/foo.md path', '_SYSTEM/foo.md', '_SYSTEM/docs/foo.md') === 'other evil/_SYSTEM/foo.md path',
  'does NOT rewrite when the token is the tail of a different path (evil/ prefix)');
ok(replaceToken('[link](_SYSTEM/foo.md)', '_SYSTEM/foo.md', '_SYSTEM/docs/foo.md') === '[link](_SYSTEM/docs/foo.md)',
  'rewrites inside a markdown link (delimited by parens)');
ok(replaceToken('a _SYSTEM/foo.md and _SYSTEM/foo.md', '_SYSTEM/foo.md', 'X') === 'a X and X',
  'rewrites all standalone occurrences');
ok(countToken('a _SYSTEM/foo.md and _SYSTEM/foo.md.bak', '_SYSTEM/foo.md') === 1,
  'countToken counts only the standalone token (ignores the .bak sibling)');
ok(countToken('clean after rewrite', '_SYSTEM/foo.md') === 0, 'countToken → 0 when token absent');

// ── computeTargetPath ──
ok(computeTargetPath('_SYSTEM/HANDOFF-x.md', '_SYSTEM/docs/handoffs') === '_SYSTEM/docs/handoffs/HANDOFF-x.md', 'target = zone/basename');
ok(computeTargetPath('x.tmp', 'EPHEMERAL') === null, 'EPHEMERAL zone → null target (cannot file into /tmp)');
ok(computeTargetPath('x.md', null) === null, 'null zone → null target');

// ── computeRefUpdates ──
const ru = computeRefUpdates('a/b.md', 'c/b.md', [{ file: 'x.md', layer: 'markdownRefs' }, { file: 'y.json', layer: 'jsonConfigRefs' }]);
ok(ru.length === 2 && ru[0].oldPath === 'a/b.md' && ru[0].newPath === 'c/b.md' && ru[0].file === 'x.md', 'computeRefUpdates maps hosts → {file,old,new,layer}');

// ── riskWeight / sortByRisk ──
ok(riskWeight('LOW') === 0 && riskWeight('CRITICAL') === 3 && riskWeight('???') === 3, 'riskWeight orders LOW<…<CRITICAL, unknown=worst');
const sorted = sortByRisk([{ source: 'c', risk: 'CRITICAL' }, { source: 'a', risk: 'LOW' }, { source: 'b', risk: 'HIGH' }]);
ok(sorted[0].risk === 'LOW' && sorted[2].risk === 'CRITICAL', 'sortByRisk: LOW first, CRITICAL last');

// ── buildSteps: refs are updated BEFORE the move, reindex last ──
const steps = buildSteps({ source: 'a/b.md', target: 'c/b.md', gitCommand: 'git mv a c', refsToUpdate: [{ file: 'r.md', layer: 'markdownRefs' }], needsReindex: { fts5: true, gitnexus: true } });
ok(steps[0].type === 'update-ref' && steps[1].type === 'git-mv', 'buildSteps: update-ref BEFORE git-mv');
ok(steps.filter((s) => s.type === 'reindex').length === 2, 'buildSteps: both reindex steps appended last');
ok(steps.indexOf(steps.find((s) => s.type === 'git-mv')) < steps.indexOf(steps.find((s) => s.type === 'reindex')), 'reindex comes after the move');

// ── planMove refusals (the safety gate) ──
ok(planMove('SOUL.md').blocked === true && planMove('SOUL.md').blockMove === true, 'planMove(SOUL.md): BLOCKED + blockMove (pinned @-include anchor)');
ok(/anchor/i.test(planMove('_SYSTEM/yuri-origin.md').reason), 'planMove(yuri-origin.md): blocked with anchor reason');
ok(planMove('.claude/state/session-state.json').blocked === true && /protected/i.test(planMove('.claude/state/session-state.json').reason), 'planMove(protected): BLOCKED protected');
ok(planMove('some/random/thing.xyz').blocked === true && /unclassified/i.test(planMove('some/random/thing.xyz').reason), 'planMove(unclassified): BLOCKED owner-decision');
ok(planMove('_SYSTEM/Scripts/filing-assessor.mjs').blocked === true && /canonical zone/i.test(planMove('_SYSTEM/Scripts/filing-assessor.mjs').reason), 'planMove(already-canonical): BLOCKED no-move-needed');

// ── planMove on a real misplaced loose file → a complete, reference-aware plan ──
const p = planMove('_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md');
ok(p.blocked === false, 'planMove(loose handoff): not blocked (it is misplaced)');
ok(p.target === '_SYSTEM/docs/handoffs/HANDOFF-2026-06-05-llm-lane-unlock.md', 'planMove(loose handoff): target = docs/handoffs/<name>');
ok(p.gitCommand.startsWith('git mv '), 'planMove: emits a git mv command (history-preserving)');
ok(typeof p.refCount === 'number' && Array.isArray(p.refsToUpdate), 'planMove: carries a refsToUpdate list + count');
ok(p.needsReindex.fts5 === true && p.needsReindex.gitnexus === true, 'planMove: flags fts5 + gitnexus reindex');

// ── executeMove DRY-RUN: returns steps, mutates NOTHING ──
const dry = executeMove(p, { dryRun: true });
ok(dry.ok === true && dry.dryRun === true && Array.isArray(dry.steps), 'executeMove dry-run: ok + steps, no mutation');
ok(fs.existsSync(path.join(__dirname, '..', '..', '_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md')), 'dry-run did NOT move the source file');
ok(!fs.existsSync(path.join(__dirname, '..', '..', p.target)), 'dry-run did NOT create the target file');

// default opts == dry-run (execution must be explicit opt-in)
ok(executeMove(p).dryRun === true, 'executeMove default is DRY-RUN (no accidental execution)');

// ── executeMove HARD GUARDS: refuse pinned/protected even in EXECUTE mode, with zero I/O ──
ok(executeMove({ source: 'SOUL.md', target: '_SYSTEM/x/SOUL.md', blocked: false, blockMove: true }, { dryRun: false }).refused === true,
  'executeMove EXECUTE: refuses a pinned anchor plan (hard guard, no move)');
ok(executeMove({ source: '_SYSTEM/persona.md', target: 'x/persona.md', blocked: false }, { dryRun: false }).refused === true,
  'executeMove EXECUTE: refuses a pinned source even if blockMove flag is absent (isPinned re-check)');
ok(executeMove({ source: '.env', target: 'x/.env', blocked: false }, { dryRun: false }).refused === true,
  'executeMove EXECUTE: refuses a protected source');
ok(executeMove({ source: '_SYSTEM/x.md', target: '.claude/state/x.md', blocked: false }, { dryRun: false }).refused === true,
  'executeMove EXECUTE: refuses a protected TARGET');
ok(fs.existsSync(path.join(__dirname, '..', '..', 'SOUL.md')), 'the refused guards did not touch SOUL.md');

// ── executeBatch DRY-RUN: sorts valid plans, separates blocked, mutates nothing ──
const batch = executeBatch([
  planMove('SOUL.md'),                                            // blocked (pinned)
  planMove('_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md'),      // valid
  planMove('_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md'),      // valid (dup ok for sort test)
], { dryRun: true });
ok(batch.dryRun === true && batch.aborted === false, 'executeBatch dry-run: not aborted');
ok(batch.blocked.length === 1 && /anchor/i.test(batch.blocked[0].reason), 'executeBatch: the pinned anchor is separated into blocked[]');
ok(batch.results.every((r) => r.dryRun === true), 'executeBatch dry-run: every result is a dry-run (no mutation)');

// determinism + no RNG/clock in source
const src = fs.readFileSync(path.join(__dirname, 'filing-mutator.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic)');
ok(JSON.stringify(planMove('SOUL.md')) === JSON.stringify(planMove('SOUL.md')), 'planMove is deterministic');

console.log(`\nfiling-mutator.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
