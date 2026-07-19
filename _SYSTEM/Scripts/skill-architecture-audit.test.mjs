#!/usr/bin/env node
// Trio (GREEN/RED/GREY) for skill-architecture-audit.mjs. Hermetic temp fixture.
// Run: node --test _SYSTEM/Scripts/skill-architecture-audit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditSkill, auditAll } from './skill-architecture-audit.mjs';

const GOOD_DESC = 'Generate ad creative at scale. Use when the user wants headline variations for paid ads.';
function cleanSkill(extraBody = '') {
  return `---\nname: alpha\ndescription: ${GOOD_DESC}\n---\n\n# Alpha\n\nbody\n\n## Session Notes\n- init\n${extraBody}`;
}
function write(root, rel, content) {
  const d = path.join(root, rel);
  mkdirSync(d, { recursive: true });
  writeFileSync(path.join(d, 'SKILL.md'), content);
  return path.join(d, 'SKILL.md');
}
function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'sarch-'));
  write(root, 'skills/alpha', cleanSkill());                                     // clean -> PASS
  write(root, '.claude/skills/alpha', cleanSkill());                             // published
  write(root, 'skills/broken', `# ABSORBED FROM: x\n\n---\nname: broken\ndescription: ${GOOD_DESC}\n---\n\n# B\n## Session Notes\n- n\n`); // byte-0 FAIL
  write(root, '.claude/skills/broken', cleanSkill());
  write(root, 'skills/nodesc', `---\nname: nodesc\n---\n\n# N\n## Session Notes\n- n\n`); // missing desc -> FAIL
  write(root, '.claude/skills/nodesc', `---\nname: nodesc\n---\n# N\n`);
  write(root, 'skills/stranded', cleanSkill());                                  // in skills/ but NOT published -> WARN PUBLISHED
  return root;
}

// ======================= GREEN =======================
test('GREEN clean published skill grades PASS', () => {
  const root = fixtureRoot();
  const r = auditSkill(path.join(root, 'skills/alpha/SKILL.md'), { published: true });
  assert.equal(r.grade, 'PASS', JSON.stringify(r.warns.concat(r.fails)));
});

test('GREEN byte-0 frontmatter break is a FAIL (the failure anchor)', () => {
  const root = fixtureRoot();
  const r = auditSkill(path.join(root, 'skills/broken/SKILL.md'), { published: true });
  assert.equal(r.grade, 'FAIL');
  assert.ok(r.fails.some((f) => f.rule === 'FRONTMATTER_AT_BYTE0'));
});

test('GREEN missing description is a FAIL', () => {
  const root = fixtureRoot();
  const r = auditSkill(path.join(root, 'skills/nodesc/SKILL.md'), { published: true });
  assert.equal(r.grade, 'FAIL');
  assert.ok(r.fails.some((f) => f.rule === 'HAS_DESCRIPTION'));
});

test('GREEN oversized skill is WARN (size), not FAIL', () => {
  const root = fixtureRoot();
  const big = write(root, 'skills/big', cleanSkill('x\n'.repeat(500)));
  const r = auditSkill(big, { published: true });
  assert.equal(r.grade, 'WARN');
  assert.ok(r.warns.some((f) => f.rule === 'SIZE'));
  assert.ok(!r.fails.length);
});

test('GREEN stranded (not published) is WARN PUBLISHED; auditAll counts add up', () => {
  const root = fixtureRoot();
  const { summary, results } = auditAll(root);
  assert.equal(summary.total, results.length);
  assert.equal(summary.pass + summary.warn + summary.fail, summary.total);
  const stranded = results.find((r) => r.name === 'stranded');
  assert.ok(stranded.warns.some((f) => f.rule === 'PUBLISHED'));
  assert.equal(summary.fail, 2); // broken + nodesc
});

test('GREEN metadata-and-pointer-only .agents adapter counts as published reachability', () => {
  const root = fixtureRoot();
  write(root, 'skills/codex-native', cleanSkill());
  write(root, '.agents/skills/codex-native', `---\nname: codex-native\ndescription: ${GOOD_DESC}\n---\n\nGoverned source: skills/codex-native/SKILL.md\n`);
  const { results } = auditAll(root);
  const projected = results.find((r) => r.name === 'codex-native');
  assert(projected, 'projected canonical skill missing from audit');
  assert.equal(projected.warns.some((finding) => finding.rule === 'PUBLISHED'), false);
});

// ======================= RED =======================
// Load-bearing property: byte-0 detection must use STARTS-WITH, not CONTAINS. A mutant that
// checks raw.includes('---') passes a pre-frontmatter-comment skill -> the bug ships. Caught here.
test('RED byte-0 uses starts-with not contains (contains-mutant is caught)', () => {
  const root = fixtureRoot();
  const brokenRaw = `# ABSORBED FROM: x\n\n---\nname: m\ndescription: ${GOOD_DESC}\n---\n`;
  const real = auditSkill(write(root, 'skills/m', brokenRaw), { published: true });
  assert.equal(real.fails.some((f) => f.rule === 'FRONTMATTER_AT_BYTE0'), true); // real: FAIL
  const mutantOk = brokenRaw.includes('---');                                    // contains-mutant: "fine"
  assert.equal(mutantOk, true);                                                  // mutant would PASS it
  assert.notEqual(mutantOk, real.grade === 'PASS');                              // real disagrees with mutant
});

// ======================= GREY =======================
// 1) independent oracle: every PASS skill must independently be loadable (starts with ---,
//    has name + description) — re-derived without the grader's internals.
test('GREY PASS implies independently-loadable (oracle)', () => {
  const root = fixtureRoot();
  const { results } = auditAll(root);
  for (const r of results.filter((x) => x.grade === 'PASS')) {
    const p = path.join(root, 'skills', r.name, 'SKILL.md');
    const raw = readFileSync(p, 'utf8');
    assert.ok(/^---\s*\n/.test(raw), `${r.name} PASS but no byte-0 fence`);
    assert.ok(/^name:/m.test(raw) && /^description:/m.test(raw), `${r.name} PASS but missing name/desc`);
  }
});

// 2) metamorphic: injecting a FAIL-class defect never improves the grade (monotonic severity).
test('GREY injecting a byte-0 defect degrades grade (never improves)', () => {
  const root = fixtureRoot();
  const before = auditSkill(write(root, 'skills/mono', cleanSkill()), { published: true });
  const order = { PASS: 0, WARN: 1, FAIL: 2 };
  const after = auditSkill(write(root, 'skills/mono', '# pre\n\n' + cleanSkill()), { published: true });
  assert.ok(order[after.grade] >= order[before.grade], `grade improved ${before.grade}->${after.grade}`);
  assert.equal(after.grade, 'FAIL');
});
